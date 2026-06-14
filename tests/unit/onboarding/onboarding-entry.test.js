/**
 * @jest-environment jsdom
 */

/* global jest, describe, it, expect, beforeEach, afterEach */

// Mock controller
jest.mock('../../../pages/onboarding/onboardingController.js', () => ({
  TOTAL_STEPS: 6,
  showStep: jest.fn(),
  getCurrentStep: jest.fn(),
  nextStep: jest.fn(),
  skipToEnd: jest.fn(),
  markCompleted: jest.fn(),
  isNotionConnected: jest.fn(),
  runNotionOAuthFlow: jest.fn(),
  fetchNotionDatabases: jest.fn(),
  selectDataSource: jest.fn(),
  isAccountFeatureEnabled: jest.fn(),
  isAccountLoggedIn: jest.fn(),
}));

// Mock login initiator
jest.mock('../../../scripts/auth/accountLoginInitiator.js', () => ({
  startAccountLogin: jest.fn(),
}));

import {
  showStep,
  nextStep,
  skipToEnd,
  isNotionConnected,
  runNotionOAuthFlow,
  fetchNotionDatabases,
  selectDataSource,
  isAccountFeatureEnabled,
  isAccountLoggedIn,
} from '../../../pages/onboarding/onboardingController.js';
import { startAccountLogin } from '../../../scripts/auth/accountLoginInitiator.js';

