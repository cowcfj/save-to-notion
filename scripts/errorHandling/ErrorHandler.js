/**
 * 統一錯誤處理系統
 * 提供標準化的錯誤處理、重試機制和日誌記錄
 */

/**
 * 錯誤類型枚舉
 */
const ErrorTypes = {
    EXTRACTION_FAILED: 'extraction_failed',
    INVALID_URL: 'invalid_url',
    NETWORK_ERROR: 'network_error',
    PARSING_ERROR: 'parsing_error',
    PERFORMANCE_WARNING: 'performance_warning',
    DOM_ERROR: 'dom_error',
    VALIDATION_ERROR: 'validation_error',
    TIMEOUT_ERROR: 'timeout_error'
};

/**
 * 錯誤嚴重程度
 */
const ErrorSeverity = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

/**
 * 統一錯誤處理器
 */
class ErrorHandler {
    /**
     * 創建錯誤處理器實例
     * @param {Object} options - 配置選項
     * @param {boolean} options.enableLogging - 是否啟用日誌記錄
     * @param {boolean} options.enableRetry - 是否啟用重試機制
     * @param {number} options.maxRetries - 最大重試次數
     */
    constructor(options = {}) {
        this.options = {
            enableLogging: true,
            enableRetry: true,
            maxRetries: 3,
            ...options
        };
        
        this.errorStats = new Map();
    }

    /**
     * 執行操作並處理錯誤，支持回退策略
     * @param {Function} operation - 要執行的操作
     * @param {*} fallback - 回退值或回退函數
     * @param {string} context - 操作上下文描述
     * @param {Object} options - 額外選項
     * @returns {*} 操作結果或回退值
     */
    static withFallback(operation, fallback, context = '', options = {}) {
        try {
            const result = operation();
            return result;
        } catch (error) {
            const errorInfo = {
                type: ErrorTypes.EXTRACTION_FAILED,
                context: context,
                originalError: error,
                timestamp: Date.now()
            };

            // 記錄錯誤
            if (options.enableLogging !== false) {
                this.logError(errorInfo);
            }

            // 返回回退值
            return typeof fallback === 'function' ? fallback() : fallback;
        }
    }

    /**
     * 執行異步操作並支持重試機制
     * @param {Function} asyncOperation - 異步操作函數
     * @param {Object} options - 重試選項
     * @param {number} options.maxRetries - 最大重試次數
     * @param {number} options.delay - 重試延遲（毫秒）
     * @param {Function} options.shouldRetry - 判斷是否應該重試的函數
     * @returns {Promise<*>} 操作結果
     */
    static async withRetry(asyncOperation, options = {}) {
        const {
            maxRetries = 3,
            delay = 100,
            shouldRetry = (error) => this.isRetryableError(error)
        } = options;

        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
            try {
                return await asyncOperation();
            } catch (error) {
                lastError = error;
                
                // 記錄重試嘗試
                this.logRetryAttempt(error, attempt, maxRetries + 1);
                
                // 如果是最後一次嘗試或不應該重試，拋出錯誤
                if (attempt > maxRetries || !shouldRetry(error)) {
                    throw error;
                }
                
                // 等待後重試
                await this.delay(delay * attempt);
            }
        }
        
