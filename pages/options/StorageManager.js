/**
 * StorageManager.js
 * UI 控制層：負責展示、事件纁定與用戶交互。
 * 純數據邏輯請參閱 storageDataUtils.js
 */

/* global chrome */

import Logger from '../scripts/utils/Logger.js';
import {
  sanitizeApiError,
  validateSafeSvg,
  separateIconAndText,
  createSafeIcon,
} from '../scripts/utils/securityUtils.js';
import { ErrorHandler } from '../scripts/utils/ErrorHandler.js';
import { UI_ICONS } from '../scripts/config/icons.js';
import { UI_MESSAGES } from '../scripts/config/shared/messages.js';
import {
  sanitizeBackupData,
  getStorageHealthReport,
  getAllLocalStorage,
  buildImportExecutionPlan,
} from './storageDataUtils.js';

/**
 * 管理存儲空間的 UI 控制層
 * 負責展示、事件纁定與用戶交互。
 * 純數據邏輯請參閱 storageDataUtils.js
 */
export class StorageManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.elements = {};
    this._lastHealthReport = null; // 暫存健康度報告，供「執行清理」按鈕直接使用
  }

  init() {
    this.initializeElements();
    this.setupEventListeners();
    this.updateStorageUsage();
  }

  initializeElements() {
    this.elements = {
      // 備份/恢復按鈕
      exportButton: document.querySelector('#export-data-button'),
      importButton: document.querySelector('#import-data-button'),
      importFile: document.querySelector('#import-data-file'),
      dataStatus: document.querySelector('#data-status'),

      // 使用量統計
      refreshUsageButton: document.querySelector('#refresh-usage-button'),
      usageFill: document.querySelector('#usage-fill'),
      usagePercentage: document.querySelector('#usage-percentage'),
      usageDetails: document.querySelector('#usage-details'),
      pagesCount: document.querySelector('#pages-count'),
      highlightsCount: document.querySelector('#highlights-count'),
      configCount: document.querySelector('#config-count'),

      // 健康狀態與清理
      healthStatus: document.querySelector('#health-status'),
      executeCleanupButton: document.querySelector('#execute-cleanup-button'),
      cleanupStatus: document.querySelector('#cleanup-status'),
    };
  }

  setupEventListeners() {
    // 備份
    this.elements.exportButton?.addEventListener('click', () => this.exportData());

    // 還原
    this.elements.importButton?.addEventListener('click', () => {
      this.elements.importFile?.click();
    });
    this.elements.importFile?.addEventListener('change', event => this.importData(event));

    // 刷新使用量（同時刷新健康狀態）
    this.elements.refreshUsageButton?.addEventListener('click', () => this.updateStorageUsage());

    // 執行清理（僅在有可清理項目時顯示）
    this.elements.executeCleanupButton?.addEventListener('click', () =>
      this.executeUnifiedCleanup()
    );
  }

  async exportData() {
    try {
      Logger.start('開始導出備份數據');
      this.showDataStatus(UI_MESSAGES.STORAGE.BACKUP_START, 'info');

      const data = await new Promise(resolve => {
        chrome.storage.local.get(null, resolve);
      });
      const sanitizedData = sanitizeBackupData(data);

      const backup = {
        timestamp: new Date().toISOString(),
        version: chrome.runtime.getManifest().version,
        data: sanitizedData,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `notion-clipper-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const icon = UI_ICONS.SUCCESS;
      this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.BACKUP_SUCCESS}`, 'success');
      Logger.success('備份數據導出成功');
    } catch (error) {
      Logger.error('Backup failed', { action: 'export_backup', error });
      const icon = UI_ICONS.ERROR;
      const safeMessage = sanitizeApiError(error, 'export_backup');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.BACKUP_FAILED}${errorMsg}`, 'error');
    }
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    try {
      Logger.start('開始導入備份數據');

      const text = await file.text();
      const backup = JSON.parse(text);

      // 防呆檢查：確保是有效的備份格式（基本結構檢查）
      // 要求 backup.data 必須存在，必須是物件，且不能是陣列
      if (!backup?.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
        throw new Error(UI_MESSAGES.STORAGE.INVALID_BACKUP_FORMAT);
      }

      const sanitizedData = sanitizeBackupData(backup.data);

      // 顯示模式選擇 UI；成功路徑在 _executeImport 結尾清 importFile.value，
      // 取消路徑在 _cancelImport 清。
      this._showImportModeSelector(sanitizedData);
    } catch (error) {
      this._handleImportFailure(error);
    }
  }

  /**
   * 顯示匯入模式選擇器：在 #data-status 動態插入三個模式按鈕 + 取消按鈕
   *
   * @param {object} sanitizedData - 已過濾的備份數據
   * @private
   */
  _showImportModeSelector(sanitizedData) {
    const container = this.elements.dataStatus;
    if (!container) {
      return;
    }

    // 清空舊狀態；面板樣式改由 .import-mode-panel 自持，不再沿用 status-message.info
    container.textContent = '';
    container.classList.remove('success', 'error', 'warning', 'info');

    const panel = document.createElement('div');
    panel.className = 'import-mode-panel';

    const prompt = document.createElement('div');
    prompt.className = 'import-mode-prompt';
    prompt.textContent = UI_MESSAGES.STORAGE.IMPORT_SELECT_MODE;
    panel.append(prompt);

    const hint = document.createElement('p');
    hint.className = 'import-mode-hint';
    hint.textContent = UI_MESSAGES.STORAGE.IMPORT_MODE_HINT;
    panel.append(hint);

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'import-mode-buttons';

    const MODE_TO_CLASS = {
      'new-and-overwrite': 'btn-primary',
      'new-only': 'btn-secondary',
      'overwrite-all': 'btn-danger',
    };

    // 由推薦 → 安全 → 破壞性，視覺層級由上至下遞進
    const modes = [
      { mode: 'new-and-overwrite', label: UI_MESSAGES.STORAGE.IMPORT_MODE_NEW_AND_OVERWRITE },
      { mode: 'new-only', label: UI_MESSAGES.STORAGE.IMPORT_MODE_NEW_ONLY },
      { mode: 'overwrite-all', label: UI_MESSAGES.STORAGE.IMPORT_MODE_OVERWRITE_ALL },
    ];

    const handleClick = handler => {
      // 執行前先禁用整組按鈕，避免重複點擊
      panel.querySelectorAll('button').forEach(btn => {
        btn.disabled = true;
      });
      handler();
    };

    for (const { mode, label } of modes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `import-mode-button ${MODE_TO_CLASS[mode]}`;
      btn.dataset.mode = mode;
      btn.textContent = label;
      btn.addEventListener('click', () =>
        handleClick(() => this._executeImport(mode, sanitizedData))
      );
      buttonGroup.append(btn);
    }

    panel.append(buttonGroup);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'import-mode-button import-mode-cancel btn-secondary';
    cancelBtn.dataset.mode = 'cancel';
    cancelBtn.textContent = UI_MESSAGES.STORAGE.IMPORT_CANCEL;
    cancelBtn.addEventListener('click', () => handleClick(() => this._cancelImport()));
    panel.append(cancelBtn);

    container.append(panel);
  }

  /**
   * 取消匯入：清空檔案輸入、顯示取消訊息
   *
   * @private
   */
  _cancelImport() {
    this.showDataStatus(UI_MESSAGES.STORAGE.IMPORT_CANCELED, 'info');
    if (this.elements.importFile) {
      this.elements.importFile.value = '';
    }
  }

  /**
   * 依模式執行匯入：diff → 寫入 → 結果訊息 → 清理 + reload
   *
   * @param {'overwrite-all'|'new-only'|'new-and-overwrite'} mode
   * @param {object} sanitizedData - 已過濾的備份數據
   * @private
   */
  async _executeImport(mode, sanitizedData) {
    try {
      const localData = await getAllLocalStorage();
      const {
        dataToWrite,
        keysToRemove,
        effectiveNewCount,
        effectiveOverwriteCount,
        skipCount,
        conflictSkipCount,
        hasWork,
      } = buildImportExecutionPlan(mode, sanitizedData, localData);

      // 使用者看到的「跳過」數合併顯示 identical + conflict-skipped，保持現有 UI 行為
      const displaySkipCount = skipCount + conflictSkipCount;

      if (!hasWork) {
        // 區分「真正無差異」與「new-only 模式下全為衝突」兩種 no-op 情境
        const message =
          effectiveNewCount === 0 && conflictSkipCount > 0
            ? UI_MESSAGES.STORAGE.IMPORT_NEW_ONLY_ALL_CONFLICTS(conflictSkipCount)
            : UI_MESSAGES.STORAGE.IMPORT_NOTHING_TO_DO;
        this.showDataStatus(message, 'info');
        if (this.elements.importFile) {
          this.elements.importFile.value = '';
        }
        return;
      }

      // 真正要進行 I/O 時才顯示「正在匯入」；避免被 _showImportModeSelector 立即清空
      this.showDataStatus(UI_MESSAGES.STORAGE.IMPORT_START, 'info');

      if (Object.keys(dataToWrite).length > 0) {
        await chrome.storage.local.set(dataToWrite);
      }
      if (keysToRemove.length > 0) {
        try {
          await chrome.storage.local.remove(keysToRemove);
        } catch (removeError) {
          // 策略：維持 set-first 以避免「舊資料已清除、新資料未寫入」的資料損毀；
          // 若 remove 失敗則新資料已落地、但遺留 legacy key，明確標註「部分匯入已套用」以利診斷
          Logger.error('Import partially applied: new data written but legacy keys remove failed', {
            action: 'import_backup',
            result: 'partial',
            writtenCount: Object.keys(dataToWrite).length,
            pendingRemoveCount: keysToRemove.length,
            error: removeError,
          });
          throw removeError;
        }
      }

      const icon = UI_ICONS.SUCCESS;
      this.showDataStatus(
        `${icon} ${UI_MESSAGES.STORAGE.IMPORT_SUCCESS(effectiveNewCount, effectiveOverwriteCount, displaySkipCount)}`,
        'success'
      );
      Logger.success('匯入完成', {
        action: 'import_backup',
        result: 'success',
        addedCount: effectiveNewCount,
        overwrittenCount: effectiveOverwriteCount,
        skippedCount: displaySkipCount,
      });

      if (this.elements.importFile) {
        this.elements.importFile.value = '';
      }

      // 保留現行為：2 秒後 reload，讓統計與健康度反映新資料
      setTimeout(() => {
        globalThis.location.reload();
      }, 2000);
    } catch (error) {
      this._handleImportFailure(error);
    }
  }

  /**
   * 集中式匯入失敗處理：Logger + sanitizeApiError + UI 錯誤訊息 + 清理 importFile
   *
   * @param {Error} error
   * @private
   */
  _handleImportFailure(error) {
    Logger.error('Import failed', { action: 'import_backup', error });
    const icon = UI_ICONS.ERROR;
    const safeMessage = sanitizeApiError(error, 'import_backup');
    const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
    this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.IMPORT_FAILED}${errorMsg}`, 'error');
    if (this.elements.importFile) {
      this.elements.importFile.value = '';
    }
  }

  /**
   * 確保按鈕具有正確的 DOM 結構（圖標與文字容器）
   *
   * @param {HTMLElement} btn
   * @returns {{iconWrap: HTMLElement, textSpan: HTMLElement}}
   * @private
   */
  _ensureUsageButtonStructure(btn) {
    let iconWrap = btn.querySelector('span.icon');
    if (!iconWrap) {
      iconWrap = document.createElement('span');
      iconWrap.className = 'icon';
      btn.insertBefore(iconWrap, btn.firstChild);
    }
    let textSpan = btn.querySelector('span.button-text');
    if (!textSpan) {
      textSpan = document.createElement('span');
      textSpan.className = 'button-text';
      btn.append(textSpan);
    }
    return { iconWrap, textSpan };
  }

  async updateStorageUsage() {
    const button = this.elements.refreshUsageButton;
    if (!button) {
      return;
    }

    // 添加加載狀態
    this._updateUsageButtonState(button, 'loading', '更新中...', true);

    try {
      Logger.start('開始更新存儲使用量統計');
      const report = await getStorageHealthReport();
      this._lastHealthReport = report;
      this.updateUsageDisplay(report);
      this.updateHealthDisplay(report);

      // 顯示成功提示
      this._updateUsageButtonState(button, 'success', '已更新');
      setTimeout(() => {
        this._updateUsageButtonState(button, 'default', '刷新統計', false);
      }, 1500);
      Logger.success('存儲使用量更新完成');
    } catch (error) {
      Logger.error('Failed to get storage usage', { action: 'get_usage', error });

      // 顯示錯誤狀態
      this._updateUsageButtonState(button, 'error', '更新失敗');
      setTimeout(() => {
        this._updateUsageButtonState(button, 'default', '刷新統計', false);
      }, 2000);
    }
  }

  /**
   * 輔助方法：統一更新使用量按鈕的狀態
   *
   * @param {HTMLElement} button
   * @param {string} state 狀態 (loading, success, error, default)
   * @param {string} text 顯示文字
   * @param {boolean} disabled 是否禁用
   * @private
   */
  _updateUsageButtonState(button, state, text, disabled = false) {
    if (!button) {
      return;
    }

    const { iconWrap, textSpan } = this._ensureUsageButtonStructure(button);

    // SVG Icons
    const stateIcons = {
      success: UI_ICONS.SUCCESS,
      error: UI_ICONS.ERROR,
      loading: UI_ICONS.REFRESH,
      default: UI_ICONS.REFRESH,
    };
    const iconHtml = stateIcons[state] || stateIcons.default;

    // 更新圖標（安全方式）
    iconWrap.textContent = '';
    const safe = createSafeIcon(iconHtml);
    const svg = safe.querySelector('svg');

    if (svg) {
      if (!svg.classList.contains('icon-svg')) {
        svg.classList.add('icon-svg');
      }
      if (state === 'loading') {
        svg.classList.add('spin');
      }
      iconWrap.append(svg);
    } else {
      iconWrap.append(safe);
    }

    // 更新文字
    textSpan.textContent = text;
    button.disabled = disabled;
  }

  updateUsageDisplay(usage) {
    if (!this.elements.usageFill) {
      return;
    }

    this.elements.usageFill.style.width = `${usage.percentage}%`;
    const usedMB = Number.parseFloat(usage.usedMB);

    this.elements.usageFill.className = 'usage-fill';
    if (usedMB > 80) {
      this.elements.usageFill.classList.add('danger');
    } else if (usedMB > 50) {
      this.elements.usageFill.classList.add('warning');
    }

    this.elements.usagePercentage.textContent = `${usage.percentage}%`;

    if (usage.isUnlimited) {
      this.elements.usageDetails.textContent = `${usage.usedMB} MB（無限存儲）`;
    } else {
      this.elements.usageDetails.textContent = `${usage.usedMB} MB`;
    }

    this.elements.pagesCount.textContent = usage.pages.toLocaleString();
    this.elements.highlightsCount.textContent = usage.highlights.toLocaleString();
    this.elements.configCount.textContent = usage.configs;

    // 條件判斷順序：先檢查更高的閾值（>100MB），再檢查較低的閾值（>80MB）
    if (usedMB > 100) {
      const alertIcon = UI_ICONS.WARNING;
      this.showDataStatus(
        `${alertIcon} ${UI_MESSAGES.STORAGE.USAGE_TOO_LARGE(usage.usedMB)}`,
        'error'
      );
    } else if (usedMB > 80) {
      const icon = UI_ICONS.WARNING;
      this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.USAGE_LARGE(usage.usedMB)}`, 'warning');
    }
  }

  /**
   * 更新健康狀態顯示區塊，並根據清理計劃控制「執行清理」按鈕的可見性
   *
   * @param {object} report getStorageHealthReport() 的報告結果
   */
  updateHealthDisplay(report) {
    const el = this.elements.healthStatus;
    if (!el) {
      return;
    }

    el.textContent = '';
    el.className = 'health-status';

    const { corruptedData, migrationKeys, migrationDataSize, legacySavedKeys, cleanupPlan } =
      report;

    this._renderHealthMainStatus(el, corruptedData, migrationKeys, migrationDataSize, cleanupPlan);
    this._renderLegacySavedInfo(el, legacySavedKeys);
    this._renderCleanupSummary(el, cleanupPlan);
  }

  /**
   * 渲染健康度主狀態（ok / warning / error）
   *
   * 判定優先序（MUST NOT 違反）：
   * 1. corruptedData > 0 → error
   * 2. migrationKeys > 0 → warning（HEALTH_MIGRATION_LEFTOVERS）
   * 3. cleanupPlan.totalKeys > 0 → warning（HEALTH_NEEDS_CLEANUP）
   * 否則 → HEALTH_OK
   *
   * migrationKeys 必須先於 cleanupPlan.totalKeys / cleanupPlan.items 檢查，
   * 確保 migration leftover 顯示 HEALTH_MIGRATION_LEFTOVERS，而不是一般 HEALTH_NEEDS_CLEANUP。
   * 上述規則確保「有可清理項目時 MUST NOT 顯示 HEALTH_OK」，消除 UI 語意衝突。
   *
   * @private
   * @param {HTMLElement} el 容器元素
   * @param {Array} corruptedData 損壞數據清單
   * @param {number} migrationKeys 升級殘留數量
   * @param {number} migrationDataSize 升級殘留大小（bytes）
   * @param {{ totalKeys: number }} cleanupPlan 清理計劃
   */
  _renderHealthMainStatus(el, corruptedData, migrationKeys, migrationDataSize, cleanupPlan) {
    const HEALTH_ITEM_CLASS = 'health-item';
    const item = document.createElement('div');
    item.className = HEALTH_ITEM_CLASS;

    if (corruptedData.length > 0) {
      el.classList.add('health-error');
      item.textContent = UI_MESSAGES.STORAGE.HEALTH_CORRUPTED(corruptedData.length);
    } else if (migrationKeys > 0) {
      el.classList.add('health-warning');
      const migrationSizeKB = (migrationDataSize / 1024).toFixed(1);
      item.textContent = UI_MESSAGES.STORAGE.HEALTH_MIGRATION_LEFTOVERS(
        migrationKeys,
        migrationSizeKB
      );
    } else if (cleanupPlan.totalKeys > 0) {
      // 有孤兒 / 空記錄等可清理項目，但無損壞也無 migration leftover：顯示 warning 而非 HEALTH_OK
      el.classList.add('health-warning');
      item.textContent = UI_MESSAGES.STORAGE.HEALTH_NEEDS_CLEANUP;
    } else {
      el.classList.add('health-ok');
      item.textContent = UI_MESSAGES.STORAGE.HEALTH_OK;
    }
    el.append(item);
  }

  /**
   * 渲染舊版網頁保存紀錄提示（純資訊，不影響健康度）
   *
   * @private
   * @param {HTMLElement} el 容器元素
   * @param {number} legacySavedKeys 舊版紀錄數量
   */
  _renderLegacySavedInfo(el, legacySavedKeys) {
    if (legacySavedKeys <= 0) {
      return;
    }
    const info = document.createElement('div');
    info.className = 'health-item health-legacy-info';
    info.textContent = UI_MESSAGES.STORAGE.HEALTH_LEGACY_SAVED(legacySavedKeys);
    el.append(info);
  }

  /**
   * 渲染清理摘要，並控制「執行清理」按鈕的可見性
   *
   * @private
   * @param {HTMLElement} el 容器元素
   * @param {object} cleanupPlan 清理計劃
   */
  _renderCleanupSummary(el, cleanupPlan) {
    const { totalKeys, spaceFreed, summary } = cleanupPlan;
    const btn = this.elements.executeCleanupButton;

    if (totalKeys <= 0) {
      if (btn) {
        btn.style.display = 'none';
      }
      return;
    }

    const spaceKB = (spaceFreed / 1024).toFixed(1);
    const summaryEl = document.createElement('div');
    summaryEl.className = 'health-item health-cleanup-summary';

    const parts = [];
    if (summary.emptyRecords > 0) {
      parts.push(`${summary.emptyRecords} 個空記錄`);
    }
    if (summary.orphanRecords > 0) {
      parts.push(`${summary.orphanRecords} 個孤兒資料`);
    }
    if (summary.migrationLeftovers > 0) {
      parts.push(`${summary.migrationLeftovers} 個升級殘留`);
    }
    if (summary.corruptedRecords > 0) {
      parts.push(`${summary.corruptedRecords} 個損壞項目`);
    }

    summaryEl.textContent = UI_MESSAGES.STORAGE.CLEANUP_SUMMARY(parts, spaceKB);
    el.append(summaryEl);

    if (btn) {
      btn.style.display = 'inline-block';
    }
  }

  /**
   * 執行統一清理：使用暫存的 _lastHealthReport.cleanupPlan 執行清理
   * 清理完成後重新呼叫 updateStorageUsage() 刷新全部狀態
   */
  async executeUnifiedCleanup() {
    const cachedPlan = this._lastHealthReport?.cleanupPlan;
    if (!cachedPlan || cachedPlan.items.length === 0) {
      this.showDataStatus(UI_MESSAGES.STORAGE.NO_CLEANUP_NEEDED, 'info', 'cleanupStatus');
      return;
    }

    const button = this.elements.executeCleanupButton;
    if (button) {
      button.disabled = true;
    }

    try {
      this.showDataStatus(UI_MESSAGES.STORAGE.CLEANUP_EXECUTING, 'info', 'cleanupStatus');

      const latestReport = await getStorageHealthReport();
      this._lastHealthReport = latestReport;

      const latestItemsByKey = new Map(
        latestReport.cleanupPlan.items.map(item => [item.key, item])
      );
      const validatedItems = cachedPlan.items
        .map(item => latestItemsByKey.get(item.key))
        .filter(Boolean);

      if (validatedItems.length === 0) {
        this.updateHealthDisplay(latestReport);
        this.showDataStatus(UI_MESSAGES.STORAGE.NO_CLEANUP_NEEDED, 'info', 'cleanupStatus');
        return;
      }

      Logger.start('開始執行統一清理', {
        action: 'executeUnifiedCleanup',
        operation: 'validateCleanupPlan',
        count: validatedItems.length,
      });

      const keysToRemove = validatedItems.map(item => item.key);

      await new Promise((resolve, reject) => {
        chrome.storage.local.remove(keysToRemove, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      const actualFreed = validatedItems.reduce(
        (total, item) => total + (typeof item.size === 'number' ? item.size : 0),
        0
      );
      const spaceKB = (actualFreed / 1024).toFixed(1);
      Logger.success('統一清理完成', {
        action: 'executeUnifiedCleanup',
        result: 'success',
        removedCount: keysToRemove.length,
        freedBytes: actualFreed,
      });
      this.showDataStatus(
        UI_MESSAGES.STORAGE.UNIFIED_CLEANUP_SUCCESS(keysToRemove.length, spaceKB),
        'success',
        'cleanupStatus'
      );

      // 清理後重新刷新全部狀態（包含健康度和清理按鈕）
      await this.updateStorageUsage();
    } catch (error) {
      Logger.error('執行統一清理失敗', {
        action: 'executeUnifiedCleanup',
        result: 'failed',
        error,
      });
      const safeMessage = sanitizeApiError(error, 'executeUnifiedCleanup');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(UI_MESSAGES.STORAGE.CLEANUP_FAILED(errorMsg), 'error', 'cleanupStatus');
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  /**
   * 顯示資料管理狀態訊息（安全版本）
   *
   * Security Note: 此函數僅應接收內部可信的訊息字串
   * - SVG/Emoji 圖標內容應由系統內部生成，不應來自外部輸入
   * - 所有外部錯誤訊息必須先經過 sanitizeApiError() 清理
   * - message 參數不應直接包含未經驗證的用戶輸入或 API 響應
   *
   * @param {string} message - 訊息內容（可包含 Emoji 或系統生成的 SVG）
   * @param {string} type - 訊息類型（success, error, info）
   * @param {string} elementKey - 目標容器屬性名，預設為 'dataStatus'
   */
  showDataStatus(message, type, elementKey = 'dataStatus') {
    const targetElement = this.elements[elementKey];
    if (!targetElement) {
      return;
    }

    // 使用共用函數分離圖標和文本（統一處理 Emoji 和 SVG）
    const { icon, text } = separateIconAndText(message);

    // SVG 安全驗證：使用 securityUtils 統一處理
    // 即使預期只接收內部生成的 SVG，仍進行驗證作為縱深防禦
    let safeIcon = icon;
    if (icon && !validateSafeSvg(icon)) {
      safeIcon = ''; // 拒絕不安全的 SVG
    }

    // [優化] 如果訊息本身不帶圖標，根據 type 自動匹配預設圖標
    if (!safeIcon) {
      switch (type) {
        case 'success': {
          safeIcon = UI_ICONS.SUCCESS;
          break;
        }
        case 'error': {
          safeIcon = UI_ICONS.ERROR;
          break;
        }
        case 'warning': {
          safeIcon = UI_ICONS.WARNING;
          break;
        }
        case 'info': {
          safeIcon = UI_ICONS.INFO;
          break;
        }
        default: {
          safeIcon = UI_ICONS.INFO;
          break;
        }
      }
    }

    // 清空內容
    targetElement.textContent = '';

    // 如果有圖標，插入圖標
    if (safeIcon) {
      const iconSpan = createSafeIcon(safeIcon);
      iconSpan.className = 'status-icon';
      targetElement.append(iconSpan);
    }

    // 使用 textContent 設置文本（防止 XSS），並支持換行
    if (text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'status-text';

      // 處理換行符：將文本按 \n 分割，並插入 <br> 標籤
      const lines = text.split('\n');
      const numberRegex = /^\d+$/; // 嚴格匹配純數字

      lines.forEach((line, index) => {
        // Tokenization: 將字串分割為 [文字, 數字, 文字...]
        // 使用 capture group Keeping the separator in the result
        const tokens = line.split(/(\d+)/);

        tokens.forEach(token => {
          if (!token) {
            return;
          } // 忽略空字串

          if (numberRegex.test(token)) {
            // 如果是純數字，這是我們生成的數據，安全地套用樣式
            const numSpan = document.createElement('span');
            numSpan.className = 'highlight-primary';
            numSpan.textContent = token; // 使用 textContent
            textSpan.append(numSpan);
          } else {
            // 其他文字，使用 TextNode 自動轉義
            textSpan.append(document.createTextNode(token));
          }
        });

        if (index < lines.length - 1) {
          textSpan.append(document.createElement('br'));
        }
      });

      targetElement.append(textSpan);
    }

    targetElement.classList.remove('success', 'error', 'info', 'warning');
    targetElement.classList.add('status-message', type);
  }
}
