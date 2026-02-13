/**
 * InjectionService - 腳本注入服務
 *
 * 職責：管理所有腳本注入操作，包括：
 * - 注入文件和執行函數
 * - 標記工具 (Highlighter) 注入
 * - 內容提取和清理
 * - 錯誤處理和恢復機制
 *
 * @module services/InjectionService
 */

/* global chrome */

import { RESTRICTED_PROTOCOLS, INJECTION_CONFIG } from '../../config/constants.js';
import Logger from '../../utils/Logger.js';

/**
 * 檢查 URL 是否限制注入腳本
 *
 * @param {string} url - 要檢查的 URL
 * @returns {boolean} 是否受限
 */
function isRestrictedInjectionUrl(url) {
  // 基本空值檢查
  if (!url) {
    return true;
  }

  try {
    // 使用統一配置的受限協議列表
    if (RESTRICTED_PROTOCOLS.some(protocol => url.startsWith(protocol))) {
      return true;
    }

    // 檢查 Chrome Web Store
    if (url.startsWith('https://chrome.google.com/webstore')) {
      return true;
    }

    // 解析 URL 檢查特定域名
    const urlObj = new URL(url);

    // 檢查受限域名列表
    const blockedHosts = [
      { host: 'chrome.google.com', pathPrefix: '/webstore' },
      { host: 'chromewebstore.google.com' },
      { host: 'microsoftedge.microsoft.com', pathPrefix: '/addons' },
      { host: 'addons.mozilla.org' },
    ];

    return blockedHosts.some(({ host, pathPrefix }) => {
      if (urlObj.host !== host) {
        return false;
      }
      if (!pathPrefix) {
        return true;
      }
      return urlObj.pathname.startsWith(pathPrefix);
    });
  } catch (error) {
    Logger.warn('[Injection:Utils] Failed to parse URL when checking restrictions', {
      action: 'isRestrictedInjectionUrl',
      url,
      error: error.message,
    });
    return true;
  }
}

/**
 * 解析 chrome.runtime.lastError 的文字內容
 *
 * @param {object | string} runtimeError - 運行時錯誤對象
 * @returns {string} 錯誤訊息
 */
function getRuntimeErrorMessage(runtimeError) {
  if (!runtimeError) {
    return '';
  }

  if (typeof runtimeError === 'string') {
    return runtimeError;
  }

  if (runtimeError.message) {
    return runtimeError.message;
  }

  try {
    return JSON.stringify(runtimeError);
  } catch (error) {
    Logger.warn('[Injection:Utils] Unable to stringify runtime error', {
      action: 'getRuntimeErrorMessage',
      error: error.message,
    });
    return `[Runtime Error: ${Object.prototype.toString.call(runtimeError)}]`;
  }
}

/**
 * 判斷注入錯誤是否可恢復（例如受限頁面、無權限等）
 * 可恢復錯誤將被靜默處理，不視為真正的失敗
 *
 * @param {string} message - 錯誤訊息
 * @returns {boolean} 是否為可恢復錯誤
 */
function isRecoverableInjectionError(message) {
  if (!message) {
    return false;
  }

  const patterns = [
    'Cannot access contents of url',
    'Cannot access contents of page',
    'Cannot access contents of the page',
    'Extension manifest must request permission',
    'No tab with id',
    'The tab was closed',
    'The frame was removed',
    // v2.11.3: 新增錯誤頁面相關模式
    'Frame with ID 0 is showing error page',
    'is showing error page',
    'ERR_NAME_NOT_RESOLVED',
    'ERR_CONNECTION_REFUSED',
    'ERR_INTERNET_DISCONNECTED',
    'ERR_TIMED_OUT',
    'ERR_SSL_PROTOCOL_ERROR',
    // Content script 環境未就緒（Preloader 還未注入）
    // 這是暫時性問題，通常在稍後重試會成功
    'Receiving end does not exist',
    // Chrome Web Store restricted error
    'The extensions gallery cannot be scripted.',
    'Could not establish connection',
    INJECTION_CONFIG.PING_TIMEOUT_ERROR,
  ];

  return patterns.some(pattern => message.includes(pattern));
}

/**
 * InjectionService 類
 */