        throw lastError;
    }

    /**
     * 創建標準化的錯誤對象
     * @param {string} type - 錯誤類型
     * @param {string} message - 錯誤消息
     * @param {Object} details - 錯誤詳情
     * @param {string} severity - 錯誤嚴重程度
     * @returns {Object} 標準化錯誤對象
     */
    static createError(type, message, details = {}, severity = ErrorSeverity.MEDIUM) {
        return {
            type: type,
            message: message,
            details: details,
            severity: severity,
            timestamp: Date.now(),
            stack: new Error().stack
        };
    }

    /**
     * 記錄錯誤信息
     * @param {Object} errorInfo - 錯誤信息對象
     */
    static logError(errorInfo) {
        const { type, context, originalError, timestamp } = errorInfo;
        
        // 根據錯誤類型選擇日誌級別
        const logLevel = this.getLogLevel(type);
        const message = `[${type}] ${context}: ${originalError?.message || 'Unknown error'}`;
        
        switch (logLevel) {
            case 'error':
                console.error(message, originalError);
                break;
            case 'warn':
                console.warn(message, originalError);
                break;
            case 'info':
                console.info(message, originalError);
                break;
            default:
                
        }
        
        // 更新錯誤統計
        this.updateErrorStats(type);
    }

    /**
     * 記錄重試嘗試
     * @param {Error} error - 錯誤對象
     * @param {number} attempt - 當前嘗試次數
     * @param {number} maxAttempts - 最大嘗試次數
     */
    static logRetryAttempt(error, attempt, maxAttempts) {
        console.warn(`Retry attempt ${attempt}/${maxAttempts}: ${error.message}`);
    }

    /**
     * 判斷錯誤是否可重試
     * @param {Error} error - 錯誤對象
     * @returns {boolean} 是否可重試
     */
    static isRetryableError(error) {
        // 網絡錯誤通常可以重試
        if (error.name === 'NetworkError' || error.name === 'TimeoutError') {
            return true;
        }
        
        // HTTP 5xx 錯誤可以重試
        if (error.status >= 500 && error.status < 600) {
            return true;
        }
        
        // 429 (Too Many Requests) 可以重試
        if (error.status === 429) {
            return true;
        }
        
        // 4xx 客戶端錯誤通常不應重試
        if (error.status >= 400 && error.status < 500) {
            return false;
        }
        
        return false;
    }

    /**
     * 根據錯誤類型獲取日誌級別
     * @param {string} errorType - 錯誤類型
     * @returns {string} 日誌級別
     */
    static getLogLevel(errorType) {
        const logLevels = {
            [ErrorTypes.EXTRACTION_FAILED]: 'warn',
            [ErrorTypes.INVALID_URL]: 'warn',
            [ErrorTypes.NETWORK_ERROR]: 'error',
            [ErrorTypes.PARSING_ERROR]: 'warn',
            [ErrorTypes.PERFORMANCE_WARNING]: 'info',
            [ErrorTypes.DOM_ERROR]: 'warn',
            [ErrorTypes.VALIDATION_ERROR]: 'warn',
            [ErrorTypes.TIMEOUT_ERROR]: 'error'
        };
        
        return logLevels[errorType] || 'warn';
    }

    /**
     * 更新錯誤統計
     * @param {string} errorType - 錯誤類型
     */
    static updateErrorStats(errorType) {
        if (!this.errorStats) {
            this.errorStats = new Map();
        }
        
        const current = this.errorStats.get(errorType) || 0;
        this.errorStats.set(errorType, current + 1);
    }

    /**
     * 獲取錯誤統計信息
     * @returns {Object} 錯誤統計
     */
    static getErrorStats() {
        if (!this.errorStats) {
            return {};
        }
        
        const stats = {};
        for (const [type, count] of this.errorStats.entries()) {
            stats[type] = count;
        }
        return stats;
    }

    /**
     * 清除錯誤統計
     */
    static clearErrorStats() {
        if (this.errorStats) {
            this.errorStats.clear();
        }
    }

    /**
     * 延遲執行
     * @param {number} ms - 延遲毫秒數
     * @returns {Promise} Promise 對象
     */
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 包裝函數以添加錯誤處理
     * @param {Function} fn - 要包裝的函數
     * @param {Object} options - 包裝選項
     * @returns {Function} 包裝後的函數
     */
    static wrap(fn, options = {}) {
        const { 
            fallback = null, 
            context = fn.name || 'anonymous function',
            enableLogging = true 
        } = options;
        
        return function(...args) {
            return ErrorHandler.withFallback(
                () => fn.apply(this, args),
                fallback,
                context,
                { enableLogging }
            );
        };
    }

    /**
     * 包裝異步函數以添加重試機制
     * @param {Function} asyncFn - 要包裝的異步函數
     * @param {Object} retryOptions - 重試選項
     * @returns {Function} 包裝後的異步函數
     */
    static wrapAsync(asyncFn, retryOptions = {}) {
        return async function(...args) {
            return ErrorHandler.withRetry(
                () => asyncFn.apply(this, args),
                retryOptions
            );
        };
    }
}

// 導出類和常量
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ErrorHandler, ErrorTypes, ErrorSeverity };
} else if (typeof window !== 'undefined') {
    window.ErrorHandler = ErrorHandler;
    window.ErrorTypes = ErrorTypes;
    window.ErrorSeverity = ErrorSeverity;
}