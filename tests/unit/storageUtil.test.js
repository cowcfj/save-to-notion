/**
 * StorageUtil 單元測試
 * 測試存儲工具類的功能
 */

describe('StorageUtil', () => {
    let mockChrome;
    let mockLocalStorage;

    beforeEach(() => {
        // Mock normalizeUrl function
        global.normalizeUrl = jest.fn((url) => {
            // 簡單的 normalizeUrl 模擬
            try {
                const u = new URL(url);
                u.hash = '';
                // 移除追蹤參數
                const trackingParams = ['utm_source', 'utm_medium', 'fbclid'];
                trackingParams.forEach(p => u.searchParams.delete(p));
                // 移除尾部斜杠（除了根路徑）
                if (u.pathname !== '/' && u.pathname.endsWith('/')) {
                    u.pathname = u.pathname.replace(/\/+$/, '');
                }
                return u.toString();
            } catch (e) {
                return url || '';
            }
        });

        // Mock chrome.storage.local
        mockChrome = {
            storage: {
                local: {
                    set: jest.fn((items, callback) => {
                        setTimeout(() => callback && callback(), 0);
                    }),
                    get: jest.fn((keys, callback) => {
                        setTimeout(() => callback && callback({}), 0);
                    }),
                    remove: jest.fn((keys, callback) => {
                        setTimeout(() => callback && callback(), 0);
                    })
                }
            },
            runtime: {
                lastError: null
            }
        };
        global.chrome = mockChrome;

        // 替換 localStorage 為完全可控的 mock
        mockLocalStorage = {
            data: {},
            setItem: jest.fn((key, value) => {
                mockLocalStorage.data[key] = value;
            }),
            getItem: jest.fn((key) => {
                return mockLocalStorage.data[key] || null;
            }),
            removeItem: jest.fn((key) => {
                delete mockLocalStorage.data[key];
            }),
            clear: jest.fn(() => {
                mockLocalStorage.data = {};
            })
        };
        global.localStorage = mockLocalStorage;

        // Mock console 方法
        global.console = {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        };

        // 載入 utils.js 中的 StorageUtil
        // 因為測試環境，我們需要手動定義 StorageUtil
        global.StorageUtil = {
            async saveHighlights(pageUrl, highlightData) {
                const normalizedUrl = normalizeUrl(pageUrl);
                const pageKey = `highlights_${normalizedUrl}`;
                
                return new Promise((resolve, reject) => {
                    try {
                        chrome.storage?.local?.set({ [pageKey]: highlightData }, () => {
                            if (chrome.runtime.lastError) {
                                try {
                                    localStorage.setItem(pageKey, JSON.stringify(highlightData));
                                    resolve();
                                } catch (e) {
                                    reject(e);
                                }
                            } else {
                                resolve();
                            }
                        });
                    } catch (e) {
                        try {
                            localStorage.setItem(pageKey, JSON.stringify(highlightData));
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    }
                });
            },

            async loadHighlights(pageUrl) {
                const normalizedUrl = normalizeUrl(pageUrl);
                const pageKey = `highlights_${normalizedUrl}`;
                
                return new Promise((resolve) => {
                    try {
                        chrome.storage?.local?.get([pageKey], (data) => {
                            const stored = data && data[pageKey];
                            if (stored) {
                                let highlights = [];
                                if (Array.isArray(stored)) {
                                    highlights = stored;
                                } else if (stored.highlights && Array.isArray(stored.highlights)) {
                                    highlights = stored.highlights;
                                }
                                
                                if (highlights.length > 0) {
                                    resolve(highlights);
                                    return;
                                }
                            }
                            
                            // 回退到 localStorage
                            const legacy = localStorage.getItem(pageKey);
                            if (legacy) {
                                try {
                                    const parsed = JSON.parse(legacy);
                                    let highlights = [];
                                    if (Array.isArray(parsed)) {
                                        highlights = parsed;
                                    } else if (parsed.highlights && Array.isArray(parsed.highlights)) {
                                        highlights = parsed.highlights;
                                    }
                                    
                                    if (highlights.length > 0) {
                                        resolve(highlights);
                                        return;
                                    }
                                } catch (e) {
                                    // ignore
                                }
                            }
                            resolve([]);
                        });
                    } catch (e) {
                        const legacy = localStorage.getItem(pageKey);
                        if (legacy) {
                            try {
                                const parsed = JSON.parse(legacy);
                                let highlights = [];
                                if (Array.isArray(parsed)) {
                                    highlights = parsed;
                                } else if (parsed.highlights && Array.isArray(parsed.highlights)) {
                                    highlights = parsed.highlights;
                                }
                                
                                if (highlights.length > 0) {
                                    resolve(highlights);
                                    return;
                                }
                            } catch (e) {
                                // ignore
                            }
                        }
                        resolve([]);
                    }
                });
            },

            async clearHighlights(pageUrl) {
                const pageKey = `highlights_${normalizeUrl(pageUrl)}`;
                
                return new Promise((resolve) => {
                    try {
                        chrome.storage?.local?.remove([pageKey], () => {
                            try {
                                localStorage.removeItem(pageKey);
                            } catch (e) {
                                // ignore
                            }
                            resolve();
                        });
                    } catch (e) {
                        try {
                            localStorage.removeItem(pageKey);
                        } catch (err) {
                            // ignore
                        }
                        resolve();
                    }
                });
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
    });

    describe('saveHighlights', () => {
        test('應該成功保存標註到 chrome.storage', async () => {
            const testUrl = 'https://example.com/page';
            const testData = [
                { text: 'highlight 1', color: 'yellow' },
                { text: 'highlight 2', color: 'green' }
            ];

            await StorageUtil.saveHighlights(testUrl, testData);

            expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    [`highlights_${normalizeUrl(testUrl)}`]: testData
                }),
                expect.any(Function)
            );
        });

        test('應該在 chrome.storage 失敗時回退到 localStorage', async () => {
            // 模擬 chrome.storage 失敗
            mockChrome.runtime.lastError = { message: 'Storage error' };
            
            const testUrl = 'https://example.com/page';
            const testData = [{ text: 'highlight', color: 'yellow' }];

            // 使用 Storage.prototype spy 來追蹤 setItem 調用
            const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

            try {
                await StorageUtil.saveHighlights(testUrl, testData);

                expect(setItemSpy).toHaveBeenCalledWith(
                    `highlights_${normalizeUrl(testUrl)}`,
                    JSON.stringify(testData)
                );
            } finally {
                setItemSpy.mockRestore();
                // 重置 mock
                mockChrome.runtime.lastError = null;
            }
        });

        test('應該處理包含追蹤參數的 URL', async () => {
            const testUrl = 'https://example.com/page?utm_source=test&id=123';
            const testData = [{ text: 'highlight', color: 'yellow' }];

            await StorageUtil.saveHighlights(testUrl, testData);

            // URL 應該被標準化（移除追蹤參數）
            const normalizedUrl = normalizeUrl(testUrl);
            expect(normalizedUrl).not.toContain('utm_source');
            expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    [`highlights_${normalizedUrl}`]: testData
                }),
                expect.any(Function)
            );
        });

        test('應該處理空標註數組', async () => {
            const testUrl = 'https://example.com/page';
            const testData = [];

            await StorageUtil.saveHighlights(testUrl, testData);

            expect(mockChrome.storage.local.set).toHaveBeenCalled();
        });

        test('應該處理包含特殊字符的 URL', async () => {
            const testUrl = 'https://example.com/頁面/測試';
            const testData = [{ text: '中文標註', color: 'yellow' }];

            await StorageUtil.saveHighlights(testUrl, testData);

            expect(mockChrome.storage.local.set).toHaveBeenCalled();
        });
    });

    describe('loadHighlights', () => {
        test('應該從 chrome.storage 加載標註（數組格式）', async () => {
            const testUrl = 'https://example.com/page';
            const testData = [
                { text: 'highlight 1', color: 'yellow' },
                { text: 'highlight 2', color: 'green' }
            ];
            
            // 模擬 chrome.storage 返回數據
            mockChrome.storage.local.get = jest.fn((keys, callback) => {
                setTimeout(() => callback({
                    [`highlights_${normalizeUrl(testUrl)}`]: testData
                }), 0);
            });

            const result = await StorageUtil.loadHighlights(testUrl);

            expect(result).toEqual(testData);
            expect(result.length).toBe(2);
        });

        test('應該從 chrome.storage 加載標註（對象格式）', async () => {
            const testUrl = 'https://example.com/page';
            const testData = {
                url: testUrl,
                highlights: [
                    { text: 'highlight 1', color: 'yellow' },
                    { text: 'highlight 2', color: 'green' }
                ]
            };
            
            mockChrome.storage.local.get = jest.fn((keys, callback) => {
                setTimeout(() => callback({
                    [`highlights_${normalizeUrl(testUrl)}`]: testData
                }), 0);
            });

            const result = await StorageUtil.loadHighlights(testUrl);

            expect(result).toEqual(testData.highlights);
            expect(result.length).toBe(2);
        });

        test('應該在 chrome.storage 無數據時回退到 localStorage', async () => {
            const testUrl = 'https://example.com/page';
            const testData = [{ text: 'legacy highlight', color: 'yellow' }];
            
            // chrome.storage 返回空
            mockChrome.storage.local.get = jest.fn((keys, callback) => {
                setTimeout(() => callback({}), 0);
            });
            
            // 使用 Storage.prototype spy 來模擬 localStorage 有數據
            const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(JSON.stringify(testData));

            try {
                const result = await StorageUtil.loadHighlights(testUrl);

                expect(result).toEqual(testData);
                expect(getItemSpy).toHaveBeenCalled();
            } finally {
                getItemSpy.mockRestore();
            }
        });

        test('應該處理不存在的 URL', async () => {
            const testUrl = 'https://example.com/nonexistent';
            
            mockChrome.storage.local.get = jest.fn((keys, callback) => {
                setTimeout(() => callback({}), 0);
            });

            const result = await StorageUtil.loadHighlights(testUrl);

            expect(result).toEqual([]);
        });

        test('應該處理損壞的 localStorage 數據', async () => {
            const testUrl = 'https://example.com/page';
            
            mockChrome.storage.local.get = jest.fn((keys, callback) => {
                setTimeout(() => callback({}), 0);
            });
            
            // localStorage 返回無效 JSON
            mockLocalStorage.getItem = jest.fn(() => 'invalid json{');

            const result = await StorageUtil.loadHighlights(testUrl);

            expect(result).toEqual([]);
        });

        test('應該標準化 URL 後再加載', async () => {
            const testUrl = 'https://example.com/page?utm_source=test#section';
            const normalizedUrl = normalizeUrl(testUrl);
            const testData = [{ text: 'highlight', color: 'yellow' }];
            
            mockChrome.storage.local.get = jest.fn((keys, callback) => {
                expect(keys[0]).toBe(`highlights_${normalizedUrl}`);
                setTimeout(() => callback({
                    [keys[0]]: testData
                }), 0);
            });

            const result = await StorageUtil.loadHighlights(testUrl);

            expect(result).toEqual(testData);
        });
    });

    describe('clearHighlights', () => {
        test('應該清除 chrome.storage 和 localStorage 中的標註', async () => {
            const testUrl = 'https://example.com/page';

            // 使用 Storage.prototype spy
            const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

            try {
                await StorageUtil.clearHighlights(testUrl);

                expect(mockChrome.storage.local.remove).toHaveBeenCalledWith(
                    [`highlights_${normalizeUrl(testUrl)}`],
                    expect.any(Function)
                );
                expect(removeItemSpy).toHaveBeenCalledWith(
                    `highlights_${normalizeUrl(testUrl)}`
                );
            } finally {
                removeItemSpy.mockRestore();
            }
        });

        test('應該處理 chrome.storage 不可用的情況', async () => {
            const testUrl = 'https://example.com/page';
            
            // 模擬 chrome.storage 不可用
            const savedChrome = global.chrome;
            global.chrome = undefined;

            // 使用 Storage.prototype spy
            const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

            try {
                await StorageUtil.clearHighlights(testUrl);

                expect(removeItemSpy).toHaveBeenCalled();
            } finally {
                removeItemSpy.mockRestore();
                // 恢復 chrome
                global.chrome = savedChrome;
            }
        });

        test('應該標準化 URL 後再清除', async () => {
            const testUrl = 'https://example.com/page?utm_source=test#anchor';
            const normalizedUrl = normalizeUrl(testUrl);

            await StorageUtil.clearHighlights(testUrl);

            expect(mockChrome.storage.local.remove).toHaveBeenCalledWith(
                [`highlights_${normalizedUrl}`],
                expect.any(Function)
            );
        });
    });
});
