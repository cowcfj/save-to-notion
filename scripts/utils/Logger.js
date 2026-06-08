/* global chrome */

/**
 * Unified Logger Module
 * 提供統一的日誌記錄介面，支持環境感知、分級控制和背景轉發。
 *
 * @module Logger
 */

import { LogBuffer } from './LogBuffer.js';
import { LogBufferPersistence } from './LogBufferPersistence.js';
import { LogSanitizer } from './LogSanitizer.js';
import { LOG_ICONS } from '../config/shared/ui.js';
import { DEV_LOG_SINK, DEV_LOG_SINK_BATCH } from '../config/runtimeActions/diagnosticsActions.js';

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

const DEBUG_LEVEL_LOG_CONFIG = {
  DEBUG: { level: 'debug', levelConst: LOG_LEVELS.DEBUG, consoleMethod: 'debug' },
  LOG: { level: 'log', levelConst: LOG_LEVELS.LOG, consoleMethod: 'log' },
  INFO: { level: 'info', levelConst: LOG_LEVELS.INFO, consoleMethod: 'info' },
};

const DEFAULT_BUFFER_CAPACITY = 500;

const UNSERIALIZABLE_OBJECT_PLACEHOLDER = '[Unserializable Object]';
const SERIALIZED_ERROR_RESERVED_KEYS = new Set(['message', 'stack', 'name']);

// 全域錯誤前綴常量（用於 initGlobalErrorHandlers 和 error 方法的過濾邏輯）
const GLOBAL_ERROR_PREFIXES = {
  UNCAUGHT_EXCEPTION: '[Uncaught Exception]',
  UNHANDLED_REJECTION: '[Unhandled Rejection]',
};

// 檢查是否在 Chrome 擴展環境中
const isExtensionContext = Boolean(chrome?.runtime?.id);
const isContentScriptBuild = globalThis.__CONTENT_SCRIPT_BUILD__ === true;

const isBackground = !isContentScriptBuild && isExtensionContext && globalThis.window === undefined; // Service Worker 環境通常沒有 window (或 self !== window)

// ---- 批量轉發狀態（僅 Content Script 環境生效）----
const FLUSH_INTERVAL_MS = 500; // 最多 500ms 發送一次
const MAX_BATCH_SIZE = 20; // 累積超過 20 條立即發送
const _pendingLogs = []; // 待發送的日誌佇列（mutation only，不重賦變數）
let _flushTimer = null; // 發送計時器

/**
 * 序列化 Error 物件，保留標準欄位與自訂 own properties。
 *
 * @param {Error} error - 原始 Error 物件
 * @param {WeakMap<object, any>} seen - 已處理物件映射，用於保留循環引用
 * @returns {object|string} 序列化後的 Error 資料
 * @private
 */
function _serializeErrorForIpc(error, seen) {
  if (seen.has(error)) {
    return seen.get(error);
  }

  const serialized = {
    message: error.message,
    stack: error.stack,
    name: error.name,
  };
  seen.set(error, serialized);

  for (const key of Object.getOwnPropertyNames(error)) {
    if (SERIALIZED_ERROR_RESERVED_KEYS.has(key)) {
      continue;
    }
    try {
      serialized[key] = _serializeValueForIpc(error[key], seen);
    } catch {
      serialized[key] = UNSERIALIZABLE_OBJECT_PLACEHOLDER;
    }
  }

  return serialized;
}

/**
 * 序列化陣列，並保留循環引用拓撲。
 *
 * @param {Array} array - 原始陣列
 * @param {WeakMap<object, any>} seen - 已處理物件映射
 * @returns {Array} 序列化後的陣列
 * @private
 */
function _serializeArrayForIpc(array, seen) {
  if (seen.has(array)) {
    return seen.get(array);
  }

  const serialized = [];
  seen.set(array, serialized);
  for (const item of array) {
    serialized.push(_serializeValueForIpc(item, seen));
  }
  return serialized;
}

/**
 * 序列化一般物件，並保留循環引用拓撲。
 *
 * @param {object} object - 原始物件
 * @param {WeakMap<object, any>} seen - 已處理物件映射
 * @returns {object} 序列化後的物件
 * @private
 */
function _serializePlainObjectForIpc(object, seen) {
  if (seen.has(object)) {
    return seen.get(object);
  }

  const serialized = {};
  seen.set(object, serialized);
  for (const [key, value] of Object.entries(object)) {
    try {
      serialized[key] = _serializeValueForIpc(value, seen);
    } catch {
      serialized[key] = UNSERIALIZABLE_OBJECT_PLACEHOLDER;
    }
  }
  return serialized;
}

