/* global chrome */

/**
 * Unified Logger Module
 * 提供統一的日誌記錄介面，支持環境感知、分級控制和背景轉發。
 *
 * @module Logger
 */

import { LogBuffer } from './LogBuffer.js';
import { LogSanitizer } from './LogSanitizer.js';
import { LOG_ICONS } from '../config/constants.js';

// 內部狀態
let _debugEnabled = false;
let _isInitialized = false;
// 背景環境下的日誌緩衝區(Singleton)
let _logBuffer = null;

// 日誌級別常量
const LOG_LEVELS = {
  DEBUG: 0,
  LOG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
};

const DEFAULT_BUFFER_CAPACITY = 500;

// 全域錯誤前綴常量（用於 initGlobalErrorHandlers 和 error 方法的過濾邏輯）
const GLOBAL_ERROR_PREFIXES = {
  UNCAUGHT_EXCEPTION: '[Uncaught Exception]',
  UNHANDLED_REJECTION: '[Unhandled Rejection]',
};

// 檢查是否在 Chrome 擴展環境中
const isExtensionContext = Boolean(chrome?.runtime?.id);

const isBackground = isExtensionContext && globalThis.window === undefined; // Service Worker 環境通常沒有 window (或 self !== window)

// ---- 批量轉發狀態（僅 Content Script 環境生效）----
const FLUSH_INTERVAL_MS = 500; // 最多 500ms 發送一次
const MAX_BATCH_SIZE = 20; // 累積超過 20 條立即發送
const _pendingLogs = []; // 待發送的日誌佇列（mutation only，不重賝變數）
let _flushTimer = null; // 發送計時器

/**
 * 格式化日誌訊息（控制台輸出用）
 * 注意：
 * 1. 不添加時間戳，Chrome DevTools 已內建此功能
 * 2. 保留物件原生形式以支援 DevTools 互動式檢查
 * 3. 僅對無法被控制台處理的特殊情況進行序列化
 *
 * @param {number} level - 日誌級別
 * @param {Array} args - 參數列表
 * @returns {Array} 格式化後的參數列表
 */
function formatMessage(level, args) {
  const levelPrefix =
    {
      [LOG_LEVELS.DEBUG]: '[DEBUG]',
      [LOG_LEVELS.LOG]: '[LOG]',
      [LOG_LEVELS.INFO]: '[INFO]',
      [LOG_LEVELS.WARN]: `[WARN] ${LOG_ICONS.WARN}`,
      [LOG_LEVELS.ERROR]: `[ERROR] ${LOG_ICONS.ERROR}`,
    }[level] || '[UNKNOWN]';

  // 直接返回參數，保留物件原生形式以支援 DevTools 互動式檢查
  // 控制台會自動處理循環引用、不可序列化物件等特殊情況
  return [levelPrefix, ...args];
}

/**
 * 將日誌加入待發送佇列（節流批量轉發檀制）
 *
 * 創建節流計時器：500ms 內無新日誌則批量發送，
 * 或累積至 MAX_BATCH_SIZE 條立即發送。
 * warn/error 級別則玉過此機制直接發送。
 *
 * @param {string} level - 日誌級別字符串
 * @param {string} message - 主訊息
 * @param {Array} args - 額外參數
 */
function _queueForBackground(level, message, args) {
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
          return structuredClone(arg);
        }
        return arg;
      } catch {
        return '[Unserializable Object]';
      }
    });

    _pendingLogs.push({ level, message: String(message), args: safeArgs });

    // 超過批次上限，立即發送
    if (_pendingLogs.length >= MAX_BATCH_SIZE) {
      _flushToBackground();
      return;
    }

    // 尚未建立計時器，建立之
    if (!_flushTimer) {
      _flushTimer = setTimeout(() => {
        _flushToBackground();
      }, FLUSH_INTERVAL_MS);
    }
  } catch {
    // 忽略發送錯誤
  }
}

/**
 * 將待發送佇列中的日誌批量發送至 Background
 *
 * @private
 */
function _flushToBackground() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }

  if (_pendingLogs.length === 0) {
    return;
  }

  const batch = _pendingLogs.splice(0); // 取出所有待發送項目

  try {
    chrome.runtime.sendMessage({ action: 'devLogSinkBatch', logs: batch }, () => {
      // 忽略 lastError
      if (chrome.runtime.lastError) {
        /* empty */
      }
    });
  } catch {
    // 忽略發送錯誤（extension context 已斷開等情況）
  }
}

