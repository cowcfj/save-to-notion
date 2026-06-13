/**
 * 重試管理器
 * 專門處理網絡請求和異步操作的重試邏輯
 */
const RETRYABLE_NETWORK_ERROR_NAMES = new Set(['NetworkError', 'TimeoutError']);
const RETRYABLE_HTTP_STATUS_CODES = new Set([408, 429]);
const DOM_READY_ERROR_NAMES = new Set(['InvalidStateError']);
const DOM_TRANSIENT_ERROR_NAMES = new Set(['NotFoundError']);
const DOM_READY_MESSAGE_FRAGMENTS = ['not ready', 'loading'];
const DOM_TRANSIENT_MESSAGE_FRAGMENTS = ['not found'];

function hasLogErrorMethod(ref) {
  if (!ref) {
    return false;
  }
  return typeof ref.logError === 'function';
}

function isErrorHandlerInstance(ref) {
  if (typeof ref !== 'object') {
    return false;
  }
  return hasLogErrorMethod(ref);
}

function isErrorHandlerClass(ref) {
  if (typeof ref !== 'function') {
    return false;
  }
  if (!ref.prototype) {
    return false;
  }
  return hasLogErrorMethod(ref.prototype);
}

function messageIncludesAny(message, fragments) {
  return fragments.some(fragment => message.includes(fragment));
}

/**
 * 獲取錯誤處理器
 *
 * @returns {object|null} ErrorHandler 實例
 */
function getErrorHandler() {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  // 於瀏覽器環境優先使用全域 ErrorHandler，以便在 runtime 覆蓋
  const ref = globalThis.ErrorHandler; // 避免引用模組級符號造成遮蔽/循環
  if (!ref) {
    return null;
  }

  // 若已是實例（具備 logError 方法）
  if (isErrorHandlerInstance(ref)) {
    return ref;
  }

  // 若是類別（原型上有 logError），則嘗試實例化
  if (!isErrorHandlerClass(ref)) {
    return null;
  }

  try {
    return Reflect.construct(ref, []);
  } catch {
    return null;
  }
}
/**
 * 獲取日誌記錄器
 *
 * @returns {object|null} Logger 實例
 */
function getLogger() {
  // 統一取得 Logger，若無則返回 null（避免使用 console.* 以符合生產規範）
  if (typeof globalThis === 'undefined') {
    return null;
  }
  if (!globalThis.Logger) {
    return null;
  }
  return globalThis.Logger;
}
class RetryManager {
  /**
   * 創建重試管理器實例
   *
   * @param {object} options - 配置選項
   */
  constructor(options = {}) {
    this.options = {
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 5000,
      backoffFactor: 2,
      jitter: true,
      random: RetryManager._random, // 將 random 預設值移至此處，避免在 execute 中重複設定
      ...options,
    };
  }