describe('onboarding entry script (onboarding.js)', () => {
  let root;
  let originalWindowClose;

  beforeEach(() => {
    // 設置 JSDOM 環境的 HTML
    document.body.innerHTML = `
      <div id="onboarding-root">
        <div class="onboarding-progress">
          <span class="progress-dot" data-dot="1"></span>
          <span class="progress-dot" data-dot="2"></span>
          <span class="progress-dot" data-dot="3"></span>
          <span class="progress-dot" data-dot="4"></span>
          <span class="progress-dot" data-dot="5"></span>
          <span class="progress-dot" data-dot="6"></span>
        </div>
        <section data-step="1" class="step-section"></section>
        <section data-step="2" class="step-section">
          <button data-action="connect-notion">Connect Notion</button>
          <div data-error="connect-notion" hidden></div>
        </section>
        <section data-step="3" class="step-section">
          <div data-step3-state="loading" hidden>Loading...</div>
          <div data-step3-state="empty" hidden>No databases</div>
          <div data-step3-state="list" hidden>
            <ul data-database-list></ul>
          </div>
          <div data-step3-state="error" hidden>Error loading</div>
          <button data-step3-confirm disabled data-action="confirm-database">Confirm Database</button>
          <button data-action="retry-databases">Retry</button>
          <div data-error="fetch-databases" hidden></div>
        </section>
        <section data-step="4" class="step-section">
          <button data-action="login-account">Login Account</button>
          <div data-step4-state="waiting" hidden>Waiting for login...</div>
          <div data-error="login-account" hidden></div>
        </section>
        <section data-step="5" class="step-section">
          <button data-action="next">Next</button>
          <button data-action="skip">Skip</button>
        </section>
        <section data-step="6" class="step-section">
          <button data-action="finish">Finish</button>
        </section>
      </div>
    `;
    root = document.querySelector('#onboarding-root');

    // Mock chrome storage
    globalThis.chrome.storage = {
      local: {},
      onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    };

    // Mock chrome runtime
    globalThis.chrome.runtime = {
      sendMessage: jest.fn(),
    };

    originalWindowClose = window.close;
    window.close = jest.fn();

    // 預設重置 Mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    window.close = originalWindowClose;
  });

  const loadEntryScript = () => {
    jest.isolateModules(() => {
      require('../../../pages/onboarding/onboarding.js');
    });
  };

  it('載入時應初始化步驟 1 並綁定 actions', () => {
    loadEntryScript();
    expect(showStep).toHaveBeenCalledWith(root, 1);
  });

  it('點擊 next 應調用 nextStep', () => {
    loadEntryScript();
    nextStep.mockReturnValue(5);

    const nextBtn = root.querySelector('[data-action="next"]');
    nextBtn.click();

    expect(nextStep).toHaveBeenCalledWith(root);
  });

  it('點擊 skip 應調用 skipToEnd', () => {
    loadEntryScript();
    skipToEnd.mockReturnValue(6);

    const skipBtn = root.querySelector('[data-action="skip"]');
    skipBtn.click();

    expect(skipToEnd).toHaveBeenCalledWith(root);
  });

  it('點擊 finish 應關閉視窗', () => {
    loadEntryScript();

    const finishBtn = root.querySelector('[data-action="finish"]');
    finishBtn.click();

    expect(window.close).toHaveBeenCalled();
  });

  describe('Step 2: Connect Notion', () => {
    it('若 Notion 已連接，進入 Step 2 時應自動跳到下一步', async () => {
      isNotionConnected.mockResolvedValue(true);
      nextStep.mockReturnValue(3);

      loadEntryScript();

      runNotionOAuthFlow.mockResolvedValue(undefined);
      nextStep.mockReturnValue(3);

      const connectBtn = root.querySelector('[data-action="connect-notion"]');
      await connectBtn.click();

      expect(runNotionOAuthFlow).toHaveBeenCalled();
      expect(nextStep).toHaveBeenCalledWith(root);
    });

    it('Notion OAuth 連接失敗時，應顯示錯誤訊息並還原按鈕', async () => {
      isNotionConnected.mockResolvedValue(false);
      runNotionOAuthFlow.mockRejectedValue(new Error('oauth_error'));

      loadEntryScript();

      const connectBtn = root.querySelector('[data-action="connect-notion"]');
      const originalText = connectBtn.textContent;

      connectBtn.click();

      await new Promise(process.nextTick);

      const errorEl = root.querySelector('[data-error="connect-notion"]');
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('oauth_error');
      expect(connectBtn.disabled).toBe(false);
      expect(connectBtn.textContent).toBe(originalText);
    });
  });

  describe('Step 3: Database Selection', () => {
    it('加載資料庫為空時應顯示空狀態', async () => {
      isNotionConnected.mockResolvedValue(true);
      fetchNotionDatabases.mockResolvedValue([]);

      loadEntryScript();

      const retryBtn = root.querySelector('[data-action="retry-databases"]');
      retryBtn.click();

      await new Promise(process.nextTick);

      const emptyState = root.querySelector('[data-step3-state="empty"]');
      expect(emptyState.hidden).toBe(false);
    });

    it('載入資料庫成功時，應渲染列表並支援選取與確認', async () => {
      isNotionConnected.mockResolvedValue(true);
      fetchNotionDatabases.mockResolvedValue([
        { id: 'db-1', title: 'DB One' },
        { id: 'db-2', title: 'DB Two' },
      ]);

      loadEntryScript();

      const retryBtn = root.querySelector('[data-action="retry-databases"]');
      retryBtn.click();

      await new Promise(process.nextTick);

      const listState = root.querySelector('[data-step3-state="list"]');
      expect(listState.hidden).toBe(false);

      const listEl = root.querySelector('[data-database-list]');
      expect(listEl.children).toHaveLength(2);

      const firstItem = listEl.children[0];
      firstItem.click();

      expect(firstItem.classList.contains('selected')).toBe(true);
      expect(firstItem.getAttribute('aria-checked')).toBe('true');

      const confirmBtn = root.querySelector('[data-step3-confirm]');
      expect(confirmBtn.disabled).toBe(false);

      selectDataSource.mockResolvedValue(undefined);
      nextStep.mockReturnValue(4);
      confirmBtn.click();

      await new Promise(process.nextTick);
      expect(selectDataSource).toHaveBeenCalledWith({
        storage: globalThis.chrome.storage.local,
        dataSourceId: 'db-1',
      });
    });

    it('資料庫加載失敗時應顯示錯誤狀態與訊息', async () => {
      isNotionConnected.mockResolvedValue(true);
      fetchNotionDatabases.mockRejectedValue(new Error('network_error'));

      loadEntryScript();

      const retryBtn = root.querySelector('[data-action="retry-databases"]');
      retryBtn.click();

      await new Promise(process.nextTick);

      const errorState = root.querySelector('[data-step3-state="error"]');
      expect(errorState.hidden).toBe(false);

      const errorEl = root.querySelector('[data-error="fetch-databases"]');
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('network_error');
    });
  });

  describe('Step 4: Account Login', () => {
    it('點擊登入應啟動登入流，設置 listener，並在儲存 accountEmail 後進入下一步', async () => {
      isAccountFeatureEnabled.mockReturnValue(true);
      isAccountLoggedIn.mockResolvedValue(false);
      startAccountLogin.mockResolvedValue({ success: true });

      let addedListener = null;
      globalThis.chrome.storage.onChanged.addListener.mockImplementation(listener => {
        addedListener = listener;
      });

      loadEntryScript();

      const loginBtn = root.querySelector('[data-action="login-account"]');
      loginBtn.click();

      await new Promise(process.nextTick);

      expect(startAccountLogin).toHaveBeenCalled();
      expect(globalThis.chrome.storage.onChanged.addListener).toHaveBeenCalled();
      expect(addedListener).not.toBeNull();

      const waitingEl = root.querySelector('[data-step4-state="waiting"]');
      expect(waitingEl.hidden).toBe(false);

      nextStep.mockReturnValue(5);

      await addedListener({ accountEmail: { newValue: 'user@example.com' } }, 'local');

      expect(globalThis.chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(
        addedListener
      );
      expect(waitingEl.hidden).toBe(true);
      expect(nextStep).toHaveBeenCalledWith(root);
    });

    it('啟動登入失敗時應移除 listener 並恢復按鈕', async () => {
      isAccountFeatureEnabled.mockReturnValue(true);
      isAccountLoggedIn.mockResolvedValue(false);
      startAccountLogin.mockRejectedValue(new Error('auth_api_down'));

      // 此測試中不需監聽 storage 變更

      loadEntryScript();

      const loginBtn = root.querySelector('[data-action="login-account"]');
      const originalText = loginBtn.textContent;
      loginBtn.click();

      await new Promise(process.nextTick);

      const errorEl = root.querySelector('[data-error="login-account"]');
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('auth_api_down');
      expect(loginBtn.disabled).toBe(false);
      expect(loginBtn.textContent).toBe(originalText);
      expect(globalThis.chrome.storage.onChanged.removeListener).toHaveBeenCalled();
    });

    it('startAccountLogin 回傳 success:false 應視為失敗並顯示錯誤', async () => {
      isAccountFeatureEnabled.mockReturnValue(true);
      isAccountLoggedIn.mockResolvedValue(false);
      startAccountLogin.mockResolvedValue({ success: false, error: 'login_failed' });

      loadEntryScript();

      const loginBtn = root.querySelector('[data-action="login-account"]');
      loginBtn.click();

      await new Promise(process.nextTick);

      const errorEl = root.querySelector('[data-error="login-account"]');
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('login_failed');
      expect(loginBtn.disabled).toBe(false);
      expect(globalThis.chrome.storage.onChanged.removeListener).toHaveBeenCalled();
    });

    it('storage listener 收到非 accountEmail 變更應忽略', async () => {
      isAccountFeatureEnabled.mockReturnValue(true);
      isAccountLoggedIn.mockResolvedValue(false);
      startAccountLogin.mockResolvedValue({ success: true });

      let addedListener = null;
      globalThis.chrome.storage.onChanged.addListener.mockImplementation(listener => {
        addedListener = listener;
      });

      loadEntryScript();

      const loginBtn = root.querySelector('[data-action="login-account"]');
      loginBtn.click();

      await new Promise(process.nextTick);

      nextStep.mockClear();

      // 傳送不相關的 storage 變更
      await addedListener({ otherKey: { newValue: 'value' } }, 'local');

      expect(nextStep).not.toHaveBeenCalled();
      expect(globalThis.chrome.storage.onChanged.removeListener).not.toHaveBeenCalled();
    });

    it('storage listener 收到 sync 區域變更應忽略', async () => {
      isAccountFeatureEnabled.mockReturnValue(true);
      isAccountLoggedIn.mockResolvedValue(false);
      startAccountLogin.mockResolvedValue({ success: true });

      let addedListener = null;
      globalThis.chrome.storage.onChanged.addListener.mockImplementation(listener => {
        addedListener = listener;
      });

      loadEntryScript();

      const loginBtn = root.querySelector('[data-action="login-account"]');
      loginBtn.click();

      await new Promise(process.nextTick);

      nextStep.mockClear();

      // 傳送 sync 區域變更
      await addedListener({ accountEmail: { newValue: 'user@example.com' } }, 'sync');

      expect(nextStep).not.toHaveBeenCalled();
      expect(globalThis.chrome.storage.onChanged.removeListener).not.toHaveBeenCalled();
    });
  });

  describe('formatError 函數行為', () => {
    it('formatError 應處理字串類型錯誤', async () => {
      runNotionOAuthFlow.mockRejectedValue('string_error');

      loadEntryScript();

      const connectBtn = root.querySelector('[data-action="connect-notion"]');
      connectBtn.click();

      await new Promise(process.nextTick);

      const errorEl = root.querySelector('[data-error="connect-notion"]');
      expect(errorEl.textContent).toContain('string_error');
    });

    it('formatError 應處理 null/undefined 錯誤', async () => {
      runNotionOAuthFlow.mockRejectedValue(null);

      loadEntryScript();

      const connectBtn = root.querySelector('[data-action="connect-notion"]');
      connectBtn.click();

      await new Promise(process.nextTick);

      const errorEl = root.querySelector('[data-error="connect-notion"]');
      expect(errorEl.textContent).toContain('未知錯誤');
    });

    it('formatError 應處理非 Error 物件', async () => {
      runNotionOAuthFlow.mockRejectedValue(12_345);

      loadEntryScript();

      const connectBtn = root.querySelector('[data-action="connect-notion"]');
      connectBtn.click();

      await new Promise(process.nextTick);

      const errorEl = root.querySelector('[data-error="connect-notion"]');
      expect(errorEl.textContent).toContain('未知錯誤');
    });
  });

  describe('防禦性檢查', () => {
    it('setError 找不到 error 元素時應不拋錯', async () => {
      // 移除 error 元素
      const errorEl = root.querySelector('[data-error="connect-notion"]');
      errorEl.remove();

      runNotionOAuthFlow.mockRejectedValue(new Error('test_error'));

      loadEntryScript();

      const connectBtn = root.querySelector('[data-action="connect-notion"]');

      // 應該不拋錯
      await expect(async () => {
        connectBtn.click();
        await new Promise(process.nextTick);
      }).not.toThrow();
    });

    it('renderDatabaseList 找不到 list 元素時應不拋錯', async () => {
      // 移除 list 元素
      const listEl = root.querySelector('[data-database-list]');
      listEl.remove();

      isNotionConnected.mockResolvedValue(true);
      fetchNotionDatabases.mockResolvedValue([{ id: 'db-1', title: 'DB One' }]);

      loadEntryScript();

      const retryBtn = root.querySelector('[data-action="retry-databases"]');

      // 應該不拋錯
      await expect(async () => {
        retryBtn.click();
        await new Promise(process.nextTick);
      }).not.toThrow();
    });

    it('handleConfirmDatabase 未選資料庫時應直接返回', async () => {
      loadEntryScript();

      const confirmBtn = root.querySelector('[data-step3-confirm]');
      confirmBtn.disabled = false;
      confirmBtn.click();

      await new Promise(process.nextTick);

      // selectDataSource 不應被調用
      expect(selectDataSource).not.toHaveBeenCalled();
    });

    it('點擊非 action 元素應不觸發任何 handler', () => {
      loadEntryScript();

      const section = root.querySelector('[data-step="1"]');
      section.click();

      // 所有 handler 都不應被調用
      expect(nextStep).not.toHaveBeenCalled();
      expect(skipToEnd).not.toHaveBeenCalled();
    });
  });

  describe('步驟自動跳轉與錯誤處理', () => {
    it('進入 Step 2 時若已連接 Notion 應自動跳到 Step 3', async () => {
      isNotionConnected.mockResolvedValue(true);
      nextStep.mockReturnValue(3);
      fetchNotionDatabases.mockResolvedValue([]);

      loadEntryScript();

      const nextBtn = root.querySelector('[data-action="next"]');
      nextBtn.click();

      await new Promise(process.nextTick);

      expect(isNotionConnected).toHaveBeenCalled();
      expect(nextStep).toHaveBeenCalledWith(root);
    });

    it('進入 Step 2 時檢測 Notion 連接失敗應記錄但不阻斷', async () => {
      isNotionConnected.mockRejectedValue(new Error('detection_failed'));

      loadEntryScript();

      const nextBtn = root.querySelector('[data-action="next"]');

      // 應該不拋錯
      await expect(async () => {
        nextBtn.click();
        await new Promise(process.nextTick);
      }).not.toThrow();
    });

    it('進入 Step 3 時若未連接 Notion 應顯示 needs-auth 狀態', async () => {
      isNotionConnected.mockResolvedValue(false);
      nextStep.mockReturnValue(3);

      loadEntryScript();

      const nextBtn = root.querySelector('[data-action="next"]');
      nextStep.mockReturnValue(3);
      nextBtn.click();

      await new Promise(process.nextTick);

      const confirmBtn = root.querySelector('[data-step3-confirm]');
      expect(confirmBtn.hidden).toBe(true);
    });

    it('進入 Step 3 時檢測 Notion 連接失敗應顯示 needs-auth', async () => {
      isNotionConnected.mockRejectedValue(new Error('detection_failed'));
      nextStep.mockReturnValue(3);

      loadEntryScript();

      const nextBtn = root.querySelector('[data-action="next"]');
      nextStep.mockReturnValue(3);
      nextBtn.click();

      await new Promise(process.nextTick);

      const confirmBtn = root.querySelector('[data-step3-confirm]');
      expect(confirmBtn.hidden).toBe(true);
    });

    it('進入 Step 4 時若功能關閉應自動跳到 Step 5', async () => {
      isAccountFeatureEnabled.mockReturnValue(false);

      // 模擬從 Step 3 進入 Step 4
      nextStep.mockReturnValueOnce(4).mockReturnValueOnce(5);

      loadEntryScript();

      // 模擬完成 Step 3 (選擇資料庫)
      isNotionConnected.mockResolvedValue(true);
      fetchNotionDatabases.mockResolvedValue([{ id: 'db-1', title: 'DB One' }]);
      selectDataSource.mockResolvedValue(undefined);

      const retryBtn = root.querySelector('[data-action="retry-databases"]');
      retryBtn.click();

      await new Promise(process.nextTick);

      const listEl = root.querySelector('[data-database-list]');
      const firstItem = listEl.children[0];
      firstItem.click();

      const confirmBtn = root.querySelector('[data-step3-confirm]');
      confirmBtn.click();

      await new Promise(process.nextTick);

      expect(isAccountFeatureEnabled).toHaveBeenCalled();
      expect(nextStep).toHaveBeenCalledTimes(2); // Step 3->4, Step 4->5
    });

    it('進入 Step 4 時若已登入應自動跳到 Step 5', async () => {
      isAccountFeatureEnabled.mockReturnValue(true);
      isAccountLoggedIn.mockResolvedValue(true);

      // 模擬從 Step 3 進入 Step 4
      nextStep.mockReturnValueOnce(4).mockReturnValueOnce(5);

      loadEntryScript();

      // 模擬完成 Step 3 (選擇資料庫)
      isNotionConnected.mockResolvedValue(true);
      fetchNotionDatabases.mockResolvedValue([{ id: 'db-1', title: 'DB One' }]);
      selectDataSource.mockResolvedValue(undefined);

      const retryBtn = root.querySelector('[data-action="retry-databases"]');
      retryBtn.click();

      await new Promise(process.nextTick);

      const listEl = root.querySelector('[data-database-list]');
      const firstItem = listEl.children[0];
      firstItem.click();

      const confirmBtn = root.querySelector('[data-step3-confirm]');
      confirmBtn.click();

      await new Promise(process.nextTick);

      expect(isAccountLoggedIn).toHaveBeenCalled();
      expect(nextStep).toHaveBeenCalledTimes(2); // Step 3->4, Step 4->5
    });

    it('進入 Step 4 時檢測登入狀態失敗應記錄但不阻斷', async () => {
      isAccountFeatureEnabled.mockReturnValue(true);
      isAccountLoggedIn.mockRejectedValue(new Error('detection_failed'));
      nextStep.mockReturnValue(4);

      loadEntryScript();

      const nextBtn = root.querySelector('[data-action="next"]');

      // 應該不拋錯
      await expect(async () => {
        nextBtn.click();
        await new Promise(process.nextTick);
      }).not.toThrow();
    });

    it('進入 Step 6 (完成) 時 markCompleted 失敗應記錄但不阻斷', async () => {
      const { markCompleted } = require('../../../pages/onboarding/onboardingController.js');
      markCompleted.mockRejectedValue(new Error('write_failed'));
      skipToEnd.mockReturnValue(6);

      loadEntryScript();

      const skipBtn = root.querySelector('[data-action="skip"]');

      // 應該不拋錯
      await expect(async () => {
        skipBtn.click();
        await new Promise(process.nextTick);
      }).not.toThrow();

      expect(markCompleted).toHaveBeenCalled();
    });
  });

  describe('資料庫選取與切換', () => {
    it('選取第二個資料庫時應移除第一個的 selected 狀態', async () => {
      isNotionConnected.mockResolvedValue(true);
      fetchNotionDatabases.mockResolvedValue([
        { id: 'db-1', title: 'DB One' },
        { id: 'db-2', title: 'DB Two' },
      ]);

      loadEntryScript();

      const retryBtn = root.querySelector('[data-action="retry-databases"]');
      retryBtn.click();

      await new Promise(process.nextTick);

      const listEl = root.querySelector('[data-database-list]');
      const firstItem = listEl.children[0];
      const secondItem = listEl.children[1];

      // 選取第一個
      firstItem.click();
      expect(firstItem.classList.contains('selected')).toBe(true);
      expect(firstItem.getAttribute('aria-checked')).toBe('true');

      // 選取第二個
      secondItem.click();
      expect(firstItem.classList.contains('selected')).toBe(false);
      expect(firstItem.getAttribute('aria-checked')).toBe('false');
      expect(secondItem.classList.contains('selected')).toBe(true);
      expect(secondItem.getAttribute('aria-checked')).toBe('true');
    });

    it('selectDataSource 失敗時應顯示錯誤並保留按鈕狀態', async () => {
      isNotionConnected.mockResolvedValue(true);
      fetchNotionDatabases.mockResolvedValue([{ id: 'db-1', title: 'DB One' }]);

      loadEntryScript();

      const retryBtn = root.querySelector('[data-action="retry-databases"]');
      retryBtn.click();

      await new Promise(process.nextTick);

      const listEl = root.querySelector('[data-database-list]');
      const firstItem = listEl.children[0];
      firstItem.click();

      selectDataSource.mockRejectedValue(new Error('storage_error'));

      const confirmBtn = root.querySelector('[data-step3-confirm]');
      confirmBtn.click();

      await new Promise(process.nextTick);

      const errorEl = root.querySelector('[data-error="fetch-databases"]');
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('storage_error');

      const errorState = root.querySelector('[data-step3-state="error"]');
      expect(errorState.hidden).toBe(false);
    });
  });

  describe('chrome.runtime.sendMessage 錯誤處理', () => {
    it('sendMessage 成功應正常返回 response', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true, data: [] });
      });

      isNotionConnected.mockResolvedValue(true);
      fetchNotionDatabases.mockResolvedValue([]);

      loadEntryScript();

      const retryBtn = root.querySelector('[data-action="retry-databases"]');
      retryBtn.click();

      await new Promise(process.nextTick);

      // 成功載入（空列表）
      const emptyState = root.querySelector('[data-step3-state="empty"]');
      expect(emptyState.hidden).toBe(false);
    });

    it('sendMessage 觸發 chrome.runtime.lastError 應拋出錯誤', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        globalThis.chrome.runtime.lastError = { message: 'runtime_error' };
        callback();
        delete globalThis.chrome.runtime.lastError;
      });

      fetchNotionDatabases.mockImplementation(async ({ sendMessage }) => {
        await sendMessage({ action: 'test' });
      });

      loadEntryScript();

      const retryBtn = root.querySelector('[data-action="retry-databases"]');
      retryBtn.click();

      await new Promise(process.nextTick);

      const errorEl = root.querySelector('[data-error="fetch-databases"]');
      expect(errorEl.hidden).toBe(false);
    });

    it('sendMessage 同步拋出錯誤應被捕獲', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation(() => {
        throw new Error('sync_error');
      });

      fetchNotionDatabases.mockImplementation(async ({ sendMessage }) => {
        await sendMessage({ action: 'test' });
      });

      loadEntryScript();

      const retryBtn = root.querySelector('[data-action="retry-databases"]');
      retryBtn.click();

      await new Promise(process.nextTick);

      const errorEl = root.querySelector('[data-error="fetch-databases"]');
      expect(errorEl.hidden).toBe(false);
    });
  });
});