/**
 * 發送日誌到 Background (僅在 Content Script 環境下)
 * warn/error 級別使用，不經佇列直接發送，確保高優先級日誌不延遲。
 *
 * @param {string} level - 日誌級別字符串
 * @param {string} message - 主訊息
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
          return structuredClone(arg);
        }
        return arg;
      } catch {
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
  } catch {
    // 忽略發送錯誤
  }
}

/**
 * 寫入 LogBuffer (僅 Background 有效)
 *
 * @param {string} level
 * @param {string} message
 * @param {Array} args
 */
function writeToBuffer(level, message, args) {
  if (_logBuffer) {
    try {
      // 提取第一個參數作為 context (如果是對象)，符合導出規格
      // 如果 args[0] 不是對象，則視為普通參數放入 details
      let context = {};

      if (args.length > 0) {
        if (typeof args[0] === 'object' && args[0] !== null) {
          // Use the first object as the main context
          context = { ...args[0] };
          // Collect any remaining arguments into context.details
          if (args.length > 1) {
            context.details = args.slice(1);
          }
        } else {
          // If first arg is not an object, treat all args as details
          context = { details: args };
        }
      }

      // 即時脫敏：確保存儲在 LogBuffer 中的數據是安全的
      // 根據調試模式決定是否保留堆疊追蹤細節
      const safeEntry = LogSanitizer.sanitizeEntry(String(message), context, {
        isDev: _debugEnabled,
      });

      _logBuffer.push({
        level,
        source: 'background', // 暫時假設都在 background 寫入，content script 透過 sendToBackground 過來
        message: safeEntry.message,
        context: safeEntry.context,
      });
    } catch (error) {
      console.error('寫入緩衝區失敗', { action: 'writeToBuffer', error });
    }
  }
}

/**
 * 初始化全域錯誤監聽器 (僅 Background)
 * 捕捉未處理的異常並記錄到 LogBuffer
 */
function initGlobalErrorHandlers() {
  if (!isBackground) {
    return;
  }

  // 1. 監聽未捕獲的異常 (Synchronous + Asynchronous)
  if (globalThis.self) {
    self.addEventListener('error', event => {
      try {
        const { message, filename, lineno, colno, error } = event;
        Logger.error(`${GLOBAL_ERROR_PREFIXES.UNCAUGHT_EXCEPTION} ${message}`, {
          filename,
          lineno,
          colno,
          stack: error?.stack,
        });
      } catch (error) {
        console.error('Failed to log uncaught exception:', error);
      }
    });

    // 2. 監聽未處理的 Promise Rejection
    self.addEventListener('unhandledrejection', event => {
      try {
        const reason = event.reason;
        const msg = reason instanceof Error ? reason.message : String(reason);
        const stack = reason instanceof Error ? reason.stack : null;
        // 正確處理 null：typeof null === 'object' 為 true，需要額外檢查
        const reasonField = reason !== null && typeof reason === 'object' ? reason : String(reason);

        Logger.error(`${GLOBAL_ERROR_PREFIXES.UNHANDLED_REJECTION} ${msg}`, {
          reason: reasonField,
          stack,
        });
      } catch (error) {
        console.error('Failed to log unhandled rejection:', error);
      }
    });
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

  // 初始化全域錯誤監聽
  initGlobalErrorHandlers();

  // 1. 檢查 Manifest (默認值)
  try {
    if (isExtensionContext) {
      const manifest = chrome.runtime.getManifest();
      const versionString = manifest.version_name || manifest.version || '';
      if (/dev/i.test(versionString)) {
        _debugEnabled = true;
      }
    }
  } catch (error) {
    // skipcq: JS-0002
    console.warn('檢查 Manifest 失敗', { action: 'initDebugState', error });
  }

  // 2. 檢查 Storage (覆蓋值) 並設置監聽
  if (isExtensionContext && chrome.storage?.sync) {
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
          console.info('調試模式狀態變更', {
            action: 'initDebugState',
            status: _debugEnabled ? 'ENABLED' : 'DISABLED',
          });
        }
      });
    }
  }

  // 初始化 LogBuffer (僅 Background)
  if (isBackground && !_logBuffer) {
    _logBuffer = new LogBuffer(DEFAULT_BUFFER_CAPACITY);
  }

  _isInitialized = true;
}

/**
 * 統一日誌模組
 */
