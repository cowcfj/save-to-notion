/**
 * @jest-environment jsdom
 */

describe('highlight-restore.js', () => {
    // 保存原始的全局對象
    const originalInitHighlighter = window.initHighlighter;
    const originalNotionHighlighter = window.notionHighlighter;

    beforeEach(() => {
        jest.useFakeTimers();

        // 清理 DOM
        document.body.innerHTML = '';

        // 重置全局對象
        window.initHighlighter = null;
        window.notionHighlighter = null;
        window.Logger = null;

        // Mock console 方法
        console.log = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();
        console.info = jest.fn();
    });

    afterEach(() => {
        // 恢復原始的全局對象
        window.initHighlighter = originalInitHighlighter;
        window.notionHighlighter = originalNotionHighlighter;

        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('應該在 initHighlighter 不存在時記錄警告並退出', () => {
        // 確保 initHighlighter 不存在
        window.initHighlighter = undefined;

        // 動態加載腳本
        jest.isolateModules(() => {
            require('../../scripts/highlight-restore.js');
        });

        expect(console.warn).toHaveBeenCalledWith('⚠️ 標註工具未加載，無法恢復標註');
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
        expect(console.warn).toHaveBeenCalledWith('⚠️ 無法找到標註管理器，跳過強制恢復');
    });

    test('應該調用 forceRestoreHighlights 方法', async () => {
        // Mock initHighlighter 函數
        window.initHighlighter = jest.fn();

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
        expect(console.log).toHaveBeenCalledWith('✅ 標註恢復成功');
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
        expect(console.warn).toHaveBeenCalledWith('⚠️ 標註恢復失敗');
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
        expect(console.error).toHaveBeenCalledWith('❌ 標註恢復過程中出錯:', expect.any(Error));
    });

    test('應該在 500ms 後調用 hide 方法', () => {
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

        expect(console.warn).toHaveBeenCalledWith('⚠️ 無法找到標註管理器，跳過強制恢復');
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
        expect(console.error).not.toHaveBeenCalled();
    });
});