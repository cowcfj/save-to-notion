/**
 * @jest-environment jsdom
 */

// Mock constants BEFORE imports
jest.mock('../../../scripts/config/constants.js', () => {
    const original = jest.requireActual('../../../scripts/config/constants.js');
    return {
        __esModule: true,
        ...original,
        HANDLER_CONSTANTS: {
            ...original.HANDLER_CONSTANTS,
            BUNDLE_READY_RETRY_DELAY: 1,
            BUNDLE_READY_MAX_RETRIES: 2,
            CHECK_DELAY: 1,
            IMAGE_RETRY_DELAY: 1,
            PAGE_STATUS_CACHE_TTL: 1000,
        },
    };
});

jest.mock('../../../scripts/background/services/InjectionService.js', () => ({
    isRestrictedInjectionUrl: jest.fn(url => url?.startsWith('chrome://') || url?.startsWith('about:')),
}));

jest.mock('../../../scripts/utils/securityUtils.js', () => ({
    ...jest.requireActual('../../../scripts/utils/securityUtils.js'),
    sanitizeApiError: jest.fn(err => err?.message || err || 'Unknown'),
}));

import { createHighlightHandlers } from '../../../scripts/background/handlers/highlightHandlers.js';

// Global mocks
global.Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

global.chrome = {
    runtime: { id: 'mock-id', lastError: null },
    tabs: { sendMessage: jest.fn(), query: jest.fn() },
};

describe('BackgroundHandlers 覆蓋率補強 (整合)', () => {
    let handlers;
    const mockSender = { id: 'mock-id', tab: { id: 1, url: 'https://example.com' } };

    beforeEach(() => {
        jest.clearAllMocks();
        const mockInjectionService = {
            ensureBundleInjected: jest.fn().mockResolvedValue(),
        };
        handlers = createHighlightHandlers({
            injectionService: mockInjectionService,
            storageService: {},
        });
    });

    afterEach(() => {
        // 清除 chrome.runtime.lastError 避免狀態洩漏到其他測試
        chrome.runtime.lastError = null;
    });

    // --- highlightHandlers.js 測試 ---
    test('USER_ACTIVATE_SHORTCUT: 各種失敗路徑', async () => {
        const sendResponse = jest.fn();

        // 1. 安全性驗證失敗
        await handlers.USER_ACTIVATE_SHORTCUT({}, { id: 'wrong' }, sendResponse);
        expect(sendResponse).toHaveBeenCalled();

        // 2. 受限頁面
        const restrictedSender = { id: 'mock-id', tab: { id: 1, url: 'chrome://settings' } };
        await handlers.USER_ACTIVATE_SHORTCUT({}, restrictedSender, sendResponse);
        expect(sendResponse).toHaveBeenCalled();
    });

    test('USER_ACTIVATE_SHORTCUT: showHighlighter 消息發送失敗', async () => {
        const sendResponse = jest.fn();
        chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
            if (msg.action === 'PING') {
                cb({ status: 'bundle_ready' });
            } else if (msg.action === 'showHighlighter') {
                chrome.runtime.lastError = { message: 'Internal error' };
                cb(null);
            }
        });

        await handlers.USER_ACTIVATE_SHORTCUT({}, mockSender, sendResponse);
        expect(sendResponse).toHaveBeenCalled();
    });

    test('startHighlight: 安全性驗證失敗', async () => {
        const sendResponse = jest.fn();
        const evilSender = { id: 'mock-id', tab: { id: 1, url: 'https://evil.com' } };
        await handlers.startHighlight({}, evilSender, sendResponse);
        expect(sendResponse).toHaveBeenCalled();
    });
});
