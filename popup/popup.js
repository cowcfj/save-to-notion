/**
 * Popup 入口文件
 *
 * 職責：
 * - 獲取 DOM 元素
 * - 綁定事件監聯器
 * - 調用 UI 和 Actions 模組
 */

/* global chrome */

import {
  getElements,
  setStatus,
  setButtonState,
  updateUIForSavedPage,
  updateUIForUnsavedPage,
  showModal,
  hideModal,
  formatSaveSuccessMessage,
} from './popupUI.js';
import {
  checkSettings,
  checkPageStatus,
  savePage,
  startHighlight,
  openNotionPage,
  getActiveTab,
  clearHighlights,
} from './popupActions.js';
import Logger from '../scripts/utils/Logger.js';
import { ErrorHandler } from '../scripts/utils/ErrorHandler.js';
import { ERROR_MESSAGES, UI_MESSAGES } from '../scripts/config/messages.js';
import { sanitizeApiError } from '../scripts/utils/securityUtils.js';

// Export initialization function for testing
export async function initPopup() {
  // 獲取所有 DOM 元素
  const elements = getElements();

  // 檢查設置
  const settings = await checkSettings();
  if (!settings.valid) {
    // 根據實際缺失的設定顯示對應的提示訊息
    const msg = !settings.apiKey
      ? ERROR_MESSAGES.USER_MESSAGES.SETUP_MISSING_API_KEY
      : !settings.dataSourceId
        ? ERROR_MESSAGES.USER_MESSAGES.SETUP_MISSING_DATA_SOURCE
        : UI_MESSAGES.SETUP.MISSING_CONFIG;
    setStatus(elements, msg);
    setButtonState(elements.saveButton, true);
    setButtonState(elements.highlightButton, true);
    return;
  }

  // 檢查頁面狀態並更新 UI（強制刷新以獲取最新狀態）
  try {
    const pageStatus = await checkPageStatus({ forceRefresh: true });

    if (pageStatus?.success) {
      if (pageStatus.isSaved) {
        updateUIForSavedPage(elements, pageStatus);
      } else {
        updateUIForUnsavedPage(elements, pageStatus);
      }
    }
  } catch (error) {
    Logger.error('Failed to initialize popup:', error);
    // 將實際錯誤經過 sanitizeApiError 清洗後再格式化，提供更精確的錯誤提示
    const safeMessage = sanitizeApiError(error, 'popup_init');
    const msg = ErrorHandler.formatUserMessage(safeMessage);
    setStatus(elements, msg, '#d63384');
  }

  // ========== 事件監聽器 ==========

  // 保存按鈕
  elements.saveButton.addEventListener('click', async () => {
    setStatus(elements, UI_MESSAGES.POPUP.SAVING);
    setButtonState(elements.saveButton, true);

    const response = await savePage();

    if (response?.success) {
      const message = formatSaveSuccessMessage(response);
      setStatus(elements, message);

      // 直接更新 UI，避免額外的 API 請求和潛在的一致性延遲
      // Mapping savePage response to pageStatus format
      const directPageStatus = {
        success: true,
        isSaved: true,
        notionUrl: response.url,
        // notionPageId 並非必須用於 updateUIForSavedPage，除非需要鏈接
        notionPageId: response.notionPageId || response.pageId,
        title: response.title || 'Untitled',
      };

      updateUIForSavedPage(elements, directPageStatus);

      // 🔑 保存完成後，通知 Content Script 創建並顯示 Toolbar
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { action: 'showToolbar' });
        }
      } catch (error) {
        // 如果 Content Script 尚未注入，忽略錯誤
        Logger.warn(ERROR_MESSAGES.TECHNICAL.TOOLBAR_SHOW_FAILED, {
          action: 'showToolbar',
          error,
        });
      }
    } else {
      const errorMsg = ErrorHandler.formatUserMessage(response?.error);
      setStatus(elements, `${UI_MESSAGES.POPUP.SAVE_FAILED_PREFIX}${errorMsg}`);
    }

    // 延遲後重新啟用按鈕
    setTimeout(() => {
      setButtonState(elements.saveButton, false);
    }, 3000);
  });

  // 標記按鈕
  elements.highlightButton.addEventListener('click', async () => {
    // 檢查頁面是否已保存
    const statusResponse = await checkPageStatus({ forceRefresh: true });

    if (!statusResponse?.isSaved) {
      const msg = ErrorHandler.formatUserMessage('Page not saved');
      // 先以警告色 (#d63384) 顯示訊息，提供即時視覺回饋
      setStatus(elements, msg, '#d63384');
      // 2 秒後重置為預設顏色，但保留訊息內容（紅色短暫閃現後淡化為預設色）
      setTimeout(() => {
        setStatus(elements, msg);
      }, 2000);
      return;
    }

    // 啟動標記模式
    setStatus(elements, UI_MESSAGES.POPUP.HIGHLIGHT_STARTING);
    setButtonState(elements.highlightButton, true);

    const response = await startHighlight();

    if (response?.success) {
      setStatus(elements, UI_MESSAGES.POPUP.HIGHLIGHT_ACTIVATED);
      setTimeout(() => {
        window.close();
      }, 1000);
    } else {
      setStatus(elements, UI_MESSAGES.POPUP.HIGHLIGHT_FAILED);
      Logger.error('Failed to start highlight mode', {
        action: 'startHighlight',
        error: response?.error,
      });
    }

    setTimeout(() => {
      setButtonState(elements.highlightButton, false);
    }, 2000);
  });

  // 打開 Notion 按鈕
  elements.openNotionButton.addEventListener('click', async () => {
    const notionUrl = elements.openNotionButton.getAttribute('data-url');
    if (notionUrl) {
      const result = await openNotionPage(notionUrl);
      if (!result.success) {
        setStatus(elements, UI_MESSAGES.POPUP.OPEN_NOTION_FAILED);
        Logger.error('Failed to open Notion page', {
          action: 'openNotionPage',
          error: result.error,
        });
      }
    }
  });

  // 清除標記按鈕
  elements.clearHighlightsButton.addEventListener('click', () => {
    showModal(elements, UI_MESSAGES.POPUP.CLEAR_CONFIRM);
  });

  // Modal Overlay 點擊關閉 (Click to close)
  if (elements.modal) {
    elements.modal.addEventListener('click', event => {
      // 確保只在點擊 overlay 本身時關閉，而不是點擊內容時
      if (event.target === elements.modal) {
        hideModal(elements);
      }
    });
  }

  // Modal 取消按鈕
  elements.modalCancel.addEventListener('click', () => {
    hideModal(elements);
  });

  // Modal 確認按鈕
  elements.modalConfirm.addEventListener('click', async () => {
    hideModal(elements);
    setStatus(elements, UI_MESSAGES.POPUP.CLEARING);
    setButtonState(elements.clearHighlightsButton, true);

    const activeTab = await getActiveTab();
    if (!activeTab?.id) {
      setStatus(elements, UI_MESSAGES.POPUP.CLEAR_FAILED);
      setButtonState(elements.clearHighlightsButton, false);
      return;
    }

    const result = await clearHighlights(activeTab.id, activeTab.url);

    if (result.success) {
      setStatus(elements, UI_MESSAGES.POPUP.CLEAR_SUCCESS(result.clearedCount));
      setTimeout(() => {
        setButtonState(elements.clearHighlightsButton, false);
        setStatus(elements, UI_MESSAGES.POPUP.PAGE_READY);
      }, 2000);
    } else {
      setStatus(elements, UI_MESSAGES.POPUP.CLEAR_FAILED);
      setButtonState(elements.clearHighlightsButton, false);
      Logger.error('Failed to clear highlights', {
        action: 'clearHighlights',
        error: result.error,
      });
    }
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initPopup);
