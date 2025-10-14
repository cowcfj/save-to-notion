/**
 * @jest-environment jsdom
 */

// Mock chrome API
const mockChrome = {
    storage: {
        local: {
            set: jest.fn(),
            get: jest.fn(),
            remove: jest.fn()
        }
    },
    runtime: {
        lastError: null
    }
};

// 在測試開始前設置全局 chrome 對象
global.chrome = mockChrome;

// 重置模塊緩存並重新加載 utils.js
jest.resetModules();
require('../../scripts/utils.js');

describe('utils.js', () => {
    beforeEach(() => {
        // 清理 mock
        jest.clearAllMocks();
        mockChrome.runtime.lastError = null;

        // 清理 localStorage
        localStorage.clear();
    });

    describe('normalizeUrl', () => {
        test('應該標準化 URL 並移除 hash', () => {
            const result = window.normalizeUrl('https://example.com/page#section');
            expect(result).toBe('https://example.com/page');
        });

        test('應該移除追蹤參數', () => {
            const result = window.normalizeUrl('https://example.com/page?utm_source=test&utm_medium=email');
            expect(result).toBe('https://example.com/page');
        });

        test('應該標準化尾部斜杠', () => {
            const result = window.normalizeUrl('https://example.com/page/');
            expect(result).toBe('https://example.com/page');
        });

        test('應該處理無效 URL', () => {
            const result = window.normalizeUrl('invalid-url');
            expect(result).toBe('invalid-url');
        });
    });

    describe('StorageUtil', () => {
        describe('saveHighlights', () => {
            test('應該成功保存標註到 chrome.storage', async () => {
                mockChrome.storage.local.set.mockImplementation((data, callback) => {
                    callback();
                });

                const result = await window.StorageUtil.saveHighlights(
                    'https://example.com/page',
                    [{ text: 'test highlight' }]
                );

                expect(mockChrome.storage.local.set).toHaveBeenCalled();
                expect(result).toBeUndefined();
            });

            test('應該在 chrome.storage 失敗時回退到 localStorage', async () => {
                mockChrome.storage.local.set.mockImplementation((data, callback) => {
                    mockChrome.runtime.lastError = { message: 'Storage failed' };
                    callback();
                });

                await window.StorageUtil.saveHighlights(
                    'https://example.com/page',
                    [{ text: 'test highlight' }]
                );

                expect(localStorage.getItem('highlights_https://example.com/page')).toBeTruthy();
            });

            test('應該處理 chrome.storage 不可用的情況', async () => {
                // 模擬 chrome.storage 不可用
                const originalChrome = global.chrome;
                global.chrome = undefined;

                await window.StorageUtil.saveHighlights(
                    'https://example.com/page',
                    [{ text: 'test highlight' }]
                );

                expect(localStorage.getItem('highlights_https://example.com/page')).toBeTruthy();

                // 恢復 chrome 對象
                global.chrome = originalChrome;
            });
        });

        describe('loadHighlights', () => {
            test('應該從 chrome.storage 加載標註', async () => {
                mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                    const data = {
                        'highlights_https://example.com/page': [{ text: 'test highlight' }]
                    };
                    callback(data);
                });

                const result = await window.StorageUtil.loadHighlights('https://example.com/page');
                expect(result).toEqual([{ text: 'test highlight' }]);
            });

            test('應該處理舊格式數據（數組）', async () => {
                mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                    const data = {
                        'highlights_https://example.com/page': [{ text: 'old format' }]
                    };
                    callback(data);
                });

                const result = await window.StorageUtil.loadHighlights('https://example.com/page');
                expect(result).toEqual([{ text: 'old format' }]);
            });

            test('應該處理新格式數據（對象）', async () => {
                mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                    const data = {
                        'highlights_https://example.com/page': {
                            url: 'https://example.com/page',
                            highlights: [{ text: 'new format' }]
                        }
                    };
                    callback(data);
                });

                const result = await window.StorageUtil.loadHighlights('https://example.com/page');
                expect(result).toEqual([{ text: 'new format' }]);
            });

            test('應該在 chrome.storage 無數據時回退到 localStorage', async () => {
                mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                    callback({});
                });

                localStorage.setItem(
                    'highlights_https://example.com/page',
                    JSON.stringify([{ text: 'localStorage highlight' }])
                );

                const result = await window.StorageUtil.loadHighlights('https://example.com/page');
                expect(result).toEqual([{ text: 'localStorage highlight' }]);
            });

            test('應該處理 chrome.storage 不可用的情況', async () => {
                // 模擬 chrome.storage 不可用
                const originalChrome = global.chrome;
                global.chrome = undefined;

                localStorage.setItem(
                    'highlights_https://example.com/page',
                    JSON.stringify([{ text: 'localStorage highlight' }])
                );

                const result = await window.StorageUtil.loadHighlights('https://example.com/page');
                expect(result).toEqual([{ text: 'localStorage highlight' }]);

                // 恢復 chrome 對象
                global.chrome = originalChrome;
            });
        });

        describe('clearHighlights', () => {
            test('應該清除 chrome.storage 和 localStorage 中的標註', async () => {
                mockChrome.storage.local.remove.mockImplementation((keys, callback) => {
                    callback();
                });

                localStorage.setItem(
                    'highlights_https://example.com/page',
                    JSON.stringify([{ text: 'test highlight' }])
                );

                await window.StorageUtil.clearHighlights('https://example.com/page');

                expect(mockChrome.storage.local.remove).toHaveBeenCalled();
                expect(localStorage.getItem('highlights_https://example.com/page')).toBeNull();
            });

            test('應該處理 chrome.storage 不可用的情況', async () => {
                // 模擬 chrome.storage 不可用
                const originalChrome = global.chrome;
                global.chrome = { storage: undefined };

                localStorage.setItem(
                    'highlights_https://example.com/page',
                    JSON.stringify([{ text: 'test highlight' }])
                );

                await window.StorageUtil.clearHighlights('https://example.com/page');

                expect(localStorage.getItem('highlights_https://example.com/page')).toBeNull();

                // 恢復 chrome 對象
                global.chrome = originalChrome;
            });
        });
    });

    describe('Logger', () => {
        beforeEach(() => {
            // Mock console 方法來驗證調用
            console.log = jest.fn();
            console.warn = jest.fn();
            console.error = jest.fn();
        });

        test('應該正確記錄 debug 信息', () => {
            window.Logger.debug('test message', 'arg1', 'arg2');
            expect(console.log).toHaveBeenCalledWith('[DEBUG] test message', 'arg1', 'arg2');
        });

        test('應該正確記錄 info 信息', () => {
            window.Logger.info('test message', 'arg1');
            expect(console.log).toHaveBeenCalledWith('[INFO] test message', 'arg1');
        });

        test('應該正確記錄 warn 信息', () => {
            window.Logger.warn('test message');
            expect(console.warn).toHaveBeenCalledWith('[WARN] test message');
        });

        test('應該正確記錄 error 信息', () => {
            window.Logger.error('test message', 'error');
            expect(console.error).toHaveBeenCalledWith('[ERROR] test message', 'error');
        });
    });
});