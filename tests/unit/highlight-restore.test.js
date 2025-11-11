/**
 * @jest-environment jsdom
 */

describe('highlight-restore.js', () => {
    // Arrange - 保存原始全域引用（避免在 beforeEach/afterEach 間被覆寫）
    const originalInitHighlighter = window.initHighlighter;
    const originalNotionHighlighter = window.notionHighlighter;
    const originalLogger = window.Logger;

    beforeEach(() => {
        // 使用假計時器以控制 setTimeout 等計時行為
        jest.useFakeTimers();

        // 清理 DOM 狀態
        document.body.innerHTML = '';

        // 重置全域並建立 Logger mock（遵循日誌規範，避免直接依賴 console）
        window.initHighlighter = null;
        window.notionHighlighter = null;

        window.Logger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };

        // 嚴格：避免測試依賴 console，將其設為 jest.fn()，但不作為驗證依據
        console.log = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();
        console.info = jest.fn();
    });

    afterEach(() => {
        // 恢復原始全域對象（若存在），避免測試間污染
        window.initHighlighter = originalInitHighlighter;
        window.notionHighlighter = originalNotionHighlighter;
        window.Logger = originalLogger;

        // 確保計時器清空並恢復真實計時器
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    test('應該在 initHighlighter 不存在時記錄警告並退出', () => {
        // 確保 initHighlighter 不存在
        window.initHighlighter = undefined;

        // 動態加載腳本
        jest.isolateModules(() => {
            require('../../scripts/highlight-restore.js');
        });

        expect(window.Logger.warn).toHaveBeenCalledWith('⚠️ 標註工具未加載，無法恢復標註');
    });

    test('應該調用 initHighlighter 函數', () => {
        // Mock initHighlighter 函數
        window.initHighlighter = jest.fn();

        // Mock Logger
        window.Logger = {
            info: jest.fn()
        };

        // 動態加載腳本
        jest.isolateModules(() => {
            require('../../scripts/highlight-restore.js');
        });

        expect(window.initHighlighter).toHaveBeenCalled();
        expect(window.Logger.info).toHaveBeenCalledWith('🔧 執行標註恢復腳本');
    });

    test('當 notionHighlighter 不存在時應該記錄警告', () => {
        // Mock initHighlighter 函數
        window.initHighlighter = jest.fn();
        // 確保 notionHighlighter 不存在
        window.notionHighlighter = undefined;

        // 動態加載腳本
        jest.isolateModules(() => {
            require('../../scripts/highlight-restore.js');
        });

        expect(window.initHighlighter).toHaveBeenCalled();
        expect(window.Logger.warn).toHaveBeenCalledWith('⚠️ 無法找到標註管理器，跳過強制恢復');
    });

    test('應該調用 forceRestoreHighlights 方法', async () => {
        // Mock initHighlighter 函數
        window.initHighlighter = jest.fn();
        window.Logger = {
            info: jest.fn()
        };

        // Mock notionHighlighter 對象
        const mockForceRestore = jest.fn().mockResolvedValue(true);
        window.notionHighlighter = {
            manager: {
                forceRestoreHighlights: mockForceRestore
            },
            hide: jest.fn()
        };

        // 動態加載腳本
        jest.isolateModules(() => {
            require('../../scripts/highlight-restore.js');
        });

        await Promise.resolve();
        await Promise.resolve();

        expect(window.initHighlighter).toHaveBeenCalled();
        expect(mockForceRestore).toHaveBeenCalled();
        expect(window.Logger.info).toHaveBeenCalledWith('✅ 標註恢復成功');
        expect(console.log).not.toHaveBeenCalled();
    });

    test('應該處理 forceRestoreHighlights 失敗的情況', async () => {
        // Mock initHighlighter 函數
        window.initHighlighter = jest.fn();

        // Mock notionHighlighter 對象
        const mockForceRestore = jest.fn().mockResolvedValue(false);
        window.notionHighlighter = {
            manager: {
                forceRestoreHighlights: mockForceRestore
            },
            hide: jest.fn()
        };

        // 動態加載腳本
        jest.isolateModules(() => {
            require('../../scripts/highlight-restore.js');
        });

        await Promise.resolve();
        await Promise.resolve();
        jest.runAllTimers();

        expect(window.initHighlighter).toHaveBeenCalled();
        expect(mockForceRestore).toHaveBeenCalled();
        expect(window.Logger.warn).toHaveBeenCalledWith('⚠️ 標註恢復失敗');
    });

    test('應該處理 forceRestoreHighlights 錯誤的情況', async () => {
        // Mock initHighlighter 函數
        window.initHighlighter = jest.fn();

        // Mock notionHighlighter 對象
        const mockForceRestore = jest.fn().mockRejectedValue(new Error('Test error'));
        window.notionHighlighter = {
            manager: {
                forceRestoreHighlights: mockForceRestore
            },
            hide: jest.fn()
        };

        // 動態加載腳本
        jest.isolateModules(() => {
            require('../../scripts/highlight-restore.js');
        });

        await Promise.resolve();
        await Promise.resolve();
        jest.runAllTimers();

        expect(window.initHighlighter).toHaveBeenCalled();
        expect(mockForceRestore).toHaveBeenCalled();
        expect(window.Logger.error).toHaveBeenCalledWith('❌ 標註恢復過程中出錯:', expect.any(Error));
    });

    test('應該在 500ms 後調用 hide 方法', async () => {
        // Mock initHighlighter 函數
        window.initHighlighter = jest.fn();

        // Mock notionHighlighter 對象
        const mockForceRestore = jest.fn().mockResolvedValue(true);
        const mockHide = jest.fn();
        window.notionHighlighter = {
            manager: {
                forceRestoreHighlights: mockForceRestore
            },
            hide: mockHide
        };

        // 動態加載腳本
        jest.isolateModules(() => {
            require('../../scripts/highlight-restore.js');
        });


        // 需先清空 Promise 隊列以完成強制恢復流程，否則 setTimeout 尚未排程
        await Promise.resolve();
        await Promise.resolve();
        jest.runAllTimers();

        expect(mockHide).toHaveBeenCalled();
    });

    test('當管理器缺少 forceRestoreHighlights 時應該記錄警告', async () => {
        window.initHighlighter = jest.fn();
        window.notionHighlighter = {
            manager: {},
            hide: jest.fn()
        };

        jest.isolateModules(() => {
            require('../../scripts/highlight-restore.js');
        });

        await Promise.resolve();

        expect(window.Logger.warn).toHaveBeenCalledWith('⚠️ 無法找到標註管理器，跳過強制恢復');
        expect(window.initHighlighter).toHaveBeenCalled();
    });

    test('缺少 hide 方法時應該安全跳過', async () => {
        window.initHighlighter = jest.fn();
        const mockForceRestore = jest.fn().mockResolvedValue(true);

        window.notionHighlighter = {
            manager: {
                forceRestoreHighlights: mockForceRestore
            }
        };

        jest.isolateModules(() => {
            require('../../scripts/highlight-restore.js');
        });

        await Promise.resolve();
        await Promise.resolve();
        jest.runAllTimers();

        expect(mockForceRestore).toHaveBeenCalled();
        expect(window.Logger.error).not.toHaveBeenCalled();
    });
});
