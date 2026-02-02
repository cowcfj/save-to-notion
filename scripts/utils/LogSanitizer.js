const MAX_DEPTH = 3;
const SANITIZED_LABEL = '[REDACTED_TOKEN]';

// 敏感鍵名模式（涵蓋常見的敏感欄位名稱，包括複合詞）
const SENSITIVE_KEY_PATTERN =
  /(?:auth|token|secret|credential|password|pwd|key|cookie|session|authorization|bearer|viewer|access|refresh|api|private)/i;

// 安全的 HTTP Headers 白名單（不包含敏感資訊）
const SAFE_HEADERS = new Set([
  'content-type',
  'content-length',
  'user-agent',
  'accept',
  'accept-language',
  'cache-control',
]);

/**
 * 清理 URL 用於日誌記錄，移除可能包含敏感資訊的部分
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
 * @param {string} text
 * @param {number} visibleStart
 * @param {number} visibleEnd
 */
export function maskSensitiveString(text, visibleStart = 4, visibleEnd = 4) {
  if (!text || typeof text !== 'string') {
    return '[empty]';
  }

  if (text.length <= visibleStart + visibleEnd) {
    return '***';
  }

  const start = text.substring(0, visibleStart);
  const end = text.substring(text.length - visibleEnd);
  return `${start}***${end}`;
}

export class LogSanitizer {
  /**
   * 清洗單條日誌條目
   * @param {string} message - 日誌訊息
   * @param {Object} context - 日誌上下文
   * @returns {Object} { message, context } 脫敏後的結果
   */
  static sanitizeEntry(message, context) {
    return {
      message: this._sanitizeString(message),
      context: this._sanitizeValue(context, 0),
    };
  }

  /**
   * 清洗日誌列表
   * @param {Array<Object>} logs - 原始日誌陣列
   * @returns {Array<Object>} 脫敏後的日誌副本
   * @note 除了 `message` 和 `context` 會被重新處理外，其他頂層屬性僅進行淺拷貝 (Shallow Copy)。
   */
  static sanitize(logs) {
    if (!Array.isArray(logs)) {
      return [];
    }

    // Map returns a new array, deep cloning is done during sanitization properties
    return logs.map(log => ({
      ...log,
      ...this.sanitizeEntry(log.message, log.context),
    }));
  }

  /**
   * 遞歸清理值（支持對象、數組、字符串）
   * @param {*} value - 要清理的值
   * @param {number} depth - 當前遞歸深度
   * @param {WeakSet} seen - 用於檢測循環引用的集合
   */
  static _sanitizeValue(value, depth, seen = new WeakSet()) {
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

    // 處理字串
    if (typeof value === 'string') {
      // 如果是 URL 字段，優先使用 URL 清洗
      // 但這裡我們不知道字段名，只能依靠內容判斷
      // 簡單起見，日誌內容統一走 sanitizeString
      return this._sanitizeString(value);
    }

    // 處理陣列
    if (Array.isArray(value)) {
      return value.map(item => this._sanitizeValue(item, depth + 1, seen));
    }

    // 處理 Error 對象 (優先處理，因為 Error 也是 Object)
    if (value instanceof Error) {
      const sanitized = {
        name: value.name || 'Error',
      };

      // 嘗試保留其他自定義屬性 (手動迭代以避免展開運算符的問題)
      for (const key of Object.keys(value)) {
        if (key !== 'message' && key !== 'stack' && key !== 'name') {
          sanitized[key] = this._sanitizeValue(value[key], depth + 1, seen);
        }
      }

      // 強制覆蓋核心屬性以確保正確脫敏
      sanitized.message = this._sanitizeString(value.message);
      sanitized.stack = this._sanitizeStackTrace(value.stack);

      return sanitized;
    }

    // 處理對象
    if (typeof value === 'object') {
      const safeObj = {};
      for (const [key, val] of Object.entries(value)) {
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

        // 3. 特定字段名的特殊處理 (Heuristics)
        if (/url/i.test(key) && typeof val === 'string') {
          safeObj[key] = sanitizeUrlForLogging(val);
        } else if (/^(?:title|name)$/i.test(key) && typeof val === 'string') {
          // 標題類字段脫敏
          safeObj[key] = '[REDACTED_TITLE]';
        } else if (/^properties$/i.test(key)) {
          // 屬性字段脫敏 (隱藏 Schema)
          safeObj[key] = '[REDACTED_PROPERTIES]';
        } else {
          safeObj[key] = this._sanitizeValue(val, depth + 1, seen);
        }
      }
      return safeObj;
    }

    // 其他類型（數字、布林值）直接返回
    return value;
  }

