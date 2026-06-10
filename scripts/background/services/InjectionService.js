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

import Logger from '../../utils/Logger.js';
import { sanitizeUrlForLogging } from '../../utils/LogSanitizer.js';
import { RESTRICTED_PROTOCOLS } from '../../config/shared/core.js';
import { RUNTIME_ACTIONS } from '../../config/shared/runtimeActions.js';

/**
 * 腳本注入服務的超時與錯誤定義
 */
const INJECTION_CONFIG = {
  PING_TIMEOUT_MS: 2000,
  PING_TIMEOUT_ERROR: 'PING timeout',
  CONTENT_BUNDLE_PATH: 'dist/content.bundle.js',
};

const ERROR_DETAIL_MAX_LENGTH = 160;
const ERROR_URL_PATTERN = /(?:https?|chrome-extension|file|ftp):\/\/[^\s"',)]+/gi;
const ERROR_AUTH_HEADER_PATTERN = /(?:Bearer|Basic)\s+[\w+./~-]+=*/gi;
const ERROR_JWT_PATTERN = /\beyJ[\w.-]+\b/g;
const ERROR_API_KEY_PATTERN = /\b(?:sk|ghp|gho|xoxb|xoxp|key)-[\dA-Za-z]{20,}\b/g;
const ERROR_NOTION_TOKEN_PATTERN = /secret_[\dA-Za-z]+/g;
const ERROR_SENSITIVE_ASSIGNMENT_PATTERN =
  /\b([\w.-]*(?:token|secret|password|credential|authorization|session|api[_-]?key)[\w.-]*)=(?:[^\s&"',)]+)/gi;

async function activateFloatingRailInPage() {
  const timeout = 2000;
  const interval = 100;
  const startTime = Date.now();

  /* eslint-disable unicorn/consistent-function-scoping -- chrome.scripting.executeScript 序列化限制：func 無法捕獲外部閉包，必須內聯定義 */
  function activateRail(rail) {
    rail.show?.();
    rail.activateHighlighting?.();
    const count = globalThis.HighlighterV2?.manager?.getCount() || 0;
    return { initialized: true, highlightCount: count };
  }

  function delay(ms) {
    // NOSONAR — must be inlined for chrome.scripting serialization
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  /* eslint-enable unicorn/consistent-function-scoping */

  while (Date.now() - startTime <= timeout) {
    if (globalThis.HighlighterV2?.rail) {
      return activateRail(globalThis.HighlighterV2.rail);
    }

    if (globalThis.__NOTION_RAIL_READY__) {
      const readyResult = await Promise.race([
        globalThis.__NOTION_RAIL_READY__.catch(() => null),
        delay(Math.max(0, timeout - (Date.now() - startTime))).then(() => null),
      ]);
      if (readyResult?.success && readyResult.rail) {
        return activateRail(readyResult.rail);
      }
      return { initialized: false, highlightCount: 0 };
    }

    await delay(interval);
  }

  return { initialized: false, highlightCount: 0 };
}

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

    const isBlockedHost = blockedHosts.some(({ host, pathPrefix }) => {
      if (urlObj.host !== host) {
        return false;
      }
      if (!pathPrefix) {
        return true;
      }
      return urlObj.pathname.startsWith(pathPrefix);
    });

    if (isBlockedHost) {
      return true;
    }

    // 不對 Notion 自身頁面注入腳本 (包含子域名如 custom.notion.site)
    const notionDomains = ['notion.so', 'notion.com', 'notion.site'];
    return notionDomains.some(
      domain => urlObj.host === domain || urlObj.host.endsWith(`.${domain}`)
    );
  } catch (error) {
    const sanitizedErrorMsg = String(error.message).replaceAll(url, '[invalid-url]');
    Logger.warn('[Injection:Utils] Failed to parse URL when checking restrictions', {
      action: 'isRestrictedInjectionUrl',
      result: 'failure',
      url: sanitizeUrlForLogging(url),
      error: sanitizedErrorMsg,
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
      result: 'failure',
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

const LOGGER_METHODS = ['debug', 'warn', 'error', 'success', 'start'];

/**
 * 將傳入的 logger 標準化，確保其包含所有必要的日誌方法，缺少的則靜默處理 (no-op)
 *
 * @param {object} logger - 原始 logger 對象
 * @returns {object} 標準化後的 logger 對象
 */
function normalizeLogger(logger) {
  const base = logger || Logger;
  const normalized = {};
  for (const method of LOGGER_METHODS) {
    normalized[method] = typeof base[method] === 'function' ? base[method].bind(base) : () => {};
  }
  return normalized;
}

/**
 * 格式化錯誤，獲取適合日誌使用的安全短訊息
 *
 * @param {any} error - 錯誤對象
 * @returns {string} 錯誤詳細訊息
 */
function getErrorDetail(error) {
  const rawMessage = getRawErrorMessage(error);
  const sanitizedMessage = sanitizeErrorMessage(rawMessage);
  const identifier = getErrorIdentifier(error);
  return `${identifier}: ${sanitizedMessage || 'Unknown error'}`;
}

function getRawErrorMessage(error) {
  if (!error) {
    return '';
  }

  if (typeof error?.message === 'string') {
    return error.message;
  }

  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}

function getErrorIdentifier(error) {
  const identifier = error?.code || error?.name;
  if (typeof identifier === 'string' && identifier.trim()) {
    return identifier.trim();
  }
  return 'Error';
}

function sanitizeErrorMessage(message) {
  const firstLine = String(message || '')
    .split(/\r?\n/u)[0]
    .trim();
  const sanitized = firstLine
    .replaceAll(ERROR_URL_PATTERN, '[URL]')
    .replaceAll(ERROR_AUTH_HEADER_PATTERN, '[REDACTED_AUTH_HEADER]')
    .replaceAll(ERROR_JWT_PATTERN, '[REDACTED_TOKEN]')
    .replaceAll(ERROR_API_KEY_PATTERN, '[REDACTED_API_KEY]')
    .replaceAll(ERROR_NOTION_TOKEN_PATTERN, '[REDACTED_TOKEN]')
    .replaceAll(ERROR_SENSITIVE_ASSIGNMENT_PATTERN, '$1=[REDACTED]');

  if (sanitized.length <= ERROR_DETAIL_MAX_LENGTH) {
    return sanitized;
  }
  return `${sanitized.slice(0, ERROR_DETAIL_MAX_LENGTH - 3)}...`;
}

function readBundlePingResult(result) {
  if (chrome.runtime.lastError) {
    return { lastError: getRuntimeErrorMessage(chrome.runtime.lastError) };
  }
  return result;
}

function createBundlePingTimeout() {
  return new Promise((resolve, reject) =>
    setTimeout(
      () => reject(new Error(INJECTION_CONFIG.PING_TIMEOUT_ERROR)),
      INJECTION_CONFIG.PING_TIMEOUT_MS
    )
  );
}

function isBundlePingTimeoutError(error) {
  return error.message.includes(INJECTION_CONFIG.PING_TIMEOUT_ERROR);
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
    this.logger = normalizeLogger(options.logger);
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

    // 統一打包目標為唯一目標。
    // 不使用 fetch HEAD 探測（額外網路請求）— 路徑由 build 時確定，直接信任。
    const bundlePath = INJECTION_CONFIG.CONTENT_BUNDLE_PATH;
    this._highlighterPath = bundlePath;
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
        const errorDetail = getErrorDetail(error);
        this.logger.error(`[Injection] ${options.errorMessage}: ${errorDetail}`, {
          action: 'injectAndExecute',
          result: 'failure',
          files,
          error: errorDetail,
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
        this._handleScriptResult({ resolve, reject }, options, false)
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
        this._handleScriptResult({ resolve, reject }, options, true, results)
      );
    });
  }

  _handleScriptResult(promiseHandlers, options, isFunction, results = null) {
    const { resolve, reject } = promiseHandlers;
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

    if (options.logErrors || isRecoverable) {
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
    const shouldLogSuccess = isFunction && options.successMessage && options.logErrors;
    if (shouldLogSuccess) {
      this.logger.success(`[Injection] ${options.successMessage}`, {
        action: 'injectAndExecute',
        result: 'success',
      });
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
    // 非可恢復錯誤不在此記錄 — 由 injectAndExecute catch block 統一發出 canonical ERROR
    if (isSuccess || !isRecoverable) {
      return;
    }

    const msgPrefix = isFunction ? 'Function execution' : 'File injection';
    this.logger.debug(`[Injection] ${msgPrefix} skipped (recoverable)`, {
      action: 'injectAndExecute',
      operation: isFunction ? 'executeFunction' : 'injectFiles',
      result: 'skipped',
      reason: 'recoverable_error',
      error: getErrorDetail(new Error(errMsg)),
    });
  }

  /**
   * 探測目標標籤頁的 Content Bundle 狀態
   *
   * @param {number} tabId - 目標標籤頁 ID
   * @returns {Promise<'ready' | 'unreachable' | 'missing'>} 狀態值
   * @private
   */
  async _probeBundleStatus(tabId) {
    try {
      const response = await this._sendBundlePing(tabId);
      return this._resolveBundlePingStatus(response, tabId);
    } catch (error) {
      return this._handleBundlePingError(error, tabId);
    }
  }

  _sendBundlePing(tabId) {
    return Promise.race([this._sendBundlePingMessage(tabId), createBundlePingTimeout()]);
  }

  _sendBundlePingMessage(tabId) {
    return new Promise(resolve => {
      // 使用 sentinel resolve 而非 reject：
      // 若 timeout 先贏得 race，這個 Promise 可能在之後才 settle。
      // 用 reject 會在「已無人監聽」時產生 Unhandled Rejection；
      // sentinel 讓外層保留 lastError 分類，同時避免 race 後續 reject。
      chrome.tabs.sendMessage(tabId, { action: RUNTIME_ACTIONS.PING }, result => {
        resolve(readBundlePingResult(result));
      });
    });
  }

  _resolveBundlePingStatus(response, tabId) {
    if (response?.lastError) {
      throw new Error(response.lastError);
    }

    if (response?.status !== 'bundle_ready') {
      return 'missing';
    }

    this.logger.success(`[Injection] Bundle already exists in tab ${tabId}`, {
      action: 'ensureBundleInjected',
      result: 'success',
      tabId,
    });
    return 'ready';
  }

  _handleBundlePingError(error, tabId) {
    if (!isRecoverableInjectionError(error.message)) {
      throw error;
    }

    if (isBundlePingTimeoutError(error)) {
      return this._handleBundlePingTimeout(tabId);
    }

    return this._handleBundlePingUnreachable(error, tabId);
  }

  _handleBundlePingTimeout(tabId) {
    // PING 超時：頁面反應慢不代表不能注入，所以記錄警告後繼續。
    this.logger.warn(`[Injection] PING timed out, proceeding with injection anyway`, {
      action: 'ensureBundleInjected',
      result: 'failure',
      reason: 'ping_timeout',
      tabId,
    });
    return 'missing';
  }

  _handleBundlePingUnreachable(error, tabId) {
    this.logger.warn(`[Injection] PING failed with recoverable error, returning false`, {
      action: 'ensureBundleInjected',
      result: 'failure',
      reason: 'ping_unreachable',
      tabId,
      error: getErrorDetail(error),
    });
    return 'unreachable';
  }

  /**
   * 注入 Content Bundle 到目標標籤頁
   *
   * @param {number} tabId - 目標標籤頁 ID
   * @returns {Promise<boolean>} 是否成功注入
   * @private
   */
  async _injectContentBundle(tabId) {
    try {
      this.logger.start(`[Injection] Injecting Content Bundle into tab ${tabId}`, {
        action: 'ensureBundleInjected',
        result: 'started',
        tabId,
      });

      await new Promise((resolve, reject) => {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            files: [INJECTION_CONFIG.CONTENT_BUNDLE_PATH],
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

      this.logger.success(`[Injection] Content Bundle injected into tab ${tabId}`, {
        action: 'ensureBundleInjected',
        result: 'success',
        tabId,
      });
      return true;
    } catch (error) {
      // 處理錯誤（如無法連接、權限受限）
      const errorMessage = getErrorDetail(error);
      if (isRecoverableInjectionError(errorMessage)) {
        this.logger.warn(`[Injection] Bundle injection skipped (recoverable)`, {
          action: 'ensureBundleInjected',
          result: 'skipped',
          error: errorMessage,
        });
        return false;
      }
      this.logger.error(`[Injection] Bundle injection failed`, {
        action: 'ensureBundleInjected',
        result: 'failure',
        error: errorMessage,
      });
      throw error;
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
    const status = await this._probeBundleStatus(tabId);

    if (status === 'ready') {
      return true;
    }

    if (status === 'unreachable') {
      return false;
    }

    return this._injectContentBundle(tabId);
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
    return this.injectAndExecute(tabId, [bundlePath], activateFloatingRailInPage, {
      errorMessage: 'Failed to inject highlighter',
      successMessage: 'Highlighter v2 injected successfully',
      returnResult: true,
    });
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
      const hasFilesToInject = files?.length > 0;
      // 如果有文件需要注入，先注入文件（由外層 catch 統一記錄，避免重複日誌）
      if (hasFilesToInject) {
        await this.injectAndExecute(tabId, files, null, { logErrors: false });
      }

      // 執行函數並返回結果（由外層 catch 統一記錄，避免重複日誌）
      if (func) {
        return await this.injectAndExecute(tabId, [], func, {
          returnResult: true,
          logErrors: false,
          args,
        });
      } else if (hasFilesToInject) {
        // 如果只注入文件而不執行函數，等待注入完成後返回成功標記
        return [{ result: { success: true } }];
      }

      return null;
    } catch (error) {
      const errorDetail = getErrorDetail(error);
      this.logger.error(`[Injection] injectWithResponse failed: ${errorDetail}`, {
        action: 'injectWithResponse',
        result: 'failure',
        error: errorDetail,
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
      this.logger.error('[Injection] inject failed', {
        action: 'inject',
        result: 'failure',
        error: getErrorDetail(error),
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
