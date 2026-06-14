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
  });
});
