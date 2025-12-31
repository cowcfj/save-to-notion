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

// PING 請求超時時間（毫秒）
const PING_TIMEOUT_MS = 2000;

/**
 * 檢查 URL 是否限制注入腳本
 * @param {string} url - 要檢查的 URL
 * @returns {boolean} 是否受限
 */
function isRestrictedInjectionUrl(url) {
  // 基本空值檢查
  if (!url) {
    return true;
  }

  try {
    // 檢查協議
    const restrictedProtocols = [
      'chrome:',
      'edge:',
      'about:',
      'data:',
      'chrome-extension:',
      'view-source:',
    ];

    if (restrictedProtocols.some(protocol => url.startsWith(protocol))) {
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
    console.warn('Failed to parse URL when checking restrictions:', error);
    return true;
  }
}

/**
 * 解析 chrome.runtime.lastError 的文字內容
 * @param {Object|string} runtimeError - 運行時錯誤對象
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
    console.warn('Unable to stringify runtime error:', error);
    return String(runtimeError);
  }
}

/**
 * 判斷注入錯誤是否可恢復（例如受限頁面、無權限等）
 * 可恢復錯誤將被靜默處理，不視為真正的失敗
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
    'Could not establish connection',
  ];

  return patterns.some(pattern => message.includes(pattern));
}

/**
 * InjectionService 類
 */
class InjectionService {
  /**
   * @param {Object} options - 配置選項
   * @param {Object} options.logger - 日誌對象
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
  }

  /**
   * Resolve the correct path for highlighter bundle
   * Handles both 'dist' loading (tests) and 'root' loading (development)
   * @private
   */
  async _resolveHighlighterPath() {
    if (this._highlighterPath) {
      return this._highlighterPath;
    }

    // Unified bundle is the only target now
    const candidates = ['dist/content.bundle.js'];

    for (const path of candidates) {
      try {
        const response = await fetch(chrome.runtime.getURL(path), { method: 'HEAD' });
        if (response.ok) {
          this._highlighterPath = path;
          return path;
        }
      } catch (_err) {
        // Continue to next candidate
      }
    }

    // Fallback (should typically be caught by candidates, but return unified bundle as default)
    return 'dist/content.bundle.js';
  }

  /**
   * 注入文件並執行函數
   * @param {number} tabId - 目標標籤頁 ID
   * @param {string[]} files - 要注入的文件列表
   * @param {Function} func - 要執行的函數
   * @param {Object} options - 注入選項
   * @returns {Promise<any>}
   */
  async injectAndExecute(tabId, files = [], func = null, options = {}) {
    const {
      errorMessage = 'Script injection failed',
      successMessage = 'Script executed successfully',
      logErrors = true,
      returnResult = false,
    } = options;

    try {
      // 首先注入文件
      if (files.length > 0) {
        await new Promise((resolve, reject) => {
          chrome.scripting.executeScript(
            {
              target: { tabId },
              files,
            },
            () => {
              if (chrome.runtime.lastError) {
                const errMsg = getRuntimeErrorMessage(chrome.runtime.lastError);
                const isRecoverable = isRecoverableInjectionError(errMsg);
                if (logErrors) {
                  if (isRecoverable) {
                    this.logger.warn?.('⚠️ File injection skipped (recoverable):', errMsg);
                  } else {
                    this.logger.error?.('File injection failed:', errMsg);
                  }
                }
                if (isRecoverable) {
                  resolve();
                  return;
                }
                reject(new Error(errMsg || errorMessage));
              } else {
                resolve();
              }
            }
          );
        });
      }

      // 然後執行函數
      if (func) {
        return new Promise((resolve, reject) => {
          chrome.scripting.executeScript(
            {
              target: { tabId },
              func,
            },
            results => {
              if (chrome.runtime.lastError) {
                const errMsg = getRuntimeErrorMessage(chrome.runtime.lastError);
                const isRecoverable = isRecoverableInjectionError(errMsg);
                if (logErrors) {
                  if (isRecoverable) {
                    this.logger.warn?.('⚠️ Function execution skipped (recoverable):', errMsg);
                  } else {
                    this.logger.error?.('Function execution failed:', errMsg);
                  }
                }
                if (isRecoverable) {
                  resolve(returnResult ? null : undefined);
                  return;
                }
                reject(new Error(errMsg || errorMessage));
              } else {
                if (successMessage && logErrors) {
                  this.logger.log(successMessage);
                }
                const result = returnResult && results && results[0] ? results[0].result : null;
                resolve(result);
              }
            }
          );
        });
      }

      return Promise.resolve();
    } catch (error) {
      if (logErrors) {
        this.logger.error?.(errorMessage, error);
      }
      throw error;
    }
  }

  /**
   * 確保 Content Bundle 已注入到指定標籤頁
   * 使用 PING 機制檢測 Bundle 是否存在，若無則注入
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
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('PING timeout')), PING_TIMEOUT_MS)
        ),
      ]);

      if (response?.status === 'bundle_ready') {
        this.logger.debug?.(`✅ Bundle already exists in tab ${tabId}`);
        return true; // Bundle 已存在
      }

      // Bundle 不存在（僅 Preloader 或無回應），注入主程式
      this.logger.debug?.(`📦 Injecting Content Bundle into tab ${tabId}...`);

      await new Promise((resolve, reject) => {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            files: ['lib/Readability.js', 'dist/content.bundle.js'],
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

      this.logger.log?.(`✅ Content Bundle injected into tab ${tabId}`);
      return true;
    } catch (error) {
      // 處理錯誤（如無法連接、權限受限）
      const errorMessage = error?.message || String(error);
      if (isRecoverableInjectionError(errorMessage)) {
        this.logger.warn?.(`⚠️ Bundle injection skipped (recoverable): ${errorMessage}`);
        return false;
      }
      this.logger.error?.(`❌ Bundle injection failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 注入標記工具並初始化
   * v2.5.0: 使用新版 CSS Highlight API + 無痛自動遷移
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
            if (window.notionHighlighter) {
              window.notionHighlighter.show();
              const count = window.HighlighterV2?.manager?.getCount() || 0;
              // skipcq: JS-0002 - Running in page context
              console.log(`✅ 標註工具已準備，共 ${count} 個標註`);
              resolve({ initialized: true, highlightCount: count });
              return;
            }

            if (Date.now() - startTime > timeout) {
              // skipcq: JS-0002 - Running in page context
              console.warn('⚠️ notionHighlighter 初始化超時');
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
   * @param {number} tabId
   * @returns {Promise<Array>}
   */
  collectHighlights(tabId) {
    // manifest.json 已注入所有依賴，無需重複注入
    return this.injectAndExecute(
      tabId,
      [], // 所有腳本已由 manifest.json 注入
      () => {
        if (window.collectHighlights) {
          return window.collectHighlights();
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
   * @param {number} tabId
   * @returns {Promise<void>}
   */
  clearPageHighlights(tabId) {
    // manifest.json 已注入所有依賴，無需重複注入
    return this.injectAndExecute(
      tabId,
      [], // 所有腳本已由 manifest.json 注入
      () => {
        if (window.clearPageHighlights) {
          window.clearPageHighlights();
        }
      },
      {
        errorMessage: 'Failed to clear highlights',
      }
    );
  }

  /**
   * 注入標記恢復腳本
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
   * @param {number} tabId
   * @param {Function} func
   * @param {string[]} files
   * @returns {Promise<any>}
   */
  async injectWithResponse(tabId, func, files = []) {
    try {
      // 如果有文件需要注入，先注入文件
      if (files && files.length > 0) {
        await this.injectAndExecute(tabId, files, null, { logErrors: true });
      }

      // 執行函數並返回結果
      if (func) {
        return this.injectAndExecute(tabId, [], func, {
          returnResult: true,
          logErrors: true,
        });
      } else if (files && files.length > 0) {
        // 如果只注入文件而不執行函數，等待注入完成後返回成功標記
        return Promise.resolve([{ result: { success: true } }]);
      }

      return Promise.resolve(null);
    } catch (error) {
      this.logger.error?.('injectWithResponse failed:', error);
      // 返回 null，由調用方判斷並回覆錯誤，避免未捕獲拒絕
      return null;
    }
  }

  /**
   * 簡單的腳本注入（不返回結果）
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
      this.logger.error?.('inject failed:', error);
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

// 向後兼容：掛載到 window（用於非模組環境）
if (typeof window !== 'undefined') {
  window.InjectionService = InjectionService;
  window.isRestrictedInjectionUrl = isRestrictedInjectionUrl;
  window.getRuntimeErrorMessage = getRuntimeErrorMessage;
  window.isRecoverableInjectionError = isRecoverableInjectionError;
}
