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

// Mock CSS Highlight API
global.CSS = {
    highlights: new Map()
};

// 重置模塊緩存並重新加載 seamless-migration.js
jest.resetModules();
require('../../scripts/seamless-migration.js');

describe('seamless-migration.js', () => {
    beforeEach(() => {
        // 清理 DOM
        document.body.innerHTML = '';

        // 清理 mock
        jest.clearAllMocks();
        mockChrome.runtime.lastError = null;

        // 重置 chrome.storage
        mockChrome.storage.local.get.mockImplementation((keys, callback) => {
            callback({});
        });
        mockChrome.storage.local.set.mockImplementation((_data, callback) => {
            callback();
        });
        mockChrome.storage.local.remove.mockImplementation((keys, callback) => {
            callback();
        });
    });

    describe('SeamlessMigrationManager', () => {
        /** @type {SeamlessMigrationManager} 遷移管理器實例,在 beforeEach 中初始化 */
        let migrationManager = null;
        /** @type {Object} 模擬的 HighlightManager,在 beforeEach 中初始化 */
        let mockHighlightManager = null;

        beforeEach(() => {
            migrationManager = new window.SeamlessMigrationManager();

            // Mock HighlightManager
            mockHighlightManager = {
                addHighlight: jest.fn(),
                getCount: jest.fn(),
                restoreHighlights: jest.fn()
            };
        });

        describe('getMigrationState', () => {
            test('應該獲取當前頁面的遷移狀態', async () => {
                const mockState = {
                    phase: 'not_started',
                    timestamp: Date.now()
                };

                mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                    const data = {
                        'seamless_migration_state_': mockState
                    };
                    callback(data);
                });

                const result = await migrationManager.getMigrationState();
                expect(result.phase).toBe('not_started');
            });

            test('應該處理無法讀取狀態的情況', async () => {
                mockChrome.storage.local.get.mockImplementation((_keys, _callback) => {
                    throw new Error('Storage error');
                });

                const result = await migrationManager.getMigrationState();
                expect(result.phase).toBe('not_started');
            });
        });

        describe('updateMigrationState', () => {
            test('應該更新遷移狀態', async () => {
                await migrationManager.updateMigrationState('phase_1', { test: 'data' });
                expect(mockChrome.storage.local.set).toHaveBeenCalled();
            });

            test('應該處理無法保存狀態的情況', async () => {
                mockChrome.storage.local.set.mockImplementation((_data, _callback) => {
                    throw new Error('Storage error');
                });

                await migrationManager.updateMigrationState('phase_1');
                // 不應該拋出異常
            });
        });

        describe('performSeamlessMigration', () => {
            test('應該檢查瀏覽器支持並跳過不支持的瀏覽器', async () => {
                const originalCSS = global.CSS;
                global.CSS = { highlights: undefined };

                const result = await migrationManager.performSeamlessMigration(mockHighlightManager);
                expect(result.skipped).toBe(true);
                expect(result.reason).toBe('browser_not_supported');

                global.CSS = originalCSS;
            });

            test('應該跳過沒有舊標註的頁面', async () => {
                mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                    callback({});
                });

                const result = await migrationManager.performSeamlessMigration(mockHighlightManager);
                expect(result.skipped).toBe(true);
                expect(result.reason).toBe('no_old_highlights');
            });
        });

        describe('phase1_CreateNewHighlights', () => {
            test('應該為舊標註創建新標註', async () => {
                // 創建舊標註
                const span = document.createElement('span');
                span.className = 'simple-highlight';
                span.textContent = 'test highlight';
                span.style.backgroundColor = 'rgb(255, 243, 205)';
                document.body.appendChild(span);

                // Mock HighlightManager.addHighlight
                mockHighlightManager.addHighlight.mockReturnValue('highlight-1');

                const result = await migrationManager.phase1_CreateNewHighlights(mockHighlightManager);

                expect(result.phase).toBe('phase_1');
                expect(mockHighlightManager.addHighlight).toHaveBeenCalled();
                expect(span.style.opacity).toBe('0');
                expect(span.style.pointerEvents).toBe('none');
            });

            test('應該處理沒有舊標註的情況', async () => {
                const result = await migrationManager.phase1_CreateNewHighlights(mockHighlightManager);
                expect(result.skipped).toBe(true);
                expect(result.reason).toBe('no_old_highlights');
            });
        });

        describe('phase2_VerifyAndHide', () => {
            test('應該驗證新標註並進入階段3', async () => {
                // 創建已遷移的舊標註
                const span = document.createElement('span');
                span.className = 'simple-highlight';
                span.setAttribute('data-migrated', 'true');
                document.body.appendChild(span);

                // Mock HighlightManager.getCount
                mockHighlightManager.getCount.mockReturnValue(1);

                const result = await migrationManager.phase2_VerifyAndHide(mockHighlightManager);
                expect(result.completed).toBe(true);
            });

            test('應該在新標註未恢復時回滾', async () => {
                // 創建已遷移的舊標註
                const span = document.createElement('span');
                span.className = 'simple-highlight';
                span.setAttribute('data-migrated', 'true');
                document.body.appendChild(span);

                // Mock HighlightManager.getCount
                mockHighlightManager.getCount.mockReturnValue(0);

                const result = await migrationManager.phase2_VerifyAndHide(mockHighlightManager);
                expect(result.rolledBack).toBe(true);
            });
        });

        describe('phase3_RemoveOldSpans', () => {
            test('應該完全移除舊span', async () => {
                // 創建已遷移的舊標註
                const span = document.createElement('span');
                span.className = 'simple-highlight';
                span.setAttribute('data-migrated', 'true');
                span.textContent = 'test highlight';
                document.body.appendChild(span);

                const result = await migrationManager.phase3_RemoveOldSpans(mockHighlightManager);

                expect(result.completed).toBe(true);
                expect(document.querySelectorAll('.simple-highlight[data-migrated="true"]').length).toBe(0);
            });
        });

        describe('rollback', () => {
            test('應該恢復舊標註顯示', async () => {
                // 創建已遷移的舊標註
                const span = document.createElement('span');
                span.className = 'simple-highlight';
                span.setAttribute('data-migrated', 'true');
                span.style.opacity = '0';
                document.body.appendChild(span);

                const result = await migrationManager.rollback('test_reason');

                expect(result.rolledBack).toBe(true);
                expect(span.style.opacity).toBe('1');
                expect(span.style.pointerEvents).toBe('auto');
                expect(span.hasAttribute('data-migrated')).toBe(false);
            });
        });

        describe('checkBrowserSupport', () => {
            test('應該檢查瀏覽器支持', () => {
                const result = window.SeamlessMigrationManager.checkBrowserSupport();
                expect(result).toBe(true);
            });

            test('應該在不支持時返回false', () => {
                const originalCSS = global.CSS;
                global.CSS = { highlights: undefined };

                const result = window.SeamlessMigrationManager.checkBrowserSupport();
                expect(result).toBe(false);

                global.CSS = originalCSS;
            });
        });

        describe('convertColorToName', () => {
            test('應該轉換顏色值', () => {
                expect(window.SeamlessMigrationManager.convertColorToName('rgb(255, 243, 205)')).toBe('yellow');
                expect(window.SeamlessMigrationManager.convertColorToName('rgb(212, 237, 218)')).toBe('green');
                expect(window.SeamlessMigrationManager.convertColorToName('unknown')).toBe('yellow');
            });
        });
    });
});