  /**
   * 清理 HTTP Headers 物件（採用白名單策略）
   * @param {Object} headers - Headers 物件
   * @returns {Object} 清理後的 Headers
   */
  static _sanitizeHeaders(headers) {
    const safeHeaders = {};
    for (const [key, val] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (SAFE_HEADERS.has(lowerKey)) {
        safeHeaders[key] = val;
      } else {
        safeHeaders[key] = '[REDACTED_HEADER]';
      }
    }
    return safeHeaders;
  }

  /**
   * 清洗錯誤堆疊追蹤，移除內部路徑和精確位置資訊
   * @param {string} stack - 原始 stack trace
   * @returns {string} 清洗後的 stack trace
   */
  static _sanitizeStackTrace(stack) {
    if (!stack || typeof stack !== 'string') {
      return stack;
    }

    // 清洗每一行 stack trace
    const lines = stack.split('\n');
    const sanitizedLines = lines.map(line => {
      // 移除 Extension ID（chrome-extension://xxx）
      let sanitized = line.replace(/chrome-extension:\/\/[a-z0-9]+/gi, 'chrome-extension://[ID]');

      // 移除完整路徑，只保留檔案名稱
      // 範例：scripts/utils/LogExporter.js -> LogExporter.js
      // 使用非貪婪匹配避免回溯問題
      sanitized = sanitized.replace(/[a-zA-Z0-9_/-]*\/([a-zA-Z0-9_.-]+\.js)/g, '$1');

      // 移除精確的行號和列號（:16:13），只保留檔案名
      // 保留函數名稱但移除位置資訊，以平衡除錯需求和安全性
      sanitized = sanitized.replace(/\.js:\d+:\d+/g, '.js:[位置已隱藏]');

      return sanitized;
    });

    return sanitizedLines.join('\n');
  }

  /**
   * 清理字串內容
   */
  static _sanitizeString(str) {
    if (str === null || str === undefined) {
      return '';
    }

    if (typeof str !== 'string') {
      // 強制轉換為字串，確保後續的正則表達式能正常運作
      // 這也解決了呼叫者傳入非字串（如錯誤物件、數字）時直接返回原值的問題
      try {
        str = String(str);
      } catch (_error) {
        return '[INVALID_STRING_INPUT]';
      }
    }

    if (!str) {
      return '';
    }

    let safeStr = str;

    // 1. URL 脫敏 (優先處理，避免 URL 中的參數被誤判為其他 Token)
    // 找出字串中的 URL 並進行清理
    safeStr = safeStr.replace(/https?:\/\/[^\s"',]+/g, url => sanitizeUrlForLogging(url));

    // 2. Embedded Bearer/Basic Tokens
    // 移除錨點 ^$ 以支援字串中的 Token
    safeStr = safeStr.replace(/(?:Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/g, '[REDACTED_AUTH_HEADER]');

    // 3. JWT Tokens (eyJ...)
    // 匹配標準 JWT 格式：header.payload.signature
    // 注意：長度閾值為啟發式設定，並非 RFC 強制要求；此處放寬以支援短 Token
    safeStr = safeStr.replace(
      /\beyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g,
      '[REDACTED_JWT]'
    );

    // 4. 常見 API Key 格式 (sk-, gh-, key-)
    safeStr = safeStr.replace(
      /\b(?:sk|ghp|gho|xoxb|xoxp|key)-[A-Za-z0-9]{20,}\b/g,
      '[REDACTED_API_KEY]'
    );

    // 5. 特殊 Token 模式 (Notion Tokens often start with secret_)
    safeStr = safeStr.replace(/secret_[a-zA-Z0-9]+/g, SANITIZED_LABEL);

    // 6. Email 脫敏
    safeStr = safeStr.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, email => {
      return maskSensitiveString(email, 1, 4);
    });

    // 7. UUID 截斷
    safeStr = safeStr.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      uuid => {
        return `${uuid.slice(0, 8)}***`;
      }
    );

    return safeStr;
  }
}