class InjectionService {
  /**
   * @param {object} options - 配置選項
   * @param {object} options.logger - 日誌對象
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
  }

  /**
   * Resolve the correct path for highlighter bundle
   * Handles both 'dist' loading (tests) and 'root' loading (development)
   *
   * @returns {Promise<string>}
   * @private
   */
  async _resolveHighlighterPath() {
    if (this._highlighterPath) {
      return this._highlighterPath;
    }

    // Unified bundle is the only target now
    const bundlePath = 'dist/content.bundle.js';
    const candidates = [bundlePath];

    for (const path of candidates) {
      try {
        const response = await fetch(chrome.runtime.getURL(path), { method: 'HEAD' });
        if (response.ok) {
          this._highlighterPath = path;
          return path;
        }
      } catch {
        // Continue to next candidate
      }
    }

    // Fallback (should typically be caught by candidates, but return unified bundle as default)
    return bundlePath;
  }

  /**
   * 注入文件並執行函數
   *
   * @param {number} tabId - 目標標籤頁 ID
   * @param {string[]} files - 要注入的文件列表
   * @param {Function} func - 要執行的函數
   * @param {object} options - 注入選項
   * @returns {Promise<any>}
   */
  async injectAndExecute(tabId, files = [], func = null, options = {}) {
    this._validateInjectOptions(options);

    try {
      if (files.length > 0) {
        await this._injectFiles(tabId, files, options);
      }

      if (func) {
        return await this._executeFunction(tabId, func, options);
      }
    } catch (error) {
      if (options.logErrors !== false) {
        this.logger.error?.(`[Injection] ${options.errorMessage || 'Script injection failed'}`, {
          action: 'injectAndExecute',
          files,
          error,
        });
      }
      throw error;
    }
  }

  _validateInjectOptions(options) {
    options.errorMessage = options.errorMessage || 'Script injection failed';
    options.successMessage = options.successMessage || 'Script executed successfully';
    if (options.logErrors === undefined) {
      options.logErrors = true;
    }
    if (options.returnResult === undefined) {
      options.returnResult = false;
    }
  }

