/**
 * StorageManager.js
 * UI 控制層：負責展示、事件纁定與用戶交互。
 * 純數據邏輯請參閱 storageDataUtils.js
 */

/* global chrome */

import Logger from '../../scripts/utils/Logger.js';
import {
  validateSafeSvg,
  separateIconAndText,
  createSafeIcon,
} from '../../scripts/utils/securityUtils.js';
import { sanitizeApiError } from '../../scripts/utils/ApiErrorSanitizer.js';
import { ErrorHandler } from '../../scripts/utils/ErrorHandler.js';
import { UI_ICONS } from '../../scripts/config/shared/ui.js';
import { UI_MESSAGES } from '../../scripts/config/shared/messages.js';
import {
  sanitizeBackupData,
  getStorageHealthReport,
  getAllLocalStorage,
  buildImportExecutionPlan,
} from './storageDataUtils.js';

/**
 * 驗證備份數據是否為合法的非陣列物件
 *
 * @param {any} data
 * @returns {boolean}
 */
function isBackupDataObject(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data);
}

const STATUS_TYPE_ICONS = {
  success: UI_ICONS.SUCCESS,
  error: UI_ICONS.ERROR,
  warning: UI_ICONS.WARNING,
  info: UI_ICONS.INFO,
};

const CLEANUP_SUMMARY_DESCRIPTORS = [
  { key: 'emptyRecords', label: UI_MESSAGES.STORAGE.CLEANUP_SUMMARY_EMPTY_RECORDS },
  { key: 'orphanRecords', label: UI_MESSAGES.STORAGE.CLEANUP_SUMMARY_ORPHAN_RECORDS },
  { key: 'migrationLeftovers', label: UI_MESSAGES.STORAGE.CLEANUP_SUMMARY_MIGRATION_LEFTOVERS },
  { key: 'corruptedRecords', label: UI_MESSAGES.STORAGE.CLEANUP_SUMMARY_CORRUPTED_RECORDS },
];

/**
 * 解析存儲空間使用狀態（樣式類與顯示狀態）
 *
 * @param {number} usedMB
 * @param {string} displayUsedMB
 * @returns {{fillClass: 'danger'|'warning'|null, statusType: 'error'|'warning'|null, statusMessage: string|null}}
 */
function resolveUsageDisplayState(usedMB, displayUsedMB) {
  if (usedMB > 100) {
    const alertIcon = UI_ICONS.WARNING;
    return {
      fillClass: 'danger',
      statusType: 'error',
      statusMessage: `${alertIcon} ${UI_MESSAGES.STORAGE.USAGE_TOO_LARGE(displayUsedMB)}`,
    };
  }
  if (usedMB > 80) {
    const icon = UI_ICONS.WARNING;
    return {
      fillClass: 'danger',
      statusType: 'warning',
      statusMessage: `${icon} ${UI_MESSAGES.STORAGE.USAGE_LARGE(displayUsedMB)}`,
    };
  }
  if (usedMB > 50) {
    return {
      fillClass: 'warning',
      statusType: null,
      statusMessage: null,
    };
  }
  return {
    fillClass: null,
    statusType: null,
    statusMessage: null,
  };
}

/**
 * 依優先序解析健康度主狀態
 *
 * @param {object} report
 * @returns {{ className: 'health-error'|'health-warning'|'health-ok', message: string }}
 */
function resolveHealthMainStatus(report) {
  const { corruptedData, migrationKeys, migrationDataSize, cleanupPlan } = report;

  if (corruptedData.length > 0) {
    return {
      className: 'health-error',
      message: UI_MESSAGES.STORAGE.HEALTH_CORRUPTED(corruptedData.length),
    };
  }

  if (migrationKeys > 0) {
    const migrationSizeKB = (migrationDataSize / 1024).toFixed(1);
    return {
      className: 'health-warning',
      message: UI_MESSAGES.STORAGE.HEALTH_MIGRATION_LEFTOVERS(migrationKeys, migrationSizeKB),
    };
  }

  if (cleanupPlan.totalKeys > 0) {
    return {
      className: 'health-warning',
      message: UI_MESSAGES.STORAGE.HEALTH_NEEDS_CLEANUP,
    };
  }

  return {
    className: 'health-ok',
    message: UI_MESSAGES.STORAGE.HEALTH_OK,
  };
}

