/**
 * @jest-environment node
 */

/**
 * env/index.js 配置測試
 */

import * as envModule from '../../../scripts/config/env/index.js';

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

const EXTENSION_ID = 'extension-id';

function setWindow(value) {
  if (value === undefined) {
    delete globalThis.window;
    return;
  }

  globalThis.window = value;
}

function installChromeRuntime(runtime = {}) {
  globalThis.chrome = {
    runtime: {
      id: EXTENSION_ID,
      ...runtime,
    },
  };

  return globalThis.chrome.runtime;
}

function installChromeManifest(manifest, runtime = {}) {
  return installChromeRuntime({
    ...runtime,
    getManifest: jest.fn(() => manifest),
  });
}

function installContentLikeContext({ runtime = {}, location } = {}) {
  installChromeRuntime(runtime);
  setWindow({});
  if (location !== undefined) {
    globalThis.location = location;
  }
}

describe('配置模組 - env/index.js', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    delete globalThis.chrome;
    delete globalThis.window;
    delete globalThis.location;
  });

  describe('isExtensionContext', () => {
    test('當 chrome.runtime.id 存在時應返回 true', () => {
      installChromeRuntime();

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
      installChromeRuntime();
      setWindow(undefined);

      expect(isBackgroundContext()).toBe(true);
      expect(isContentContext()).toBe(false);
    });

    test('extension 環境且 window 存在時應視為 content context', () => {
      installContentLikeContext();

      expect(isBackgroundContext()).toBe(false);
      expect(isContentContext()).toBe(true);
    });

    test('extension 環境且 window 存在但 protocol 為 chrome-extension: 時不視為 content context', () => {
      installContentLikeContext({
        location: { protocol: 'chrome-extension:' },
      });

      expect(isContentContext()).toBe(false);
    });

    test.each([
      {
        name: '當沒有 extensionBaseUrl 時回退視為 content context',
        runtime: { getURL: () => '' },
        location: { protocol: 'https:' },
        expected: true,
      },
      {
        name: '當 currentOrigin 等於 extensionOrigin 時不視為 content context',
        runtime: { getURL: () => 'https://extension-id/' },
        location: {
          protocol: 'https:',
          origin: 'https://extension-id',
        },
        expected: false,
      },
      {
        name: '當 currentOrigin 不等於 extensionOrigin 時視為 content context',
        runtime: { getURL: () => 'https://extension-id/' },
        location: {
          protocol: 'https:',
          origin: 'https://example.com',
        },
        expected: true,
      },
      {
        name: '當 URL 解析失敗時，捕獲錯誤並回退視為 content context',
        runtime: { getURL: () => 'invalid-url' },
        location: {
          protocol: 'https:',
        },
        expected: true,
      },
      {
        name: '當 currentOrigin 無效時回退視為 content context',
        runtime: { getURL: () => 'chrome-extension://extension-id/' },
        location: {
          protocol: 'https:',
          origin: '',
        },
        expected: true,
      },
    ])('$name', ({ runtime, location, expected }) => {
      installContentLikeContext({ runtime, location });

      expect(isContentContext()).toBe(expected);
    });
  });

  describe('isNodeEnvironment', () => {
    test('native ESM runner 不應合成 CommonJS module.exports 語意', () => {
      setWindow(undefined);

      expect(isNodeEnvironment()).toBe(false);
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
      installChromeManifest({ version_name: '2.0.0-dev' });

      expect(isDevelopment()).toBe(true);
      expect(isProduction()).toBe(false);
    });

    test.each([
      {
        name: 'version_name 缺失但 version 包含 dev 時仍應返回開發模式',
        manifest: { version: '2.0.0-dev' },
        expected: true,
      },
      {
        name: 'version_name 缺失且 version 缺失時應不報錯並返回非開發模式',
        manifest: {},
        expected: false,
      },
    ])('$name', ({ manifest, expected }) => {
      installChromeManifest(manifest);

      expect(isDevelopment()).toBe(expected);
    });

    test('getManifest 拋錯時應返回 false 並記錄錯誤', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      installChromeRuntime({
        id: 'extension-id-error-test',
        getManifest: jest.fn(() => {
          throw new Error('manifest unavailable');
        }),
      });

      expect(isDevelopment()).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[環境檢測] 無法讀取 manifest:',
        expect.any(Error)
      );
    });
  });

  describe('getEnvironment 與 selectByEnvironment', () => {
    test('應聚合所有環境旗標，且開發/生產模式互斥', () => {
      installChromeManifest({ version_name: '2.0.0-dev' });
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
      const runtime = installChromeManifest({ version_name: '2.0.0-dev' });

      expect(selectByEnvironment('development', 'production')).toBe('development');

      runtime.getManifest = jest.fn(() => ({ version_name: '2.0.0' }));
      expect(selectByEnvironment('development', 'production')).toBe('production');
    });
  });

  describe('ENV 與 BUILD_ENV 常量', () => {
    test('ENV getter 應與對應函式返回一致', () => {
      installChromeManifest({ version_name: '2.0.0-dev' });
      setWindow({});

      expect(ENV.IS_EXTENSION).toBe(isExtensionContext());
      expect(ENV.IS_BACKGROUND).toBe(isBackgroundContext());
      expect(ENV.IS_CONTENT).toBe(isContentContext());
      expect(ENV.IS_NODE).toBe(isNodeEnvironment());
      expect(ENV.IS_DEV).toBe(isDevelopment());
      expect(ENV.IS_PROD).toBe(isProduction());
      expect(Object.isFrozen(ENV)).toBe(true);
    });

    test('BUILD_ENV 應包含必要欄位且為唯讀', () => {
      expect(Object.keys(BUILD_ENV)).toEqual([
        'ENABLE_OAUTH',
        'ENABLE_ACCOUNT',
        'OAUTH_SERVER_URL',
        'OAUTH_CLIENT_ID',
        'EXTENSION_API_KEY',
      ]);
      expect(typeof BUILD_ENV.ENABLE_OAUTH).toBe('boolean');
      expect(typeof BUILD_ENV.ENABLE_ACCOUNT).toBe('boolean');
      expect(typeof BUILD_ENV.OAUTH_SERVER_URL).toBe('string');
      expect(typeof BUILD_ENV.OAUTH_CLIENT_ID).toBe('string');
      expect(typeof BUILD_ENV.EXTENSION_API_KEY).toBe('string');
      expect(Object.isFrozen(BUILD_ENV)).toBe(true);
    });
  });
});
