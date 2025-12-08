/**
 * 測試環境輔助工具類
 * 提供標準化的測試環境設置和清理功能
 */

class TestEnvironmentHelper {
  constructor() {
    this.originalChrome = null;
    this.originalWindow = null;
    this.originalConsole = null;
  }

  /**
   * 創建標準的 Chrome API mock 對象
   * @param {Object} overrides - 覆蓋特定的 mock 行為
   * @returns {Object} Mock Chrome 對象
   */
  static createMockChrome(overrides = {}) {
    const defaultChrome = {
      runtime: {
        id: 'mock-extension-id',
        sendMessage: jest.fn(),
        lastError: null,
        getManifest: jest.fn(() => ({ version: '2.10.0' })),
      },
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
        sync: {
          get: jest.fn(),
          onChanged: {
            addListener: jest.fn(),
          },
        },
      },
    };

    // 深度合併覆蓋設置
    if (overrides.runtime) {
      Object.assign(defaultChrome.runtime, overrides.runtime);
    }
    if (overrides.storage?.local) {
      Object.assign(defaultChrome.storage.local, overrides.storage.local);
    }
    if (overrides.storage?.sync) {
      Object.assign(defaultChrome.storage.sync, overrides.storage.sync);
    }

    return defaultChrome;
  }

  /**
   * 創建標準的 Console mock 對象
   * @returns {Object} Mock Console 對象
   */
  static createMockConsole() {
    return {
      log: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  }

  /**
   * 創建標準的 Window mock 對象
   * @param {Object} overrides - 覆蓋特定屬性
   * @returns {Object} Mock Window 對象
   */
  static createMockWindow(overrides = {}) {
    return {
      StorageUtil: undefined,
      Logger: undefined,
      normalizeUrl: undefined,
      location: { href: 'https://example.com' },
      ...overrides,
    };
  }

  /**
   * 保存當前環境狀態
   */
  saveCurrentEnvironment() {
    this.originalChrome = global.chrome;
    this.originalWindow = global.window;
    this.originalConsole = global.console;
  }

  /**
   * 設置測試環境
   * @param {Object} options - 配置選項
   * @param {Object} options.chromeOverrides - Chrome API 覆蓋設置
   * @param {Object} options.windowOverrides - Window 對象覆蓋設置
   * @param {boolean} options.mockConsole - 是否 mock console（默認 true）
   */
  setupTestEnvironment(options = {}) {
    const { chromeOverrides = {}, windowOverrides = {}, mockConsole = true } = options;

    // 保存原始環境
    this.saveCurrentEnvironment();

    // 設置 mock 環境
    global.chrome = TestEnvironmentHelper.createMockChrome(chromeOverrides);
    global.window = TestEnvironmentHelper.createMockWindow(windowOverrides);

    if (mockConsole) {
      global.console = TestEnvironmentHelper.createMockConsole();
    }
  }

  /**
   * 恢復原始環境
   */
  restoreEnvironment() {
    if (this.originalChrome !== null) {
      global.chrome = this.originalChrome;
    }
    if (this.originalWindow !== null) {
      global.window = this.originalWindow;
    }
    if (this.originalConsole !== null) {
      global.console = this.originalConsole;
    }
  }

  /**
   * 完整的測試清理
   */
  cleanup() {
    jest.clearAllMocks();
    this.restoreEnvironment();
  }

  /**
   * 模擬 Chrome Storage 錯誤
   * @param {string} errorMessage - 錯誤消息
   */
  static simulateStorageError(errorMessage = 'Storage access denied') {
    if (global.chrome?.storage?.local) {
      global.chrome.storage.local.get = jest.fn(() => {
        throw new Error(errorMessage);
      });
    }
  }

  /**
   * 模擬 Chrome Runtime 錯誤
   * @param {string} errorMessage - 錯誤消息
   */
  static simulateRuntimeError(errorMessage = 'Runtime error') {
    if (global.chrome?.runtime) {
      global.chrome.runtime.lastError = { message: errorMessage };
    }
  }

  /**
   * 移除 Chrome API 的特定部分
   * @param {string} path - 要移除的路徑，如 'storage.local' 或 'storage'
   */
  static removeChromeAPI(path) {
    const parts = path.split('.');
    let current = global.chrome;

    for (let i = 0; i < parts.length - 1; i++) {
      if (current?.[parts[i]]) {
        current = current[parts[i]];
      } else {
        return; // 路徑不存在
      }
    }

    if (current) {
      delete current[parts[parts.length - 1]];
    }
  }

  /**
   * 完全移除 Chrome API
   */
  static removeChrome() {
    delete global.chrome;
  }
}

module.exports = TestEnvironmentHelper;
