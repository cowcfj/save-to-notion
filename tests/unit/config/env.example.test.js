/**
 * @jest-environment node
 */

/**
 * env.example.js 模板配置測試
 */

const envModule = require('../../../scripts/config/env.example.js');

const {
  isExtensionContext,
  isBackgroundContext,
  isContentContext,
  isNodeEnvironment,
  isDevelopment,
  isProduction,
  getEnvironment,
  selectByEnvironment,
  ENV,
  BUILD_ENV,
} = envModule;

function setWindow(value) {
  if (value === undefined) {
    delete globalThis.window;
    return;
  }

  globalThis.window = value;
}

describe('配置模組 - env.example.js', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    delete globalThis.chrome;
    delete globalThis.window;
  });

  describe('isExtensionContext', () => {
    test('當 chrome.runtime.id 存在時應返回 true', () => {
      globalThis.chrome = { runtime: { id: 'extension-id' } };

      expect(isExtensionContext()).toBe(true);
    });

    test('當 chrome 不存在或缺少 runtime.id 時應返回 false', () => {
      delete globalThis.chrome;
      expect(isExtensionContext()).toBe(false);

      globalThis.chrome = { runtime: {} };
      expect(isExtensionContext()).toBe(false);
    });
  });

  describe('背景與內容腳本環境判斷', () => {
    test('extension 環境且 window 不存在時應視為 background context', () => {
      globalThis.chrome = { runtime: { id: 'extension-id' } };
      setWindow(undefined);

      expect(isBackgroundContext()).toBe(true);
      expect(isContentContext()).toBe(false);
    });

    test('extension 環境且 window 存在時應視為 content context', () => {
      globalThis.chrome = { runtime: { id: 'extension-id' } };
      setWindow({});

      expect(isBackgroundContext()).toBe(false);
      expect(isContentContext()).toBe(true);
    });
  });

  describe('isNodeEnvironment', () => {
    test('當 module.exports 存在且 window 不存在時應返回 true', () => {
      setWindow(undefined);

      expect(isNodeEnvironment()).toBe(true);
    });

    test('當 window 存在時應返回 false', () => {
      setWindow({});

      expect(isNodeEnvironment()).toBe(false);
    });
  });

  describe('isDevelopment 與 isProduction', () => {
    test('非 extension 環境時應返回非開發模式', () => {
      delete globalThis.chrome;

      expect(isDevelopment()).toBe(false);
      expect(isProduction()).toBe(true);
    });

    test('version_name 包含 dev 時應返回開發模式', () => {
      globalThis.chrome = {
        runtime: {
          id: 'extension-id',
          getManifest: jest.fn(() => ({ version_name: '2.0.0-dev' })),
        },
      };

      expect(isDevelopment()).toBe(true);
      expect(isProduction()).toBe(false);
    });

    test('version_name 缺失但 version 包含 dev 時仍應返回開發模式', () => {
      globalThis.chrome = {
        runtime: {
          id: 'extension-id',
          getManifest: jest.fn(() => ({ version: '2.0.0-dev' })),
        },
      };

      expect(isDevelopment()).toBe(true);
    });

    test('getManifest 拋錯時應返回 false 並記錄錯誤', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      globalThis.chrome = {
        runtime: {
          id: 'extension-id',
          getManifest: jest.fn(() => {
            throw new Error('manifest unavailable');
          }),
        },
      };

      expect(isDevelopment()).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[環境檢測] 無法讀取 manifest:',
        expect.any(Error)
      );
    });
  });

  describe('getEnvironment 與 selectByEnvironment', () => {
    test('應聚合所有環境旗標，且開發/生產模式互斥', () => {
      globalThis.chrome = {
        runtime: {
          id: 'extension-id',
          getManifest: jest.fn(() => ({ version_name: '2.0.0-dev' })),
        },
      };
      setWindow({});

      expect(getEnvironment()).toEqual({
        isExtension: true,
        isBackground: false,
        isContent: true,
        isNode: false,
        isDevelopment: true,
        isProduction: false,
      });
    });

    test('應依據環境選擇對應值', () => {
      globalThis.chrome = {
        runtime: {
          id: 'extension-id',
          getManifest: jest.fn(() => ({ version_name: '2.0.0-dev' })),
        },
      };

      expect(selectByEnvironment('development', 'production')).toBe('development');

      globalThis.chrome.runtime.getManifest = jest.fn(() => ({ version_name: '2.0.0' }));
      expect(selectByEnvironment('development', 'production')).toBe('production');
    });
  });

  describe('ENV 與 BUILD_ENV 常量', () => {
    test('ENV getter 應與對應函式返回一致', () => {
      globalThis.chrome = {
        runtime: {
          id: 'extension-id',
          getManifest: jest.fn(() => ({ version_name: '2.0.0-dev' })),
        },
      };
      setWindow({});

      expect(ENV.IS_EXTENSION).toBe(isExtensionContext());
      expect(ENV.IS_BACKGROUND).toBe(isBackgroundContext());
      expect(ENV.IS_CONTENT).toBe(isContentContext());
      expect(ENV.IS_NODE).toBe(isNodeEnvironment());
      expect(ENV.IS_DEV).toBe(isDevelopment());
      expect(ENV.IS_PROD).toBe(isProduction());
      expect(Object.isFrozen(ENV)).toBe(true);
    });

    test('BUILD_ENV 應保留模板預設值且為唯讀', () => {
      expect(BUILD_ENV).toEqual({
        ENABLE_OAUTH: false,
        ENABLE_ACCOUNT: false,
        OAUTH_SERVER_URL: '',
        OAUTH_CLIENT_ID: '',
        EXTENSION_API_KEY: '',
      });
      expect(Object.isFrozen(BUILD_ENV)).toBe(true);
    });
  });
});
