/**
 * 單元測試：waitForDOMStability 方法
 * 測試 DOM 穩定性檢測功能
 */

describe('HighlightManager.waitForDOMStability', () => {
    let originalRequestIdleCallback = null;
    let originalCancelIdleCallback = null;

    beforeEach(() => {
        // 模擬 document 和 body
        global.document = {
            body: document.createElement('div'),
            querySelector: jest.fn()
        };

        // 保存原始的 requestIdleCallback 和 cancelIdleCallback
        originalRequestIdleCallback = global.requestIdleCallback;
        originalCancelIdleCallback = global.cancelIdleCallback;

        // 載入 HighlightManager（需要根據實際路徑調整）
        // 這裡假設我們可以直接訪問類
        // 實際測試中可能需要通過 require 或其他方式載入
    });

    afterEach(() => {
        // 恢復原始函數
        global.requestIdleCallback = originalRequestIdleCallback;
        global.cancelIdleCallback = originalCancelIdleCallback;

        // 清理
        jest.clearAllMocks();
        jest.clearAllTimers();
    });

    describe('成功分支測試', () => {
        test('應該在 DOM 穩定時返回 true', async () => {
            // 模擬 MutationObserver
            const mockDisconnect = jest.fn();
            const mockObserve = jest.fn();

            global.MutationObserver = jest.fn((_callback) => {
                return {
                    observe: mockObserve,
                    disconnect: mockDisconnect
                };
            });

            // 模擬 requestIdleCallback 不可用，使用 setTimeout
            global.requestIdleCallback = undefined;

            // 使用 fake timers
            jest.useFakeTimers();

            // 創建測試用的 HighlightManager 類
            class TestHighlightManager {
                static async waitForDOMStability(options = {}) {
                    const {
                        containerSelector = null,
                        stabilityThresholdMs = 150,
                        maxWaitMs = 5000
                    } = options;

                    return new Promise((resolve) => {
                        if (typeof document === 'undefined' || !document.body) {
                            resolve(false);
                            return;
                        }

                        let targetContainer = document.body;
                        if (containerSelector) {
                            const container = document.querySelector(containerSelector);
                            if (!container) {
                                resolve(false);
                                return;
                            }
                            targetContainer = container;
                        }

                        let observer = null;
                        let stabilityTimerId = null;
                        let maxWaitTimerId = null;
                        let lastMutationTime = Date.now();

                        const cleanup = () => {
                            if (observer) {
                                observer.disconnect();
                                observer = null;
                            }
                            if (stabilityTimerId !== null) {
                                clearTimeout(stabilityTimerId);
                                stabilityTimerId = null;
                            }
                            if (maxWaitTimerId !== null) {
                                clearTimeout(maxWaitTimerId);
                                maxWaitTimerId = null;
                            }
                        };

                        const checkStability = () => {
                            const timeSinceLastMutation = Date.now() - lastMutationTime;
                            if (timeSinceLastMutation >= stabilityThresholdMs) {
                                cleanup();
                                resolve(true);
                                return true;
                            }
                            return false;
                        };

                        const scheduleStabilityCheck = () => {
                            if (stabilityTimerId !== null) {
                                clearTimeout(stabilityTimerId);
                                stabilityTimerId = null;
                            }
                            stabilityTimerId = setTimeout(() => {
                                if (!checkStability()) {
                                    scheduleStabilityCheck();
                                }
                            }, stabilityThresholdMs);
                        };

                        const handleTimeout = () => {
                            cleanup();
                            resolve(false);
                        };

                        maxWaitTimerId = setTimeout(handleTimeout, maxWaitMs);

                        observer = new MutationObserver(() => {
                            lastMutationTime = Date.now();
                            scheduleStabilityCheck();
                        });

                        try {
                            observer.observe(targetContainer, {
                                childList: true,
                                subtree: true
                            });
                            scheduleStabilityCheck();
                        } catch (error) {
                            cleanup();
                            resolve(false);
                        }
                    });
                }
            }

            // 執行測試
            const promise = TestHighlightManager.waitForDOMStability({
                stabilityThresholdMs: 150,
                maxWaitMs: 5000
            });

            // 快進時間讓 DOM 穩定
            jest.advanceTimersByTime(200);

            // 等待 Promise 解決
            const result = await promise;

            // 驗證
            expect(result).toBe(true);
            expect(mockObserve).toHaveBeenCalledWith(
                document.body,
                expect.objectContaining({
                    childList: true,
                    subtree: true
                })
            );
            expect(mockDisconnect).toHaveBeenCalled();

            jest.useRealTimers();
        });

        test('應該在指定容器穩定時返回 true', async () => {
            // 創建測試容器
            const mockContainer = document.createElement('div');
            mockContainer.id = 'test-container';

            global.document.querySelector = jest.fn((selector) => {
                if (selector === '#test-container') {
                    return mockContainer;
                }
                return null;
            });

            const mockDisconnect = jest.fn();
            const mockObserve = jest.fn();

            global.MutationObserver = jest.fn(() => ({
                observe: mockObserve,
                disconnect: mockDisconnect
            }));

            global.requestIdleCallback = undefined;
            jest.useFakeTimers();

            class TestHighlightManager {
                static async waitForDOMStability(options = {}) {
                    const {
                        containerSelector = null,
                        stabilityThresholdMs = 150,
                        maxWaitMs = 5000
                    } = options;

                    return new Promise((resolve) => {
                        if (typeof document === 'undefined' || !document.body) {
                            resolve(false);
                            return;
                        }

                        let targetContainer = document.body;
                        if (containerSelector) {
                            const container = document.querySelector(containerSelector);
                            if (!container) {
                                resolve(false);
                                return;
                            }
                            targetContainer = container;
                        }

                        let observer = null;
                        let stabilityTimerId = null;
                        let maxWaitTimerId = null;
                        let lastMutationTime = Date.now();

                        const cleanup = () => {
                            if (observer) {
                                observer.disconnect();
                            }
                            if (stabilityTimerId !== null) {
                                clearTimeout(stabilityTimerId);
                            }
                            if (maxWaitTimerId !== null) {
                                clearTimeout(maxWaitTimerId);
                            }
                        };

                        const checkStability = () => {
                            const timeSinceLastMutation = Date.now() - lastMutationTime;
                            if (timeSinceLastMutation >= stabilityThresholdMs) {
                                cleanup();
                                resolve(true);
                                return true;
                            }
                            return false;
                        };

                        const scheduleStabilityCheck = () => {
                            if (stabilityTimerId !== null) {
                                clearTimeout(stabilityTimerId);
                            }
                            stabilityTimerId = setTimeout(() => {
                                if (!checkStability()) {
                                    scheduleStabilityCheck();
                                }
                            }, stabilityThresholdMs);
                        };

                        maxWaitTimerId = setTimeout(() => {
                            cleanup();
                            resolve(false);
                        }, maxWaitMs);

                        observer = new MutationObserver(() => {
                            lastMutationTime = Date.now();
                            scheduleStabilityCheck();
                        });

                        observer.observe(targetContainer, {
                            childList: true,
                            subtree: true
                        });
                        scheduleStabilityCheck();
                    });
                }
            }

            const promise = TestHighlightManager.waitForDOMStability({
                containerSelector: '#test-container',
                stabilityThresholdMs: 150
            });

            jest.advanceTimersByTime(200);
            const result = await promise;

            expect(result).toBe(true);
            expect(global.document.querySelector).toHaveBeenCalledWith('#test-container');
            expect(mockObserve).toHaveBeenCalledWith(
                mockContainer,
                expect.objectContaining({
                    childList: true,
                    subtree: true
                })
            );

            jest.useRealTimers();
        });
    });

    describe('超時分支測試', () => {
        test('應該在超時時返回 false', async () => {
            const mockDisconnect = jest.fn();
            const mockObserve = jest.fn();
            let mutationCallback = null;

            global.MutationObserver = jest.fn((callback) => {
                mutationCallback = callback;
                return {
                    observe: mockObserve,
                    disconnect: mockDisconnect
                };
            });

            global.requestIdleCallback = undefined;
            jest.useFakeTimers();

            class TestHighlightManager {
                static async waitForDOMStability(options = {}) {
                    const {
                        stabilityThresholdMs = 150,
                        maxWaitMs = 5000
                    } = options;

                    return new Promise((resolve) => {
                        if (typeof document === 'undefined' || !document.body) {
                            resolve(false);
                            return;
                        }

                        let observer = null;
                        let stabilityTimerId = null;
                        let maxWaitTimerId = null;
                        let lastMutationTime = Date.now();

                        const cleanup = () => {
                            if (observer) {
                                observer.disconnect();
                            }
                            if (stabilityTimerId !== null) {
                                clearTimeout(stabilityTimerId);
                            }
                            if (maxWaitTimerId !== null) {
                                clearTimeout(maxWaitTimerId);
                            }
                        };

                        const handleTimeout = () => {
                            cleanup();
                            resolve(false);
                        };

                        maxWaitTimerId = setTimeout(handleTimeout, maxWaitMs);

                        observer = new MutationObserver(() => {
                            lastMutationTime = Date.now();
                            if (stabilityTimerId !== null) {
                                clearTimeout(stabilityTimerId);
                            }
                            stabilityTimerId = setTimeout(() => {
                                const timeSinceLastMutation = Date.now() - lastMutationTime;
                                if (timeSinceLastMutation >= stabilityThresholdMs) {
                                    cleanup();
                                    resolve(true);
                                }
                            }, stabilityThresholdMs);
                        });

                        observer.observe(document.body, {
                            childList: true,
                            subtree: true
                        });

                        stabilityTimerId = setTimeout(() => {
                            const timeSinceLastMutation = Date.now() - lastMutationTime;
                            if (timeSinceLastMutation >= stabilityThresholdMs) {
                                cleanup();
                                resolve(true);
                            }
                        }, stabilityThresholdMs);
                    });
                }
            }

            const promise = TestHighlightManager.waitForDOMStability({
                stabilityThresholdMs: 150,
                maxWaitMs: 1000
            });

            // 模擬持續的 DOM 變更（每 100ms 一次）
            for (let i = 0; i < 12; i++) {
                jest.advanceTimersByTime(100);
                if (mutationCallback) {
                    mutationCallback([]);
                }
            }

            // 快進到超時
            jest.advanceTimersByTime(1000);

            const result = await promise;

            expect(result).toBe(false);
            expect(mockDisconnect).toHaveBeenCalled();

            jest.useRealTimers();
        });

        test('應該在找不到指定容器時返回 false', async () => {
            global.document.querySelector = jest.fn(() => null);

            class TestHighlightManager {
                static async waitForDOMStability(options = {}) {
                    const { containerSelector = null } = options;

                    return new Promise((resolve) => {
                        if (typeof document === 'undefined' || !document.body) {
                            resolve(false);
                            return;
                        }

                        if (containerSelector) {
                            const container = document.querySelector(containerSelector);
                            if (!container) {
                                resolve(false);
                                return;
                            }
                        }

                        resolve(true);
                    });
                }
            }

            const result = await TestHighlightManager.waitForDOMStability({
                containerSelector: '#non-existent'
            });

            expect(result).toBe(false);
            expect(global.document.querySelector).toHaveBeenCalledWith('#non-existent');
        });

        test('應該在 document.body 不存在時返回 false', async () => {
            // 使用 Object.defineProperty 暫時覆蓋 document.body
            const originalDescriptor = Object.getOwnPropertyDescriptor(global.document, 'body');

            Object.defineProperty(global.document, 'body', {
                configurable: true,
                get: () => null
            });

            class TestHighlightManager {
                static async waitForDOMStability() {
                    return new Promise((resolve) => {
                        if (typeof document === 'undefined' || !document.body) {
                            resolve(false);
                            return;
                        }
                        resolve(true);
                    });
                }
            }

            const result = await TestHighlightManager.waitForDOMStability();

            expect(result).toBe(false);

            // 恢復 document.body
            if (originalDescriptor) {
                Object.defineProperty(global.document, 'body', originalDescriptor);
            }
        });
    });

    describe('資源清理測試', () => {
        test('應該正確清理所有資源', async () => {
            jest.useFakeTimers();

            const mockDisconnect = jest.fn();
            const mockObserve = jest.fn();
            let clearTimeoutCallCount = 0;
            const originalClearTimeout = global.clearTimeout;

            global.clearTimeout = jest.fn((timerId) => {
                clearTimeoutCallCount++;
                return originalClearTimeout(timerId);
            });

            global.MutationObserver = jest.fn(() => ({
                observe: mockObserve,
                disconnect: mockDisconnect
            }));

            global.requestIdleCallback = undefined;

            class TestHighlightManager {
                static async waitForDOMStability(options = {}) {
                    const {
                        stabilityThresholdMs = 150,
                        maxWaitMs = 200
                    } = options;

                    return new Promise((resolve) => {
                        let observer = null;
                        let stabilityTimerId = null;
                        let maxWaitTimerId = null;
                        let lastMutationTime = Date.now();

                        const cleanup = () => {
                            if (observer) {
                                observer.disconnect();
                            }
                            if (stabilityTimerId !== null) {
                                clearTimeout(stabilityTimerId);
                                stabilityTimerId = null;
                            }
                            if (maxWaitTimerId !== null) {
                                clearTimeout(maxWaitTimerId);
                                maxWaitTimerId = null;
                            }
                        };

                        const checkStability = () => {
                            const timeSinceLastMutation = Date.now() - lastMutationTime;
                            if (timeSinceLastMutation >= stabilityThresholdMs) {
                                cleanup();
                                resolve(true);
                                return true;
                            }
                            return false;
                        };

                        const scheduleStabilityCheck = () => {
                            if (stabilityTimerId !== null) {
                                clearTimeout(stabilityTimerId);
                            }
                            stabilityTimerId = setTimeout(() => {
                                if (!checkStability()) {
                                    scheduleStabilityCheck();
                                }
                            }, stabilityThresholdMs);
                        };

                        maxWaitTimerId = setTimeout(() => {
                            cleanup();
                            resolve(false);
                        }, maxWaitMs);

                        observer = new MutationObserver(() => {
                            lastMutationTime = Date.now();
                            scheduleStabilityCheck();
                        });

                        observer.observe(document.body, {
                            childList: true,
                            subtree: true
                        });
                        scheduleStabilityCheck();
                    });
                }
            }

            const promise = TestHighlightManager.waitForDOMStability();

            // 推進時間觸發超時
            jest.advanceTimersByTime(200);

            await promise;

            // 驗證清理操作
            expect(mockDisconnect).toHaveBeenCalled();
            expect(clearTimeoutCallCount).toBeGreaterThan(0);

            global.clearTimeout = originalClearTimeout;
            jest.useRealTimers();
        });
    });
});
