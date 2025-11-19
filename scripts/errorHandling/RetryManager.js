/**
 * 重試管理器
 * 專門處理網絡請求和異步操作的重試邏輯
 */
function getErrorHandler() {
    // 於瀏覽器環境優先使用全域 ErrorHandler，以便在 runtime 覆蓋
    const globalRef = (typeof globalThis !== 'undefined' ? globalThis.ErrorHandler : null);
    const ref = globalRef || null; // 避免引用模組級符號造成遮蔽/循環
    if (!ref) return null;

    // 若已是實例（具備 logError 方法）
    if (typeof ref === 'object' && typeof ref.logError === 'function') {
        return ref;
    }

    // 若是類別（原型上有 logError），則嘗試實例化
    if (typeof ref === 'function' && ref.prototype && typeof ref.prototype.logError === 'function') {
        try {
            return new ref();
        } catch (_) {
            return null;
        }
    }

    return null;
}
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
     * @param {Object} options - 配置選項
     */
    constructor(options = {}) {
        this.options = {
            maxRetries: 3,
            baseDelay: 100,
            maxDelay: 5000,
            backoffFactor: 2,
            jitter: true,
            ...options
        };
    }

    /**
     * 執行帶重試的異步操作
     * @param {Function} operation - 要執行的異步操作
     * @param {Object} options - 重試選項
     * @returns {Promise<*>} 操作結果
     */
    async execute(operation, options = {}) {
        const config = { ...this.options, random: Math.random, ...options };
        let lastError = null;
        let totalDelayMs = 0;
        const startTime = Date.now();

        for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
            // 支援外部中止
            if (config.signal?.aborted) {
                const abortErr = new Error('已取消（AbortSignal）');
                abortErr.name = 'AbortError';
                throw abortErr;
            }

            try {
                const result = await operation();

                // 成功時記錄重試統計
                if (attempt > 1) {
                    this._logRetrySuccess(attempt - 1, config.contextType);
                }

                // 更新最後統計
                this._lastStats = {
                    lastTotalRetries: attempt - 1,
                    lastTotalDelayMs: totalDelayMs,
                    lastEndedAt: Date.now(),
                    lastSucceeded: true,
                    contextType: config.contextType || 'network'
                };

                return result;
            } catch (error) {
                lastError = error;

                // 檢查是否應該重試
                if (attempt > config.maxRetries || !this._shouldRetry(error, config)) {
                    this._logRetryFailure(error, attempt - 1, config.contextType);

                    // 更新最後統計
                    this._lastStats = {
                        lastTotalRetries: attempt - 1,
                        lastTotalDelayMs: totalDelayMs,
                        lastEndedAt: Date.now(),
                        lastSucceeded: false,
                        contextType: config.contextType || 'network',
                        lastErrorName: error?.name,
                        lastErrorMessage: String(error?.message || '')
                    };

                    throw error;
                }

                // 計算延遲時間（支援 Retry-After 覆蓋）
                const retryAfter = typeof error?.retryAfterMs === 'number' ? error.retryAfterMs : undefined;
                const delay = typeof retryAfter === 'number' ? retryAfter : RetryManager._calculateDelay(attempt, config);

                // 記錄重試嘗試
                RetryManager._logRetryAttempt(error, attempt, config.maxRetries + 1, delay, config.contextType);

                // 總超時控制（若設定 totalTimeoutMs，則避免超出）
                if (typeof config.totalTimeoutMs === 'number') {
                    const elapsed = Date.now() - startTime;
                    if (elapsed + delay > config.totalTimeoutMs) {
                        const timeoutErr = new Error('重試總時長已超時');
                        timeoutErr.name = 'TimeoutError';
                        this._logRetryFailure(timeoutErr, attempt - 1, config.contextType);
                        throw timeoutErr;
                    }
                }

                // 等待後重試（支援 AbortSignal）
                await RetryManager._delay(delay, config.signal);
                totalDelayMs += delay;
            }
        }

        throw lastError || new Error('未知的重試錯誤');
    }

    /**
     * 為網絡請求創建重試包裝器
     * @param {Function} fetchFunction - fetch 函數
     * @param {Object} retryOptions - 重試選項
     * @returns {Function} 包裝後的 fetch 函數
     */
    wrapFetch(fetchFunction, retryOptions = {}) {
        return (url, options = {}) => this.execute(
            async () => {
                const res = await fetchFunction(url, options);

                // 若回應為可重試狀態，依策略拋錯以觸發重試
                if (res && typeof res.status === 'number') {
                    const status = res.status;
                    const isDefaultRetryable = (status >= 500 && status < 600) || status === 429 || status === 408;

                    let shouldRetryResp = isDefaultRetryable;
                    if (typeof retryOptions.shouldRetryResponse === 'function') {
                        try {
                            shouldRetryResp = Boolean(retryOptions.shouldRetryResponse(res));
                        } catch (_) {
                            // 若使用者回呼拋錯，退回預設策略
                            shouldRetryResp = isDefaultRetryable;
                        }
                    }

                    if (shouldRetryResp) {
                        const err = new Error(`可重試的 HTTP 狀態：${status}`);
                        err.name = 'HttpError';
                        err.status = status;
                        err.response = res;

                        // 讀取 Retry-After（秒或HTTP日期），轉換為毫秒（防禦性處理 headers 為 null/非標準實作）
                        let ra = null;
                        try {
                            if (res?.headers && typeof res.headers.get === 'function') {
                                ra = res.headers.get('Retry-After');
                            }
                        } catch (_) {
                            ra = null; // 不讓 headers 實作異常中斷重試流程
                        }
                        if (ra) {
                            const sec = Number(ra);
                            if (!Number.isNaN(sec)) {
                                err.retryAfterMs = Math.max(0, Math.floor(sec * 1000));
                            } else {
                                const dateMs = Date.parse(ra);
                                if (!Number.isNaN(dateMs)) {
                                    const delta = dateMs - Date.now();
                                    if (delta > 0) err.retryAfterMs = delta;
                                }
                            }
                        }

                        throw err;
                    }
                }

                return res;
            },
            {
                contextType: 'network',
                shouldRetry: (error) => (typeof retryOptions.shouldRetry === 'function' ? retryOptions.shouldRetry.call(this, error) : RetryManager._shouldRetryNetworkError(error)),
                ...retryOptions
            }
        );
    }

    /**
     * 為 DOM 操作創建重試包裝器
     * @param {Function} domOperation - DOM 操作函數
     * @param {Object} retryOptions - 重試選項
     * @returns {Function} 包裝後的函數
     */
    wrapDomOperation(domOperation, retryOptions = {}) {
        return (...args) => this.execute(
            () => domOperation(...args),
            {
                contextType: 'dom',
                maxRetries: 2, // DOM 操作通常重試次數較少
                baseDelay: 50,
                shouldRetry: (error) => RetryManager._shouldRetryDomError(error),
                ...retryOptions
            }
        );
    }

    /**
     * 判斷是否應該重試
     * @private
     * @param {Error} error - 錯誤對象
     * @param {Object} config - 配置選項
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
            if (error.status >= 500 && error.status < 600) return true;
            // 429 Too Many Requests 可以重試
            if (error.status === 429) return true;
            // 408 Request Timeout 可以重試
            if (error.status === 408) return true;
            // 4xx 客戶端錯誤通常不重試
            if (error.status >= 400 && error.status < 500) return false;
        }

        return false;
    }

    /**
     * 判斷 DOM 錯誤是否應該重試
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
     * @private
     * @param {number} attempt - 當前嘗試次數
     * @param {Object} config - 配置選項
     * @returns {number} 延遲毫秒數
     */
    static _calculateDelay(attempt, config) {
        // 指數退避
        let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);

        // 限制最大延遲
        delay = Math.min(delay, config.maxDelay);

        // 添加隨機抖動以避免雷群效應（可注入隨機來源以利測試）
        if (config.jitter) {
            const rnd = typeof config.random === 'function' ? config.random() : Math.random();
            delay = delay * (0.5 + rnd * 0.5);
        }

        return Math.floor(delay);
    }

    /**
     * 延遲執行
     * @private
     * @param {number} ms - 延遲毫秒數
     * @param {AbortSignal} signal - 中止信號
     * @returns {Promise} Promise 對象
     */
    static _delay(ms, signal) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                resolve();
            }, Math.max(0, ms));

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
                if (signal) signal.removeEventListener?.('abort', onAbort);
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
        const message = `📦 [重試] 第 ${attempt}/${maxAttempts} 次，延遲 ${delay}ms：${msg}`;

        // 使用 Logger（若不可用則在非生產環境降級到 console）
        if (logger && typeof logger.warn === 'function') {
            logger.warn(message);
        } else if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
            // 開發/測試環境降級：避免完全靜默
            console.warn(message);
        }

        const handler = getErrorHandler();
        if (handler && typeof handler.logError === 'function') {
            handler.logError({
                type: contextType === 'dom' ? 'dom_error' : 'network_error',
                context: `retry attempt ${attempt}/${maxAttempts} (delay ${delay}ms)`,
                originalError: error,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 記錄重試成功
     * @private
     * @param {number} totalRetries - 總重試次數
     */
    _logRetrySuccess(totalRetries, contextType = 'network') {
        const logger = getLogger();
        const message = `📦 [重試] 已成功，經歷 ${totalRetries} 次重試（${contextType}）`;
        if (logger && typeof logger.log === 'function') {
            logger.log(message);
        } else if (logger && typeof logger.info === 'function') {
            logger.info(message);
        }
    }

    /**
     * 記錄重試失敗
     * @private
     * @param {Error} error - 最終錯誤
     * @param {number} totalRetries - 總重試次數
     */
    _logRetryFailure(error, totalRetries, contextType = 'network') {
        const logger = getLogger();
        const msg = String(error?.message || '');
        const message = `❌ [重試] 失敗（${contextType}），共重試 ${totalRetries} 次：${msg}`;

        if (logger && typeof logger.error === 'function') {
            logger.error(message, error);
        }

        const handler = getErrorHandler();
        if (handler && typeof handler.logError === 'function') {
            handler.logError({
                type: contextType === 'dom' ? 'dom_error' : 'network_error',
                context: `final failure after ${totalRetries} retries`,
                originalError: error,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 獲取當前配置快照（不含動態統計）
     * @returns {Object} 配置快照
     */
    getConfigSnapshot() {
        return {
            maxRetries: this.options.maxRetries,
            baseDelay: this.options.baseDelay,
            maxDelay: this.options.maxDelay,
            backoffFactor: this.options.backoffFactor,
            jitter: Boolean(this.options.jitter)
        };
    }

    /**
     * 獲取最近一次重試統計資訊
     * @returns {Object|null} 最近一次執行的統計資訊
     */
    getLastStats() {
        return this._lastStats || null;
    }
}

// 創建默認實例
const defaultRetryManager = new RetryManager();

/**
 * 便捷的重試函數
 * @param {Function} operation - 要重試的操作
 * @param {Object} options - 重試選項
 * @returns {Promise<*>} 操作結果
 */
function withRetry(operation, options = {}) {
    return defaultRetryManager.execute(operation, options);
}

/**
 * 為 fetch 添加重試機制
 * @param {string} url - 請求 URL
 * @param {Object} options - fetch 選項
 * @param {Object} retryOptions - 重試選項
 * @returns {Promise<Response>} fetch 響應
 */
function fetchWithRetry(url, options = {}, retryOptions = {}) {
    const retryManager = new RetryManager(retryOptions);
    return retryManager.wrapFetch(fetch)(url, options);
}

// 導出類和函數
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RetryManager, withRetry, fetchWithRetry };
} else if (typeof window !== 'undefined') {
    window.RetryManager = RetryManager;
    window.withRetry = withRetry;
    window.fetchWithRetry = fetchWithRetry;
}
