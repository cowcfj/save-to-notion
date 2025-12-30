/**
 * 簡單的隔離測試 - 診斷 initHighlighter 掛起問題
 */

import { initHighlighter } from '../../scripts/highlighter/index.js';

describe('Diagnostic Test', () => {
  beforeEach(() => {
    // 設置基本 mocks
    global.Logger = {
      log: jest.fn((...args) => console.log('[LOGGER.LOG]', ...args)),
      info: jest.fn((...args) => console.log('[LOGGER.INFO]', ...args)),
      error: jest.fn((...args) => console.error('[LOGGER.ERROR]', ...args)),
      warn: jest.fn((...args) => console.warn('[LOGGER.WARN]', ...args)),
    };

    window.Logger = global.Logger;

    window.StorageUtil = {
      saveHighlights: jest.fn(async (...args) => {
        console.log('[StorageUtil.saveHighlights] called', ...args);
        return Promise.resolve();
      }),
      loadHighlights: jest.fn(async (...args) => {
        console.log('[StorageUtil.loadHighlights] called', ...args);
        return Promise.resolve([]);
      }),
      clearHighlights: jest.fn((...args) => {
        console.log('[StorageUtil.clearHighlights] called', ...args);
      }),
    };

    window.chrome = {
      runtime: {
        id: 'test',
        sendMessage: jest.fn(),
        lastError: null,
        onMessage: {
          addListener: jest.fn(),
        },
      },
      storage: {
        local: {
          get: jest.fn(async (...args) => {
            console.log('[chrome.storage.local.get] called', ...args);
            return Promise.resolve({});
          }),
          set: jest.fn(async (...args) => {
            console.log('[chrome.storage.local.set] called', ...args);
            return Promise.resolve();
          }),
        },
      },
    };

    // Note: window.location is already provided by jsdom
    window.normalizeUrl = jest.fn(url => {
      console.log('[normalizeUrl] called with', url);
      return url;
    });

    document.body.innerHTML = '<div>Test</div>';
    console.log('[SETUP] Complete');
  });

  test('initHighlighter should complete within timeout', async () => {
    console.log('[TEST] Starting test...');
    const manager = initHighlighter();
    console.log('[TEST] Manager created');

    //  設置超時
    const timeout = new Promise((_, reject) => {
      setTimeout(() => {
        console.log('[TIMEOUT] Init timeout reached!');
        reject(new Error('Initialization timeout'));
      }, 2000);
    });

    try {
      await Promise.race([manager.initializationComplete, timeout]);
      console.log('[TEST] Initialization completed successfully');
    } catch (error) {
      console.error('[TEST] Initialization failed or timed out:', error.message);
      throw error;
    }
  }, 5000); // 5秒測試超時
});
