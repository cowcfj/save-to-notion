/* global chrome */

/**
 * Unified Logger Module
 * 提供統一的日誌記錄介面，支持環境感知、分級控制和背景轉發。
 *
 * @module Logger
 */

// 內部狀態 - 使用 var 支持重複注入
// eslint-disable-next-line no-var
var _debugEnabled = false;
// eslint-disable-next-line no-var
var _isInitialized = false;

// 日誌級別常量 - 使用 var 支持重複注入
// eslint-disable-next-line no-var
var LOG_LEVELS = {
  DEBUG: 0,
  LOG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
};

// 環境檢測 - 使用 var 支持重複注入
// eslint-disable-next-line no-var
var isExtensionContext = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
// eslint-disable-next-line no-var
var isBackground = isExtensionContext && typeof window === 'undefined'; // Service Worker 環境通常沒有 window (或 self !== window)

/**
 * 統一日誌類
 * 提供靜態方法用於記錄不同級別的日誌
 */
// eslint-disable-next-line no-var
var Logger = (function () {
  // 如果已存在，直接返回
  if (typeof window !== 'undefined' && window.Logger) {
    return window.Logger;
  }
  if (typeof self !== 'undefined' && self.Logger) {
    return self.Logger;
  }

  return class _Logger {
    static get debugEnabled() {
      if (!_isInitialized) {
        initDebugState();
      }
      return _debugEnabled;
    }

    static debug(message, ...args) {
      if (!this.debugEnabled) {
        return;
      }
      console.debug(...formatMessage(LOG_LEVELS.DEBUG, [message, ...args]));
      sendToBackground('debug', message, args);
    }

    static log(message, ...args) {
      if (!this.debugEnabled) {
        return;
      }
      console.log(...formatMessage(LOG_LEVELS.LOG, [message, ...args]));
      sendToBackground('log', message, args);
    }

    static info(message, ...args) {
      if (!this.debugEnabled) {
        return;
      }
      console.info(...formatMessage(LOG_LEVELS.INFO, [message, ...args]));
      sendToBackground('info', message, args);
    }

    static warn(message, ...args) {
      // Warn 總是輸出
      console.warn(...formatMessage(LOG_LEVELS.WARN, [message, ...args]));
      sendToBackground('warn', message, args);
    }

    static error(message, ...args) {
      // Error 總是輸出
      console.error(...formatMessage(LOG_LEVELS.ERROR, [message, ...args]));
      sendToBackground('error', message, args);
    }
  };
})();

// Node.js 環境適配：嘗試從配置模組加載
if (typeof module !== 'undefined' && typeof require !== 'undefined') {
  try {
    const config = require('../config/constants');
    const env = require('../config/env');

    if (config.LOG_LEVELS) {
      LOG_LEVELS = config.LOG_LEVELS;
    }

    if (env.isExtensionContext) {
      isExtensionContext = env.isExtensionContext();
    }
    if (env.isBackgroundContext) {
      isBackground = env.isBackgroundContext();
    }
  } catch (_err) {
    // 忽略加載錯誤，保持默認值
  }
}

/**
 * 初始化調試狀態
 * 優先級：
 * 1. Manifest version_name (包含 'dev')
 * 2. Storage 配置 (enableDebugLogs)
 */
function initDebugState() {
  if (_isInitialized) {
    return;
  }

  // 1. 檢查 Manifest (默認值)
  try {
    if (isExtensionContext) {
      const manifest = chrome.runtime.getManifest();
      const versionString = manifest.version_name || manifest.version || '';
      if (/dev/i.test(versionString)) {
        _debugEnabled = true;
      }
    }
  } catch (err) {
    console.warn('[Logger] Failed to check manifest:', err);
  }

  // 2. 檢查 Storage (覆蓋值) 並設置監聽
  if (isExtensionContext && chrome.storage && chrome.storage.sync) {
    // 初始讀取
    chrome.storage.sync.get(['enableDebugLogs'], result => {
      if (result.enableDebugLogs !== undefined) {
        _debugEnabled = Boolean(result.enableDebugLogs);
      }
    });

    // 監聽變更（防禦性檢查 onChanged 是否存在）
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.enableDebugLogs) {
          _debugEnabled = Boolean(changes.enableDebugLogs.newValue);
          // 在控制台輸出狀態變更，方便調試
          const status = _debugEnabled ? 'ENABLED' : 'DISABLED';
          console.info(`[Logger] Debug mode ${status}`);
        }
      });
    }
  }

  _isInitialized = true;
}

