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

jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: require('../../helpers/loggerMock.js').createLoggerMock(),
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
import Logger from '../../../scripts/utils/Logger.js';

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

    globalThis.chrome = {};

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

  const flushPendingPromises = () => new Promise(process.nextTick);

  const getActionButton = action => root.querySelector(`[data-action="${action}"]`);

  const expectLoggerWarnResult = action => {
    const call = Logger.warn.mock.calls.find(([, context]) => context?.action === action);
    expect(call?.[1]).toEqual(expect.objectContaining({ action, result: 'failed' }));
  };

  const clickAction = action => {
    const button = getActionButton(action);
    button.click();
    return button;
  };

  const clickActionAndFlush = async action => {
    const button = clickAction(action);
    await flushPendingPromises();
    return button;
  };

  const getErrorElement = errorKey => root.querySelector(`[data-error="${errorKey}"]`);

  const getStep3State = state => root.querySelector(`[data-step3-state="${state}"]`);

  const loadDatabasesByRetry = async databases => {
    isNotionConnected.mockResolvedValue(true);
    fetchNotionDatabases.mockResolvedValue(databases);

    loadEntryScript();
    await clickActionAndFlush('retry-databases');

    return root.querySelector('[data-database-list]');
  };

  const loadDatabasesAndSelectFirst = async databases => {
    const listEl = await loadDatabasesByRetry(databases);
    const firstItem = listEl.children[0];
    firstItem.click();

    return {
      listEl,
      firstItem,
      confirmBtn: root.querySelector('[data-step3-confirm]'),
    };
  };

  const completeFirstDatabaseSelection = async () => {
    const { confirmBtn } = await loadDatabasesAndSelectFirst([{ id: 'db-1', title: 'DB One' }]);

    selectDataSource.mockResolvedValue(undefined);
    confirmBtn.click();
    await flushPendingPromises();
  };

  const startAccountLoginAndCaptureListener = async () => {
    let addedListener = null;
    globalThis.chrome.storage.onChanged.addListener.mockImplementation(listener => {
      addedListener = listener;
    });

    isAccountFeatureEnabled.mockReturnValue(true);
    isAccountLoggedIn.mockResolvedValue(false);
    startAccountLogin.mockResolvedValue({ success: true });

    loadEntryScript();
    const loginBtn = await clickActionAndFlush('login-account');

    return {
      addedListener,
      loginBtn,
      waitingEl: root.querySelector('[data-step4-state="waiting"]'),
    };
  };

  const showConnectNotionError = async error => {
    runNotionOAuthFlow.mockRejectedValue(error);

    loadEntryScript();
    await clickActionAndFlush('connect-notion');

    return getErrorElement('connect-notion');
  };

  const mockFetchThroughRuntimeSendMessage = () => {
    fetchNotionDatabases.mockImplementation(async ({ sendMessage }) => {
      await sendMessage({ action: 'test' });
    });
  };

  it('載入時應初始化步驟 1 並綁定 actions', () => {
    loadEntryScript();
    expect(showStep).toHaveBeenCalledWith(root, 1);
    expect(Logger.ready).toHaveBeenCalledWith('[Onboarding] entry loaded', {
      action: 'onboarding_init',
      result: 'success',
    });
  });

  it('點擊 next 應調用 nextStep', () => {
    loadEntryScript();
    nextStep.mockReturnValue(5);

    clickAction('next');

    expect(nextStep).toHaveBeenCalledWith(root);
  });

  it('點擊 skip 應調用 skipToEnd', () => {
    loadEntryScript();
    skipToEnd.mockReturnValue(6);

    clickAction('skip');

    expect(skipToEnd).toHaveBeenCalledWith(root);
  });

  it('點擊 finish 應關閉視窗', () => {
    loadEntryScript();

    clickAction('finish');

    expect(window.close).toHaveBeenCalled();
  });

  describe('Step 2: Connect Notion', () => {
    it('若 Notion 已連接，進入 Step 2 時應自動跳到下一步', async () => {
      isNotionConnected.mockResolvedValue(true);
      nextStep.mockReturnValue(3);

      loadEntryScript();

      runNotionOAuthFlow.mockResolvedValue(undefined);
      nextStep.mockReturnValue(3);

      await clickActionAndFlush('connect-notion');

      expect(runNotionOAuthFlow).toHaveBeenCalled();
      expect(nextStep).toHaveBeenCalledWith(root);
    });

    it('Notion OAuth 連接失敗時，應顯示錯誤訊息並還原按鈕', async () => {
      isNotionConnected.mockResolvedValue(false);
      runNotionOAuthFlow.mockRejectedValue(new Error('oauth_error'));

      loadEntryScript();

      const connectBtn = getActionButton('connect-notion');
      const originalText = connectBtn.textContent;

      await clickActionAndFlush('connect-notion');

      const errorEl = getErrorElement('connect-notion');
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('oauth_error');
      expect(connectBtn.disabled).toBe(false);
      expect(connectBtn.textContent).toBe(originalText);
      expectLoggerWarnResult('runNotionOAuthFlow');
    });
  });

  describe('Step 3: Database Selection', () => {
    it('加載資料庫為空時應顯示空狀態', async () => {
      await loadDatabasesByRetry([]);

      const emptyState = getStep3State('empty');
      expect(emptyState.hidden).toBe(false);
    });

    it('載入資料庫成功時，應渲染列表並支援選取與確認', async () => {
      const { listEl, firstItem, confirmBtn } = await loadDatabasesAndSelectFirst([
        { id: 'db-1', title: 'DB One' },
        { id: 'db-2', title: 'DB Two' },
      ]);

      const listState = getStep3State('list');
      expect(listState.hidden).toBe(false);

      expect(listEl.children).toHaveLength(2);

      expect(firstItem.classList.contains('selected')).toBe(true);
      expect(firstItem.getAttribute('aria-checked')).toBe('true');

      expect(confirmBtn.disabled).toBe(false);

      selectDataSource.mockResolvedValue(undefined);
      nextStep.mockReturnValue(4);
      confirmBtn.click();

      await flushPendingPromises();
      expect(selectDataSource).toHaveBeenCalledWith({
        storage: globalThis.chrome.storage.local,
        dataSourceId: 'db-1',
      });
    });

    it('資料庫加載失敗時應顯示錯誤狀態與訊息', async () => {
      isNotionConnected.mockResolvedValue(true);
      fetchNotionDatabases.mockRejectedValue(new Error('network_error'));

      loadEntryScript();
      await clickActionAndFlush('retry-databases');

      const errorState = getStep3State('error');
      expect(errorState.hidden).toBe(false);

      const errorEl = getErrorElement('fetch-databases');
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('network_error');
      expectLoggerWarnResult('fetchNotionDatabases');
    });
  });

  describe('Step 4: Account Login', () => {
    it('點擊登入應啟動登入流，設置 listener，並在儲存 accountEmail 後進入下一步', async () => {
      const { addedListener, waitingEl } = await startAccountLoginAndCaptureListener();

      expect(startAccountLogin).toHaveBeenCalled();
      expect(globalThis.chrome.storage.onChanged.addListener).toHaveBeenCalled();
      expect(addedListener).not.toBeNull();

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

      const loginBtn = getActionButton('login-account');
      const originalText = loginBtn.textContent;
      await clickActionAndFlush('login-account');

      const errorEl = getErrorElement('login-account');
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('auth_api_down');
      expect(loginBtn.disabled).toBe(false);
      expect(loginBtn.textContent).toBe(originalText);
      expect(globalThis.chrome.storage.onChanged.removeListener).toHaveBeenCalled();
      expectLoggerWarnResult('startAccountLogin');
    });

    it('startAccountLogin 回傳 success:false 應視為失敗並顯示錯誤', async () => {
      isAccountFeatureEnabled.mockReturnValue(true);
      isAccountLoggedIn.mockResolvedValue(false);
      startAccountLogin.mockResolvedValue({ success: false, error: 'login_failed' });

      loadEntryScript();

      const loginBtn = await clickActionAndFlush('login-account');

      const errorEl = getErrorElement('login-account');
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('login_failed');
      expect(loginBtn.disabled).toBe(false);
      expect(globalThis.chrome.storage.onChanged.removeListener).toHaveBeenCalled();
    });

    it.each([
      ['非 accountEmail 變更', { otherKey: { newValue: 'value' } }, 'local'],
      ['sync 區域變更', { accountEmail: { newValue: 'user@example.com' } }, 'sync'],
    ])('storage listener 收到%s應忽略', async (_label, changes, areaName) => {
      const { addedListener } = await startAccountLoginAndCaptureListener();
      nextStep.mockClear();

      await addedListener(changes, areaName);

      expect(nextStep).not.toHaveBeenCalled();
      expect(globalThis.chrome.storage.onChanged.removeListener).not.toHaveBeenCalled();
    });
  });

  describe('formatError 函數行為', () => {
    it.each([
      ['字串類型錯誤', 'string_error', 'string_error'],
      ['null/undefined 錯誤', null, '未知錯誤'],
      ['非 Error 物件', 12_345, '未知錯誤'],
    ])('formatError 應處理%s', async (_label, thrownError, expectedMessage) => {
      const errorEl = await showConnectNotionError(thrownError);

      expect(errorEl.textContent).toContain(expectedMessage);
    });
  });

  describe('防禦性檢查', () => {
    it('setError 找不到 error 元素時應不拋錯', async () => {
      // 移除 error 元素
      const errorEl = getErrorElement('connect-notion');
      errorEl.remove();

      runNotionOAuthFlow.mockRejectedValue(new Error('test_error'));

      loadEntryScript();

      // 應該不拋錯
      await expect(
        (async () => {
          await clickActionAndFlush('connect-notion');
        })()
      ).resolves.toBeUndefined();
    });

    it('renderDatabaseList 找不到 list 元素時應不拋錯', async () => {
      // 移除 list 元素
      const listEl = root.querySelector('[data-database-list]');
      listEl.remove();

      isNotionConnected.mockResolvedValue(true);
      fetchNotionDatabases.mockResolvedValue([{ id: 'db-1', title: 'DB One' }]);

      loadEntryScript();

      // 應該不拋錯
      await expect(
        (async () => {
          await clickActionAndFlush('retry-databases');
        })()
      ).resolves.toBeUndefined();
    });

    it('handleConfirmDatabase 未選資料庫時應直接返回', async () => {
      loadEntryScript();

      const confirmBtn = root.querySelector('[data-step3-confirm]');
      confirmBtn.disabled = false;
      confirmBtn.click();

      await flushPendingPromises();

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

    it('event.target 不是 Element 時應忽略 click', async () => {
      loadEntryScript();

      const textNode = document.createTextNode('plain text');
      root.append(textNode);
      textNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      await flushPendingPromises();

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

      await clickActionAndFlush('next');

      expect(isNotionConnected).toHaveBeenCalled();
      expect(nextStep).toHaveBeenCalledWith(root);
    });

    it('進入 Step 2 時檢測 Notion 連接失敗應記錄但不阻斷', async () => {
      isNotionConnected.mockRejectedValue(new Error('detection_failed'));

      loadEntryScript();

      // 應該不拋錯
      await expect(
        (async () => {
          await clickActionAndFlush('next');
        })()
      ).resolves.toBeUndefined();
      expectLoggerWarnResult('isNotionConnected');
    });

    it('進入 Step 3 時若未連接 Notion 應顯示 needs-auth 狀態', async () => {
      isNotionConnected.mockResolvedValue(false);
      nextStep.mockReturnValue(3);

      loadEntryScript();

      nextStep.mockReturnValue(3);

      await clickActionAndFlush('next');

      const confirmBtn = root.querySelector('[data-step3-confirm]');
      expect(confirmBtn.hidden).toBe(true);
    });

    it('進入 Step 3 時檢測 Notion 連接失敗應顯示 needs-auth', async () => {
      isNotionConnected.mockRejectedValue(new Error('detection_failed'));
      nextStep.mockReturnValue(3);

      loadEntryScript();

      nextStep.mockReturnValue(3);

      await clickActionAndFlush('next');

      const confirmBtn = root.querySelector('[data-step3-confirm]');
      expect(confirmBtn.hidden).toBe(true);
      expectLoggerWarnResult('isNotionConnected');
    });

    it('進入 Step 4 時若功能關閉應自動跳到 Step 5', async () => {
      isAccountFeatureEnabled.mockReturnValue(false);

      // 模擬從 Step 3 進入 Step 4
      nextStep.mockReturnValueOnce(4).mockReturnValueOnce(5);

      await completeFirstDatabaseSelection();

      expect(isAccountFeatureEnabled).toHaveBeenCalled();
      expect(nextStep).toHaveBeenCalledTimes(2); // Step 3->4, Step 4->5
    });

    it('進入 Step 4 時若已登入應自動跳到 Step 5', async () => {
      isAccountFeatureEnabled.mockReturnValue(true);
      isAccountLoggedIn.mockResolvedValue(true);

      // 模擬從 Step 3 進入 Step 4
      nextStep.mockReturnValueOnce(4).mockReturnValueOnce(5);

      await completeFirstDatabaseSelection();

      expect(isAccountLoggedIn).toHaveBeenCalled();
      expect(nextStep).toHaveBeenCalledTimes(2); // Step 3->4, Step 4->5
    });

    it('進入 Step 4 時檢測登入狀態失敗應記錄但不阻斷', async () => {
      isAccountFeatureEnabled.mockReturnValue(true);
      isAccountLoggedIn.mockRejectedValue(new Error('detection_failed'));
      nextStep.mockReturnValue(4);

      loadEntryScript();

      // 應該不拋錯
      await expect(
        (async () => {
          await clickActionAndFlush('next');
        })()
      ).resolves.toBeUndefined();
      expectLoggerWarnResult('isAccountLoggedIn');
    });

    it('進入 Step 6 (完成) 時 markCompleted 失敗應記錄但不阻斷', async () => {
      const { markCompleted } = require('../../../pages/onboarding/onboardingController.js');
      markCompleted.mockRejectedValue(new Error('write_failed'));
      skipToEnd.mockReturnValue(6);

      loadEntryScript();

      // 應該不拋錯
      await expect(
        (async () => {
          await clickActionAndFlush('skip');
        })()
      ).resolves.toBeUndefined();

      expect(markCompleted).toHaveBeenCalled();
      expectLoggerWarnResult('markCompleted');
    });
  });

  describe('資料庫選取與切換', () => {
    it('選取第二個資料庫時應移除第一個的 selected 狀態', async () => {
      const { listEl, firstItem } = await loadDatabasesAndSelectFirst([
        { id: 'db-1', title: 'DB One' },
        { id: 'db-2', title: 'DB Two' },
      ]);

      const secondItem = listEl.children[1];

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
      const { confirmBtn } = await loadDatabasesAndSelectFirst([{ id: 'db-1', title: 'DB One' }]);

      selectDataSource.mockRejectedValue(new Error('storage_error'));

      confirmBtn.click();

      await flushPendingPromises();

      const errorEl = getErrorElement('fetch-databases');
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toContain('storage_error');
      expectLoggerWarnResult('selectDataSource');

      const errorState = getStep3State('error');
      expect(errorState.hidden).toBe(false);
    });
  });

  describe('chrome.runtime.sendMessage 錯誤處理', () => {
    it('sendMessage 成功應正常返回 response', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true, data: [] });
      });

      await loadDatabasesByRetry([]);

      // 成功載入（空列表）
      const emptyState = getStep3State('empty');
      expect(emptyState.hidden).toBe(false);
    });

    it.each([
      [
        '觸發 chrome.runtime.lastError 應拋出錯誤',
        (_msg, callback) => {
          globalThis.chrome.runtime.lastError = { message: 'runtime_error' };
          callback();
          delete globalThis.chrome.runtime.lastError;
        },
      ],
      [
        '同步拋出錯誤應被捕獲',
        () => {
          throw new Error('sync_error');
        },
      ],
    ])('sendMessage %s', async (_label, sendMessageImplementation) => {
      globalThis.chrome.runtime.sendMessage.mockImplementation(sendMessageImplementation);
      mockFetchThroughRuntimeSendMessage();

      loadEntryScript();
      await clickActionAndFlush('retry-databases');

      const errorEl = getErrorElement('fetch-databases');
      expect(errorEl.hidden).toBe(false);
    });
  });
});