/**
 * 遞迴序列化日誌值，確保可透過 Chrome IPC 傳遞。
 *
 * @param {any} value - 原始值
 * @param {WeakMap<object, any>} seen - 已處理物件映射
 * @returns {any} 序列化後的安全值
 * @private
 */
function _serializeValueForIpc(value, seen) {
  if (value instanceof Error) {
    return _serializeErrorForIpc(value, seen);
  }
  // Function / Symbol 無法通過 Chrome IPC (structuredClone / JSON)，需提前轉換
  if (typeof value === 'function') {
    return '[Function]';
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return _serializeArrayForIpc(value, seen);
  }
  if (typeof value === 'object' && value !== null) {
    return _serializePlainObjectForIpc(value, seen);
  }
  return value;
}

/**
 * 序列化單一日誌參數，確保可透過 Chrome IPC 傳遞
 *
 * @param {any} arg - 原始參數
 * @returns {any} 序列化後的安全參數
 * @private
 */
function _serializeSingleArg(arg) {
  try {
    return _serializeValueForIpc(arg, new WeakMap());
  } catch {
    return UNSERIALIZABLE_OBJECT_PLACEHOLDER;
  }
}

/**
 * 序列化日誌參數，確保可透過 Chrome IPC 傳遞
 * 將 Error 對象轉為純物件、使用 structuredClone 複製物件、
 * 並對無法序列化的對象降級為佔位字串。
 *
 * @param {Array} args - 原始參數列表
 * @returns {Array} 序列化後的安全參數列表
 * @private
 */
