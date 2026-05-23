/**
 * @jest-environment node
 */

import {
  sendToastToTab,
  classifyErrorForToast,
} from '../../../../scripts/background/handlers/toastUtils.js';
import { CONTENT_BRIDGE_ACTIONS } from '../../../../scripts/config/runtimeActions/contentBridgeActions.js';

describe('toastUtils', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    globalThis.chrome = {
      tabs: {
        sendMessage: jest.fn().mockResolvedValue(undefined),
      },
    };
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  describe('sendToastToTab', () => {
    test('有效 tabId 應呼叫 chrome.tabs.sendMessage 一次', async () => {
      await sendToastToTab(42, 'SYNC_FAILED_AUTH', 'error');

      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
        action: CONTENT_BRIDGE_ACTIONS.SHOW_TOAST,
        messageKey: 'SYNC_FAILED_AUTH',
        level: 'error',
      });
    });

    test('tabId 為 null 時不呼叫 sendMessage', async () => {
      await sendToastToTab(null, 'SYNC_FAILED_AUTH', 'error');
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    test('tabId 為 undefined 時不呼叫 sendMessage', async () => {
      await sendToastToTab(undefined, 'SYNC_FAILED_AUTH', 'error');
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    test('tabId 為 -1 時不呼叫 sendMessage', async () => {
      await sendToastToTab(-1, 'SYNC_FAILED_AUTH', 'error');
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    test('tabId 為非整數時不呼叫 sendMessage', async () => {
      await sendToastToTab(3.14, 'SYNC_FAILED_AUTH', 'error');
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    test('sendMessage reject 時 caller 不收到 throw', async () => {
      chrome.tabs.sendMessage.mockRejectedValue(new Error('tab closed'));
      await expect(sendToastToTab(42, 'SYNC_FAILED_AUTH', 'error')).resolves.toBeUndefined();
    });
  });

  describe('classifyErrorForToast', () => {
    test('UNAUTHORIZED → SYNC_FAILED_AUTH', () => {
      expect(classifyErrorForToast('UNAUTHORIZED')).toBe('SYNC_FAILED_AUTH');
    });

    test('INVALID_API_KEY_FORMAT → SYNC_FAILED_AUTH', () => {
      expect(classifyErrorForToast('INVALID_API_KEY_FORMAT')).toBe('SYNC_FAILED_AUTH');
    });

    test('API_KEY_NOT_CONFIGURED → SYNC_FAILED_AUTH', () => {
      expect(classifyErrorForToast('API_KEY_NOT_CONFIGURED')).toBe('SYNC_FAILED_AUTH');
    });

    test('INTEGRATION_DISCONNECTED → SYNC_FAILED_AUTH', () => {
      expect(classifyErrorForToast('INTEGRATION_DISCONNECTED')).toBe('SYNC_FAILED_AUTH');
    });

    test('RATE_LIMITED → SYNC_FAILED_RATE_LIMIT', () => {
      expect(classifyErrorForToast('RATE_LIMITED')).toBe('SYNC_FAILED_RATE_LIMIT');
    });

    test('NETWORK_ERROR → SYNC_FAILED_NETWORK', () => {
      expect(classifyErrorForToast('NETWORK_ERROR')).toBe('SYNC_FAILED_NETWORK');
    });

    test('TIMEOUT → SYNC_FAILED_NETWORK', () => {
      expect(classifyErrorForToast('TIMEOUT')).toBe('SYNC_FAILED_NETWORK');
    });

    test('OBJECT_NOT_FOUND → SYNC_FAILED_PAGE', () => {
      expect(classifyErrorForToast('OBJECT_NOT_FOUND')).toBe('SYNC_FAILED_PAGE');
    });

    test('PAGE_NOT_SAVED → SYNC_FAILED_PAGE', () => {
      expect(classifyErrorForToast('PAGE_NOT_SAVED')).toBe('SYNC_FAILED_PAGE');
    });

    test('HIGHLIGHT_SECTION_DELETE_INCOMPLETE → null（不 toast）', () => {
      expect(classifyErrorForToast('HIGHLIGHT_SECTION_DELETE_INCOMPLETE')).toBeNull();
    });

    test('不在映射表的 errorCode → null', () => {
      expect(classifyErrorForToast('SOME_UNKNOWN_CODE')).toBeNull();
    });

    test('null → null', () => {
      expect(classifyErrorForToast(null)).toBeNull();
    });

    test('undefined → null', () => {
      expect(classifyErrorForToast(undefined)).toBeNull();
    });
  });
});
