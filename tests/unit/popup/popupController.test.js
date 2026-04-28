/**
 * Popup Controller 測試
 *
 * 測試 popup/popup.js 的初始化和事件協調邏輯
 */

import { initPopup } from '../../../popup/popup.js';
import {
  getElements,
  initializePopupStaticText,
  setAccountSectionVisible,
  updateUIForLoggedOutAccount,
  updateUIForLoggedInAccount,
  updateUIForSavedPage,
  updateUIForUnsavedPage,
  renderDestinationSelector,
  setAccountStatusError,
  setStatus,
  setButtonState,
  formatSaveSuccessMessage,
} from '../../../popup/popupUI.js';
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
} from '../../../popup/popupActions.js';
import Logger from '../../../scripts/utils/Logger.js';
import { BUILD_ENV } from '../../../scripts/config/env/index.js';
import { UI_MESSAGES, ERROR_MESSAGES } from '../../../scripts/config/shared/messages.js';

// Mock dependencies
jest.mock('../../../popup/popupUI.js', () => ({
  getElements: jest.fn(),
  initializePopupStaticText: jest.fn(),
  setAccountSectionVisible: jest.fn(),
  updateUIForLoggedOutAccount: jest.fn(),
  updateUIForLoggedInAccount: jest.fn(),
  updateUIForSavedPage: jest.fn(),
  updateUIForUnsavedPage: jest.fn(),
  renderDestinationSelector: jest.fn(),
  setAccountStatusError: jest.fn(),
  setStatus: jest.fn(),
  setButtonState: jest.fn(),
  formatSaveSuccessMessage: jest.fn(),
}));
jest.mock('../../../popup/popupActions.js', () => ({
  checkSettings: jest.fn(),
  checkPageStatus: jest.fn(),
  savePage: jest.fn(),
  getDestinationState: jest.fn(),
  startHighlight: jest.fn(),
  openNotionPage: jest.fn(),
  getActiveTab: jest.fn(),
  getPopupAccountState: jest.fn(),
  startAccountLogin: jest.fn(),
  openAccountManagement: jest.fn(),
}));
jest.mock('../../../scripts/utils/Logger.js');
jest.mock('../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    ENABLE_ACCOUNT: true,
  },
}));

