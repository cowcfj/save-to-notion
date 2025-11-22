/**
 * Highlighter V2 - ES6 Module Entry Point
 * 
 * 整合所有模組並提供統一導出
 * @version 2.9.12
 */

// Core modules
import { HighlightManager } from './core/HighlightManager.js';
import {
    serializeRange,
    deserializeRange,
    restoreRangeWithRetry,
    findRangeByTextContent,
    validateRange
} from './core/Range.js';

// Utility modules
import { COLORS, convertBgColorToName } from './utils/color.js';
import { supportsHighlightAPI, isValidElement, getVisibleText } from './utils/dom.js';
import { isValidColor, isValidRange, isValidHighlightData } from './utils/validation.js';
import { getNodePath, getNodeByPath } from './utils/path.js';
import { findTextInPage, findTextWithTreeWalker, findTextFuzzy } from './utils/textSearch.js';
import { waitForDOMStability } from './utils/domStability.js';

/**
 * 初始化 Highlighter V2
 * @returns {HighlightManager}
 */
export function initHighlighter(options = {}) {
    const manager = new HighlightManager(options);

    // 自動執行初始化
    manager.initializationComplete = manager.initialize();

    return manager;
}

/**
 * 導出所有模組供外部使用
 */
export {
    // Core
    HighlightManager,
    serializeRange,
    deserializeRange,
    restoreRangeWithRetry,
    findRangeByTextContent,
    validateRange,

    // Utils
    COLORS,
    convertBgColorToName,
    supportsHighlightAPI,
    isValidElement,
    getVisibleText,
    isValidColor,
    isValidRange,
    isValidHighlightData,
    getNodePath,
    getNodeByPath,
    findTextInPage,
    findTextWithTreeWalker,
    findTextFuzzy,
    waitForDOMStability
};

/**
 * 默認導出：自動初始化並設置到 window
 */
export default function setupHighlighter() {
    if (typeof window === 'undefined') {
        throw new Error('Highlighter V2 requires a browser environment');
    }

    // 初始化 manager  
    const manager = initHighlighter();

    // 設置到 window for Chrome Extension compatibility
    window.HighlighterV2 = {
        manager,

        // Core functions
        serializeRange,
        deserializeRange,
        findRangeByTextContent,
        validateRange,

        // Utils
        COLORS,
        supportsHighlightAPI,
        isValidColor,
        isValidRange,
        isValidHighlightData,
        getNodePath,
        getNodeByPath,
        findTextInPage,
        waitForDOMStability,

        // Convenience methods
        init: (options) => initHighlighter(options),
        getInstance: () => manager
    };

    console.log('[Highlighter V2] Initialized successfully');

    return manager;
}

// 自動初始化（在 browser 環境中）
if (typeof window !== 'undefined' && !window.HighlighterV2) {
    setupHighlighter();

    // 🔑 通知 background 檢查頁面狀態並更新 badge
    // 這確保在頁面載入後 extension icon 的 badge 立即更新
    if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'checkPageStatus' }, (_response) => {
            // 靜默處理，不需要回應
            if (chrome.runtime.lastError) {
                // 忽略錯誤（例如 background script 未就緒）
            }
        });
    }
}