const Logger = {
  get debugEnabled() {
    if (!_isInitialized) {
      initDebugState();
    }
    return _debugEnabled;
  },

  debug(message, ...args) {
    if (!this.debugEnabled) {
      return;
    }

    writeToBuffer('debug', message, args);
    // eslint-disable-next-line no-console
    console.debug(...formatMessage(LOG_LEVELS.DEBUG, [message, ...args]));
    _queueForBackground('debug', message, args);
  },

  log(message, ...args) {
    if (!this.debugEnabled) {
      return;
    }

    writeToBuffer('log', message, args);
    // eslint-disable-next-line no-console
    console.log(...formatMessage(LOG_LEVELS.LOG, [message, ...args]));
    _queueForBackground('log', message, args);
  },

  info(message, ...args) {
    if (!this.debugEnabled) {
      return;
    }

    writeToBuffer('info', message, args);
    console.info(...formatMessage(LOG_LEVELS.INFO, [message, ...args]));
    _queueForBackground('info', message, args);
  },

  /**
   * 成功日誌 (Shortcut for INFO with ✅)
   *
   * @param {string} message - 日誌訊息
   * @param {...any} args - 額外參數
   */
  success(message, ...args) {
    this.info(`${LOG_ICONS.SUCCESS} ${message}`, ...args);
  },

  /**
   * 啟動日誌 (Shortcut for INFO with 🚀)
   *
   * @param {string} message - 日誌訊息
   * @param {...any} args - 額外參數
   */
  start(message, ...args) {
    this.info(`${LOG_ICONS.START} ${message}`, ...args);
  },

  /**
   * 就緒日誌 (Shortcut for INFO with 📦)
   *
   * @param {string} message - 日誌訊息
   * @param {...any} args - 額外參數
   */
  ready(message, ...args) {
    this.info(`${LOG_ICONS.READY} ${message}`, ...args);
  },

  warn(message, ...args) {
    // Warn 總是輸出
    // skipcq: JS-0002
    console.warn(...formatMessage(LOG_LEVELS.WARN, [message, ...args]));
    sendToBackground('warn', message, args);
    writeToBuffer('warn', message, args);
  },

  error(message, ...args) {
    // 檢查是否為忽略的錯誤（Chrome 擴展框架相關的非關鍵錯誤）
    // 特殊情況：全域未捕獲異常/rejection 不應被過濾，即使它們包含被忽略的關鍵字
    const errorMsg = message instanceof Error ? message.message : String(message);
    const isGlobalError =
      errorMsg.startsWith(GLOBAL_ERROR_PREFIXES.UNCAUGHT_EXCEPTION) ||
      errorMsg.startsWith(GLOBAL_ERROR_PREFIXES.UNHANDLED_REJECTION);

    if (!isGlobalError && errorMsg.includes('Frame with ID') && errorMsg.includes('was removed')) {
      return;
    }

    // Error 總是輸出
    // skipcq: JS-0002
    console.error(...formatMessage(LOG_LEVELS.ERROR, [message, ...args]));
    sendToBackground('error', message, args);
    writeToBuffer('error', message, args);
  },

  /**
   * 獲取日誌緩衝區實例 (供 LogExporter 使用)
   *
   * @returns {LogBuffer|null}
   */
  getBuffer() {
    return _logBuffer;
  },

  /**
   * 直接寫入日誌到緩衝區 (供 devLogSink 使用，保留原始來源)
   *
   * @param {object} logEntry - 日誌 entry 對象
   * @param {string} logEntry.level - 日誌等級
   * @param {string} logEntry.message - 訊息內容
   * @param {object} logEntry.context - 上下文數據
   * @param {string} [logEntry.source] - 來源標識
   */
  addLogToBuffer({ level, message, context, source }) {
    if (_logBuffer) {
      try {
        // 即時脫敏
        const safeEntry = LogSanitizer.sanitizeEntry(String(message), context, {
          isDev: _debugEnabled,
        });

        _logBuffer.push({
          level,
          source: source || 'unknown',
          message: safeEntry.message,
          context: safeEntry.context,
        });
      } catch (error) {
        console.error('添加外部日誌到緩衝區失敗', { action: 'addLogToBuffer', error });
      }
    }
  },
};

export default Logger;

// 自動初始化 (嘗試)
initDebugState();

// Global Assignment (Module & Classic Script compatible fallback)
// 確保覆蓋 Service Worker (self) 與 Window 環境。
// 注意：此條件在大多數瀏覽器環境為真，但在純 Node.js 環境中可能兩者皆為 undefined，這符合預期 (避免污染測試環境全域)。
if (globalThis.self !== undefined || globalThis.window !== undefined) {
  globalThis.Logger = Logger;
}
