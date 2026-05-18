/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/auth/notionOAuthInitiator.js', () => ({
  initiateNotionOAuth: jest.fn(),
}));

jest.mock('../../../scripts/auth/notionOAuthCompleter.js', () => ({
  exchangeNotionOAuthCode: jest.fn(),
  saveNotionOAuthToken: jest.fn(),
}));

jest.mock('../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    ENABLE_ACCOUNT: true,
  },
}));

import {
  TOTAL_STEPS,
  ONBOARDING_COMPLETED_KEY,
  showStep,
  getCurrentStep,
  nextStep,
  skipToEnd,
  markCompleted,
  isNotionConnected,
  runNotionOAuthFlow,
  fetchNotionDatabases,
  selectDataSource,
  extractDatabaseTitle,
  isAccountFeatureEnabled,
  isAccountLoggedIn,
} from '../../../onboarding/onboardingController.js';
import { initiateNotionOAuth } from '../../../scripts/auth/notionOAuthInitiator.js';
import {
  exchangeNotionOAuthCode,
  saveNotionOAuthToken,
} from '../../../scripts/auth/notionOAuthCompleter.js';
import { BUILD_ENV } from '../../../scripts/config/env/index.js';

function buildRoot() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="onboarding-progress">
      ${Array.from({ length: TOTAL_STEPS }, (_, i) => `<span class="progress-dot" data-dot="${i + 1}"></span>`).join('')}
    </div>
    ${Array.from({ length: TOTAL_STEPS }, (_, i) => `<section data-step="${i + 1}" hidden></section>`).join('')}
  `;
  return root;
}

describe('onboardingController', () => {
  describe('TOTAL_STEPS', () => {
    it('應為 6 步驟', () => {
      expect(TOTAL_STEPS).toBe(6);
    });
  });

  describe('showStep', () => {
    it('應僅顯示對應 data-step 的 section、隱藏其他', () => {
      const root = buildRoot();
      showStep(root, 3);
      const sections = root.querySelectorAll('section[data-step]');
      sections.forEach(section => {
        const step = Number(section.dataset.step);
        if (step === 3) {
          expect(section.hidden).toBe(false);
        } else {
          expect(section.hidden).toBe(true);
        }
      });
    });

    it('應同步將進度圓點的 active 狀態設在當前 step', () => {
      const root = buildRoot();
      showStep(root, 4);
      const dots = root.querySelectorAll('.progress-dot');
      dots.forEach(dot => {
        const dotIndex = Number(dot.dataset.dot);
        expect(dot.classList.contains('active')).toBe(dotIndex === 4);
      });
    });

    it('應 clamp 到 1..TOTAL_STEPS 範圍內', () => {
      const root = buildRoot();
      expect(showStep(root, 0)).toBe(1);
      expect(showStep(root, 99)).toBe(TOTAL_STEPS);
      expect(showStep(root, -5)).toBe(1);
    });

    it('回傳實際套用的 step 數值', () => {
      const root = buildRoot();
      expect(showStep(root, 2)).toBe(2);
    });
  });

  describe('getCurrentStep', () => {
    it('應回傳當前可見 section 的 data-step', () => {
      const root = buildRoot();
      showStep(root, 5);
      expect(getCurrentStep(root)).toBe(5);
    });

    it('沒有任何可見 section 時回傳 1', () => {
      const root = buildRoot();
      expect(getCurrentStep(root)).toBe(1);
    });
  });

  describe('nextStep', () => {
    it('應前進一步', () => {
      const root = buildRoot();
      showStep(root, 2);
      nextStep(root);
      expect(getCurrentStep(root)).toBe(3);
    });

    it('已在最後一步時不會超出 TOTAL_STEPS', () => {
      const root = buildRoot();
      showStep(root, TOTAL_STEPS);
      nextStep(root);
      expect(getCurrentStep(root)).toBe(TOTAL_STEPS);
    });
  });

  describe('skipToEnd', () => {
    it('應直接跳到最後一步', () => {
      const root = buildRoot();
      showStep(root, 2);
      skipToEnd(root);
      expect(getCurrentStep(root)).toBe(TOTAL_STEPS);
    });
  });

  describe('markCompleted', () => {
    it('應將 onboardingCompleted 寫入 storage 為 true', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined);
      const storage = { set: setMock };
      await markCompleted(storage);
      expect(setMock).toHaveBeenCalledWith({ [ONBOARDING_COMPLETED_KEY]: true });
    });

    it('storage.set 失敗時應 reject 並保留 error', async () => {
      const setMock = jest.fn().mockRejectedValue(new Error('storage_unavailable'));
      const storage = { set: setMock };
      await expect(markCompleted(storage)).rejects.toThrow('storage_unavailable');
    });
  });

  describe('ONBOARDING_COMPLETED_KEY', () => {
    it('應為 onboardingCompleted', () => {
      expect(ONBOARDING_COMPLETED_KEY).toBe('onboardingCompleted');
    });
  });

  describe('isNotionConnected', () => {
    it('storage 中有 notionOAuthToken 時應回傳 true', async () => {
      const storage = {
        get: jest.fn().mockResolvedValue({ notionOAuthToken: 'token-abc' }),
      };
      await expect(isNotionConnected(storage)).resolves.toBe(true);
      expect(storage.get).toHaveBeenCalledWith('notionOAuthToken');
    });

    it('storage 中無 notionOAuthToken 時應回傳 false', async () => {
      const storage = {
        get: jest.fn().mockResolvedValue({}),
      };
      await expect(isNotionConnected(storage)).resolves.toBe(false);
    });

    it('notionOAuthToken 為空字串時應回傳 false', async () => {
      const storage = {
        get: jest.fn().mockResolvedValue({ notionOAuthToken: '' }),
      };
      await expect(isNotionConnected(storage)).resolves.toBe(false);
    });
  });

  describe('runNotionOAuthFlow', () => {
    beforeEach(() => {
      initiateNotionOAuth.mockReset();
      exchangeNotionOAuthCode.mockReset();
      saveNotionOAuthToken.mockReset();
    });

    it('成功路徑應依序呼叫 initiator → exchange → save 並回傳 tokenData', async () => {
      initiateNotionOAuth.mockResolvedValueOnce({
        code: 'auth-code-1',
        redirectUri: 'https://ext.test/callback',
        csrfState: 'state-1',
      });
      exchangeNotionOAuthCode.mockResolvedValueOnce({
        access_token: 'token-1',
        refresh_token: 'refresh-1',
        workspace_name: 'WS',
      });
      saveNotionOAuthToken.mockResolvedValueOnce(undefined);

      const result = await runNotionOAuthFlow();

      expect(initiateNotionOAuth).toHaveBeenCalledTimes(1);
      expect(exchangeNotionOAuthCode).toHaveBeenCalledWith({
        code: 'auth-code-1',
        redirectUri: 'https://ext.test/callback',
      });
      expect(saveNotionOAuthToken).toHaveBeenCalledWith(
        expect.objectContaining({ access_token: 'token-1' })
      );
      expect(result.workspace_name).toBe('WS');
    });

    it('initiator 拋錯時應 reject，且不應呼叫 exchange / save', async () => {
      initiateNotionOAuth.mockRejectedValueOnce(new Error('user_cancel'));

      await expect(runNotionOAuthFlow()).rejects.toThrow('user_cancel');
      expect(exchangeNotionOAuthCode).not.toHaveBeenCalled();
      expect(saveNotionOAuthToken).not.toHaveBeenCalled();
    });

    it('exchange 拋錯時應 reject，且不應呼叫 save', async () => {
      initiateNotionOAuth.mockResolvedValueOnce({
        code: 'c',
        redirectUri: 'r',
        csrfState: 's',
      });
      exchangeNotionOAuthCode.mockRejectedValueOnce(new Error('server_500'));

      await expect(runNotionOAuthFlow()).rejects.toThrow('server_500');
      expect(saveNotionOAuthToken).not.toHaveBeenCalled();
    });

    it('save 拋錯時應 reject', async () => {
      initiateNotionOAuth.mockResolvedValueOnce({
        code: 'c',
        redirectUri: 'r',
        csrfState: 's',
      });
      exchangeNotionOAuthCode.mockResolvedValueOnce({
        access_token: 'a',
        refresh_token: 'r',
      });
      saveNotionOAuthToken.mockRejectedValueOnce(new Error('storage_quota'));

      await expect(runNotionOAuthFlow()).rejects.toThrow('storage_quota');
    });
  });

  describe('extractDatabaseTitle', () => {
    it('應從 title[0].plain_text 取出純文字', () => {
      const db = { title: [{ plain_text: 'My DB', text: { content: '其他' } }] };
      expect(extractDatabaseTitle(db)).toBe('My DB');
    });

    it('plain_text 缺失時 fallback 到 text.content', () => {
      const db = { title: [{ text: { content: 'Fallback DB' } }] };
      expect(extractDatabaseTitle(db)).toBe('Fallback DB');
    });

    it('title 空陣列時應回傳「（未命名）」', () => {
      expect(extractDatabaseTitle({ title: [] })).toBe('（未命名）');
    });

    it('title 缺欄位時應回傳「（未命名）」', () => {
      expect(extractDatabaseTitle({})).toBe('（未命名）');
    });
  });

  describe('fetchNotionDatabases', () => {
    it('成功應發送 SEARCH_NOTION 並回傳已過濾的 database 列表', async () => {
      const sendMessage = jest.fn().mockResolvedValue({
        success: true,
        data: {
          results: [
            { id: 'db-1', object: 'database', title: [{ plain_text: 'Database 1' }] },
            { id: 'page-1', object: 'page', title: [{ plain_text: 'Page (skip)' }] },
            { id: 'db-2', object: 'database', title: [{ plain_text: 'Database 2' }] },
          ],
        },
      });

      const result = await fetchNotionDatabases({ sendMessage });

      expect(sendMessage).toHaveBeenCalledWith({
        action: 'searchNotion',
        searchParams: { filter: { property: 'object', value: 'database' } },
      });
      expect(result).toEqual([
        { id: 'db-1', title: 'Database 1' },
        { id: 'db-2', title: 'Database 2' },
      ]);
    });

    it('回傳 success: false 時應拋出含 error 訊息', async () => {
      const sendMessage = jest.fn().mockResolvedValue({
        success: false,
        error: 'unauthorized',
      });

      await expect(fetchNotionDatabases({ sendMessage })).rejects.toThrow('unauthorized');
    });

    it('沒 results 時應回傳空陣列', async () => {
      const sendMessage = jest.fn().mockResolvedValue({
        success: true,
        data: { results: [] },
      });

      await expect(fetchNotionDatabases({ sendMessage })).resolves.toEqual([]);
    });

    it('sendMessage 拋錯時應 reject', async () => {
      const sendMessage = jest.fn().mockRejectedValue(new Error('messaging_failed'));

      await expect(fetchNotionDatabases({ sendMessage })).rejects.toThrow('messaging_failed');
    });

    it('未提供 response 時應拋 no_response 錯誤', async () => {
      const sendMessage = jest.fn().mockResolvedValue(undefined);

      await expect(fetchNotionDatabases({ sendMessage })).rejects.toThrow();
    });
  });

  describe('selectDataSource', () => {
    it('應寫入 notionDataSourceId 到 storage', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined);
      const storage = { set: setMock };

      await selectDataSource({ storage, dataSourceId: 'db-xyz' });

      expect(setMock).toHaveBeenCalledWith({ notionDataSourceId: 'db-xyz' });
    });

    it('未提供 dataSourceId 時應拋錯不寫 storage', async () => {
      const setMock = jest.fn();
      const storage = { set: setMock };

      await expect(selectDataSource({ storage, dataSourceId: '' })).rejects.toThrow();
      expect(setMock).not.toHaveBeenCalled();
    });
  });

  describe('isAccountFeatureEnabled', () => {
    afterEach(() => {
      BUILD_ENV.ENABLE_ACCOUNT = true;
    });

    it('BUILD_ENV.ENABLE_ACCOUNT === true 應回傳 true', () => {
      BUILD_ENV.ENABLE_ACCOUNT = true;
      expect(isAccountFeatureEnabled()).toBe(true);
    });

    it('BUILD_ENV.ENABLE_ACCOUNT === false 應回傳 false', () => {
      BUILD_ENV.ENABLE_ACCOUNT = false;
      expect(isAccountFeatureEnabled()).toBe(false);
    });

    it('BUILD_ENV.ENABLE_ACCOUNT 缺值應回傳 false', () => {
      BUILD_ENV.ENABLE_ACCOUNT = undefined;
      expect(isAccountFeatureEnabled()).toBe(false);
    });
  });

  describe('isAccountLoggedIn', () => {
    it('storage 含 accountEmail 應回傳 true', async () => {
      const storage = {
        get: jest.fn().mockResolvedValue({ accountEmail: 'user@example.com' }),
      };
      await expect(isAccountLoggedIn(storage)).resolves.toBe(true);
      expect(storage.get).toHaveBeenCalledWith('accountEmail');
    });

    it('storage 無 accountEmail 應回傳 false', async () => {
      const storage = {
        get: jest.fn().mockResolvedValue({}),
      };
      await expect(isAccountLoggedIn(storage)).resolves.toBe(false);
    });

    it('accountEmail 為空字串應回傳 false', async () => {
      const storage = {
        get: jest.fn().mockResolvedValue({ accountEmail: '' }),
      };
      await expect(isAccountLoggedIn(storage)).resolves.toBe(false);
    });
  });
});
