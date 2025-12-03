/**
 * ErrorHandler 全面測試套件
 * 測試統一錯誤處理系統的所有功能
 */
/* eslint-env jest */

const { ErrorHandler, ErrorTypes, ErrorSeverity } = require('../../../scripts/errorHandling/ErrorHandler');

describe('ErrorHandler - 全面測試', () => {
    // 保存原始的 console 方法
    /** @type {Object|null} */
    let originalConsole = null;

    beforeEach(() => {
        // Mock console 方法
        originalConsole = {
            error: console.error,
            warn: console.warn,
            info: console.info,
            log: console.log
        };

        console.error = jest.fn();
        console.warn = jest.fn();
        console.info = jest.fn();
        console.log = jest.fn();

        // Mock Logger (used by ErrorHandler now)
        const mockLogger = {
            error: console.error,
            warn: console.warn,
            info: console.info,
            log: console.log,
            debug: console.log
        };
        global.Logger = mockLogger;
        if (typeof window !== 'undefined') {
            window.Logger = mockLogger;
        }

        // 清除錯誤統計
        ErrorHandler.clearErrorStats();
    });

    afterEach(() => {
        // 恢復原始的 console 方法
        console.error = originalConsole.error;
        console.warn = originalConsole.warn;
        console.info = originalConsole.info;
        console.log = originalConsole.log;

        jest.clearAllTimers();
    });

    describe('ErrorTypes 常量', () => {
        test('應該定義所有錯誤類型', () => {
            expect(ErrorTypes.EXTRACTION_FAILED).toBe('extraction_failed');
            expect(ErrorTypes.INVALID_URL).toBe('invalid_url');
            expect(ErrorTypes.NETWORK_ERROR).toBe('network_error');
            expect(ErrorTypes.PARSING_ERROR).toBe('parsing_error');
            expect(ErrorTypes.PERFORMANCE_WARNING).toBe('performance_warning');
            expect(ErrorTypes.DOM_ERROR).toBe('dom_error');
            expect(ErrorTypes.VALIDATION_ERROR).toBe('validation_error');
            expect(ErrorTypes.TIMEOUT_ERROR).toBe('timeout_error');
        });
    });

    describe('ErrorSeverity 常量', () => {
        test('應該定義所有嚴重程度', () => {
            expect(ErrorSeverity.LOW).toBe('low');
            expect(ErrorSeverity.MEDIUM).toBe('medium');
            expect(ErrorSeverity.HIGH).toBe('high');
            expect(ErrorSeverity.CRITICAL).toBe('critical');
        });
    });

    describe('withFallback - 回退策略', () => {
        test('應該在成功時返回操作結果', () => {
            const operation = () => 'success';
            const result = ErrorHandler.withFallback(operation, 'fallback');
            expect(result).toBe('success');
        });

        test('應該在失敗時返回回退值', () => {
            const operation = () => { throw new Error('Operation failed'); };
            const result = ErrorHandler.withFallback(operation, 'fallback');
            expect(result).toBe('fallback');
        });

        test('應該支持回退函數', () => {
            const operation = () => { throw new Error('Operation failed'); };
            const fallbackFn = () => 'fallback from function';
            const result = ErrorHandler.withFallback(operation, fallbackFn);
            expect(result).toBe('fallback from function');
        });

        test('應該記錄錯誤信息', () => {
            const operation = () => { throw new Error('Test error'); };
            ErrorHandler.withFallback(operation, 'fallback', 'test context');

            expect(console.warn).toHaveBeenCalled();
        });

        test('應該支持禁用日誌記錄', () => {
            const operation = () => { throw new Error('Test error'); };
            ErrorHandler.withFallback(operation, 'fallback', 'test context', { enableLogging: false });

            expect(console.warn).not.toHaveBeenCalled();
        });
    });

    describe('withRetry - 重試機制', () => {
        test('應該在成功時返回結果', async () => {
            const asyncOperation = jest.fn().mockResolvedValue('success');
            const result = await ErrorHandler.withRetry(asyncOperation);

            expect(result).toBe('success');
            expect(asyncOperation).toHaveBeenCalledTimes(1);
        });

        test('應該在失敗後重試', async () => {
            const error = new Error('Network error');
            error.name = 'NetworkError';

            const asyncOperation = jest.fn()
                .mockRejectedValueOnce(error)
                .mockRejectedValueOnce(error)
                .mockResolvedValue('success');

            const result = await ErrorHandler.withRetry(asyncOperation, { maxRetries: 3, delay: 10 });

            expect(result).toBe('success');
            expect(asyncOperation).toHaveBeenCalledTimes(3);
        });

        test('應該在重試次數用盡後拋出錯誤', async () => {
            const error = new Error('Always fails');
            error.name = 'NetworkError';
            const asyncOperation = jest.fn().mockRejectedValue(error);

            await expect(
                ErrorHandler.withRetry(asyncOperation, { maxRetries: 2, delay: 10 })
            ).rejects.toThrow('Always fails');

            expect(asyncOperation).toHaveBeenCalledTimes(3); // 初始 + 2 次重試
        });

        test('應該支持自定義 shouldRetry 函數', async () => {
            const asyncOperation = jest.fn().mockRejectedValue(new Error('Non-retryable'));
            const shouldRetry = jest.fn().mockReturnValue(false);

            await expect(
                ErrorHandler.withRetry(asyncOperation, { maxRetries: 3, shouldRetry })
            ).rejects.toThrow('Non-retryable');

            expect(asyncOperation).toHaveBeenCalledTimes(1); // 不應重試
            expect(shouldRetry).toHaveBeenCalled();
        });

        test('應該記錄重試嘗試', async () => {
            const error = new Error('Network error');
            error.name = 'NetworkError';

            const asyncOperation = jest.fn()
                .mockRejectedValueOnce(error)
                .mockResolvedValue('success');

            await ErrorHandler.withRetry(asyncOperation, { maxRetries: 2, delay: 10 });

            expect(console.warn).toHaveBeenCalled();
        });

        test('應該使用指數退避延遲', async () => {
            const error = new Error('Network error');
            error.name = 'NetworkError';

            const asyncOperation = jest.fn()
                .mockRejectedValueOnce(error)
                .mockRejectedValueOnce(error)
                .mockResolvedValue('success');

            const startTime = Date.now();
            await ErrorHandler.withRetry(asyncOperation, { maxRetries: 3, delay: 50 });
            const endTime = Date.now();

            // 延遲應該是 50ms + 100ms = 150ms（考慮測試環境可能的誤差）
            expect(endTime - startTime).toBeGreaterThanOrEqual(100);
        });
    });

    describe('createError - 創建標準化錯誤', () => {
        test('應該創建完整的錯誤對象', () => {
            const error = ErrorHandler.createError(
                ErrorTypes.NETWORK_ERROR,
                'Network request failed',
                { url: 'https://example.com' },
                ErrorSeverity.HIGH
            );

            expect(error.type).toBe(ErrorTypes.NETWORK_ERROR);
            expect(error.message).toBe('Network request failed');
            expect(error.details).toEqual({ url: 'https://example.com' });
            expect(error.severity).toBe(ErrorSeverity.HIGH);
            expect(error.timestamp).toBeDefined();
            expect(error.stack).toBeDefined();
        });

        test('應該使用默認的嚴重程度', () => {
            const error = ErrorHandler.createError(
                ErrorTypes.PARSING_ERROR,
                'Parse failed'
            );

            expect(error.severity).toBe(ErrorSeverity.MEDIUM);
        });

        test('應該使用空對象作為默認詳情', () => {
            const error = ErrorHandler.createError(
                ErrorTypes.DOM_ERROR,
                'DOM operation failed'
            );

            expect(error.details).toEqual({});
        });
    });

    describe('logError - 記錄錯誤', () => {
        test('應該記錄 error 級別的錯誤', () => {
            const errorInfo = {
                type: ErrorTypes.NETWORK_ERROR,
                context: 'fetch data',
                originalError: new Error('Network failed'),
                timestamp: Date.now()
            };

            ErrorHandler.logError(errorInfo);

            expect(console.error).toHaveBeenCalled();
        });

        test('應該記錄 warn 級別的錯誤', () => {
            const errorInfo = {
                type: ErrorTypes.EXTRACTION_FAILED,
                context: 'extract images',
                originalError: new Error('Extraction failed'),
                timestamp: Date.now()
            };

            ErrorHandler.logError(errorInfo);

            expect(console.warn).toHaveBeenCalled();
        });

        test('應該記錄 info 級別的錯誤', () => {
            const errorInfo = {
                type: ErrorTypes.PERFORMANCE_WARNING,
                context: 'performance check',
                originalError: new Error('Slow operation'),
                timestamp: Date.now()
            };

            ErrorHandler.logError(errorInfo);

            expect(console.info).toHaveBeenCalled();
        });

        test('應該處理沒有 originalError 的情況', () => {
            const errorInfo = {
                type: ErrorTypes.VALIDATION_ERROR,
                context: 'validate input',
                timestamp: Date.now()
            };

            ErrorHandler.logError(errorInfo);

            expect(console.warn).toHaveBeenCalled();
        });

        test('應該更新錯誤統計', () => {
            const errorInfo = {
                type: ErrorTypes.DOM_ERROR,
                context: 'DOM operation',
                originalError: new Error('DOM error'),
                timestamp: Date.now()
            };

            ErrorHandler.logError(errorInfo);

            const stats = ErrorHandler.getErrorStats();
            expect(stats[ErrorTypes.DOM_ERROR]).toBe(1);
        });
    });

    describe('isRetryableError - 判斷錯誤是否可重試', () => {
        test('應該識別 NetworkError 為可重試', () => {
            const error = new Error('Network failed');
            error.name = 'NetworkError';

            expect(ErrorHandler.isRetryableError(error)).toBe(true);
        });

        test('應該識別 TimeoutError 為可重試', () => {
            const error = new Error('Timeout');
            error.name = 'TimeoutError';

            expect(ErrorHandler.isRetryableError(error)).toBe(true);
        });

        test('應該識別 5xx 錯誤為可重試', () => {
            const error = new Error('Server error');
            error.status = 500;

            expect(ErrorHandler.isRetryableError(error)).toBe(true);

            error.status = 503;
            expect(ErrorHandler.isRetryableError(error)).toBe(true);
        });

        test('應該識別 429 錯誤為可重試', () => {
            const error = new Error('Too many requests');
            error.status = 429;

            expect(ErrorHandler.isRetryableError(error)).toBe(true);
        });

        test('應該識別 4xx 錯誤為不可重試', () => {
            const error = new Error('Bad request');
            error.status = 400;

            expect(ErrorHandler.isRetryableError(error)).toBe(false);

            error.status = 404;
            expect(ErrorHandler.isRetryableError(error)).toBe(false);
        });

        test('應該對未知錯誤返回 false', () => {
            const error = new Error('Unknown error');

            expect(ErrorHandler.isRetryableError(error)).toBe(false);
        });
    });

    describe('getLogLevel - 獲取日誌級別', () => {
        test('應該為不同錯誤類型返回正確的日誌級別', () => {
            expect(ErrorHandler.getLogLevel(ErrorTypes.NETWORK_ERROR)).toBe('error');
            expect(ErrorHandler.getLogLevel(ErrorTypes.TIMEOUT_ERROR)).toBe('error');
            expect(ErrorHandler.getLogLevel(ErrorTypes.EXTRACTION_FAILED)).toBe('warn');
            expect(ErrorHandler.getLogLevel(ErrorTypes.INVALID_URL)).toBe('warn');
            expect(ErrorHandler.getLogLevel(ErrorTypes.PERFORMANCE_WARNING)).toBe('info');
        });

        test('應該為未知錯誤類型返回默認級別', () => {
            expect(ErrorHandler.getLogLevel('unknown_error')).toBe('warn');
        });
    });

    describe('getErrorStats & updateErrorStats - 錯誤統計', () => {
        test('應該正確統計錯誤次數', () => {
            ErrorHandler.updateErrorStats(ErrorTypes.NETWORK_ERROR);
            ErrorHandler.updateErrorStats(ErrorTypes.NETWORK_ERROR);
            ErrorHandler.updateErrorStats(ErrorTypes.DOM_ERROR);

            const stats = ErrorHandler.getErrorStats();

            expect(stats[ErrorTypes.NETWORK_ERROR]).toBe(2);
            expect(stats[ErrorTypes.DOM_ERROR]).toBe(1);
        });

        test('應該在沒有統計數據時返回空對象', () => {
            ErrorHandler.errorStats = null;
            const stats = ErrorHandler.getErrorStats();
            expect(stats).toEqual({});
        });

        test('應該在 errorStats 不存在時初始化它', () => {
            ErrorHandler.errorStats = null;
            ErrorHandler.updateErrorStats(ErrorTypes.PARSING_ERROR);

            expect(ErrorHandler.errorStats).toBeDefined();
            expect(ErrorHandler.errorStats.get(ErrorTypes.PARSING_ERROR)).toBe(1);
        });
    });

    describe('clearErrorStats - 清除錯誤統計', () => {
        test('應該清除所有錯誤統計', () => {
            ErrorHandler.updateErrorStats(ErrorTypes.NETWORK_ERROR);
            ErrorHandler.updateErrorStats(ErrorTypes.DOM_ERROR);

            ErrorHandler.clearErrorStats();

            const stats = ErrorHandler.getErrorStats();
            expect(Object.keys(stats).length).toBe(0);
        });

        test('應該處理 errorStats 為 null 的情況', () => {
            ErrorHandler.errorStats = null;
            expect(() => ErrorHandler.clearErrorStats()).not.toThrow();
        });
    });

    describe('delay - 延遲執行', () => {
        test('應該延遲指定的毫秒數', async () => {
            const startTime = Date.now();
            await ErrorHandler.delay(100);
            const endTime = Date.now();

            expect(endTime - startTime).toBeGreaterThanOrEqual(90); // 考慮誤差
        });
    });

    describe('wrap - 包裝函數', () => {
        test('應該包裝同步函數並添加錯誤處理', () => {
            const fn = (x, y) => x + y;
            const wrappedFn = ErrorHandler.wrap(fn, { fallback: 0 });

            const result = wrappedFn(2, 3);
            expect(result).toBe(5);
        });

        test('應該在錯誤時使用回退值', () => {
            const fn = () => { throw new Error('Function failed'); };
            const wrappedFn = ErrorHandler.wrap(fn, { fallback: 'default' });

            const result = wrappedFn();
            expect(result).toBe('default');
        });

        test('應該使用函數名作為上下文', () => {
            function namedFunction() {
                throw new Error('Named function error');
            }

            const wrappedFn = ErrorHandler.wrap(namedFunction, { fallback: null });
            wrappedFn();

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('namedFunction'),
                expect.any(Error)
            );
        });

        test('應該支持自定義上下文', () => {
            const fn = () => { throw new Error('Error'); };
            const wrappedFn = ErrorHandler.wrap(fn, {
                fallback: null,
                context: 'custom context'
            });

            wrappedFn();

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('custom context'),
                expect.any(Error)
            );
        });

        test('應該支持禁用日誌記錄', () => {
            const fn = () => { throw new Error('Error'); };
            const wrappedFn = ErrorHandler.wrap(fn, {
                fallback: null,
                enableLogging: false
            });

            wrappedFn();

            expect(console.warn).not.toHaveBeenCalled();
        });

        test('應該保持 this 上下文', () => {
            const obj = {
                value: 42,
                getValue() {
                    return this.value;
                }
            };

            obj.getValue = ErrorHandler.wrap(obj.getValue, { fallback: 0 });

            expect(obj.getValue()).toBe(42);
        });
    });

    describe('wrapAsync - 包裝異步函數', () => {
        test('應該包裝異步函數並添加重試機制', async () => {
            const asyncFn = jest.fn().mockResolvedValue('result');
            const wrappedFn = ErrorHandler.wrapAsync(asyncFn);

            const result = await wrappedFn();

            expect(result).toBe('result');
            expect(asyncFn).toHaveBeenCalledTimes(1);
        });

        test('應該在失敗後重試', async () => {
            const error = new Error('Network error');
            error.name = 'NetworkError';

            const asyncFn = jest.fn()
                .mockRejectedValueOnce(error)
                .mockResolvedValue('success');

            const wrappedFn = ErrorHandler.wrapAsync(asyncFn, { maxRetries: 2, delay: 10 });

            const result = await wrappedFn();

            expect(result).toBe('success');
            expect(asyncFn).toHaveBeenCalledTimes(2);
        });

        test('應該保持 this 上下文', async () => {
            const obj = {
                value: 42,
                getValueAsync() {
                    return Promise.resolve(this.value);
                }
            };

            obj.getValueAsync = ErrorHandler.wrapAsync(obj.getValueAsync);

            const result = await obj.getValueAsync();
            expect(result).toBe(42);
        });

        test('應該傳遞參數', async () => {
            const asyncFn = jest.fn((a, b) => Promise.resolve(a + b));
            const wrappedFn = ErrorHandler.wrapAsync(asyncFn);

            const result = await wrappedFn(5, 7);

            expect(result).toBe(12);
            expect(asyncFn).toHaveBeenCalledWith(5, 7);
        });
    });

    describe('logRetryAttempt - 記錄重試', () => {
        test('應該記錄重試信息', () => {
            const error = new Error('Retry error');
            ErrorHandler.logRetryAttempt(error, 1, 3);

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Retry attempt 1/3')
            );
        });
    });

    describe('構造函數實例方法', () => {
        test('應該創建帶有默認選項的實例', () => {
            const handler = new ErrorHandler();

            expect(handler.options.enableLogging).toBe(true);
            expect(handler.options.enableRetry).toBe(true);
            expect(handler.options.maxRetries).toBe(3);
        });

        test('應該合併自定義選項', () => {
            const handler = new ErrorHandler({
                enableLogging: false,
                maxRetries: 5
            });

            expect(handler.options.enableLogging).toBe(false);
            expect(handler.options.maxRetries).toBe(5);
            expect(handler.options.enableRetry).toBe(true); // 默認值
        });

        test('應該初始化錯誤統計 Map', () => {
            const handler = new ErrorHandler();

            expect(handler.errorStats).toBeInstanceOf(Map);
            expect(handler.errorStats.size).toBe(0);
        });
    });

    describe('模塊導出', () => {
        test('應該正確導出到 module.exports', () => {
            const exported = require('../../../scripts/errorHandling/ErrorHandler');

            expect(exported.ErrorHandler).toBeDefined();
            expect(exported.ErrorTypes).toBeDefined();
            expect(exported.ErrorSeverity).toBeDefined();
        });
    });
});