/**
 * 建立清理摘要的部分字串
 *
 * @param {object} summary
 * @returns {string[]}
 */
function buildCleanupSummaryParts(summary) {
  return CLEANUP_SUMMARY_DESCRIPTORS.filter(({ key }) => summary[key] > 0).map(
    ({ key, label }) => `${summary[key]} ${label}`
  );
}

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
      if (!isBackupDataObject(backup?.data)) {
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
    this._clearImportFileInput();
  }

  /**
   * 清除匯入檔案輸入框的選取值
   *
   * @private
   */
  _clearImportFileInput() {
    if (this.elements.importFile) {
      this.elements.importFile.value = '';
    }
  }

  /**
   * 判定並回傳無需進行任何匯入操作時的無效操作訊息
   *
   * @private
   * @param {object} params
   * @param {number} params.effectiveNewCount
   * @param {number} params.conflictSkipCount
   * @returns {string}
   */
  _resolveImportNoWorkMessage({ effectiveNewCount, conflictSkipCount }) {
    return effectiveNewCount === 0 && conflictSkipCount > 0
      ? UI_MESSAGES.STORAGE.IMPORT_NEW_ONLY_ALL_CONFLICTS(conflictSkipCount)
      : UI_MESSAGES.STORAGE.IMPORT_NOTHING_TO_DO;
  }

  /**
   * 完成成功匯入後的狀態顯示、日誌記錄與頁面重整排程
   *
   * @private
   * @param {object} params
   * @param {number} params.effectiveNewCount
   * @param {number} params.effectiveOverwriteCount
   * @param {number} params.displaySkipCount
   */
  _finishSuccessfulImport({ effectiveNewCount, effectiveOverwriteCount, displaySkipCount }) {
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

    this._clearImportFileInput();

    // 保留現行為：2 秒後 reload，讓統計與健康度反映新資料
    setTimeout(() => {
      globalThis.location.reload();
    }, 2000);
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
        const message = this._resolveImportNoWorkMessage({
          effectiveNewCount,
          conflictSkipCount,
        });
        this.showDataStatus(message, 'info');
        this._clearImportFileInput();
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

      this._finishSuccessfulImport({
        effectiveNewCount,
        effectiveOverwriteCount,
        displaySkipCount,
      });
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
    this._clearImportFileInput();
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
    const { fillClass, statusType, statusMessage } = resolveUsageDisplayState(usedMB, usage.usedMB);
    if (fillClass) {
      this.elements.usageFill.classList.add(fillClass);
    }

    this.elements.usagePercentage.textContent = `${usage.percentage}%`;

    this.elements.usageDetails.textContent = usage.isUnlimited
      ? `${usage.usedMB} MB（無限存儲）`
      : `${usage.usedMB} MB`;

    this.elements.pagesCount.textContent = usage.pages.toLocaleString();
    this.elements.highlightsCount.textContent = usage.highlights.toLocaleString();
    this.elements.configCount.textContent = usage.configs;

    if (statusMessage) {
      this.showDataStatus(statusMessage, statusType);
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

    const { legacySavedKeys, cleanupPlan } = report;

    this._renderHealthMainStatus(el, report);
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
   * @private
   * @param {HTMLElement} el 容器元素
   * @param {object} report 健康度報告
   */
  _renderHealthMainStatus(el, report) {
    const { className, message } = resolveHealthMainStatus(report);
    el.classList.add(className);

    const item = document.createElement('div');
    item.className = 'health-item';
    item.textContent = message;
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
        btn.classList.add('hidden');
      }
      return;
    }

    const spaceKB = (spaceFreed / 1024).toFixed(1);
    const summaryEl = document.createElement('div');
    summaryEl.className = 'health-item health-cleanup-summary';

    const parts = buildCleanupSummaryParts(summary);

    summaryEl.textContent = UI_MESSAGES.STORAGE.CLEANUP_SUMMARY(parts, spaceKB);
    el.append(summaryEl);

    if (btn) {
      btn.classList.remove('hidden');
    }
  }

  /**
   * 驗證最新與快照清理項，回傳有效的待清理項目
   *
   * @private
   * @param {Array} cachedItems
   * @param {Array} latestItems
   * @returns {Array}
   */
  _resolveValidatedCleanupItems(cachedItems, latestItems) {
    const latestItemsByKey = new Map(latestItems.map(item => [item.key, item]));
    return cachedItems.map(item => latestItemsByKey.get(item.key)).filter(Boolean);
  }

  /**
   * 將待清理 keys 從 storage 中移除
   *
   * @private
   * @param {string[]} keysToRemove
   * @returns {Promise<void>}
   */
  _removeStorageKeys(keysToRemove) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keysToRemove, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 計算已釋放的總空間大小 (bytes)
   *
   * @private
   * @param {Array} items
   * @returns {number}
   */
  _calculateCleanupFreedBytes(items) {
    return items.reduce(
      (total, item) => total + (typeof item.size === 'number' ? item.size : 0),
      0
    );
  }

  /**
   * 當發現無需任何清理時，更新健康度顯示並顯示無須清理狀態
   *
   * @private
   * @param {object} latestReport
   */
  _showNoCleanupNeededFromLatestReport(latestReport) {
    this.updateHealthDisplay(latestReport);
    this.showDataStatus(UI_MESSAGES.STORAGE.NO_CLEANUP_NEEDED, 'info', 'cleanupStatus');
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

      const validatedItems = this._resolveValidatedCleanupItems(
        cachedPlan.items,
        latestReport.cleanupPlan.items
      );

      if (validatedItems.length === 0) {
        this._showNoCleanupNeededFromLatestReport(latestReport);
        return;
      }

      Logger.start('開始執行統一清理', {
        action: 'executeUnifiedCleanup',
        operation: 'validateCleanupPlan',
        count: validatedItems.length,
      });

      const keysToRemove = validatedItems.map(item => item.key);

      await this._removeStorageKeys(keysToRemove);

      const actualFreed = this._calculateCleanupFreedBytes(validatedItems);
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

    const { icon, text } = separateIconAndText(message);
    const safeIcon = this._resolveSafeStatusIcon(icon, type);

    targetElement.textContent = '';

    this._appendStatusIcon(targetElement, safeIcon);
    this._appendStatusText(targetElement, text);

    targetElement.classList.remove('success', 'error', 'info', 'warning');
    targetElement.classList.add('status-message', type);
  }

  /**
   * 解析出安全的狀態圖標，若不合法或不存在則套用 type 預設圖標
   *
   * @private
   * @param {string} icon
   * @param {string} type
   * @returns {string}
   */
  _resolveSafeStatusIcon(icon, type) {
    const safeIcon = icon && !validateSafeSvg(icon) ? '' : icon;
    return safeIcon || STATUS_TYPE_ICONS[type] || UI_ICONS.INFO;
  }

  /**
   * 將安全圖標附加至目標容器
   *
   * @private
   * @param {HTMLElement} targetElement
   * @param {string} safeIcon
   */
  _appendStatusIcon(targetElement, safeIcon) {
    if (safeIcon) {
      const iconSpan = createSafeIcon(safeIcon);
      iconSpan.className = 'status-icon';
      targetElement.append(iconSpan);
    }
  }

  /**
   * 將狀態文本格式化（支援換行與數字高亮）並附加至目標容器
   *
   * @private
   * @param {HTMLElement} targetElement
   * @param {string} text
   */
  _appendStatusText(targetElement, text) {
    if (!text) {
      return;
    }
    const textSpan = document.createElement('span');
    textSpan.className = 'status-text';

    const lines = text.split('\n');
    lines.forEach((line, index) => {
      this._appendTokenizedStatusLine(textSpan, line);
      if (index < lines.length - 1) {
        textSpan.append(document.createElement('br'));
      }
    });

    targetElement.append(textSpan);
  }

  /**
   * 將單行文本分詞，對其中的純數字套用高亮樣式後追加至 textSpan
   *
   * @private
   * @param {HTMLElement} textSpan
   * @param {string} line
   */
  _appendTokenizedStatusLine(textSpan, line) {
    const tokens = line.split(/(\d+)/);
    const numberRegex = /^\d+$/;

    tokens.forEach(token => {
      if (!token) {
        return;
      }
      if (numberRegex.test(token)) {
        const numSpan = document.createElement('span');
        numSpan.className = 'highlight-primary';
        numSpan.textContent = token;
        textSpan.append(numSpan);
      } else {
        textSpan.append(document.createTextNode(token));
      }
    });
  }
}