function _serializeArgs(args) {
  return args.map(arg => _serializeSingleArg(arg));
}

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
 * 將日誌加入待發送佇列（節流批量轉發機制）
 *
 * 第一條日誌觸發 500ms 節流計時器，期間新日誌只加入佇列
 * （不重設計時器），到期後批量發送。
 * 累積至 MAX_BATCH_SIZE 條則立即發送。
 * warn/error 級別略過此機制，直接發送。
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
    const safeArgs = _serializeArgs(args);

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
    chrome.runtime.sendMessage({ action: DEV_LOG_SINK_BATCH, logs: batch }, () => {
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
    const safeArgs = _serializeArgs(args);

    chrome.runtime.sendMessage(
      {
        action: DEV_LOG_SINK,
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
 * 將 Error 對象轉換為 context
 *
 * @param {Error} err - 錯誤對象
 * @returns {object} context 物件
 * @private
 */
function createErrorContext(err) {
  const context = {
    message: err.message,
    stack: err.stack,
    name: err.name,
  };
  for (const key of Object.getOwnPropertyNames(err)) {
    if (!(key in context)) {
      context[key] = err[key];
    }
  }
  return context;
}

/**
 * 寫入 details 至 context
 *
 * @param {object} context - 目標 context 物件
 * @param {Array} args - 原始參數列表
 * @private
 */
function appendDetails(context, args) {
  if (args.length > 1) {
    context.details = args.slice(1);
  }
}

/**
 * 將日誌 args 陣列解析為 context 物件
 *
 * 解析規則：
 * - 無參數或空陣列 → 空物件 {}
 * - 第一個參數為物件 → 展開為 context，剩餘參數存入 context.details
 * - 第一個參數非物件 → 所有參數存入 { details: args }
 *
 * @param {Array} args - 日誌額外參數
 * @returns {object} context 物件
 */
function parseArgsToContext(args) {
  if (!Array.isArray(args) || args.length === 0) {
    return {};
  }

  const firstArg = args[0];

  if (firstArg instanceof Error) {
    const context = createErrorContext(firstArg);
    appendDetails(context, args);
    return context;
  }

  if (typeof firstArg === 'object' && firstArg !== null) {
    const context = { ...firstArg };
    appendDetails(context, args);
    return context;
  }

  return { details: args };
}

/**
 * 寫入 LogBuffer (僅 Background 有效)
 *
 * @param {string} level
 * @param {string} message
 * @param {Array} args
 */
function writeToBuffer(level, message, args) {
  if (!isBackground || !_logBuffer) {
    return;
  }

  try {
    const context = parseArgsToContext(args);
    createSafeLogEntry(level, message, context, 'background');
  } catch (error) {
    console.error('寫入緩衝區失敗', { action: 'writeToBuffer', error });
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
  globalThis.self?.addEventListener('error', event => {
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
  globalThis.self?.addEventListener('unhandledrejection', event => {
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

/**
 * 判斷是否為 debug storage 變更
 *
 * @param {object} changes - 變更對象
 * @param {string} area - 變更區域
 * @returns {boolean} 是否為目標變更
 * @private
 */
function isDebugStorageChange(changes, area) {
  return area === 'sync' && Boolean(changes && changes.enableDebugLogs);
}

/**
 * 應用 debug storage 的 newValue
 *
 * @param {any} value - 變更值
 * @private
 */
function applyDebugStorageValue(value) {
  _debugEnabled = Boolean(value);
  // 在控制台輸出狀態變更，方便調試
  console.info('調試模式狀態變更', {
    action: 'initDebugState',
    status: _debugEnabled ? 'ENABLED' : 'DISABLED',
  });
}

/**
 * 從 Manifest 初始化 Debug 狀態
 *
 * @private
 */
function initializeDebugFromManifest() {
  if (!isExtensionContext) {
    return;
  }
  try {
    const manifest = chrome.runtime.getManifest();
    const versionString = manifest.version_name || manifest.version || '';
    if (/dev/i.test(versionString)) {
      _debugEnabled = true;
    }
  } catch (error) {
    // skipcq: JS-0002
    console.warn('檢查 Manifest 失敗', { action: 'initDebugState', error });
  }
}

/**
 * 註冊 chrome.storage 同步與監聽
 *
 * @private
 */
function registerDebugStorageSync() {
  if (!isExtensionContext || !chrome.storage?.sync) {
    return;
  }

  // 初始讀取
  chrome.storage.sync.get(['enableDebugLogs'], result => {
    if (result && result.enableDebugLogs !== undefined) {
      _debugEnabled = Boolean(result.enableDebugLogs);
    }
  });

  // 監聽變更（防禦性檢查 onChanged 是否存在）
  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (isDebugStorageChange(changes, area)) {
        applyDebugStorageValue(changes.enableDebugLogs.newValue);
      }
    });
  }
}

/**
 * 初始化 LogBuffer
 *
 * @private
 */
function initializeLogBuffer() {
  if (isBackground && !_logBuffer) {
    _logBuffer = new LogBuffer(DEFAULT_BUFFER_CAPACITY);
    LogBufferPersistence.init(_logBuffer);
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

  if (isContentScriptBuild) {
    _isInitialized = true;
    return;
  }

  // 初始化全域錯誤監聽
  initGlobalErrorHandlers();

  // 1. 檢查 Manifest (默認值)
  initializeDebugFromManifest();

  // 2. 檢查 Storage (覆蓋值) 並設置監聽
  registerDebugStorageSync();

  // 初始化 LogBuffer (僅 Background)
  initializeLogBuffer();

  _isInitialized = true;
}

/**
 * 取得錯誤消息字串
 *
 * @param {any} message - 原始錯誤消息或 Error 對象
 * @returns {string} 錯誤消息字串
 * @private
 */
function getErrorMessage(message) {
  return message instanceof Error ? message.message : String(message);
}

/**
 * 判斷是否為全域錯誤
 *
 * @param {string} errorMsg - 錯誤消息
 * @returns {boolean} 是否為全域錯誤
 * @private
 */
function isGlobalErrorMessage(errorMsg) {
  return (
    errorMsg.startsWith(GLOBAL_ERROR_PREFIXES.UNCAUGHT_EXCEPTION) ||
    errorMsg.startsWith(GLOBAL_ERROR_PREFIXES.UNHANDLED_REJECTION)
  );
}

/**
 * 判斷是否為需忽略的 Frame 移除錯誤
 *
 * @param {string} errorMsg - 錯誤消息
 * @returns {boolean} 是否為需忽略的錯誤
 * @private
 */
function isIgnoredFrameRemovalError(errorMsg) {
  return errorMsg.includes('Frame with ID') && errorMsg.includes('was removed');
}

/**
 * 發送 debug 等級的日誌
 *
 * @param {object} config - 日誌等級設定
 * @param {string} config.level - 日誌級別字串
 * @param {number} config.levelConst - 日誌級別常量
 * @param {string} config.consoleMethod - 控制台方法名
 * @param {string} message - 日誌消息
 * @param {Array} args - 額外參數
 * @private
 */
function emitDebugLevelLog(config, message, args) {
  if (isContentScriptBuild || !Logger.debugEnabled) {
    return;
  }

  const { level, levelConst, consoleMethod } = config;
  writeToBuffer(level, message, args);
  console[consoleMethod](...formatMessage(levelConst, [message, ...args]));
  _queueForBackground(level, message, args);
}

/**
 * 發送帶有圖標的前綴日誌捷徑
 *
 * @param {string} icon - 前綴圖標
 * @param {string} message - 日誌消息
 * @param {Array} args - 額外參數
 * @private
 */
function emitInfoShortcut(icon, message, args) {
  if (isContentScriptBuild) {
    return;
  }
  Logger.info(`${icon} ${message}`, ...args);
}

/**
 * 創建安全的日誌條目並寫入緩衝區
 *
 * @param {string} level - 日誌級別
 * @param {string} message - 日誌消息
 * @param {object} context - 日誌上下文
 * @param {string} source - 日誌來源
 * @private
 */
function createSafeLogEntry(level, message, context, source) {
  const safeEntry = LogSanitizer.sanitizeEntry(String(message), context, {
    isDev: _debugEnabled,
  });

  _logBuffer.push({
    level,
    source,
    message: safeEntry.message,
    context: safeEntry.context,
  });
}

/**
 * 統一日誌模組
 */
// [設計決策] 輸出等級行為
//
// - debug / log / info：僅在 `_debugEnabled === true` 時輸出（受 Manifest 版本或
//   Storage `enableDebugLogs` 設定控制）。靜默模式下完全不輸出。
// - warn / error：無論 `_debugEnabled` 為何，永遠輸出到 Console 並轉發到 Background。
//
// 理由：warn/error 屬於必須追蹤的異常訊號，即使在生產安靜模式下也不應被靜默。
// 若未來需要完全靜默所有等級，應引入獨立的 `silentMode` 旗標並更新此說明。
const Logger = {
  get debugEnabled() {
    if (!_isInitialized) {
      initDebugState();
    }
    return _debugEnabled;
  },

  debug(message, ...args) {
    emitDebugLevelLog(DEBUG_LEVEL_LOG_CONFIG.DEBUG, message, args);
  },

  log(message, ...args) {
    emitDebugLevelLog(DEBUG_LEVEL_LOG_CONFIG.LOG, message, args);
  },

  info(message, ...args) {
    emitDebugLevelLog(DEBUG_LEVEL_LOG_CONFIG.INFO, message, args);
  },

  /**
   * 成功日誌 (Shortcut for INFO with ✅)
   *
   * @param {string} message - 日誌訊息
   * @param {...any} args - 額外參數
   */
  success(message, ...args) {
    emitInfoShortcut(LOG_ICONS.SUCCESS, message, args);
  },

  start(message, ...args) {
    emitInfoShortcut(LOG_ICONS.START, message, args);
  },

  ready(message, ...args) {
    emitInfoShortcut(LOG_ICONS.READY, message, args);
  },

  warn(message, ...args) {
    // Warn 總是輸出
    // skipcq: JS-0002
    console.warn(...formatMessage(LOG_LEVELS.WARN, [message, ...args]));
    sendToBackground('warn', message, args);
    writeToBuffer('warn', message, args);
  },

  error(message, ...args) {
    const errorMsg = getErrorMessage(message);

    if (!isGlobalErrorMessage(errorMsg) && isIgnoredFrameRemovalError(errorMsg)) {
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
    if (isContentScriptBuild) {
      return null;
    }
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
    if (isContentScriptBuild || !_logBuffer) {
      return;
    }

    try {
      createSafeLogEntry(level, message, context, source || 'unknown');
    } catch (error) {
      console.error('添加外部日誌到緩衝區失敗', { action: 'addLogToBuffer', error });
    }
  },
};

export default Logger;

export { parseArgsToContext };

// 自動初始化 (嘗試)
initDebugState();

// ---- 頁面卸載時沖刷待發送日誌（僅 Content Script 環境）----
// Background Service Worker 沒有 document，因此需要環境檢查
if (!isContentScriptBuild && !isBackground && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _flushToBackground();
    }
  });

  globalThis.addEventListener('beforeunload', () => {
    _flushToBackground();
  });
}

// Global Assignment (Module & Classic Script compatible fallback)
// 確保覆蓋 Service Worker (self) 與 Window 環境。
// 注意：此條件在大多數瀏覽器環境為真，但在純 Node.js 環境中可能兩者皆為 undefined，這符合預期 (避免污染測試環境全域)。
const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
if (!isTestEnv && (globalThis.self !== undefined || globalThis.window !== undefined)) {
  globalThis.Logger = Logger;
}
