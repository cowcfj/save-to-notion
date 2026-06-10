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
  initializePopupStaticText,
  setStatus,
  setButtonState,
  setAccountSectionVisible,
  setAccountStatusError,
  updateUIForLoggedOutAccount,
  updateUIForLoggedInAccount,
  renderDestinationSelector,
  updateUIForSavedPage,
  updateUIForUnsavedPage,
  formatSaveSuccessMessage,
} from './popupUI.js';
import { injectIcons } from '../../scripts/utils/uiUtils.js';
import { UI_ICONS } from '../../scripts/config/shared/ui.js';
import {
  checkSettings,
  checkPageStatus,
  savePage,
  getDestinationState,
  startHighlight,
  openNotionPage,
  getActiveTab,
  getPopupAccountState,
  startAccountLogin,
  openAccountManagement,
} from './popupActions.js';
import Logger from '../../scripts/utils/Logger.js';
import { BUILD_ENV } from '../../scripts/config/env/index.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/shared/runtimeActions.js';
import { isSavedStatusResponse } from '../../scripts/config/shared/saveStatus.js';
import { ErrorHandler } from '../../scripts/utils/ErrorHandler.js';
import { ERROR_MESSAGES, UI_MESSAGES } from '../../scripts/config/shared/messages.js';
import { sanitizeApiError } from '../../scripts/utils/ApiErrorSanitizer.js';

const DEFAULT_ERROR = 'Unknown Error';

async function initAccountSection(elements) {
  if (BUILD_ENV.ENABLE_ACCOUNT) {
    const accountState = await getPopupAccountState();
    setAccountSectionVisible(elements, accountState.enabled);

    if (accountState.isLoggedIn) {
      updateUIForLoggedInAccount(elements, accountState.profile, {
        transientRefreshError: accountState.transientRefreshError,
      });
    } else {
      updateUIForLoggedOutAccount(elements);
    }

    return;
  }

  setAccountSectionVisible(elements, false);
}

function resolveMissingSettingsMessage(settings) {
  if (settings.missingReason === 'missing_data_source') {
    return ERROR_MESSAGES.USER_MESSAGES.SETUP_MISSING_DATA_SOURCE;
  }
  if (settings.missingReason === 'missing_auth') {
    return ERROR_MESSAGES.USER_MESSAGES.SETUP_KEY_NOT_CONFIGURED;
  }
  if (!settings.dataSourceId) {
    return ERROR_MESSAGES.USER_MESSAGES.SETUP_MISSING_DATA_SOURCE;
  }
  return UI_MESSAGES.SETUP.MISSING_CONFIG;
}

function disablePrimaryPopupActions(elements) {
  setButtonState(elements.saveButton, true);
  setButtonState(elements.highlightButton, true);
}

async function initializeDestinationSelectorState(elements) {
  let selectedDestinationProfileId = null;
  let destinationProfiles = [];
  try {
    const destinationState = await getDestinationState();
    selectedDestinationProfileId = destinationState.selectedProfileId;
    destinationProfiles = destinationState.profiles || [];
    renderDestinationSelector(elements, destinationState);
  } catch (error) {
    Logger.warn('[Popup] Failed to initialize destination selector', { error });
  }
  return { selectedDestinationProfileId, destinationProfiles };
}

async function initializePageStatus(elements) {
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
    const safeMessage = sanitizeApiError(error, 'popup_init');
    const msg = ErrorHandler.formatUserMessage(safeMessage);
    setStatus(elements, msg, '#d63384');
  }
}

async function registerActiveTabTracking() {
  let currentTab = await getActiveTab();
  const trackedWindowId = currentTab?.windowId;
  chrome.tabs.onActivated.addListener(activeInfo => {
    if (trackedWindowId !== undefined && activeInfo.windowId !== trackedWindowId) {
      return;
    }
    currentTab = {
      id: activeInfo.tabId,
      windowId: activeInfo.windowId,
    };
  });
  return {
    getCurrentTab: () => currentTab,
  };
}