  /**
   * 執行帶重試的異步操作
   *
   * @param {Function} operation - 要執行的異步操作
   * @param {object} options - 重試選項
   * @returns {Promise<*>} 操作結果
   */
  async execute(operation, options = {}) {
    // 確保 this.options 中的 random 能覆蓋默認值
    const config = { ...this.options, ...options };
    const retryState = {
      totalDelayMs: 0,
      startTime: Date.now(),
    };

    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
      RetryManager._throwIfAborted(config.signal);

      try {
        const result = await operation();
        this._recordSuccessContext(attempt, config, retryState.totalDelayMs);
        return result;
      } catch (error) {
        await this._handleFailedAttempt(error, attempt, config, retryState);
      }
    }
    // 迴圈內確保了最終會拋出錯誤，此處代碼不可達
  }

  /**
   * 為網絡請求創建重試包裝器
   *
   * @param {Function} fetchFunction - fetch 函數
   * @param {object} retryOptions - 重試選項
   * @returns {Function} 包裝後的 fetch 函數
   */
  wrapFetch(fetchFunction, retryOptions = {}) {
    return (url, options = {}) =>
      this.execute(
        async () => {
          const res = await fetchFunction(url, options);
          RetryManager._validateFetchResponse(res, retryOptions);
          return res;
        },
        {
          contextType: 'network',
          shouldRetry: error => this._shouldRetryFetchError(error, retryOptions),
          ...retryOptions,
        }
      );
  }

  /**
   * 為 DOM 操作創建重試包裝器
   *
   * @param {Function} domOperation - DOM 操作函數
   * @param {object} retryOptions - 重試選項
   * @returns {Function} 包裝後的函數
   */
  wrapDomOperation(domOperation, retryOptions = {}) {
    return (...args) =>
      this.execute(() => domOperation(...args), {
        contextType: 'dom',
        maxRetries: 2, // DOM 操作通常重試次數較少
        baseDelay: 50,
        shouldRetry: error => RetryManager._shouldRetryDomError(error),
        ...retryOptions,
      });
  }

  /**
   * 判斷是否應該重試
   *
   * @private
   * @param {Error} error - 錯誤對象
   * @param {object} config - 配置選項
   * @returns {boolean} 是否應該重試
   */
  _shouldRetry(error, config) {
    // 使用自定義的重試判斷函數
    if (typeof config.shouldRetry === 'function') {
      return config.shouldRetry.call(this, error);
    }

    // 默認重試邏輯
    return RetryManager._shouldRetryNetworkError(error);
  }

  _shouldRetryFetchError(error, retryOptions = {}) {
    if (typeof retryOptions.shouldRetry === 'function') {
      return retryOptions.shouldRetry.call(this, error);
    }
    return RetryManager._shouldRetryNetworkError(error);
  }

  /**
   * 判斷網絡錯誤是否應該重試
   *
   * @private
   * @param {Error} error - 錯誤對象
   * @returns {boolean} 是否應該重試
   */
  static _shouldRetryNetworkError(error) {
    if (!error) {
      return false;
    }

    const name = error.name;
    if (RETRYABLE_NETWORK_ERROR_NAMES.has(name)) {
      return true;
    }

    const msg = String(error.message || '');
    if (msg.includes('fetch')) {
      return true;
    }

    const status = error.status;
    if (typeof status === 'number') {
      return RetryManager._isRetryableHttpStatus(status);
    }

    return false;
  }

  /**
   * 判斷 DOM 錯誤是否應該重試
   *
   * @private
   * @param {Error} error - 錯誤對象
   * @returns {boolean} 是否應該重試
   */
  static _shouldRetryDomError(error) {
    const name = String(error?.name || '');
    const msg = String(error?.message || '');

    // DOM 還未準備好
    if (DOM_READY_ERROR_NAMES.has(name)) {
      return true;
    }
    if (messageIncludesAny(msg, DOM_READY_MESSAGE_FRAGMENTS)) {
      return true;
    }

    // 元素暫時不可訪問
    if (DOM_TRANSIENT_ERROR_NAMES.has(name)) {
      return true;
    }

    return messageIncludesAny(msg, DOM_TRANSIENT_MESSAGE_FRAGMENTS);
  }

  /**
   * 計算延遲時間
   *
   * @private
   * @param {number} attempt - 當前嘗試次數
   * @param {object} config - 配置選項
   * @returns {number} 延遲毫秒數
   */
  static _calculateDelay(attempt, config) {
    // 指數退避
    let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);

    // 限制最大延遲
    delay = Math.min(delay, config.maxDelay);

    // 添加隨機抖動以避免雷群效應（可注入隨機來源以利測試）
    if (config.jitter) {
      const rnd = RetryManager._resolveRandomValue(config);
      delay = delay * (0.5 + rnd * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * 延遲執行
   *
   * @private
   * @param {number} ms - 延遲毫秒數
   * @param {AbortSignal} signal - 中止信號
   * @returns {Promise} Promise 對象
   */
  static _delay(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          cleanup();
          resolve();
        },
        Math.max(0, ms)
      );

      /**
       * 中止重試的回調函數
       * 當 AbortSignal 觸發中止時調用，用於清理計時器並拒絕 Promise
       */
      const onAbort = () => {
        cleanup();
        const abortErr = new Error('已取消（AbortSignal）');
        abortErr.name = 'AbortError';
        reject(abortErr);
      };

      /**
       * 清理計時器和事件監聽器
       * 清除 setTimeout 計時器並移除 AbortSignal 的事件監聽器
       */
      function cleanup() {
        clearTimeout(timer);
        if (signal) {
          signal.removeEventListener?.('abort', onAbort);
        }
      }

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener?.('abort', onAbort, { once: true });
      }
    });
  }

  /**
   * 記錄重試嘗試
   *
   * @private
   * @param {object} details - 重試嘗試資訊
   * @param {Error} details.error - 錯誤對象
   * @param {number} details.attempt - 當前嘗試次數
   * @param {number} details.maxAttempts - 最大嘗試次數
   * @param {number} details.delay - 延遲時間
   * @param {string} details.contextType - 上下文類型
   */
  static _logRetryAttempt({ error, attempt, maxAttempts, delay, contextType = 'network' }) {
    const logger = getLogger();
    const msg = String(error?.message || '');
    const message = `[重試] 第 ${attempt}/${maxAttempts} 次，延遲 ${delay}ms：${msg}`;

    // 安全過濾：避免敏感資訊（如 API Key）洩漏到控制台
    const safeError = RetryManager._sanitizeErrorForLog(error);

    // 使用 Logger（若不可用則在非生產環境降級到 console）
    if (RetryManager._hasLogMethod(logger, 'warn')) {
      logger.warn(message, { error: safeError, attempt, maxAttempts, delay, contextType });
    } else {
      RetryManager._logToConsoleInDev(message);
    }

    RetryManager._reportToErrorHandler(
      contextType,
      `retry attempt ${attempt}/${maxAttempts} (delay ${delay}ms)`,
      error
    );
  }

  /**
   * 記錄重試成功
   *
   * @private
   * @param {number} totalRetries - 總重試次數
   * @param {string} contextType - 上下文類型
   */
  static _logRetrySuccess(totalRetries, contextType = 'network') {
    const logger = getLogger();
    const message = `[重試] 已成功，經歷 ${totalRetries} 次重試（${contextType}）`;
    if (RetryManager._hasLogMethod(logger, 'success')) {
      logger.success(message, { totalRetries, contextType });
      return;
    }
    if (RetryManager._hasLogMethod(logger, 'info')) {
      logger.info(message, { totalRetries, contextType });
    }
  }

  /**
   * 記錄重試失敗
   *
   * @private
   * @param {Error} error - 最終錯誤
   * @param {number} totalRetries - 總重試次數
   * @param {string} contextType - 上下文類型
   * @param {object} [options] - 其他選項 (例如 shouldLogFailure)
   */
  static _logRetryFailure(error, totalRetries, contextType = 'network', options = {}) {
    // 如果提供了 shouldLogFailure 且返回 false，則不記錄錯誤日誌
    if (!RetryManager._shouldLogRetryFailure(error, options)) {
      return;
    }

    const logger = getLogger();
    const msg = String(error?.message || '');
    const message = `[重試] 失敗（${contextType}），共重試 ${totalRetries} 次：${msg}`;

    // 安全過濾
    const safeError = RetryManager._sanitizeErrorForLog(error);

    if (RetryManager._hasLogMethod(logger, 'error')) {
      logger.error(message, { error: safeError, totalRetries, contextType });
    }

    RetryManager._reportToErrorHandler(
      contextType,
      `final failure after ${totalRetries} retries`,
      error
    );
  }

  /**
   * 清理錯誤物件以確保日誌安全
   * 僅保留白名單屬性，防止敏感資訊（如 headers 中的 API Key）洩漏
   *
   * @private
   * @param {Error} error - 原始錯誤物件
   * @returns {object} 安全的錯誤資訊物件
   */
  static _sanitizeErrorForLog(error) {
    if (!error) {
      return { message: String(error) };
    }
    if (typeof error !== 'object') {
      return { message: String(error) };
    }

    const safeError = {
      name: error.name || 'Error',
      message: error.message || '',
    };

    // 白名單屬性：僅保留這些已知安全的字段
    if (error.code !== undefined) {
      safeError.code = error.code;
    }
    if (error.status !== undefined) {
      safeError.status = error.status;
    }
    if (error.type !== undefined) {
      safeError.type = error.type;
    }

    return safeError;
  }

  /**
   * 將錯誤回報給 ErrorHandler
   *
   * @private
   * @param {string} contextType - 上下文類型
   * @param {string} context - 重試嘗試或失敗的上下文描述
   * @param {Error} error - 原始錯誤物件
   */
  static _reportToErrorHandler(contextType, context, error) {
    const handler = getErrorHandler();
    if (!hasLogErrorMethod(handler)) {
      return;
    }

    handler.logError({
      type: RetryManager._resolveErrorHandlerType(contextType),
      context,
      originalError: error,
      timestamp: Date.now(),
    });
  }

  /**
   * 在非生產環境（開發或測試）輸出警告訊息到控制台
   *
   * @private
   * @param {string} message - 警告訊息
   */
  static _logToConsoleInDev(message) {
    if (typeof process === 'undefined') {
      return;
    }
    if (!process.env) {
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    // eslint-disable-next-line no-console
    console.warn(message);
  }

  /**
   * 獲取當前配置快照（不含動態統計）
   *
   * @returns {object} 配置快照
   */
  getConfigSnapshot() {
    return {
      maxRetries: this.options.maxRetries,
      baseDelay: this.options.baseDelay,
      maxDelay: this.options.maxDelay,
      backoffFactor: this.options.backoffFactor,
      jitter: Boolean(this.options.jitter),
    };
  }

  /**
   * 獲取最近一次重試統計資訊
   *
   * @returns {object | null} 最近一次執行的統計資訊
   */
  getLastStats() {
    return this._lastStats || null;
  }

  // --- Helpers ---

  async _handleFailedAttempt(error, attempt, config, retryState) {
    if (attempt > config.maxRetries) {
      this._recordFailureContext(error, attempt, config, retryState.totalDelayMs);
      throw error;
    }
    if (!this._shouldRetry(error, config)) {
      this._recordFailureContext(error, attempt, config, retryState.totalDelayMs);
      throw error;
    }

    const delay = this._determineDelay(error, attempt, config);
    this._checkTimeout(retryState.startTime, delay, config, attempt);

    RetryManager._logRetryAttempt({
      error,
      attempt,
      maxAttempts: config.maxRetries + 1,
      delay,
      contextType: config.contextType,
    });

    await RetryManager._delay(delay, config.signal);
    retryState.totalDelayMs += delay;
  }

  _recordSuccessContext(attempt, config, totalDelayMs) {
    if (attempt > 1) {
      RetryManager._logRetrySuccess(attempt - 1, config.contextType);
    }
    this._lastStats = {
      lastTotalRetries: attempt - 1,
      lastTotalDelayMs: totalDelayMs,
      lastEndedAt: Date.now(),
      lastSucceeded: true,
      contextType: config.contextType || 'network',
    };
  }

  _recordFailureContext(error, attempt, config, totalDelayMs) {
    RetryManager._logRetryFailure(error, attempt - 1, config.contextType, config);
    this._lastStats = {
      lastTotalRetries: attempt - 1,
      lastTotalDelayMs: totalDelayMs,
      lastEndedAt: Date.now(),
      lastSucceeded: false,
      contextType: config.contextType || 'network',
      lastErrorName: error?.name,
      lastErrorMessage: String(error?.message || ''),
    };
  }

  _determineDelay(error, attempt, config) {
    const retryAfter = typeof error?.retryAfterMs === 'number' ? error.retryAfterMs : undefined;
    if (typeof retryAfter === 'number') {
      return retryAfter;
    }
    return RetryManager._calculateDelay(attempt, config);
  }

  _checkTimeout(startTime, delay, config, attempt) {
    if (typeof config.totalTimeoutMs === 'number') {
      const elapsed = Date.now() - startTime;
      if (elapsed + delay > config.totalTimeoutMs) {
        const timeoutErr = new Error('重試總時長已超時');
        timeoutErr.name = 'TimeoutError';
        RetryManager._logRetryFailure(timeoutErr, attempt - 1, config.contextType, config);
        throw timeoutErr;
      }
    }
  }

  static _createAbortError() {
    const abortErr = new Error('已取消（AbortSignal）');
    abortErr.name = 'AbortError';
    return abortErr;
  }

  static _throwIfAborted(signal) {
    if (!signal) {
      return;
    }
    if (!signal.aborted) {
      return;
    }
    throw RetryManager._createAbortError();
  }

  static _validateFetchResponse(res, retryOptions) {
    const status = RetryManager._getResponseStatus(res);
    if (status === null) {
      return;
    }

    if (!RetryManager._shouldRetryFetchResponse(res, retryOptions, status)) {
      return;
    }

    throw RetryManager._createRetryableHttpError(status, res);
  }

  static _parseRetryAfterHeader(res) {
    try {
      const ra = RetryManager._getRetryAfterHeader(res);
      if (!ra) {
        return 0;
      }

      return RetryManager._parseRetryAfterValue(ra);
    } catch {
      return 0;
    }
  }

  static _isRetryableHttpStatus(status) {
    if (RETRYABLE_HTTP_STATUS_CODES.has(status)) {
      return true;
    }
    if (status < 500) {
      return false;
    }
    return status < 600;
  }

  static _hasLogMethod(logger, methodName) {
    if (!logger) {
      return false;
    }
    return typeof logger[methodName] === 'function';
  }

  static _shouldLogRetryFailure(error, options = {}) {
    if (typeof options.shouldLogFailure !== 'function') {
      return true;
    }
    return options.shouldLogFailure(error);
  }

  static _resolveErrorHandlerType(contextType) {
    if (contextType === 'dom') {
      return 'dom_error';
    }
    return 'network_error';
  }

  static _resolveRandomValue(config) {
    if (typeof config.random === 'function') {
      return config.random();
    }
    return RetryManager._random();
  }

  static _getResponseStatus(res) {
    if (!res) {
      return null;
    }
    if (typeof res.status !== 'number') {
      return null;
    }
    return res.status;
  }

  static _shouldRetryFetchResponse(res, retryOptions = {}, status) {
    const isDefaultRetryable = RetryManager._isRetryableHttpStatus(status);
    if (typeof retryOptions.shouldRetryResponse !== 'function') {
      return isDefaultRetryable;
    }

    try {
      return Boolean(retryOptions.shouldRetryResponse(res));
    } catch {
      return isDefaultRetryable;
    }
  }

  static _createRetryableHttpError(status, res) {
    const err = new Error(`可重試的 HTTP 狀態：${status}`);
    err.name = 'HttpError';
    err.status = status;
    err.response = res;

    const retryAfterMs = RetryManager._parseRetryAfterHeader(res);
    if (retryAfterMs > 0) {
      err.retryAfterMs = retryAfterMs;
    }

    return err;
  }

  static _getRetryAfterHeader(res) {
    if (!res) {
      return null;
    }
    const { headers } = res;
    if (!headers) {
      return null;
    }
    if (typeof headers.get !== 'function') {
      return null;
    }
    return headers.get('Retry-After');
  }

  static _parseRetryAfterValue(retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) {
      return Math.max(0, Math.floor(seconds * 1000));
    }

    const dateMs = Date.parse(retryAfter);
    if (Number.isNaN(dateMs)) {
      return 0;
    }

    const delta = dateMs - Date.now();
    return Math.max(delta, 0);
  }

  static _random() {
    if (typeof crypto === 'undefined') {
      return Math.random(); // eslint-disable-line sonarjs/pseudo-random
    }
    if (!crypto.getRandomValues) {
      return Math.random(); // eslint-disable-line sonarjs/pseudo-random
    }
    return crypto.getRandomValues(new Uint32Array(1))[0] / 4_294_967_295;
  }
}

// 創建默認實例
const defaultRetryManager = new RetryManager();

/**
 * 便捷的重試函數
 *
 * @param {Function} operation - 要重試的操作
 * @param {object} options - 重試選項
 * @returns {Promise<*>} 操作結果
 */
function withRetry(operation, options = {}) {
  return defaultRetryManager.execute(operation, options);
}

/**
 * 為 fetch 添加重試機制
 *
 * @param {string} url - 請求 URL
 * @param {object} options - fetch 選項
 * @param {object} retryOptions - 重試選項
 * @returns {Promise<Response>} fetch 響應
 */
function fetchWithRetry(url, options = {}, retryOptions = {}) {
  const retryManager = new RetryManager();
  return retryManager.wrapFetch(fetch, retryOptions)(url, options);
}

// 導出類和函數
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RetryManager, withRetry, fetchWithRetry };
} else if (typeof globalThis !== 'undefined' && globalThis.window !== undefined) {
  globalThis.RetryManager = RetryManager;
  globalThis.withRetry = withRetry;
  globalThis.fetchWithRetry = fetchWithRetry;
}
