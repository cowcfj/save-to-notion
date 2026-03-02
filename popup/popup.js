/**
 * Popup 入口文件
 *
 * 職責：
 * - 獲取 DOM 元素
 * - 綁定事件監聽器
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
import { injectIcons } from '../scripts/utils/uiUtils.js';
import { UI_ICONS } from '../scripts/config/icons.js';
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

const DEFAULT_ERROR = 'Unknown Error';

// Export initialization function for testing
export async function initPopup() {
  Logger.start('[Popup] Initializing...');

  // 注入 SVG 圖標
  injectIcons(UI_ICONS);

  // 獲取所有 DOM 元素
  const elements = getElements();

  // 檢查設置
  const settings = await checkSettings();
  if (!settings.valid) {
    // 根據實際缺失的設定顯示對應的提示訊息
    let msg = UI_MESSAGES.SETUP.MISSING_CONFIG;
    if (!settings.apiKey) {
      msg = ERROR_MESSAGES.USER_MESSAGES.SETUP_KEY_NOT_CONFIGURED;
    } else if (!settings.dataSourceId) {
      msg = ERROR_MESSAGES.USER_MESSAGES.SETUP_MISSING_DATA_SOURCE;
    }
    setStatus(elements, msg);
    setButtonState(elements.saveButton, true);
    setButtonState(elements.highlightButton, true);
    return;
  }

  // 檢查頁面狀態並更新 UI（使用 TTL cache 避免不必要的 API 呼叫）
  try {
    const pageStatus = await checkPageStatus();

    if (pageStatus?.success) {
      if (pageStatus.isSaved) {
        updateUIForSavedPage(elements, pageStatus);
      } else {
        updateUIForUnsavedPage(elements, pageStatus);
      }
      Logger.success('[Popup] Initialization complete', { pageStatus });
    }
  } catch (error) {
    Logger.error('Failed to initialize popup:', error);
    // 將實際錯誤經過 sanitizeApiError 清洗後再格式化，提供更精確的錯誤提示
    const safeMessage = sanitizeApiError(error, 'popup_init');
    const msg = ErrorHandler.formatUserMessage(safeMessage);
    setStatus(elements, msg, '#d63384');
  }

  // 預取目前分頁資訊，供 manage button 同步呼叫 sidePanel.open() 使用
  // 使用 let 以便 tabs.onActivated 監聽器可以更新它
  let currentTab = await getActiveTab();

  // ========== 事件監聽器 ==========

  // 當使用者切換分頁時更新 currentTab，避免舊的 tabId 導致 sidePanel 開到錯誤的分頁
  chrome.tabs.onActivated.addListener(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0] ?? null;
  });

  // 保存按鈕
  elements.saveButton.addEventListener('click', async () => {
    Logger.start('[Popup] Saving page...');
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
      Logger.success('[Popup] Page saved successfully', { url: response.url });

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
      const safe = sanitizeApiError(response?.error || DEFAULT_ERROR, 'popup_save');
      const errorMsg = ErrorHandler.formatUserMessage(safe);
      setStatus(elements, `${UI_MESSAGES.POPUP.SAVE_FAILED_PREFIX}${errorMsg}`);
    }

    // 延遲後重新啟用按鈕
    setTimeout(() => {
      setButtonState(elements.saveButton, false);
    }, 3000);
  });

  // 標記按鈕
  elements.highlightButton.addEventListener('click', async () => {
    // 啟動標記模式
    Logger.start('[Popup] Starting highlight mode...');
    setStatus(elements, UI_MESSAGES.POPUP.HIGHLIGHT_STARTING);
    setButtonState(elements.highlightButton, true);

    const response = await startHighlight();

    if (response?.success) {
      Logger.success('[Popup] Highlight mode activated');
      setStatus(elements, UI_MESSAGES.POPUP.HIGHLIGHT_ACTIVATED);
      setTimeout(() => {
        window.close();
      }, 1000);
    } else {
      const safe = sanitizeApiError(response?.error || DEFAULT_ERROR, 'popup_start_highlight');
      const msg = ErrorHandler.formatUserMessage(safe);
      setStatus(elements, `${UI_MESSAGES.POPUP.HIGHLIGHT_FAILED_PREFIX}${msg}`);
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
    const notionUrl = elements.openNotionButton.dataset?.url;
    if (notionUrl) {
      const result = await openNotionPage(notionUrl);
      if (!result.success) {
        const safe = sanitizeApiError(result.error || DEFAULT_ERROR, 'popup_open_notion');
        const msg = ErrorHandler.formatUserMessage(safe);
        setStatus(elements, msg);
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
    Logger.start('[Popup] Clearing highlights...');
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
      Logger.success('[Popup] Highlights cleared', { count: result.clearedCount });
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

  // 管理標註按鈕 (開啟 Side Panel)
  // 注意：sidePanel.open() 必須在使用者手勢上下文中同步呼叫，
  // 因此直接在 Popup 頁面呼叫，不經由 background 轉發，
  // 並使用初始化時預取的 currentTab.id（由 tabs.onActivated 保持最新）。
  if (elements.manageButton) {
    elements.manageButton.addEventListener('click', () => {
      if (currentTab?.id) {
        chrome.sidePanel.open({ tabId: currentTab.id });
        window.close();
      } else {
        // currentTab 不可用（例如 chrome:// 頁面、PDF 檢視器）
        setStatus('側邊欄無法在此頁面開啟。', 'error');
      }
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initPopup);
