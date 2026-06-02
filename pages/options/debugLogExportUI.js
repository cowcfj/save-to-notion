/* global chrome */
import { UI_MESSAGES, ERROR_MESSAGES } from '../../scripts/config/shared/messages.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/shared/runtimeActions.js';
import Logger from '../../scripts/utils/Logger.js';
import { ErrorHandler } from '../../scripts/utils/ErrorHandler.js';
import { sanitizeApiError, validateLogExportData } from '../../scripts/utils/securityUtils.js';

const UI_CLASS_STATUS_MSG = 'status-message';

/**
 * 向 Background 請求導出偵錯日誌
 *
 * @returns {Promise<object>} response
 */
async function requestDebugLogExport() {
  return chrome.runtime.sendMessage({
    action: RUNTIME_ACTIONS.EXPORT_DEBUG_LOGS,
    format: 'json',
  });
}

/**
 * 驗證導出的日誌回應並回傳合法的 data
 *
 * @param {object} response
 * @returns {object} response.data
 */
function resolveValidLogExportData(response) {
  if (!response) {
    throw new Error(ERROR_MESSAGES.TECHNICAL.BACKGROUND_NO_RESPONSE);
  }

  // 檢查 error 屬性 (優先處理明確的錯誤訊息)
  if (response.error) {
    throw new Error(response.error);
  }

  // 檢查 success 欄位
  if (!response.success) {
    throw new Error(ERROR_MESSAGES.TECHNICAL.LOG_EXPORT_FAILED);
  }

  const data = response.data;

  // 審核要求：驗證外部輸入
  validateLogExportData(data);

  return data;
}

/**
 * 觸發日誌下載流程
 *
 * @param {object} params
 * @param {string} params.filename
 * @param {string} params.content
 * @param {string} params.mimeType
 */
function downloadLogExportData({ filename, content, mimeType }) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = filename;
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * 顯示日誌導出成功狀態
 *
 * @param {Element} statusEl
 * @param {number} count
 */
function showLogExportSuccess(statusEl, count) {
  statusEl.textContent = UI_MESSAGES.LOGS.EXPORT_SUCCESS(count);
  statusEl.className = `${UI_CLASS_STATUS_MSG} success`;

  // 3秒後清除成功訊息
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = UI_CLASS_STATUS_MSG;
  }, 3000);
}

/**
 * 顯示日誌導出失敗狀態
 *
 * @param {Element} statusEl
 * @param {Error|any} error
 */
function showLogExportError(statusEl, error) {
  Logger.error('Log export failed', {
    action: 'setupLogExport',
    error: error.message || error,
    stack: error.stack,
  });

  // 使用標準化的錯誤處理機制
  const safeReason = sanitizeApiError(error, 'export_debug_logs');
  const userFriendlyMsg = ErrorHandler.formatUserMessage(safeReason);

  // 組合最終訊息
  const errorMessage = `${UI_MESSAGES.LOGS.EXPORT_FAILED_PREFIX}${userFriendlyMsg}`;

  statusEl.textContent = errorMessage;
  statusEl.className = `${UI_CLASS_STATUS_MSG} error`;

  // 5秒後清除錯誤訊息
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = UI_CLASS_STATUS_MSG;
  }, 5000);
}

/**
 * 設置偵錯日誌導出 UI 控制器
 */
export function setupDebugLogExport() {
  const exportBtn = document.querySelector('#export-logs-button');
  const statusEl = document.querySelector('#export-status');

  if (exportBtn && statusEl) {
    exportBtn.addEventListener('click', async () => {
      try {
        exportBtn.disabled = true;

        const response = await requestDebugLogExport();
        const data = resolveValidLogExportData(response);

        downloadLogExportData(data);
        showLogExportSuccess(statusEl, data.count);
      } catch (error) {
        showLogExportError(statusEl, error);
      } finally {
        exportBtn.disabled = false;
      }
    });
  }
}
