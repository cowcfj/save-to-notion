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
  setAccountSectionVisible,
  setAccountStatusError,
  updateUIForLoggedOutAccount,
  updateUIForLoggedInAccount,
  updateUIForSavedPage,
  updateUIForUnsavedPage,
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
  getPopupAccountState,
  startAccountLogin,
  openAccountManagement,
} from './popupActions.js';
import Logger from '../scripts/utils/Logger.js';
import { BUILD_ENV } from '../scripts/config/env/index.js';
import { RUNTIME_ACTIONS } from '../scripts/config/shared/runtimeActions.js';
import { isSavedStatusResponse } from '../scripts/config/saveStatus.js';
import { ErrorHandler } from '../scripts/utils/ErrorHandler.js';
import { ERROR_MESSAGES, UI_MESSAGES } from '../scripts/config/shared/messages.js';
import { sanitizeApiError } from '../scripts/utils/securityUtils.js';

const DEFAULT_ERROR = 'Unknown Error';

async function initAccountSection(elements) {
  if (BUILD_ENV.ENABLE_ACCOUNT) {
    const accountState = await getPopupAccountState();
    setAccountSectionVisible(elements, accountState.enabled);

    if (accountState.enabled) {
      if (accountState.isLoggedIn) {
        updateUIForLoggedInAccount(elements, accountState.profile, {
          transientRefreshError: accountState.transientRefreshError,
        });
      } else {
        updateUIForLoggedOutAccount(elements);
      }
    }

    return;
  }

  setAccountSectionVisible(elements, false);
}

// Export initialization function for testing
export async function initPopup() {
  Logger.start('[Popup] Initializing...');

  // 注入 SVG 圖標
  injectIcons(UI_ICONS);

  // 獲取所有 DOM 元素
  const elements = getElements();
  await initAccountSection(elements);

  // 檢查設置
  const settings = await checkSettings();
  if (!settings.valid) {
    // 根據實際缺失的設定顯示對應的提示訊息
    let msg = UI_MESSAGES.SETUP.MISSING_CONFIG;
    if (settings.missingReason === 'missing_data_source') {
      msg = ERROR_MESSAGES.USER_MESSAGES.SETUP_MISSING_DATA_SOURCE;
    } else if (settings.missingReason === 'missing_auth') {
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
      if (isSavedStatusResponse(pageStatus)) {
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

      // savePage 成功回應已帶 canonical status，直接交給 UI 消費
      updateUIForSavedPage(elements, response);
      Logger.success('[Popup] Page saved successfully', { url: response.url });

      // 🔑 保存完成後，通知 Content Script 創建並顯示 Toolbar
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { action: RUNTIME_ACTIONS.SHOW_TOOLBAR });
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
        setStatus(elements, '側邊欄無法在此頁面開啟。', '#d63384');
      }
    });
  }

  if (elements.accountButton) {
    elements.accountButton.addEventListener('click', async () => {
      const accountState = BUILD_ENV.ENABLE_ACCOUNT
        ? await getPopupAccountState()
        : { enabled: false, isLoggedIn: false };

      if (!accountState.enabled) {
        return;
      }

      if (accountState.isLoggedIn) {
        const result = await openAccountManagement();
        if (!result?.success) {
          setAccountStatusError(
            elements,
            result.error || UI_MESSAGES.ACCOUNT.ACCOUNT_MANAGEMENT_OPEN_FAILED
          );
        }
        return;
      }

      const result = await startAccountLogin();
      if (!result?.success) {
        setAccountStatusError(elements, result.error || UI_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED);
      }
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initPopup);
