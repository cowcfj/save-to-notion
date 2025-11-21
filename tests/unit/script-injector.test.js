/**
 * @jest-environment jsdom
 */

// Mock chrome API
const mockChrome = {
    scripting: {
        executeScript: jest.fn()
    },
    runtime: {
        lastError: null
    }
};

// 設置特定的 chrome mocks，而不是覆蓋整個物件
global.chrome.scripting = mockChrome.scripting;
global.chrome.runtime.lastError = mockChrome.runtime.lastError;
// 確保其他 chrome API 仍然可用
if (!global.chrome.runtime.sendMessage) {
    global.chrome.runtime.sendMessage = jest.fn((payload, callback) => {
        if (callback) callback();
        return Promise.resolve({ success: true });
    });
}

describe('ScriptInjector', () => {
    let ScriptInjector = null;

    beforeEach(() => {
        // 清理 mock
        jest.clearAllMocks();
        jest.useFakeTimers();

        // 清理全局對象
        delete global.ScriptInjector;

        // 重新加載模塊
        jest.isolateModules(() => {
            require('../../scripts/script-injector.js');
            ScriptInjector = global.ScriptInjector;
        });
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    describe('injectAndExecute', () => {
        test('應該成功注入文件並執行函數', async () => {
            // 設置成功的回調
            mockChrome.scripting.executeScript.mockImplementation((options, callback) => {
                // 模擬第一次調用（文件注入）
                if (options.files) {
                    mockChrome.runtime.lastError = null;
                    callback();
                }
                // 模擬第二次調用（函數執行）
                else if (options.func) {
                    mockChrome.runtime.lastError = null;
                    callback([{ result: 'test result' }]);
                }
            });

            const result = await ScriptInjector.injectAndExecute(
                1,
                ['test.js'],
                () => 'test result',
                { returnResult: true }
            );

            expect(mockChrome.scripting.executeScript).toHaveBeenCalledTimes(2);
            expect(result).toBe('test result');
        });

        test('當 returnResult 為 false 時應該忽略函數返回值', async () => {
            mockChrome.scripting.executeScript.mockImplementation((options, callback) => {
                if (options.files) {
                    mockChrome.runtime.lastError = null;
                    callback();
                } else {
                    mockChrome.runtime.lastError = null;
                    callback([{ result: 'ignored' }]);
                }
            });

            const result = await ScriptInjector.injectAndExecute(
                5,
                ['test.js'],
                () => 'ignored'
            );

            expect(result).toBeNull();
        });

        test('應該處理文件注入錯誤', async () => {
            // 設置文件注入錯誤
            mockChrome.scripting.executeScript.mockImplementationOnce((options, callback) => {
                global.chrome.runtime.lastError = { message: 'File injection failed' };
                callback();
            });

            await expect(ScriptInjector.injectAndExecute(
                1, // 使用有效的 tabId
                ['test.js'],
                () => { /* no-op */ },
                { logErrors: true }
            )).rejects.toThrow('File injection failed');

            expect(console.error).toHaveBeenCalledWith('File injection failed:', { message: 'File injection failed' });
        });

        test('應該處理函數執行錯誤', async () => {
            // 設置文件注入成功，但函數執行錯誤
            mockChrome.scripting.executeScript
                .mockImplementationOnce((options, callback) => {
                    global.chrome.runtime.lastError = null;
                    callback();
                })
                .mockImplementationOnce((options, callback) => {
                    global.chrome.runtime.lastError = { message: 'Function execution failed' };
                    callback();
                });

            await expect(ScriptInjector.injectAndExecute(
                1, // 使用有效的 tabId
                ['test.js'],
                () => { /* no-op */ },
                { logErrors: true }
            )).rejects.toThrow('Function execution failed');

            expect(console.error).toHaveBeenCalledWith('Function execution failed:', { message: 'Function execution failed' });
        });

        test('應該處理異常錯誤', async () => {
            // 重置錯誤狀態
            mockChrome.runtime.lastError = null;
            global.chrome.runtime.lastError = null;

            // 設置 mock
            mockChrome.scripting.executeScript = jest.fn((options, callback) => {
                if (options.files && options.files.length > 0) {
                    // 文件注入階段 - 成功
                    global.chrome.runtime.lastError = null;
                    callback();
                } else if (options.func) {
                    // 函數執行失敗 - 設置 lastError
                    global.chrome.runtime.lastError = { message: 'Test error' };
                    callback();
                }
            });

            await expect(ScriptInjector.injectAndExecute(
                1,
                [],
                () => { /* no-op */ },
                { logErrors: true }
            )).rejects.toThrow('Test error');

            expect(console.error).toHaveBeenCalledWith('Function execution failed:', { message: 'Test error' });

            // 清理
            global.chrome.runtime.lastError = null;
        });

        test('應該處理 tabId 無效錯誤', async () => {
            await expect(ScriptInjector.injectAndExecute(
                -1,
                ['test.js'],
                () => { /* no-op */ },
                {}
            )).rejects.toThrow('Invalid tabId: must be a positive number');

            expect(console.error).toHaveBeenCalledWith('Invalid tabId: must be a positive number');
        });

        test('應該在沒有文件和函數時解析', async () => {
            mockChrome.scripting.executeScript.mockImplementation((options, callback) => {
                callback();
            });

            await expect(ScriptInjector.injectAndExecute(1, [], null, {})).resolves.toBeUndefined();
        });
    });

    describe('injectHighlighter', () => {
        test('應該正確調用 injectAndExecute 來注入標記工具', async () => {
            // Mock injectAndExecute 方法
            ScriptInjector.injectAndExecute = jest.fn().mockResolvedValue();

            await ScriptInjector.injectHighlighter(1);

            expect(ScriptInjector.injectAndExecute).toHaveBeenCalledWith(
                1,
                ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
                expect.any(Function),
                {
                    errorMessage: 'Failed to inject highlighter',
                    successMessage: 'Highlighter v2 injected and initialized successfully'
                }
            );
        });
    });

    describe('collectHighlights', () => {
        test('應該正確調用 injectAndExecute 來收集標記', async () => {
            // Mock injectAndExecute 方法
            ScriptInjector.injectAndExecute = jest.fn().mockResolvedValue('test result');

            const result = await ScriptInjector.collectHighlights(1);

            expect(ScriptInjector.injectAndExecute).toHaveBeenCalledWith(
                1,
                ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
                expect.any(Function),
                {
                    errorMessage: 'Failed to collect highlights',
                    successMessage: 'Highlights collected successfully',
                    returnResult: true
                }
            );
            expect(result).toBe('test result');
        });
    });

    describe('clearPageHighlights', () => {
        test('應該正確調用 injectAndExecute 來清除頁面標記', async () => {
            // Mock injectAndExecute 方法
            ScriptInjector.injectAndExecute = jest.fn().mockResolvedValue();

            await ScriptInjector.clearPageHighlights(1);

            expect(ScriptInjector.injectAndExecute).toHaveBeenCalledWith(
                1,
                ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
                expect.any(Function),
                {
                    errorMessage: 'Failed to clear page highlights',
                    successMessage: 'Page highlights cleared successfully'
                }
            );
        });
    });

    describe('injectHighlightRestore', () => {
        test('應該正確調用 injectAndExecute 來注入標記恢復腳本', async () => {
            // Mock injectAndExecute 方法
            ScriptInjector.injectAndExecute = jest.fn().mockResolvedValue();

            await ScriptInjector.injectHighlightRestore(1);

            expect(ScriptInjector.injectAndExecute).toHaveBeenCalledWith(
                1,
                ['scripts/utils.js', 'scripts/highlight-restore.js'],
                null,
                {
                    errorMessage: 'Failed to inject highlight restore script',
                    successMessage: 'Highlight restore script injected successfully'
                }
            );
        });
    });

    describe('injectAndExecute 時間控制', () => {
        test('應該保留原始 console 行為控制', async () => {
            const originalLog = console.log;
            console.log = jest.fn();

            ScriptInjector.injectAndExecute = jest.fn().mockResolvedValue();

            await ScriptInjector.injectHighlightRestore(2);

            expect(console.log).not.toHaveBeenCalled();

            console.log = originalLog;
        });
    });
});