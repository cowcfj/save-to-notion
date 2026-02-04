/**
 * 重試管理器
 * 專門處理網絡請求和異步操作的重試邏輯
 */
/**
 * 獲取錯誤處理器
 *
 * @returns {object|null} ErrorHandler 實例
 */
function getErrorHandler() {
  // 於瀏覽器環境優先使用全域 ErrorHandler，以便在 runtime 覆蓋
  const globalRef = typeof globalThis === 'undefined' ? null : globalThis.ErrorHandler;
  const ref = globalRef || null; // 避免引用模組級符號造成遮蔽/循環
  if (!ref) {
    return null;
  }

  // 若已是實例（具備 logError 方法）
  if (typeof ref === 'object' && typeof ref.logError === 'function') {
    return ref;
  }

  // 若是類別（原型上有 logError），則嘗試實例化
  if (typeof ref === 'function' && ref.prototype && typeof ref.prototype.logError === 'function') {
    try {
      return new ref();
    } catch {
      return null;
    }
  }

  return null;
}
/**
 * 獲取日誌記錄器
 *
 * @returns {object|null} Logger 實例
 */
function getLogger() {
  // 統一取得 Logger，若無則返回 null（避免使用 console.* 以符合生產規範）
  if (typeof globalThis !== 'undefined' && globalThis.Logger) {
    return globalThis.Logger;
  }
  return null;
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
    const config = { random: RetryManager._random, ...this.options, ...options };
    let totalDelayMs = 0;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
      if (config.signal?.aborted) {
        throw RetryManager._createAbortError();
      }

      try {
        const result = await operation();
        this._recordSuccessContext(attempt, config, totalDelayMs);
        return result;
      } catch (error) {
        if (attempt > config.maxRetries || !this._shouldRetry(error, config)) {
          this._recordFailureContext(error, attempt, config, totalDelayMs);
          throw error;
        }

        const delay = this._determineDelay(error, attempt, config);
        this._checkTimeout(startTime, delay, config, attempt);

        RetryManager._logRetryAttempt(
          error,
          attempt,
          config.maxRetries + 1,
          delay,
          config.contextType
        );

        await RetryManager._delay(delay, config.signal);
        totalDelayMs += delay;
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
          shouldRetry: error =>
            typeof retryOptions.shouldRetry === 'function'
              ? retryOptions.shouldRetry.call(this, error)
              : RetryManager._shouldRetryNetworkError(error),
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

  /**
   * 判斷網絡錯誤是否應該重試
   *
   * @private
   * @param {Error} error - 錯誤對象
   * @returns {boolean} 是否應該重試
   */
  static _shouldRetryNetworkError(error) {
    const name = String(error?.name || '');
    const msg = String(error?.message || '');

    // 網絡相關錯誤
    if (name === 'NetworkError' || name === 'TimeoutError' || msg.includes('fetch')) {
      return true;
    }

    // HTTP 狀態碼判斷
    if (typeof error?.status === 'number') {
      // 5xx 服務器錯誤可以重試
      if (error.status >= 500 && error.status < 600) {
        return true;
      }
      // 429 Too Many Requests 可以重試
      if (error.status === 429) {
        return true;
      }
      // 408 Request Timeout 可以重試
      if (error.status === 408) {
        return true;
      }
      // 4xx 客戶端錯誤通常不重試
      if (error.status >= 400 && error.status < 500) {
        return false;
      }
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
    if (name === 'InvalidStateError' || msg.includes('not ready') || msg.includes('loading')) {
      return true;
    }

    // 元素暫時不可訪問
    return name === 'NotFoundError' || msg.includes('not found');
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
      const rnd = typeof config.random === 'function' ? config.random() : RetryManager._random();
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
   * @param {Error} error - 錯誤對象
   * @param {number} attempt - 當前嘗試次數
   * @param {number} maxAttempts - 最大嘗試次數
   * @param {number} delay - 延遲時間
   * @param {string} contextType - 上下文類型
   */
  static _logRetryAttempt(error, attempt, maxAttempts, delay, contextType = 'network') {
    const logger = getLogger();
    const msg = String(error?.message || '');
    const message = `[重試] 第 ${attempt}/${maxAttempts} 次，延遲 ${delay}ms：${msg}`;

    // 使用 Logger（若不可用則在非生產環境降級到 console）
    if (logger && typeof logger.warn === 'function') {
      logger.warn(message, { error, attempt, maxAttempts, delay, contextType });
    } else if (
      typeof process !== 'undefined' &&
      process.env &&
      process.env.NODE_ENV !== 'production'
    ) {
      // 開發/測試環境降級：避免完全靜默
      console.warn(message);
    }

    const handler = getErrorHandler();
    if (handler && typeof handler.logError === 'function') {
      handler.logError({
        type: contextType === 'dom' ? 'dom_error' : 'network_error',
        context: `retry attempt ${attempt}/${maxAttempts} (delay ${delay}ms)`,
        originalError: error,
        timestamp: Date.now(),
      });
    }
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
    if (logger && typeof logger.success === 'function') {
      logger.success(message, { totalRetries, contextType });
    } else if (logger && typeof logger.info === 'function') {
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
   */
  static _logRetryFailure(error, totalRetries, contextType = 'network') {
    const logger = getLogger();
    const msg = String(error?.message || '');
    const message = `[重試] 失敗（${contextType}），共重試 ${totalRetries} 次：${msg}`;

    if (logger && typeof logger.error === 'function') {
      logger.error(message, { error, totalRetries, contextType });
    }

    const handler = getErrorHandler();
    if (handler && typeof handler.logError === 'function') {
      handler.logError({
        type: contextType === 'dom' ? 'dom_error' : 'network_error',
        context: `final failure after ${totalRetries} retries`,
        originalError: error,
        timestamp: Date.now(),
      });
    }
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
    RetryManager._logRetryFailure(error, attempt - 1, config.contextType);
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
    return typeof retryAfter === 'number'
      ? retryAfter
      : RetryManager._calculateDelay(attempt, config);
  }

  _checkTimeout(startTime, delay, config, attempt) {
    if (typeof config.totalTimeoutMs === 'number') {
      const elapsed = Date.now() - startTime;
      if (elapsed + delay > config.totalTimeoutMs) {
        const timeoutErr = new Error('重試總時長已超時');
        timeoutErr.name = 'TimeoutError';
        RetryManager._logRetryFailure(timeoutErr, attempt - 1, config.contextType);
        throw timeoutErr;
      }
    }
  }

  static _createAbortError() {
    const abortErr = new Error('已取消（AbortSignal）');
    abortErr.name = 'AbortError';
    return abortErr;
  }

  static _validateFetchResponse(res, retryOptions) {
    if (!res || typeof res.status !== 'number') {
      return;
    }

    const status = res.status;
    const isDefaultRetryable = (status >= 500 && status < 600) || status === 429 || status === 408;

    let shouldRetryResp = isDefaultRetryable;
    if (typeof retryOptions.shouldRetryResponse === 'function') {
      try {
        shouldRetryResp = Boolean(retryOptions.shouldRetryResponse(res));
      } catch {
        shouldRetryResp = isDefaultRetryable;
      }
    }

    if (shouldRetryResp) {
      const err = new Error(`可重試的 HTTP 狀態：${status}`);
      err.name = 'HttpError';
      err.status = status;
      err.response = res;

      const ra = RetryManager._parseRetryAfterHeader(res);
      if (ra > 0) {
        err.retryAfterMs = ra;
      }

      throw err;
    }
  }

  static _parseRetryAfterHeader(res) {
    try {
      if (!res?.headers || typeof res.headers.get !== 'function') {
        return 0;
      }
      const ra = res.headers.get('Retry-After');
      if (!ra) {
        return 0;
      }

      const sec = Number(ra);
      if (Number.isNaN(sec)) {
        const dateMs = Date.parse(ra);
        if (!Number.isNaN(dateMs)) {
          const delta = dateMs - Date.now();
          return Math.max(delta, 0);
        }
      } else {
        return Math.max(0, Math.floor(sec * 1000));
      }
    } catch {
      return 0;
    }
    return 0;
  }

  static _random() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return crypto.getRandomValues(new Uint32Array(1))[0] / 4_294_967_295;
    }
    return Math.random(); // eslint-disable-line sonarjs/pseudo-random
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
} else if (globalThis.window !== undefined) {
  globalThis.RetryManager = RetryManager;
  globalThis.withRetry = withRetry;
  globalThis.fetchWithRetry = fetchWithRetry;
}