async function handleAccountManagementClick(elements) {
  const result = await openAccountManagement();
  if (!result?.success) {
    setAccountStatusError(
      elements,
      result?.error || UI_MESSAGES.ACCOUNT.ACCOUNT_MANAGEMENT_OPEN_FAILED
    );
  }
}

async function handleAccountLoginClick(elements) {
  const result = await startAccountLogin();
  if (!result?.success) {
    setAccountStatusError(elements, result?.error || UI_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED);
  }
}

async function handleAccountButtonClick(elements) {
  if (elements.accountButton?.disabled) {
    return;
  }

  setButtonState(elements.accountButton, true);

  try {
    const accountState = BUILD_ENV.ENABLE_ACCOUNT
      ? await getPopupAccountState()
      : { enabled: false, isLoggedIn: false };

    if (!accountState.enabled) {
      return;
    }

    if (accountState.isLoggedIn) {
      await handleAccountManagementClick(elements);
      return;
    }

    await handleAccountLoginClick(elements);
  } finally {
    setButtonState(elements.accountButton, false);
  }
}

function registerPopupEventListeners(elements, context) {
  let { selectedDestinationProfileId } = context;
  const { destinationProfiles, getCurrentTab } = context;

  // 保存按鈕
  elements.saveButton.addEventListener('click', async () => {
    Logger.start('[Popup] Saving page...');
    setStatus(elements, UI_MESSAGES.POPUP.SAVING);
    setButtonState(elements.saveButton, true);

    const response = await savePage(selectedDestinationProfileId);

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
          await chrome.tabs.sendMessage(tab.id, {
            action: RUNTIME_ACTIONS.CONTENT_BRIDGE_SHOW_FLOATING_RAIL,
          });
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

  if (elements.destinationToggle && elements.destinationMenu) {
    elements.destinationToggle.addEventListener('click', () => {
      const isOpen = elements.destinationMenu.style.display === 'block';
      elements.destinationMenu.style.display = isOpen ? 'none' : 'block';
      elements.destinationToggle.setAttribute?.('aria-expanded', isOpen ? 'false' : 'true');
    });
    elements.destinationMenu.addEventListener('click', event => {
      const profileId = event.target?.dataset?.profileId;
      if (!profileId) {
        return;
      }
      selectedDestinationProfileId = profileId;
      renderDestinationSelector(elements, {
        profiles: destinationProfiles,
        selectedProfileId: profileId,
      });
    });
  }

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
        error: safe,
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
  if (elements.manageButton) {
    elements.manageButton.addEventListener('click', () => {
      const currentTab = getCurrentTab();
      if (currentTab?.id) {
        chrome.sidePanel.open({ tabId: currentTab.id });
        window.close();
      } else {
        // currentTab 不可用（例如 chrome:// 頁面、PDF 檢視器）
        setStatus(elements, UI_MESSAGES.POPUP.SIDE_PANEL_UNAVAILABLE, '#d63384');
      }
    });
  }

  if (elements.accountButton) {
    elements.accountButton.addEventListener('click', async () => {
      await handleAccountButtonClick(elements);
    });
  }
}

// Export initialization function for testing
export async function initPopup() {
  Logger.start('[Popup] Initializing...');

  // 注入 SVG 圖標
  injectIcons(UI_ICONS);

  // 獲取所有 DOM 元素
  const elements = getElements();
  initializePopupStaticText(elements);
  await initAccountSection(elements);

  // 檢查設置
  const settings = await checkSettings();
  if (!settings.valid) {
    setStatus(elements, resolveMissingSettingsMessage(settings));
    disablePrimaryPopupActions(elements);
    return;
  }

  // 檢查頁面狀態並更新 UI（使用 TTL cache 避免不必要的 API 呼叫）
  const destinationState = await initializeDestinationSelectorState(elements);
  const selectedDestinationProfileId = destinationState.selectedDestinationProfileId;
  const destinationProfiles = destinationState.destinationProfiles;

  await initializePageStatus(elements);

  const tabTracker = await registerActiveTabTracking();

  registerPopupEventListeners(elements, {
    selectedDestinationProfileId,
    destinationProfiles,
    getCurrentTab: tabTracker.getCurrentTab,
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initPopup);
