import { SENSITIVE_KEY_PATTERN, LOGGING_SAFE_HEADERS } from '../config/index.js';

const MAX_DEPTH = 3;
const SANITIZED_LABEL = '[REDACTED_TOKEN]';

// 安全的 HTTP Headers 白名單 Set（為了性能而在內部轉換）
const SAFE_HEADERS_SET = new Set(LOGGING_SAFE_HEADERS);

/**
 * 清理 URL 用於日誌記錄，移除可能包含敏感資訊的部分
 *
 * @param {string} url - 原始 URL
 * @returns {string} 清理後的 URL
 */
export function sanitizeUrlForLogging(url) {
  if (!url || typeof url !== 'string') {
    return '[empty-url]';
  }

  try {
    const urlObj = new URL(url);
    // 只返回協議、主機名和路徑，移除查詢參數和片段
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
  } catch {
    // 如果無法解析，返回通用描述（避免洩露無效 URL 內容）
    return '[invalid-url]';
  }
}

/**
 * 遮蔽字串中的敏感部分
 *
 * @param {string} text
 * @param {number} [visibleStart=4] - 保留開頭的可見字符數
 * @param {number} [visibleEnd=4] - 保留結尾的可見字符數
 * @returns {string} 遮蔽後的字串
 */
export function maskSensitiveString(text, visibleStart = 4, visibleEnd = 4) {
  if (!text || typeof text !== 'string') {
    return '[empty]';
  }

  if (text.length <= visibleStart + visibleEnd) {
    return '***';
  }

  const start = text.slice(0, Math.max(0, visibleStart));
  const end = text.slice(Math.max(0, text.length - visibleEnd));
  return `${start}***${end}`;
}

