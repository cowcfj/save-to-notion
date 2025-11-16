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

// Mock StorageUtil
global.window = {
    StorageUtil: {
        saveHighlights: jest.fn(),
        loadHighlights: jest.fn()
    }
};

// 重置模塊緩存並重新加載 highlighter-migration.js
jest.resetModules();
require('../../scripts/highlighter-migration.js');

describe('highlighter-migration.js', () => {
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
        mockChrome.storage.local.set.mockImplementation((data, callback) => {
            if (callback) callback();
        });

        // 清理 console spies
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('HighlightMigrationManager - 構造函數', () => {
        test('應該正確初始化', () => {
            const manager = new window.HighlightMigrationManager();

            expect(manager.migrationKey).toBe('highlight_migration_status');
            expect(manager.oldHighlightsFound).toBe(0);
            expect(manager.migratedCount).toBe(0);
            expect(manager.failedCount).toBe(0);
        });
    });

    describe('needsMigration', () => {
        test('應該在已完成遷移時返回 false', async () => {
            const manager = new window.HighlightMigrationManager();

            // Mock getMigrationStatus 返回 'completed'
            mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                callback({
                    [`highlight_migration_status_${window.location.href}`]: 'completed'
                });
            });

            const result = await manager.needsMigration();
            expect(result).toBe(false);
        });

        test('應該在檢測到舊版標註時返回 true', async () => {
            const manager = new window.HighlightMigrationManager();

            // 創建舊版標註
            const span = document.createElement('span');
            span.className = 'simple-highlight';
            span.textContent = 'test highlight';
            document.body.appendChild(span);

            mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                callback({});
            });

            const result = await manager.needsMigration();
            expect(result).toBe(true);
            expect(manager.oldHighlightsFound).toBe(1);
        });

        test('應該在沒有舊版標註時返回 false', async () => {
            const manager = new window.HighlightMigrationManager();

            mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                callback({});
            });

            const result = await manager.needsMigration();
            expect(result).toBe(false);
            expect(manager.oldHighlightsFound).toBe(0);
        });

        test('應該正確計算舊版標註數量', async () => {
            const manager = new window.HighlightMigrationManager();

            // 創建多個舊版標註
            for (let i = 0; i < 5; i++) {
                const span = document.createElement('span');
                span.className = 'simple-highlight';
                span.textContent = `highlight ${i}`;
                document.body.appendChild(span);
            }

            mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                callback({});
            });

            const result = await manager.needsMigration();
            expect(result).toBe(true);
            expect(manager.oldHighlightsFound).toBe(5);
        });
    });

    describe('getMigrationStatus', () => {
        test('應該獲取遷移狀態', async () => {
            const manager = new window.HighlightMigrationManager();

            mockChrome.storage.local.get.mockImplementation((keys) => {
                const result = {};
                // keys 可能是字符串或數組，這裡處理字符串情況
                const key = typeof keys === 'string' ? keys : keys[0];
                result[key] = 'completed';
                return Promise.resolve(result);
            });

            const status = await manager.getMigrationStatus();
            expect(status).toBe('completed');
        });

        test('應該在無數據時返回 pending', async () => {
            const manager = new window.HighlightMigrationManager();

            mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                callback({});
            });

            const status = await manager.getMigrationStatus();
            expect(status).toBe('pending');
        });

        test('應該處理讀取錯誤', async () => {
            const manager = new window.HighlightMigrationManager();

            mockChrome.storage.local.get.mockImplementation(() => {
                throw new Error('Storage error');
            });

            const status = await manager.getMigrationStatus();
            expect(status).toBe('pending');
            expect(console.warn).toHaveBeenCalled();
        });
    });

    describe('setMigrationStatus', () => {
        test('應該保存遷移狀態', async () => {
            const manager = new window.HighlightMigrationManager();

            await manager.setMigrationStatus('completed');

            expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    [`highlight_migration_status_${window.location.href}`]: 'completed'
                })
            );
        });

        test('應該處理保存錯誤', async () => {
            const manager = new window.HighlightMigrationManager();

            mockChrome.storage.local.set.mockImplementation(() => {
                throw new Error('Storage error');
            });

            await manager.setMigrationStatus('completed');
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe('convertColorToName', () => {
        test('應該轉換 RGB 顏色值', () => {
            expect(window.HighlightMigrationManager.convertColorToName('rgb(255, 243, 205)')).toBe('yellow');
            expect(window.HighlightMigrationManager.convertColorToName('rgb(212, 237, 218)')).toBe('green');
            expect(window.HighlightMigrationManager.convertColorToName('rgb(204, 231, 255)')).toBe('blue');
            expect(window.HighlightMigrationManager.convertColorToName('rgb(248, 215, 218)')).toBe('red');
        });

        test('應該轉換十六進制顏色值', () => {
            expect(window.HighlightMigrationManager.convertColorToName('#fff3cd')).toBe('yellow');
            expect(window.HighlightMigrationManager.convertColorToName('#d4edda')).toBe('green');
            expect(window.HighlightMigrationManager.convertColorToName('#cce7ff')).toBe('blue');
            expect(window.HighlightMigrationManager.convertColorToName('#f8d7da')).toBe('red');
        });

        test('應該為未知顏色返回默認值', () => {
            expect(window.HighlightMigrationManager.convertColorToName('rgb(0, 0, 0)')).toBe('yellow');
            expect(window.HighlightMigrationManager.convertColorToName('unknown')).toBe('yellow');
            expect(window.HighlightMigrationManager.convertColorToName('')).toBe('yellow');
        });
    });

    describe('removeOldSpan', () => {
        test('應該移除舊標註並保留文本', () => {
            const parent = document.createElement('div');
            const span = document.createElement('span');
            span.className = 'simple-highlight';
            span.textContent = 'highlighted text';
            parent.appendChild(document.createTextNode('before '));
            parent.appendChild(span);
            parent.appendChild(document.createTextNode(' after'));
            document.body.appendChild(parent);

            HighlightMigrationManager.removeOldSpan(span);

            expect(parent.querySelector('.simple-highlight')).toBeNull();
            expect(parent.textContent).toBe('before highlighted text after');
        });

        test('應該處理包含多個子節點的 span', () => {
            const parent = document.createElement('div');
            const span = document.createElement('span');
            span.className = 'simple-highlight';

            const text1 = document.createTextNode('part1 ');
            const text2 = document.createTextNode('part2');
            span.appendChild(text1);
            span.appendChild(text2);
            parent.appendChild(span);
            document.body.appendChild(parent);

            HighlightMigrationManager.removeOldSpan(span);

            expect(parent.querySelector('.simple-highlight')).toBeNull();
            expect(parent.textContent).toBe('part1 part2');
        });

        test('應該處理移除錯誤', () => {
            const span = document.createElement('span');
            span.className = 'simple-highlight';
            // span 沒有父節點，會導致錯誤

            HighlightMigrationManager.removeOldSpan(span);
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe('migrateSpanToRange', () => {
        test('應該成功遷移標註', () => {
            const span = document.createElement('span');
            span.className = 'simple-highlight';
            span.textContent = 'test highlight text';
            span.style.backgroundColor = 'rgb(255, 243, 205)';
            const parent = document.createElement('div');
            parent.appendChild(span);
            document.body.appendChild(parent);

            const mockHighlightManager = {
                addHighlight: jest.fn().mockReturnValue('highlight-123')
            };

            const result = HighlightMigrationManager.migrateSpanToRange(span, mockHighlightManager);

            expect(result).toEqual({
                id: 'highlight-123',
                text: 'test highlight text',
                color: 'yellow'
            });
            expect(mockHighlightManager.addHighlight).toHaveBeenCalled();
        });

        test('應該在 addHighlight 失敗時返回 null', () => {
            const span = document.createElement('span');
            span.className = 'simple-highlight';
            span.textContent = 'test';
            span.style.backgroundColor = 'rgb(255, 243, 205)';
            document.body.appendChild(span);

            const mockHighlightManager = {
                addHighlight: jest.fn().mockReturnValue(null)
            };

            const result = HighlightMigrationManager.migrateSpanToRange(span, mockHighlightManager);
            expect(result).toBeNull();
        });

        test('應該處理遷移過程中的錯誤', () => {
            const span = document.createElement('span');
            span.className = 'simple-highlight';
            span.textContent = 'test';
            document.body.appendChild(span);

            const mockHighlightManager = {
                addHighlight: jest.fn().mockImplementation(() => {
                    throw new Error('Migration error');
                })
            };

            const result = HighlightMigrationManager.migrateSpanToRange(span, mockHighlightManager);
            expect(result).toBeNull();
            expect(console.error).toHaveBeenCalled();
        });

        test('應該正確識別不同顏色的標註', () => {
            const colors = [
                { bg: 'rgb(255, 243, 205)', expected: 'yellow' },
                { bg: 'rgb(212, 237, 218)', expected: 'green' },
                { bg: 'rgb(204, 231, 255)', expected: 'blue' },
                { bg: 'rgb(248, 215, 218)', expected: 'red' }
            ];

            colors.forEach(({ bg, expected }) => {
                const span = document.createElement('span');
                span.className = 'simple-highlight';
                span.textContent = 'test';
                span.style.backgroundColor = bg;
                const parent = document.createElement('div');
                parent.appendChild(span);
                document.body.appendChild(parent);

                const mockHighlightManager = {
                    addHighlight: jest.fn((range, color) => {
                        expect(color).toBe(expected);
                        return 'highlight-id';
                    })
                };

                HighlightMigrationManager.migrateSpanToRange(span, mockHighlightManager);
                document.body.removeChild(parent);
            });
        });
    });

    describe('autoMigrate', () => {
        test('應該遷移所有舊標註', async () => {
            const manager = new window.HighlightMigrationManager();

            // 創建多個舊標註
            for (let i = 0; i < 3; i++) {
                const span = document.createElement('span');
                span.className = 'simple-highlight';
                span.textContent = `highlight ${i}`;
                span.style.backgroundColor = 'rgb(255, 243, 205)';
                const parent = document.createElement('div');
                parent.appendChild(span);
                document.body.appendChild(parent);
            }

            // 設置 oldHighlightsFound
            manager.oldHighlightsFound = 3;

            const mockHighlightManager = {
                addHighlight: jest.fn().mockReturnValue('highlight-id')
            };

            const result = await manager.autoMigrate(mockHighlightManager);

            expect(result.total).toBe(3);
            expect(result.migrated).toBe(3);
            expect(result.failed).toBe(0);
            expect(result.data).toHaveLength(3);
            expect(mockChrome.storage.local.set).toHaveBeenCalled();
        });

        test('應該記錄失敗的遷移', async () => {
            const manager = new window.HighlightMigrationManager();

            // 創建標註
            const span1 = document.createElement('span');
            span1.className = 'simple-highlight';
            span1.textContent = 'success';
            span1.style.backgroundColor = 'rgb(255, 243, 205)';
            const parent1 = document.createElement('div');
            parent1.appendChild(span1);
            document.body.appendChild(parent1);

            const span2 = document.createElement('span');
            span2.className = 'simple-highlight';
            span2.textContent = 'fail';
            span2.style.backgroundColor = 'rgb(255, 243, 205)';
            const parent2 = document.createElement('div');
            parent2.appendChild(span2);
            document.body.appendChild(parent2);

            let callCount = 0;
            const mockHighlightManager = {
                addHighlight: jest.fn(() => {
                    callCount++;
                    return callCount === 1 ? 'highlight-id' : null;
                })
            };

            const result = await manager.autoMigrate(mockHighlightManager);

            expect(result.migrated).toBe(1);
            expect(result.failed).toBe(1);
        });

        test('應該處理空的舊標註列表', async () => {
            const manager = new window.HighlightMigrationManager();
            const mockHighlightManager = {
                addHighlight: jest.fn()
            };

            const result = await manager.autoMigrate(mockHighlightManager);

            expect(result.total).toBe(0);
            expect(result.migrated).toBe(0);
            expect(result.failed).toBe(0);
        });
    });

    describe('removeMigrationUI', () => {
        test('應該移除對話框和遮罩', () => {
            const dialog = document.createElement('div');
            dialog.id = 'highlight-migration-dialog';
            document.body.appendChild(dialog);

            const overlay = document.createElement('div');
            overlay.id = 'highlight-migration-overlay';
            document.body.appendChild(overlay);

            window.HighlightMigrationManager.removeMigrationUI();

            expect(document.getElementById('highlight-migration-dialog')).toBeNull();
            expect(document.getElementById('highlight-migration-overlay')).toBeNull();
        });

        test('應該處理 UI 元素不存在的情況', () => {
            // 不應該拋出錯誤
            expect(() => window.HighlightMigrationManager.removeMigrationUI()).not.toThrow();
        });
    });

    describe('showMigrationPrompt', () => {
        test('應該創建遷移提示 UI', () => {
            const manager = new window.HighlightMigrationManager();
            manager.oldHighlightsFound = 5;

            manager.showMigrationPrompt();

            const dialog = document.getElementById('highlight-migration-dialog');
            const overlay = document.getElementById('highlight-migration-overlay');

            expect(dialog).not.toBeNull();
            expect(overlay).not.toBeNull();
            expect(dialog.innerHTML).toContain('5');
        });

        test('應該在點擊遷移按鈕時 resolve migrate', async () => {
            const manager = new window.HighlightMigrationManager();
            manager.oldHighlightsFound = 5;

            const promise = manager.showMigrationPrompt();

            // 點擊遷移按鈕
            const migrateBtn = document.getElementById('migration-migrate');
            migrateBtn.click();

            const result = await promise;
            expect(result).toBe('migrate');
        });

        test('應該在點擊保持舊版按鈕時 resolve keep', async () => {
            const manager = new window.HighlightMigrationManager();
            manager.oldHighlightsFound = 5;

            const promise = manager.showMigrationPrompt();

            // 點擊保持舊版按鈕
            const keepBtn = document.getElementById('migration-keep-old');
            keepBtn.click();

            const result = await promise;
            expect(result).toBe('keep');
        });
    });

    describe('showMigrationResult', () => {
        test('應該顯示成功的遷移結果', () => {
            jest.useFakeTimers();

            window.HighlightMigrationManager.showMigrationResult({
                total: 10,
                migrated: 10,
                failed: 0
            });

            const notifications = document.querySelectorAll('div');
            const notification = Array.from(notifications).find(
                el => el.innerHTML?.includes('遷移完成')
            );

            expect(notification).not.toBeNull();
            expect(notification.innerHTML).toContain('10 / 10');
            expect(notification.innerHTML).toContain('✅');

            jest.advanceTimersByTime(3000);
            jest.useRealTimers();
        });

        test('應該顯示部分成功的遷移結果', () => {
            window.HighlightMigrationManager.showMigrationResult({
                total: 10,
                migrated: 6,
                failed: 4
            });

            const notifications = document.querySelectorAll('div');
            const notification = Array.from(notifications).find(
                el => el.innerHTML?.includes('遷移完成')
            );

            expect(notification).not.toBeNull();
            expect(notification.innerHTML).toContain('6 / 10');
            expect(notification.innerHTML).toContain('失敗: 4');
            expect(notification.innerHTML).toContain('⚠️');
        });

        test('應該顯示失敗的遷移結果', () => {
            window.HighlightMigrationManager.showMigrationResult({
                total: 10,
                migrated: 2,
                failed: 8
            });

            const notifications = document.querySelectorAll('div');
            const notification = Array.from(notifications).find(
                el => el.innerHTML?.includes('遷移完成')
            );

            expect(notification).not.toBeNull();
            expect(notification.innerHTML).toContain('❌');
        });
    });

    describe('performMigration', () => {
        test('應該在無需遷移時跳過', async () => {
            const manager = new window.HighlightMigrationManager();

            mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                callback({
                    [`highlight_migration_status_${window.location.href}`]: 'completed'
                });
            });

            const mockHighlightManager = {
                addHighlight: jest.fn()
            };

            const result = await manager.performMigration(mockHighlightManager);

            expect(result.skipped).toBe(true);
            expect(mockHighlightManager.addHighlight).not.toHaveBeenCalled();
        });

        test('應該在用戶拒絕時跳過遷移', async () => {
            const manager = new window.HighlightMigrationManager();

            // 創建舊標註
            const span = document.createElement('span');
            span.className = 'simple-highlight';
            span.textContent = 'test';
            document.body.appendChild(span);

            mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                callback({});
            });

            // Mock showMigrationPrompt 返回 'keep'
            manager.showMigrationPrompt = jest.fn().mockResolvedValue('keep');

            const mockHighlightManager = {
                addHighlight: jest.fn()
            };

            const result = await manager.performMigration(mockHighlightManager);

            expect(result.skipped).toBe(true);
            expect(result.reason).toBe('user_declined');
            expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    [`highlight_migration_status_${window.location.href}`]: 'skipped'
                })
            );
        });

        test('應該在用戶同意時執行完整遷移', async () => {
            const manager = new window.HighlightMigrationManager();

            // 創建舊標註
            const span = document.createElement('span');
            span.className = 'simple-highlight';
            span.textContent = 'test';
            span.style.backgroundColor = 'rgb(255, 243, 205)';
            const parent = document.createElement('div');
            parent.appendChild(span);
            document.body.appendChild(parent);

            mockChrome.storage.local.get.mockImplementation((keys, callback) => {
                callback({});
            });

            // Mock showMigrationPrompt 返回 'migrate'
            manager.showMigrationPrompt = jest.fn().mockResolvedValue('migrate');

            // Spy on static method
            const showResultSpy = jest
                .spyOn(window.HighlightMigrationManager, 'showMigrationResult')
                .mockImplementation(() => undefined);

            const mockHighlightManager = {
                addHighlight: jest.fn().mockReturnValue('highlight-id')
            };

            const result = await manager.performMigration(mockHighlightManager);

            expect(result.migrated).toBe(1);
            expect(showResultSpy).toHaveBeenCalled();

            showResultSpy.mockRestore();
        });
    });

    describe('全局導出', () => {
        test('應該導出到 window.HighlightMigrationManager', () => {
            expect(window.HighlightMigrationManager).toBeDefined();
            expect(typeof window.HighlightMigrationManager).toBe('function');
        });

        test('應該能夠實例化', () => {
            const instance = new window.HighlightMigrationManager();
            expect(instance).toBeInstanceOf(window.HighlightMigrationManager);
        });
    });
});
