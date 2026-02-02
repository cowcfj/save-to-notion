/**
 * @jest-environment jsdom
 */

/* skipcq: JS-0255
 * Chrome 擴展 API 使用 chrome.runtime.lastError 而非 error-first callback 模式，
 * 因此 mock 實作中的 callback 第一個參數是資料而非錯誤
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
    log: jest.fn(),
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
    let handlers = null;
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
        expect(sendResponse).toHaveBeenCalledWith({
            success: false,
            error: expect.stringMatching(/拒絕訪問|Security check failed/),
        });

        sendResponse.mockClear();

        // 2. 受限頁面
        const restrictedSender = { id: 'mock-id', tab: { id: 1, url: 'chrome://settings' } };
        await handlers.USER_ACTIVATE_SHORTCUT({}, restrictedSender, sendResponse);
        expect(sendResponse).toHaveBeenCalledWith({
            success: false,
            error: expect.any(String),
        });
    });

    test('USER_ACTIVATE_SHORTCUT: showHighlighter 消息發送失敗', async () => {
        const sendResponse = jest.fn();
        chrome.tabs.sendMessage.mockImplementation((id, msg, responseCallback) => {
            if (msg.action === 'PING') {
                responseCallback({ status: 'bundle_ready' });
            } else if (msg.action === 'showHighlighter') {
                chrome.runtime.lastError = { message: 'Internal error' };
                responseCallback(); // 當有 lastError 時，callback 不應傳遞參數
            }
        });

        await handlers.USER_ACTIVATE_SHORTCUT({}, mockSender, sendResponse);
        expect(sendResponse).toHaveBeenCalledWith({
            success: false,
            // 這裡錯誤訊息可能已被 sanitizeApiError 處理成通用用戶訊息
            error: expect.any(String),
        });
    });

    test('startHighlight: 安全性驗證失敗', async () => {
        const sendResponse = jest.fn();
        const evilSender = { id: 'mock-id', tab: { id: 1, url: 'https://evil.com' } };
        await handlers.startHighlight({}, evilSender, sendResponse);
        expect(sendResponse).toHaveBeenCalledWith({
            success: false,
            error: expect.stringMatching(/拒絕訪問|此操作僅限擴充功能內部調用/),
        });
    });
});