export const LogSanitizer = {
  /**
   * 清洗單條日誌條目
   *
   * @param {string} message - 日誌訊息
   * @param {object} context - 日誌上下文
   * @returns {object} { message, context } 脫敏後的結果
   */
  sanitizeEntry(message, context) {
    return {
      message: this._sanitizeString(message),
      context: this._sanitizeValue(context, 0),
    };
  },

  /**
   * 清洗日誌列表
   *
   * @param {Array<object>} logs - 原始日誌陣列
   * @returns {Array<object>} 脫敏後的日誌副本
   * 注意：除了 `message` 和 `context` 會被重新處理外，其他頂層屬性僅進行淺拷貝 (Shallow Copy)。
   */
  sanitize(logs) {
    if (!Array.isArray(logs)) {
      return [];
    }

    // Map returns a new array, deep cloning is done during sanitization properties
    return logs.map(log => ({
      ...log,
      ...this.sanitizeEntry(log.message, log.context),
    }));
  },

  /**
   * 遞歸清理值（支持對象、數組、字符串）
   *
   * @param {*} value - 要清理的值
   * @param {number} depth - 當前遞歸深度
   * @param {WeakSet} [seen] - 用於檢測循環引用的集合
   * @returns {*} 清理後的值
   */
  /**
   * 遞歸清理值（支持對象、數組、字符串）
   *
   * @param {*} value - 要清理的值
   * @param {number} depth - 當前遞歸深度
   * @param {WeakSet} [seen] - 用於檢測循環引用的集合
   * @returns {*} 清理後的值
   */
  _sanitizeValue(value, depth, seen = new WeakSet()) {
    if (depth > MAX_DEPTH) {
      return '[MAX_DEPTH_REACHED]';
    }

    if (value === null || value === undefined) {
      return value;
    }

    // 處理循環引用
    if (typeof value === 'object' || typeof value === 'function') {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }

    if (typeof value === 'string') {
      return this._sanitizeString(value);
    }

    if (Array.isArray(value)) {
      return this._sanitizeArray(value, depth, seen);
    }

    if (value instanceof Error) {
      return this._sanitizeError(value, depth, seen);
    }

    if (typeof value === 'object') {
      return this._sanitizeObject(value, depth, seen);
    }

    return value;
  },

  /**
   * 清理陣列
   *
   * @param {Array} arr - 要清理的陣列
   * @param {number} depth - 當前深度
   * @param {WeakSet} seen - 循環引用集合
   * @returns {Array} 清理後的陣列
   */
  _sanitizeArray(arr, depth, seen) {
    return arr.map(item => this._sanitizeValue(item, depth + 1, seen));
  },

  /**
   * 清理 Error 對象
   *
   * @param {Error} error - 要清理的錯誤對象
   * @param {number} depth - 當前深度
   * @param {WeakSet} seen - 循環引用集合
   * @returns {object} 清理後的錯誤信息對象
   */
  _sanitizeError(error, depth, seen) {
    const sanitized = {
      name: error.name || 'Error',
    };

    // 嘗試保留其他自定義屬性
    for (const key of Object.keys(error)) {
      if (key !== 'message' && key !== 'stack' && key !== 'name') {
        sanitized[key] = this._sanitizeValue(error[key], depth + 1, seen);
      }
    }

    sanitized.message = this._sanitizeString(error.message);
    sanitized.stack = this._sanitizeStackTrace(error.stack);

    return sanitized;
  },

  /**
   * 清理一般對象
   *
   * @param {object} obj - 要清理的對象
   * @param {number} depth - 當前深度
   * @param {WeakSet} seen - 循環引用集合
   * @returns {object} 清理後的對象
   */
  _sanitizeObject(obj, depth, seen) {
    const safeObj = {};
    for (const [key, val] of Object.entries(obj)) {
      // 1. 檢查鍵名是否為敏感鍵（優先級最高）
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        safeObj[key] = '[REDACTED_SENSITIVE_KEY]';
        continue;
      }

      // 2. 特殊處理 headers 物件
      if (key.toLowerCase() === 'headers' && typeof val === 'object' && val !== null) {
        safeObj[key] = this._sanitizeHeaders(val);
        continue;
      }

      // 3. 特定字段名的特殊處理
      if (/url/i.test(key) && typeof val === 'string') {
        safeObj[key] = sanitizeUrlForLogging(val);
      } else if (/^(?:title|name)$/i.test(key) && typeof val === 'string') {
        safeObj[key] = '[REDACTED_TITLE]';
      } else if (/^properties$/i.test(key)) {
        safeObj[key] = '[REDACTED_PROPERTIES]';
      } else {
        safeObj[key] = this._sanitizeValue(val, depth + 1, seen);
      }
    }
    return safeObj;
  },

  /**
   * 清理 HTTP Headers 物件（採用白名單策略）
   *
   * @param {object} headers - Headers 物件
   * @returns {object} 清理後的 Headers
   */
  _sanitizeHeaders(headers) {
    const safeHeaders = {};
    for (const [key, val] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (SAFE_HEADERS_SET.has(lowerKey)) {
        safeHeaders[key] = val;
      } else {
        safeHeaders[key] = '[REDACTED_HEADER]';
      }
    }
    return safeHeaders;
  },

  /**
   * 清洗錯誤堆疊追蹤，移除內部路徑和精確位置資訊
   *
   * @param {string} stack - 原始 stack trace
   * @returns {string} 清洗後的 stack trace
   */
  _sanitizeStackTrace(stack) {
    if (!stack || typeof stack !== 'string') {
      return stack;
    }

    // 清洗每一行 stack trace
    const lines = stack.split('\n');
    const sanitizedLines = lines.map(line => {
      let sanitized = line;

      // 1. 處理檔案路徑：移除完整路徑，只保留檔案名稱
      // 邏輯：保留協議部分（如果是 chrome-extension://），移除中間路徑，保留檔案名及行號
      if (sanitized.includes('://')) {
        const protocolIdx = sanitized.indexOf('://');
        if (protocolIdx !== -1) {
          const protocolAndHostEnd = sanitized.indexOf('/', protocolIdx + 3);
          if (protocolAndHostEnd !== -1) {
            const protocolPart = sanitized.slice(0, Math.max(0, protocolAndHostEnd));
            const pathAndSuffix = sanitized.slice(Math.max(0, protocolAndHostEnd + 1));

            // 找出最後一個檔案名部分 (通常包含 .js)
            const lastPathSep = pathAndSuffix.lastIndexOf('/');
            if (lastPathSep !== -1) {
              sanitized = `${protocolPart}/${pathAndSuffix.slice(Math.max(0, lastPathSep + 1))}`;
            }
          }
        }
      } else if (sanitized.includes('/')) {
        const lastSep = sanitized.lastIndexOf('/');
        const prefixEnd = sanitized.lastIndexOf('at ', lastSep);
        if (lastSep !== -1 && prefixEnd !== -1) {
          sanitized =
            sanitized.slice(0, Math.max(0, prefixEnd + 3)) +
            sanitized.slice(Math.max(0, lastSep + 1));
        }
      }

      // 2. 移除 Extension ID（chrome-extension://xxx）
      sanitized = sanitized.replaceAll(
        /chrome-extension:\/\/[\da-z]+/gi,
        'chrome-extension://[ID]'
      );

      // 3. 移除精確的行號和列號（:16:13），只保留檔案名
      sanitized = sanitized.replaceAll(/\.js:\d+:\d+/g, '.js:[位置已隱藏]');

      return sanitized;
    });

    return sanitizedLines.join('\n');
  },

  /**
   * 清理字串內容
   *
   * 清理字串內容
   *
   * @param {string|*} str - 輸入字串（如果不是字串將嘗試轉換）
   * @returns {string} 清理後的字串
   */
  _sanitizeString(str) {
    if (str === null || str === undefined) {
      return '';
    }

    if (typeof str !== 'string') {
      // 強制轉換為字串，確保後續的正則表達式能正常運作
      // 這也解決了呼叫者傳入非字串（如錯誤物件、數字）時直接返回原值的問題
      try {
        str = String(str);
      } catch {
        return '[INVALID_STRING_INPUT]';
      }
    }

    if (!str) {
      return '';
    }

    let safeStr = str;

    // 1. URL 脫敏 (優先處理，避免 URL 中的參數被誤判為其他 Token)
    // 找出字串中的 URL 並進行清理
    safeStr = safeStr.replaceAll(/https?:\/\/[^\s"',]+/g, url => sanitizeUrlForLogging(url));

    // 2. Embedded Bearer/Basic Tokens
    // 移除錨點 ^$ 以支援字串中的 Token
    safeStr = safeStr.replaceAll(/(?:Bearer|Basic)\s+[\w+./~-]+=*/g, '[REDACTED_AUTH_HEADER]');

    // 3. JWT Tokens (eyJ...)
    // 策略：使用簡單線性正則匹配候選者，在 JS 中驗證結構以避免 ReDoS
    safeStr = safeStr.replaceAll(/\beyJ[\w.-]+\b/g, match => {
      // 驗證是否為三段式結構 (Header.Payload.Signature)
      if (match.split('.').length === 3) {
        return '[REDACTED_JWT]';
      }
      return match;
    });

    // 4. 常見 API Key 格式 (sk-, gh-, key-)
    safeStr = safeStr.replaceAll(
      /\b(?:sk|ghp|gho|xoxb|xoxp|key)-[\dA-Za-z]{20,}\b/g,
      '[REDACTED_API_KEY]'
    );

    // 5. 特殊 Token 模式 (Notion Tokens often start with secret_)
    safeStr = safeStr.replaceAll(/secret_[\dA-Za-z]+/g, SANITIZED_LABEL);

    // 6. Email 脫敏 (使用簡單且安全的匹配模式)
    safeStr = safeStr.replaceAll(/\b[\w%+.-]+@[\d.A-Za-z-]+\.[A-Za-z]{2,}\b/g, email => {
      return maskSensitiveString(email, 1, 4);
    });

    // 7. UUID 截斷
    // 策略：匹配 36 位 Hex/連字號字串，在 JS 中驗證格式
    safeStr = safeStr.replaceAll(/\b[\dA-Fa-f-]{36}\b/g, match => {
      // 驗證標準 UUID 格式 (8-4-4-4-12) 的連字號位置
      if (match[8] === '-' && match[13] === '-' && match[18] === '-' && match[23] === '-') {
        return `${match.slice(0, 8)}***`;
      }
      return match;
    });

    return safeStr;
  },
};