  async _injectFiles(tabId, files, options) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({ target: { tabId }, files }, () =>
        this._handleScriptResult(resolve, reject, options, false)
      );
    });
  }

  async _executeFunction(tabId, func, options) {
    return new Promise((resolve, reject) => {
      const injection = { target: { tabId }, func };
      if (options.args) {
        injection.args = options.args;
      }
      chrome.scripting.executeScript(injection, results =>
        this._handleScriptResult(resolve, reject, options, true, results)
      );
    });
  }

  _handleScriptResult(resolve, reject, options, isFunction, results = null) {
    if (chrome.runtime.lastError) {
      return this._handleInjectionError(resolve, reject, options, isFunction);
    }
    this._handleInjectionSuccess(resolve, options, isFunction, results);
  }

  /**
   * 處理注入錯誤
   *
   * @param {Function} resolve - Promise resolve 函數
   * @param {Function} reject - Promise reject 函數
   * @param {object} options - 注入選項
   * @param {boolean} isFunction - 是否為函數執行
   * @private
   */
  _handleInjectionError(resolve, reject, options, isFunction) {
    const errMsg = getRuntimeErrorMessage(chrome.runtime.lastError);
    const isRecoverable = isRecoverableInjectionError(errMsg);

    if (options.logErrors) {
      this._logInjectionStatus(false, isFunction, isRecoverable, errMsg);
    }

    if (isRecoverable) {
      resolve(options.returnResult && isFunction ? null : undefined);
      return;
    }
    reject(new Error(errMsg || options.errorMessage));
  }

  /**
   * 處理注入成功
   *
   * @param {Function} resolve - Promise resolve 函數
   * @param {object} options - 注入選項
   * @param {boolean} isFunction - 是否為函數執行
   * @param {Array} results - 注入結果清單
   * @private
   */
  _handleInjectionSuccess(resolve, options, isFunction, results) {
    if (isFunction && options.successMessage && options.logErrors) {
      this.logger.success?.(`[Injection] ${options.successMessage}`);
    }
    const result = (options.returnResult && results?.[0]?.result) ?? null;
    resolve(result);
  }

  /**
   * 記錄注入狀態
   *
   * @param {boolean} isSuccess - 是否成功
   * @param {boolean} isFunction - 是否為函數執行
   * @param {boolean} isRecoverable - 是否為可恢復錯誤
   * @param {string} errMsg - 錯誤訊息
   * @private
   */
  _logInjectionStatus(isSuccess, isFunction, isRecoverable, errMsg) {
    if (isSuccess) {
      return;
    }

    const msgPrefix = isFunction ? 'Function execution' : 'File injection';
    if (isRecoverable) {
      this.logger.warn?.(`[Injection] ${msgPrefix} skipped (recoverable)`, {
        action: 'logInjectionStatus',
        operation: isFunction ? 'executeFunction' : 'injectFiles',
        error: errMsg,
      });
    } else {
      this.logger.error?.(`[Injection] ${msgPrefix} failed`, {
        action: 'logInjectionStatus',
        operation: isFunction ? 'executeFunction' : 'injectFiles',
        error: errMsg,
      });
    }
  }

  /**
   * 確保 Content Bundle 已注入到指定標籤頁
   * 使用 PING 機制檢測 Bundle 是否存在，若無則注入
   *
   * @param {number} tabId - 目標標籤頁 ID
   * @returns {Promise<boolean>} 若已注入或成功注入返回 true
   */
  async ensureBundleInjected(tabId) {
    try {
      // 發送 PING 檢查 Bundle 是否存在（帶超時保護）
      const response = await Promise.race([
        new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, { action: 'PING' }, result => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        }),
        new Promise((resolve, reject) =>
          setTimeout(
            () => reject(new Error(INJECTION_CONFIG.PING_TIMEOUT_ERROR)),
            INJECTION_CONFIG.PING_TIMEOUT_MS
          )
        ),
      ]);

      if (response?.status === 'bundle_ready') {
        this.logger.success?.(`[Injection] Bundle already exists in tab ${tabId}`, {
          action: 'ensureBundleInjected',
          tabId,
        });
        return true; // Bundle 已存在
      }
    } catch (error) {
      if (isRecoverableInjectionError(error.message)) {
        // 特別處理 PING 超時：視為頁面反應慢，但不代表不能注入，所以不 return false 而是記錄警告後繼續
        if (error.message.includes(INJECTION_CONFIG.PING_TIMEOUT_ERROR)) {
          this.logger.warn?.(`[Injection] PING timed out, proceeding with injection anyway`, {
            action: 'ensureBundleInjected',
            tabId,
          });
        } else {
          this.logger.warn?.(`[Injection] PING failed with recoverable error, returning false`, {
            action: 'ensureBundleInjected',
            tabId,
            error,
          });
          return false;
        }
      } else {
        throw error;
      }
    }

    try {
      // Bundle 不存在，注入主程式
      this.logger.start?.(`[Injection] Injecting Content Bundle into tab ${tabId}`, {
        action: 'ensureBundleInjected',
        tabId,
      });

      await new Promise((resolve, reject) => {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            files: ['dist/content.bundle.js'],
          },
          () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          }
        );
      });

      this.logger.success?.(`[Injection] Content Bundle injected into tab ${tabId}`, {
        action: 'ensureBundleInjected',
        tabId,
      });
      return true;
    } catch (error) {
      // 處理錯誤（如無法連接、權限受限）
      const errorMessage = error?.message || String(error);
      if (isRecoverableInjectionError(errorMessage)) {
        this.logger.warn?.(`[Injection] Bundle injection skipped (recoverable)`, {
          action: 'ensureBundleInjected',
          error,
        });
        return false;
      }
      this.logger.error?.(`[Injection] Bundle injection failed`, {
        action: 'ensureBundleInjected',
        error,
      });
      throw error;
    }
  }

  /**
   * 注入標記工具並初始化
   * v2.5.0: 使用新版 CSS Highlight API + 無痛自動遷移
   *
   * @param {number} tabId
   * @returns {Promise<{initialized: boolean, highlightCount: number}>}
   */
  async injectHighlighter(tabId) {
    const bundlePath = await this._resolveHighlighterPath();
    return this.injectAndExecute(
      tabId,
      [bundlePath],
      () => {
        // highlighter-v2.bundle.js 會自動初始化（setupHighlighter）
        // 我們只需要確保工具欄顯示即可
        // 使用 setTimeout 確保自動初始化完成
        return new Promise(resolve => {
          const startTime = Date.now();
          const timeout = 2000; // Max wait 2 seconds (increased robustness)
          const interval = 100; // Check every 100ms for responsiveness

          const checkInitialization = () => {
            if (globalThis.notionHighlighter) {
              globalThis.notionHighlighter.show();
              const count = globalThis.HighlighterV2?.manager?.getCount() || 0;
              // skipcq: JS-0002 - Running in page context
              console.info(`[Notion Highlighter] 標註工具已準備，共 ${count} 個標註`);
              resolve({ initialized: true, highlightCount: count });
              return;
            }

            if (Date.now() - startTime > timeout) {
              // skipcq: JS-0002 - Running in page context
              console.warn('[Notion Highlighter] 初始化超時');
              resolve({ initialized: false, highlightCount: 0 });
              return;
            }

            setTimeout(checkInitialization, interval);
          };

          checkInitialization();
        });
      },
      {
        errorMessage: 'Failed to inject highlighter',
        successMessage: 'Highlighter v2 injected successfully',
        returnResult: true,
      }
    );
  }

  /**
   * 注入並收集標記
   * v2.5.0: 使用新版標註系統
   *
   * @param {number} tabId
   * @returns {Promise<Array>}
   */
  collectHighlights(tabId) {
    // manifest.json 已注入所有依賴，無需重複注入
    return this.injectAndExecute(
      tabId,
      [], // 所有腳本已由 manifest.json 注入
      () => {
        if (globalThis.collectHighlights) {
          return globalThis.collectHighlights();
        }
        return [];
      },
      {
        errorMessage: 'Failed to collect highlights',
        returnResult: true,
      }
    );
  }

  /**
   * 注入並清除頁面標記
   * v2.5.0: 使用新版標註系統
   *
   * @param {number} tabId
   * @returns {Promise<void>}
   */
  clearPageHighlights(tabId) {
    // manifest.json 已注入所有依賴，無需重複注入
    return this.injectAndExecute(
      tabId,
      [], // 所有腳本已由 manifest.json 注入
      () => {
        if (globalThis.clearPageHighlights) {
          globalThis.clearPageHighlights();
        }
      },
      {
        errorMessage: 'Failed to clear highlights',
      }
    );
  }

  /**
   * 注入標記恢復腳本
   *
   * @param {number} tabId
   * @returns {Promise<void>}
   */
  injectHighlightRestore(tabId) {
    return this.injectAndExecute(tabId, ['scripts/highlight-restore.js'], null, {
      errorMessage: 'Failed to inject highlight restore script',
      successMessage: 'Highlight restore script injected successfully',
    });
  }

  /**
   * 注入腳本並執行函數，返回結果
   *
   * @param {number} tabId
   * @param {Function} func
   * @param {string[]} files
   * @param {any[]} [args] - 傳遞給函數的參數
   * @returns {Promise<any>}
   */
  async injectWithResponse(tabId, func, files = [], args = []) {
    try {
      // 如果有文件需要注入，先注入文件
      if (files && files.length > 0) {
        await this.injectAndExecute(tabId, files, null, { logErrors: true });
      }

      // 執行函數並返回結果
      if (func) {
        return await this.injectAndExecute(tabId, [], func, {
          returnResult: true,
          logErrors: true,
          args,
        });
      } else if (files && files.length > 0) {
        // 如果只注入文件而不執行函數，等待注入完成後返回成功標記
        return [{ result: { success: true } }];
      }

      return null;
    } catch (error) {
      this.logger.error?.('[Injection] injectWithResponse failed', {
        action: 'injectWithResponse',
        error,
      });
      // 返回 null，由調用方判斷並回覆錯誤，避免未捕獲拒絕
      return null;
    }
  }

  /**
   * 簡單的腳本注入（不返回結果）
   *
   * @param {number} tabId
   * @param {Function} func
   * @param {string[]} files
   * @returns {Promise<void>}
   */
  async inject(tabId, func, files = []) {
    try {
      return await this.injectAndExecute(tabId, files, func, {
        returnResult: false,
        logErrors: true,
      });
    } catch (error) {
      this.logger.error?.('[Injection] inject failed', {
        action: 'inject',
        error,
      });
      throw error;
    }
  }
}

// 導出
export {
  InjectionService,
  isRestrictedInjectionUrl,
  getRuntimeErrorMessage,
  isRecoverableInjectionError,
};
