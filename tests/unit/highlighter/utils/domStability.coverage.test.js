/**
 * @jest-environment jsdom
 */

import { waitForDOMStability } from '../../../../scripts/highlighter/utils/domStability.js';

describe('DOM Stability Utils Coverage Tests', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    describe('waitForDOMStability', () => {
        test('should resolve true when DOM is stable', async () => {
            const promise = waitForDOMStability({
                stabilityThresholdMs: 100,
                maxWaitMs: 1000
            });

            // Advance timers to trigger stability check
            jest.advanceTimersByTime(150);

            const result = await promise;
            expect(result).toBe(true);
        });

        test('should resolve false when document.body does not exist', async () => {
            const originalBody = document.body;
            Object.defineProperty(document, 'body', {
                get: () => null,
                configurable: true
            });

            const result = await waitForDOMStability();

            expect(result).toBe(false);

            Object.defineProperty(document, 'body', {
                get: () => originalBody,
                configurable: true
            });
        });

        test('should resolve false when container not found', async () => {
            const result = await waitForDOMStability({
                containerSelector: '#nonexistent'
            });

            expect(result).toBe(false);
        });

        test('should monitor specified container when selector provided', async () => {
            const container = document.createElement('div');
            container.id = 'test-container';
            document.body.appendChild(container);

            const promise = waitForDOMStability({
                containerSelector: '#test-container',
                stabilityThresholdMs: 100
            });

            jest.advanceTimersByTime(150);

            const result = await promise;
            expect(result).toBe(true);
        });

        test('should resolve false on timeout', async () => {
            const promise = waitForDOMStability({
                stabilityThresholdMs: 200,
                maxWaitMs: 100 // Very short max wait
            });

            // Fast forward past max wait time
            jest.advanceTimersByTime(150);

            const result = await promise;
            // Should timeout before stability is achieved
            expect(result).toBe(false);
        });

        test('should handle mutations and restart stability check', async () => {
            const promise = waitForDOMStability({
                stabilityThresholdMs: 100,
                maxWaitMs: 500
            });

            // Add mutation after 50ms
            jest.advanceTimersByTime(50);
            document.body.appendChild(document.createElement('div'));

            // Add another mutation after 50ms
            jest.advanceTimersByTime(50);
            document.body.appendChild(document.createElement('div'));

            // Now wait for stability
            jest.advanceTimersByTime(150);

            const result = await promise;
            expect(result).toBe(true);
        });

        test('should handle observer errors gracefully', async () => {
            // Mock MutationObserver to throw on observe
            const originalMutationObserver = global.MutationObserver;
            global.MutationObserver = class {
                constructor() {
                    this.observe = () => {
                        throw new Error('Observer error');
                    };
                    this.disconnect = () => {
                        // 空操作 - mock MutationObserver 不需要清理邏輯
                    };
                }
            };

            const result = await waitForDOMStability();

            expect(result).toBe(false);

            global.MutationObserver = originalMutationObserver;
        });

        test('should use default options when not specified', async () => {
            const promise = waitForDOMStability();

            // Default stabilityThresholdMs is 150
            jest.advanceTimersByTime(200);

            const result = await promise;
            expect(result).toBe(true);
        });

        test('should cleanup resources on success', async () => {
            const promise = waitForDOMStability({
                stabilityThresholdMs: 100
            });

            jest.advanceTimersByTime(150);

            await promise;

            // Timers should be cleared
            expect(jest.getTimerCount()).toBe(0);
        });

        test('should cleanup resources on timeout', async () => {
            const promise = waitForDOMStability({
                stabilityThresholdMs: 100,
                maxWaitMs: 200
            });

            // Keep mutating
            const interval = setInterval(() => {
                document.body.appendChild(document.createElement('div'));
            }, 50);

            jest.advanceTimersByTime(250);
            clearInterval(interval);

            await promise;

            // Timers should be cleared
            expect(jest.getTimerCount()).toBe(0);
        });
    });
});