/**
 * 格式化日誌消息
 * @param {number} level - 日誌級別
 * @param {Array} args - 參數列表
 * @returns {Array} 格式化後的參數列表
 */
function formatMessage(level, args) {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const levelPrefix =
    {
      [LOG_LEVELS.DEBUG]: '🐛 [DEBUG]',
      [LOG_LEVELS.LOG]: '📝 [LOG]',
      [LOG_LEVELS.INFO]: 'ℹ️ [INFO]',
      [LOG_LEVELS.WARN]: '⚠️ [WARN]',
      [LOG_LEVELS.ERROR]: '❌ [ERROR]',
    }[level] || '[UNKNOWN]';

  return [`${levelPrefix} ${timestamp}:`, ...args];
}

/**
 * 發送日誌到 Background (僅在 Content Script 環境下)
 * @param {string} level - 日誌級別字符串
 * @param {string} message - 主消息
 * @param {Array} args - 額外參數
 */
function sendToBackground(level, message, args) {
  if (!isExtensionContext || isBackground) {
    return;
  }

  try {
    // 序列化參數，避免傳遞 DOM 對象導致錯誤
    const safeArgs = args.map(arg => {
      try {
        if (arg instanceof Error) {
          return { message: arg.message, stack: arg.stack, name: arg.name };
        }
        if (typeof arg === 'object' && arg !== null) {
          return JSON.parse(JSON.stringify(arg));
        }
        return arg;
      } catch (_err) {
        return '[Unserializable Object]';
      }
    });

    chrome.runtime.sendMessage(
      {
        action: 'devLogSink',
        level,
        message: String(message),
        args: safeArgs,
      },
      () => {
        // 忽略 lastError
        if (chrome.runtime.lastError) {
          /* empty */
        }
      }
    );
  } catch (_err) {
    // 忽略發送錯誤
  }
}

/**
 * 統一日誌類
 * 提供靜態方法用於記錄不同級別的日誌
 */
/**
 * 統一日誌類
 * 提供靜態方法用於記錄不同級別的日誌
 */
// eslint-disable-next-line no-var
var Logger = (function () {
  // 如果已存在，直接返回
  if (typeof window !== 'undefined' && window.Logger) {
    return window.Logger;
  }
  if (typeof self !== 'undefined' && self.Logger) {
    return self.Logger;
  }

  return class _Logger {
    static get debugEnabled() {
      if (!_isInitialized) {
        initDebugState();
      }
      return _debugEnabled;
    }

    static debug(message, ...args) {
      if (!this.debugEnabled) {
        return;
      }
      console.debug(...formatMessage(LOG_LEVELS.DEBUG, [message, ...args]));
      sendToBackground('debug', message, args);
    }

    static log(message, ...args) {
      if (!this.debugEnabled) {
        return;
      }
      console.log(...formatMessage(LOG_LEVELS.LOG, [message, ...args]));
      sendToBackground('log', message, args);
    }

    static info(message, ...args) {
      if (!this.debugEnabled) {
        return;
      }
      console.info(...formatMessage(LOG_LEVELS.INFO, [message, ...args]));
      sendToBackground('info', message, args);
    }

    static warn(message, ...args) {
      // Warn 總是輸出
      console.warn(...formatMessage(LOG_LEVELS.WARN, [message, ...args]));
      sendToBackground('warn', message, args);
    }

    static error(message, ...args) {
      // Error 總是輸出
      console.error(...formatMessage(LOG_LEVELS.ERROR, [message, ...args]));
      sendToBackground('error', message, args);
    }
  };
})();

// 自動初始化
initDebugState();

// 導出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Logger;
} else if (typeof window !== 'undefined') {
  window.Logger = Logger;
} else if (typeof self !== 'undefined') {
  self.Logger = Logger;
}
