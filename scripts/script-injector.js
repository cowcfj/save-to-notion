/* global chrome */

// 腳本注入管理器
// 統一管理所有的腳本注入操作，減少重複代碼

/**
 * 腳本注入管理器
 */

// 取得安全日誌器，避免 Logger 未注入時直接引用
const logger = (() => {
    try {
        if (typeof globalThis !== 'undefined' && globalThis.Logger) {
            return globalThis.Logger;
        }
        if (typeof window !== 'undefined' && window.Logger) {
            return window.Logger;
        }
        if (typeof self !== 'undefined' && self.Logger) {
            return self.Logger;
        }
    } catch {
        // 忽略環境檢查錯誤，改用 console
    }
    return console;
})();

class ScriptInjector {
    /**
     * 注入文件並執行函數
     * @param {number} tabId - 標籤頁 ID
     * @param {string[]} files - 要注入的文件列表
     * @param {Function|string} func - 要執行的函數
     * @param {Object} options - 選項
     * @returns {Promise}
     */
    static async injectAndExecute(tabId, files = [], func = null, options = {}) {
        const {
            errorMessage = 'Script injection failed',
            successMessage = 'Script executed successfully',
            logErrors = true,
            returnResult = false
        } = options;

        // 驗證 tabId
        if (typeof tabId !== 'number' || tabId <= 0) {
            const errorMsg = 'Invalid tabId: must be a positive number';
            if (logErrors) {
                console.error(errorMsg);
            }
            throw new Error(errorMsg);
        }

        try {
            // 首先注入文件
            if (files.length > 0) {
                await new Promise((resolve, reject) => {
                    chrome.scripting.executeScript({
                        target: { tabId },
                        files: files
                    }, () => {
                        if (global.chrome.runtime.lastError) {
                            if (logErrors) {
                                console.error("File injection failed:", global.chrome.runtime.lastError);
                            }
                            reject(new Error(global.chrome.runtime.lastError.message));
                        } else {
                            resolve();
                        }
                    });
                });
            }

            // 然後執行函數
            if (func) {
                return new Promise((resolve, reject) => {
                    chrome.scripting.executeScript({
                        target: { tabId },
                        func: func
                    }, (results) => {
                        if (global.chrome.runtime.lastError) {
                            if (logErrors) {
                                console.error("Function execution failed:", global.chrome.runtime.lastError);
                            }
                            reject(new Error(global.chrome.runtime.lastError.message));
                        } else {
                            if (successMessage && logErrors) {
                                logger.log(successMessage);
                            }
                            const result = returnResult && results && results[0] ? results[0].result : null;
                            resolve(result);
                        }
                    });
                });
            }

            return Promise.resolve();
        } catch (error) {
            if (logErrors) {
                console.error(errorMessage, error);
            }
            throw error;
        }
    }

    /**
     * 注入標記工具並初始化
     * v2.5.0: 使用新版 CSS Highlight API + 無痛自動遷移
     */
    static injectHighlighter(tabId) {
        return this.injectAndExecute(
            tabId,
            ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
            () => {
                if (window.initHighlighter) {
                    window.initHighlighter();
                }
            },
            {
                errorMessage: 'Failed to inject highlighter',
                successMessage: 'Highlighter v2 injected and initialized successfully'
            }
        );
    }

    /**
     * 注入並收集標記
     * v2.5.0: 使用新版標註系統
     */
    static collectHighlights(tabId) {
        return this.injectAndExecute(
            tabId,
            ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
            () => {
                if (window.collectHighlights) {
                    return window.collectHighlights();
                }
                return [];
            },
            {
                errorMessage: 'Failed to collect highlights',
                successMessage: 'Highlights collected successfully',
                returnResult: true
            }
        );
    }

    /**
     * 注入並清除頁面標記
     * v2.5.0: 使用新版標註系統
     */
    static clearPageHighlights(tabId) {
        return this.injectAndExecute(
            tabId,
            ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
            () => {
                if (window.clearPageHighlights) {
                    window.clearPageHighlights();
                }
            },
            {
                errorMessage: 'Failed to clear page highlights',
                successMessage: 'Page highlights cleared successfully'
            }
        );
    }

    /**
     * 注入標記恢復腳本
     */
    static injectHighlightRestore(tabId) {
        return this.injectAndExecute(
            tabId,
            ['scripts/utils.js', 'scripts/highlight-restore.js'],
            null,
            {
                errorMessage: 'Failed to inject highlight restore script',
                successMessage: 'Highlight restore script injected successfully'
            }
        );
    }
}

// 暴露給全局使用
window.ScriptInjector = ScriptInjector;
