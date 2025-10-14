/**
 * 重試管理器
 * 專門處理網絡請求和異步操作的重試邏輯
 */
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
        const config = { ...this.options, ...options };
        let lastError;
        
        for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
            try {
                const result = await operation();
                
                // 成功時記錄重試統計
                if (attempt > 1) {
                    this._logRetrySuccess(attempt - 1);
                }
                
                return result;
            } catch (error) {
                lastError = error;
                
                // 檢查是否應該重試
                if (attempt > config.maxRetries || !this._shouldRetry(error, config)) {
                    this._logRetryFailure(error, attempt - 1);
                    throw error;
                }
                
                // 計算延遲時間
                const delay = this._calculateDelay(attempt, config);
                
                // 記錄重試嘗試
                this._logRetryAttempt(error, attempt, config.maxRetries + 1, delay);
                
                // 等待後重試
                await this._delay(delay);
            }
        }
        
        throw lastError;
    }

    /**
     * 為網絡請求創建重試包裝器
     * @param {Function} fetchFunction - fetch 函數
     * @param {Object} retryOptions - 重試選項
     * @returns {Function} 包裝後的 fetch 函數
     */
    wrapFetch(fetchFunction, retryOptions = {}) {
        return async (url, options = {}) => {
            return this.execute(
                () => fetchFunction(url, options),
                {
                    shouldRetry: (error) => this._shouldRetryNetworkError(error),
                    ...retryOptions
                }
            );
        };
    }

    /**
     * 為 DOM 操作創建重試包裝器
     * @param {Function} domOperation - DOM 操作函數
     * @param {Object} retryOptions - 重試選項
     * @returns {Function} 包裝後的函數
     */
    wrapDomOperation(domOperation, retryOptions = {}) {
        return async (...args) => {
            return this.execute(
                () => domOperation(...args),
                {
                    maxRetries: 2, // DOM 操作通常重試次數較少
                    baseDelay: 50,
                    shouldRetry: (error) => this._shouldRetryDomError(error),
                    ...retryOptions
                }
            );
        };
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
        if (config.shouldRetry) {
            return config.shouldRetry(error);
        }
        
        // 默認重試邏輯
        return this._shouldRetryNetworkError(error);
    }

    /**
     * 判斷網絡錯誤是否應該重試
     * @private
     * @param {Error} error - 錯誤對象
     * @returns {boolean} 是否應該重試
     */
    _shouldRetryNetworkError(error) {
        // 網絡相關錯誤
        if (error.name === 'NetworkError' || 
            error.name === 'TimeoutError' ||
            error.message.includes('fetch')) {
            return true;
        }
        
        // HTTP 狀態碼判斷
        if (error.status) {
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
     * @private
     * @param {Error} error - 錯誤對象
     * @returns {boolean} 是否應該重試
     */
    _shouldRetryDomError(error) {
        // DOM 還未準備好
        if (error.name === 'InvalidStateError' ||
            error.message.includes('not ready') ||
            error.message.includes('loading')) {
            return true;
        }
        
        // 元素暫時不可訪問
        if (error.name === 'NotFoundError' ||
            error.message.includes('not found')) {
            return true;
        }
        
        return false;
    }

    /**
     * 計算延遲時間
     * @private
     * @param {number} attempt - 當前嘗試次數
     * @param {Object} config - 配置選項
     * @returns {number} 延遲毫秒數
     */
    _calculateDelay(attempt, config) {
        // 指數退避
        let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
        
        // 限制最大延遲
        delay = Math.min(delay, config.maxDelay);
        
        // 添加隨機抖動以避免雷群效應
        if (config.jitter) {
            delay = delay * (0.5 + Math.random() * 0.5);
        }
        
        return Math.floor(delay);
    }

    /**
     * 延遲執行
     * @private
     * @param {number} ms - 延遲毫秒數
     * @returns {Promise} Promise 對象
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 記錄重試嘗試
     * @private
     * @param {Error} error - 錯誤對象
     * @param {number} attempt - 當前嘗試次數
     * @param {number} maxAttempts - 最大嘗試次數
     * @param {number} delay - 延遲時間
     */
    _logRetryAttempt(error, attempt, maxAttempts, delay) {
        const message = `Retry attempt ${attempt}/${maxAttempts} after ${delay}ms: ${error.message}`;
        
        if (typeof ErrorHandler !== 'undefined') {
            ErrorHandler.logError({
                type: 'network_error',
                context: `retry attempt ${attempt}`,
                originalError: error,
                timestamp: Date.now()
            });
        } else {
            console.warn(message);
        }
    }

    /**
     * 記錄重試成功
     * @private
     * @param {number} totalRetries - 總重試次數
     */
    _logRetrySuccess(totalRetries) {
        const message = `Operation succeeded after ${totalRetries} retries`;
        console.info(message);
    }

    /**
     * 記錄重試失敗
     * @private
     * @param {Error} error - 最終錯誤
     * @param {number} totalRetries - 總重試次數
     */
    _logRetryFailure(error, totalRetries) {
        const message = `Operation failed after ${totalRetries} retries: ${error.message}`;
        
        if (typeof ErrorHandler !== 'undefined') {
            ErrorHandler.logError({
                type: 'network_error',
                context: `final failure after ${totalRetries} retries`,
                originalError: error,
                timestamp: Date.now()
            });
        } else {
            console.error(message, error);
        }
    }

    /**
     * 獲取重試統計信息
     * @returns {Object} 統計信息
     */
    getStats() {
        return {
            maxRetries: this.options.maxRetries,
            baseDelay: this.options.baseDelay,
            maxDelay: this.options.maxDelay,
            backoffFactor: this.options.backoffFactor
        };
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
async function fetchWithRetry(url, options = {}, retryOptions = {}) {
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