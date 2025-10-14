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

// 在測試開始前設置全局 chrome 對象
global.chrome = mockChrome;

describe('ScriptInjector', () => {
    let ScriptInjector;

    beforeEach(() => {
        // 清理 mock
        jest.clearAllMocks();

        // 清理全局對象
        delete global.ScriptInjector;

        // 重新加載模塊
        jest.isolateModules(() => {
            require('../../scripts/script-injector.js');
            ScriptInjector = global.ScriptInjector;
        });
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

        test('應該處理文件注入錯誤', async () => {
            // 設置文件注入錯誤
            mockChrome.scripting.executeScript.mockImplementationOnce((options, callback) => {
                mockChrome.runtime.lastError = { message: 'File injection failed' };
                callback();
            });

            await expect(ScriptInjector.injectAndExecute(
                1,
                ['test.js'],
                () => {},
                {}
            )).rejects.toThrow('File injection failed');

            expect(console.error).toHaveBeenCalledWith('File injection failed:', expect.any(Object));
        });

        test('應該處理函數執行錯誤', async () => {
            // 設置文件注入成功，但函數執行錯誤
            mockChrome.scripting.executeScript
                .mockImplementationOnce((options, callback) => {
                    mockChrome.runtime.lastError = null;
                    callback();
                })
                .mockImplementationOnce((options, callback) => {
                    mockChrome.runtime.lastError = { message: 'Function execution failed' };
                    callback();
                });

            await expect(ScriptInjector.injectAndExecute(
                1,
                ['test.js'],
                () => {},
                {}
            )).rejects.toThrow('Function execution failed');

            expect(console.error).toHaveBeenCalledWith('Function execution failed:', expect.any(Object));
        });

        test('應該處理異常錯誤', async () => {
            // 模擬拋出異常
            mockChrome.scripting.executeScript.mockImplementation(() => {
                throw new Error('Test error');
            });

            await expect(ScriptInjector.injectAndExecute(
                1,
                ['test.js'],
                () => {},
                {}
            )).rejects.toThrow('Test error');

            expect(console.error).toHaveBeenCalledWith('Script injection failed', expect.any(Error));
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
                ['scripts/highlight-restore.js'],
                null,
                {
                    errorMessage: 'Failed to inject highlight restore script',
                    successMessage: 'Highlight restore script injected successfully'
                }
            );
        });
    });
});