beforeEach(() => {
  initializePopupStaticText.mockReset();
  setAccountSectionVisible.mockReset();
  updateUIForLoggedOutAccount.mockReset();
  updateUIForLoggedInAccount.mockReset();
  setAccountStatusError.mockReset();
  getPopupAccountState.mockReset();
  startAccountLogin.mockReset();
  openAccountManagement.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Helper to trigger event
async function triggerEvent(element, eventType = 'click') {
  const handler = element.addEventListener.mock.calls.find(call => call[0] === eventType)[1];
  await handler({ target: element });
}

describe('popup.js Controller', () => {
  const setup = () => {
    const mockElements = {
      saveButton: { addEventListener: jest.fn(), style: {}, dataset: {} },
      highlightButton: { addEventListener: jest.fn(), style: {}, dataset: {} },
      manageButton: { addEventListener: jest.fn(), style: {}, dataset: {} },
      openNotionButton: {
        addEventListener: jest.fn(),
        getAttribute: jest.fn(),
        style: {},
        dataset: { url: 'https://notion.so/new' },
      },
      accountSection: { style: { display: 'none' } },
      accountButton: {
        addEventListener: jest.fn(),
        style: {},
        dataset: {},
        querySelector: jest.fn(),
      },
      accountSummary: { textContent: '' },
      accountEmail: { textContent: '', style: {} },
      accountStatus: { textContent: '', style: {} },
      destinationSection: { style: {} },
      destinationCurrent: { textContent: '', dataset: {}, style: {} },
      destinationToggle: { addEventListener: jest.fn(), style: {}, dataset: {} },
      destinationMenu: { addEventListener: jest.fn(), style: {} },
      status: { textContent: '', style: {} },
      clearHighlightsButton: null,
      modal: null,
      modalMessage: null,
      modalConfirm: null,
      modalCancel: null,
    };

    getElements.mockReturnValue(mockElements);

    // Default mocks
    checkSettings.mockResolvedValue({ valid: true });
    checkPageStatus.mockResolvedValue({
      success: true,
      statusKind: 'saved',
      isSaved: true,
      canSave: false,
      canSyncHighlights: true,
    });
    getPopupAccountState.mockResolvedValue({
      enabled: true,
      isLoggedIn: false,
      profile: null,
      transientRefreshError: false,
    });
    getDestinationState.mockResolvedValue({
      profiles: [{ id: 'default', name: 'Default' }],
      selectedProfileId: 'default',
      entitlement: { maxProfiles: 1 },
    });

    // Mock global chrome
    globalThis.chrome = {
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 123, url: 'https://example.com' }]),
        sendMessage: jest.fn().mockResolvedValue({}),
        onActivated: { addListener: jest.fn() },
      },
      sidePanel: {
        open: jest.fn(),
      },
    };
    globalThis.window.close = jest.fn();

    return { mockElements };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(BUILD_ENV, 'ENABLE_ACCOUNT', true);
  });

  it('當設定有效且頁面已儲存時，應成功初始化', async () => {
    const { mockElements } = setup();
    await initPopup();

    expect(getElements).toHaveBeenCalled();
    expect(checkSettings).toHaveBeenCalled();
    expect(checkPageStatus).toHaveBeenCalledWith();
    expect(getPopupAccountState).toHaveBeenCalled();
    expect(getDestinationState).toHaveBeenCalled();
    expect(renderDestinationSelector).toHaveBeenCalledWith(
      mockElements,
      expect.objectContaining({ selectedProfileId: 'default' })
    );
    expect(updateUIForSavedPage).toHaveBeenCalledWith(mockElements, expect.anything());
  });

  it('初始化時應套用集中化管理的 popup 靜態文字', async () => {
    const { mockElements } = setup();
    await initPopup();

    expect(initializePopupStaticText).toHaveBeenCalledWith(mockElements);
  });

  it('account feature 開啟且未登入時，應顯示 popup account 入口', async () => {
    const { mockElements } = setup();
    await initPopup();

    expect(setAccountSectionVisible).toHaveBeenCalledWith(mockElements, true);
    expect(updateUIForLoggedOutAccount).toHaveBeenCalledWith(mockElements);
  });

  it('account 已登入時，應顯示已登入摘要', async () => {
    const { mockElements } = setup();
    const profile = {
      userId: 'u1',
      email: 'user@example.com',
      displayName: 'Test User',
      avatarUrl: null,
    };
    getPopupAccountState.mockResolvedValue({
      enabled: true,
      isLoggedIn: true,
      profile,
      transientRefreshError: false,
    });

    await initPopup();

    expect(setAccountSectionVisible).toHaveBeenCalledWith(mockElements, true);
    expect(updateUIForLoggedInAccount).toHaveBeenCalledWith(mockElements, profile, {
      transientRefreshError: false,
    });
  });

  it('account feature 關閉時，應隱藏 popup account 區塊', async () => {
    const { mockElements } = setup();
    jest.replaceProperty(BUILD_ENV, 'ENABLE_ACCOUNT', false);

    await initPopup();

    expect(setAccountSectionVisible).toHaveBeenCalledWith(mockElements, false);
    expect(updateUIForLoggedOutAccount).not.toHaveBeenCalled();
    expect(updateUIForLoggedInAccount).not.toHaveBeenCalled();
  });

  it('當頁面狀態為未儲存或已刪除時，應初始化未儲存的 UI', async () => {
    const { mockElements } = setup();
    checkPageStatus.mockResolvedValue({
      success: true,
      statusKind: 'deleted_remote',
      isSaved: false,
      canSave: true,
      canSyncHighlights: false,
      wasDeleted: true,
      stableUrl: 'https://example.com/deleted',
    });

    await initPopup();

    expect(updateUIForUnsavedPage).toHaveBeenCalledWith(
      mockElements,
      expect.objectContaining({
        isSaved: false,
        wasDeleted: true,
      })
    );
    expect(updateUIForSavedPage).not.toHaveBeenCalled();
  });

  it('當缺少 API Key 時應正確處理', async () => {
    const { mockElements } = setup();
    checkSettings.mockResolvedValue({
      valid: false,
      apiKey: undefined,
      dataSourceId: undefined,
      missingReason: 'missing_auth',
    });

    await initPopup();

    expect(setStatus).toHaveBeenCalledWith(
      mockElements,
      expect.stringContaining(ERROR_MESSAGES.USER_MESSAGES.SETUP_KEY_NOT_CONFIGURED)
    );
    expect(setButtonState).toHaveBeenCalledWith(mockElements.saveButton, true);
    expect(setButtonState).toHaveBeenCalledWith(mockElements.highlightButton, true);
  });

  it('當已有 API Key 但缺少 Data Source ID 時應正確處理', async () => {
    const { mockElements } = setup();
    checkSettings.mockResolvedValue({
      valid: false,
      apiKey: 'test-api-key',
      dataSourceId: undefined,
      missingReason: 'missing_data_source',
    });

    await initPopup();

    expect(setStatus).toHaveBeenCalledWith(
      mockElements,
      expect.stringContaining(ERROR_MESSAGES.USER_MESSAGES.SETUP_MISSING_DATA_SOURCE)
    );
    expect(setButtonState).toHaveBeenCalledWith(mockElements.saveButton, true);
    expect(setButtonState).toHaveBeenCalledWith(mockElements.highlightButton, true);
  });

  it('當 OAuth 已連接但缺少保存目標時應顯示保存目標提示而非 API Key 提示', async () => {
    const { mockElements } = setup();
    checkSettings.mockResolvedValue({
      valid: false,
      apiKey: undefined,
      dataSourceId: undefined,
      missingReason: 'missing_data_source',
      authMode: 'oauth',
      hasOAuthToken: true,
    });

    await initPopup();

    expect(setStatus).toHaveBeenCalledWith(
      mockElements,
      expect.stringContaining(ERROR_MESSAGES.USER_MESSAGES.SETUP_MISSING_DATA_SOURCE)
    );
    expect(setStatus).not.toHaveBeenCalledWith(
      mockElements,
      expect.stringContaining(ERROR_MESSAGES.USER_MESSAGES.SETUP_KEY_NOT_CONFIGURED)
    );
  });

  it('初始化失敗時應正確處理錯誤', async () => {
    setup();
    checkPageStatus.mockRejectedValue(new Error('Init failed'));

    await initPopup();

    expect(Logger.error).toHaveBeenCalled();
    // 錯誤訊息經過 sanitizeApiError 清洗後再由 ErrorHandler.formatUserMessage 轉換
    // 'Init failed' 不匹配任何已知模式，會返回預設錯誤訊息
    expect(setStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('發生未知錯誤'),
      expect.anything()
    );
  });

  it('應建立事件監聽器', async () => {
    const { mockElements } = setup();
    await initPopup();

    expect(mockElements.saveButton.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
    expect(mockElements.highlightButton.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
    expect(mockElements.manageButton.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
    expect(mockElements.openNotionButton.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
    expect(mockElements.accountButton.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
  });

  describe('Event Handlers', () => {
    it('點擊 saveButton 時應保存頁面', async () => {
      const { mockElements } = setup();
      await initPopup();

      const saveResponse = {
        success: true,
        statusKind: 'saved',
        isSaved: true,
        canSave: false,
        canSyncHighlights: true,
        url: 'https://notion.so/page',
        notionUrl: 'https://notion.so/page',
        notionPageId: 'page-123',
      };
      savePage.mockResolvedValue(saveResponse);

      await triggerEvent(mockElements.saveButton);

      expect(setStatus).toHaveBeenCalledWith(mockElements, UI_MESSAGES.POPUP.SAVING);
      expect(savePage).toHaveBeenCalledWith('default');
      expect(formatSaveSuccessMessage).toHaveBeenCalled();
      expect(updateUIForSavedPage).toHaveBeenCalledWith(mockElements, saveResponse);
    });

    it('保存成功但目前分頁缺少 tab id 時不應發送 toolbar 訊息', async () => {
      const { mockElements } = setup();
      await initPopup();
      savePage.mockResolvedValue({
        success: true,
        statusKind: 'saved',
        isSaved: true,
        canSave: false,
        canSyncHighlights: true,
        url: 'https://notion.so/page',
      });
      globalThis.chrome.tabs.query.mockResolvedValueOnce([{ url: 'https://example.com' }]);

      await triggerEvent(mockElements.saveButton);

      expect(globalThis.chrome.tabs.sendMessage).not.toHaveBeenCalled();
      expect(updateUIForSavedPage).toHaveBeenCalledWith(
        mockElements,
        expect.objectContaining({ success: true })
      );
    });

    it('保存成功但 toolbar 訊息發送失敗時應記錄警告且不中斷保存流程', async () => {
      const { mockElements } = setup();
      const toolbarError = new Error('receiving end does not exist');
      await initPopup();
      savePage.mockResolvedValue({
        success: true,
        statusKind: 'saved',
        isSaved: true,
        canSave: false,
        canSyncHighlights: true,
        url: 'https://notion.so/page',
      });
      globalThis.chrome.tabs.sendMessage.mockRejectedValueOnce(toolbarError);

      await triggerEvent(mockElements.saveButton);

      expect(Logger.warn).toHaveBeenCalledWith(ERROR_MESSAGES.TECHNICAL.TOOLBAR_SHOW_FAILED, {
        action: 'showToolbar',
        error: toolbarError,
      });
      expect(updateUIForSavedPage).toHaveBeenCalledWith(
        mockElements,
        expect.objectContaining({ success: true })
      );
    });

    it('保存按鈕延遲結束後應重新啟用', async () => {
      jest.useFakeTimers();
      const { mockElements } = setup();
      await initPopup();
      savePage.mockResolvedValue({ success: false, error: 'Save failed' });

      await triggerEvent(mockElements.saveButton);
      jest.advanceTimersByTime(3000);

      expect(setButtonState).toHaveBeenCalledWith(mockElements.saveButton, false);
      jest.useRealTimers();
    });

    it('點擊 saveButton 失敗時應顯示錯誤', async () => {
      const { mockElements } = setup();
      await initPopup();

      savePage.mockResolvedValue({ success: false, error: 'Save failed' });

      await triggerEvent(mockElements.saveButton);

      expect(setStatus).toHaveBeenCalledWith(mockElements, expect.stringContaining('發生未知錯誤'));
    });

    it('當頁面已保存時，點擊 highlightButton 應啟動標註', async () => {
      const { mockElements } = setup();
      await initPopup();
      checkPageStatus.mockResolvedValue({ isSaved: true });
      startHighlight.mockResolvedValue({ success: true });

      await triggerEvent(mockElements.highlightButton);

      expect(setStatus).toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining(UI_MESSAGES.POPUP.HIGHLIGHT_STARTING)
      );
      expect(startHighlight).toHaveBeenCalled();
    });

    it('即使頁面未保存，點擊 highlightButton 也應啟動標註', async () => {
      const { mockElements } = setup();
      await initPopup();
      checkPageStatus.mockResolvedValue({ isSaved: false });
      startHighlight.mockResolvedValue({ success: true });

      await triggerEvent(mockElements.highlightButton);

      // Highlight-First：不再檢查 isSaved，直接啟動標註
      expect(startHighlight).toHaveBeenCalled();
      expect(setStatus).toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining(UI_MESSAGES.POPUP.HIGHLIGHT_ACTIVATED)
      );
    });

    it('highlight 啟動失敗時應顯示錯誤並記錄 structured context', async () => {
      const { mockElements } = setup();
      await initPopup();
      startHighlight.mockResolvedValue({ success: false, error: 'Highlight failed' });

      await triggerEvent(mockElements.highlightButton);

      expect(setStatus).toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining(UI_MESSAGES.POPUP.HIGHLIGHT_FAILED_PREFIX)
      );
      expect(Logger.error).toHaveBeenCalledWith('Failed to start highlight mode', {
        action: 'startHighlight',
        error: 'Highlight failed',
      });
    });

    it('highlight 成功後應延遲關閉 popup 並重新啟用按鈕', async () => {
      jest.useFakeTimers();
      const { mockElements } = setup();
      await initPopup();
      startHighlight.mockResolvedValue({ success: true });

      await triggerEvent(mockElements.highlightButton);
      jest.advanceTimersByTime(1000);

      expect(globalThis.window.close).toHaveBeenCalled();

      jest.advanceTimersByTime(1000);
      expect(setButtonState).toHaveBeenCalledWith(mockElements.highlightButton, false);
      jest.useRealTimers();
    });

    it('點擊 openNotionButton 時應開啟 notion 頁面', async () => {
      const { mockElements } = setup();
      await initPopup();
      openNotionPage.mockResolvedValue({ success: true });

      await triggerEvent(mockElements.openNotionButton);

      expect(openNotionPage).toHaveBeenCalledWith('https://notion.so/new');
    });

    it('點擊 openNotionButton 開啟失敗時應顯示錯誤並記錄', async () => {
      const { mockElements } = setup();
      await initPopup();
      openNotionPage.mockResolvedValue({ success: false, error: 'Invalid Notion URL' });

      await triggerEvent(mockElements.openNotionButton);

      expect(setStatus).toHaveBeenCalledWith(mockElements, expect.stringContaining('資料驗證失敗'));
      expect(Logger.error).toHaveBeenCalledWith('Failed to open Notion page', {
        action: 'openNotionPage',
        error: 'Invalid Notion URL',
      });
    });

    it('當前分頁存在時，點擊 manageButton 應開啟側邊欄並關閉 popup', async () => {
      const { mockElements } = setup();
      getActiveTab.mockResolvedValue({ id: 777, url: 'https://example.com' });
      await initPopup();

      await triggerEvent(mockElements.manageButton);

      expect(globalThis.chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 777 });
      expect(globalThis.window.close).toHaveBeenCalled();
    });

    it('tabs.onActivated 觸發後應使用最新 currentTab 開啟側邊欄', async () => {
      const { mockElements } = setup();
      getActiveTab.mockResolvedValue({ id: 777, url: 'https://example.com/old' });
      globalThis.chrome.tabs.query.mockResolvedValue([{ id: 888, url: 'https://example.com/new' }]);
      await initPopup();

      const [onActivatedHandler] = globalThis.chrome.tabs.onActivated.addListener.mock.calls[0];
      await onActivatedHandler();
      await triggerEvent(mockElements.manageButton);

      expect(globalThis.chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 888 });
    });

    it('當前分頁不可用時，點擊 manageButton 應顯示錯誤', async () => {
      const { mockElements } = setup();
      getActiveTab.mockResolvedValue(null);
      await initPopup();

      await triggerEvent(mockElements.manageButton);

      expect(setStatus).toHaveBeenCalledWith(
        mockElements,
        UI_MESSAGES.POPUP.SIDE_PANEL_UNAVAILABLE,
        '#d63384'
      );
      expect(globalThis.chrome.sidePanel.open).not.toHaveBeenCalled();
      expect(globalThis.window.close).not.toHaveBeenCalled();
    });

    it('缺少 clear-highlights 相關 UI 控制項時也應容錯處理', async () => {
      const { mockElements } = setup();

      await expect(initPopup()).resolves.toBeUndefined();

      expect(mockElements.clearHighlightsButton).toBeNull();
      expect(mockElements.modal).toBeNull();
      expect(mockElements.modalConfirm).toBeNull();
      expect(mockElements.modalCancel).toBeNull();
    });

    it('account feature 關閉時點擊 accountButton 應直接返回', async () => {
      const { mockElements } = setup();
      jest.replaceProperty(BUILD_ENV, 'ENABLE_ACCOUNT', false);
      await initPopup();
      getPopupAccountState.mockClear();

      await triggerEvent(mockElements.accountButton);

      expect(getPopupAccountState).not.toHaveBeenCalled();
      expect(startAccountLogin).not.toHaveBeenCalled();
      expect(openAccountManagement).not.toHaveBeenCalled();
      expect(setAccountStatusError).not.toHaveBeenCalled();
    });

    it('未登入時點擊 accountButton 應啟動登入流程', async () => {
      const { mockElements } = setup();
      startAccountLogin.mockResolvedValue({ success: true });
      await initPopup();

      await triggerEvent(mockElements.accountButton);

      expect(startAccountLogin).toHaveBeenCalled();
      expect(openAccountManagement).not.toHaveBeenCalled();
    });

    it('已登入時點擊 accountButton 應開啟帳號管理', async () => {
      const { mockElements } = setup();
      const profile = {
        userId: 'u1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
      };
      getPopupAccountState.mockResolvedValue({
        enabled: true,
        isLoggedIn: true,
        profile,
        transientRefreshError: false,
      });
      openAccountManagement.mockResolvedValue({ success: true });

      await initPopup();
      await triggerEvent(mockElements.accountButton);

      expect(openAccountManagement).toHaveBeenCalled();
      expect(startAccountLogin).not.toHaveBeenCalled();
    });

    it('登入流程失敗時應把錯誤顯示在 account 狀態區', async () => {
      const { mockElements } = setup();
      startAccountLogin.mockResolvedValue({ success: false, error: '登入設定異常，請稍後再試' });
      await initPopup();

      await triggerEvent(mockElements.accountButton);

      expect(setStatus).not.toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining('登入設定異常，請稍後再試')
      );
      expect(setAccountStatusError).toHaveBeenCalledWith(mockElements, '登入設定異常，請稍後再試');
      expect(updateUIForLoggedOutAccount).toHaveBeenCalledWith(mockElements);
    });

    it('登入流程未回傳結果時應顯示預設登入錯誤且不拋出 TypeError', async () => {
      const { mockElements } = setup();
      startAccountLogin.mockResolvedValue(undefined);
      await initPopup();

      await expect(triggerEvent(mockElements.accountButton)).resolves.toBeUndefined();

      expect(setAccountStatusError).toHaveBeenCalledWith(
        mockElements,
        UI_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED
      );
    });

    it('帳號管理未回傳結果時應顯示預設管理錯誤且不拋出 TypeError', async () => {
      const { mockElements } = setup();
      getPopupAccountState.mockResolvedValue({
        enabled: true,
        isLoggedIn: true,
        profile: { email: 'user@example.com' },
        transientRefreshError: false,
      });
      openAccountManagement.mockResolvedValue(undefined);
      await initPopup();

      await expect(triggerEvent(mockElements.accountButton)).resolves.toBeUndefined();

      expect(setAccountStatusError).toHaveBeenCalledWith(
        mockElements,
        UI_MESSAGES.ACCOUNT.ACCOUNT_MANAGEMENT_OPEN_FAILED
      );
    });

    it('帳號管理失敗時應顯示回傳的錯誤', async () => {
      const { mockElements } = setup();
      getPopupAccountState.mockResolvedValue({
        enabled: true,
        isLoggedIn: true,
        profile: { email: 'user@example.com' },
        transientRefreshError: false,
      });
      openAccountManagement.mockResolvedValue({ success: false, error: '無法開啟帳號管理頁' });
      await initPopup();

      await triggerEvent(mockElements.accountButton);

      expect(setAccountStatusError).toHaveBeenCalledWith(mockElements, '無法開啟帳號管理頁');
    });
  });
});
