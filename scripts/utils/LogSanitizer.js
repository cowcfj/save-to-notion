/**
 * 敏感鍵名模式（涵蓋常見的敏感欄位名稱，包括複合詞）
 * `(?:auth|token|email)(?![a-z])` 匹配 auth、auth_token 等，但排除 author、tokenCount
 * `_?key\b` 精確匹配 apiKey、api_key 等，避免誤判 keyboard、keydown
 * 用於日誌脫敏，集中在此維持高內聚
 */
const SENSITIVE_KEY_PATTERN =
  /(?:auth|token|email)(?![a-z])|secret|credential|password|pwd|_?key\b|cookie|session|authorization|bearer|viewer/i;

/**
 * 安全的 HTTP Headers 白名單（不包含敏感資訊）
 * 用於日誌脫敏，集中在此維持高內聚
 */
const LOGGING_SAFE_HEADERS = [
  'content-type',
  'content-length',
  'user-agent',
  'accept',
  'accept-language',
  'cache-control',
];

const MAX_DEPTH = 3;
const SANITIZED_LABEL = '[REDACTED_TOKEN]';

// 安全的 HTTP Headers 白名單 Set（為了性能而在內部轉換）
const SAFE_HEADERS_SET = new Set(LOGGING_SAFE_HEADERS);

// Error 物件中已被獨立處理的保留欄位：name 於初始化、message / stack 於迴圈後，
// 其餘自定義屬性才需遞迴清洗
const RESERVED_ERROR_KEYS = new Set(['message', 'stack', 'name']);

const STACK_FRAME_AT_PREFIX_PATTERN = /^\s*at\s+/;
const STACK_FRAME_POSITION_SUFFIX_PATTERN = /:\d+:\d+\s*\)?$/;
const PATH_POSITION_SUFFIX_PATTERN = /:\d+:\d+\s*$/;
const WHITESPACE_PATTERN = /\s/;

/**
 * 日誌脫敏中需移除的追蹤參數
 * 維護說明：此清單與 config/extraction.js 的 URL_NORMALIZATION.TRACKING_PARAMS 保持同步。
 * 刻意保留獨立副本以避免安全模組依賴功能配置。
 * 同步性由 LogSanitizer.test.js 自動驗證 — 若不一致測試會失敗。
 */
export const LOG_TRACKING_PARAMS = Object.freeze([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'vero_id',
]);

/**
 * URL query 參數中的敏感鍵名清單
 * 出現這些鍵名時，其值會被遮蔽為 [REDACTED]，而非直接刪除（保留鍵名便於偵錯）
 */
const SENSITIVE_QUERY_KEYS = [
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'code',
  'session',
  'session_id',
  'key',
  'api_key',
  'apikey',
  'password',
  'passwd',
  'auth',
  'secret',
  'authorization',
  'authorization_token',
  'bearer',
  'private_token',
  'credential',
  'credentials',
];
const SENSITIVE_QUERY_KEYS_SET = new Set(SENSITIVE_QUERY_KEYS.map(key => key.toLowerCase()));
const SENSITIVE_QUERY_KEY_PARTS = new Set([
  'token',
  'secret',
  'auth',
  'password',
  'passwd',
  'credential',
  'credentials',
]);

function _safeDecodeUrlComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function _isSensitiveQueryKey(queryKey) {
  if (!queryKey || typeof queryKey !== 'string') {
    return false;
  }

  const lowerKey = queryKey.replaceAll('.', '_').toLowerCase();

  if (SENSITIVE_QUERY_KEYS_SET.has(lowerKey)) {
    return true;
  }

  const parts = lowerKey.split(/[_-]+/).filter(Boolean);
  return parts.length > 1 && parts.some(part => SENSITIVE_QUERY_KEY_PARTS.has(part));
}

function _redactSensitiveQueryInUrlString(urlObj, sanitizedLabel = SANITIZED_LABEL) {
  const rawSearch = urlObj.search.startsWith('?') ? urlObj.search.slice(1) : urlObj.search;
  if (!rawSearch) {
    return;
  }

  const redactedPairs = rawSearch.split('&').map(pair => {
    const equalIndex = pair.indexOf('=');
    if (equalIndex === -1) {
      return pair;
    }

    const rawKey = pair.slice(0, equalIndex);
    const decodedKey = _safeDecodeUrlComponent(rawKey);
    if (!_isSensitiveQueryKey(decodedKey)) {
      return pair;
    }

    return `${rawKey}=${sanitizedLabel}`;
  });

  urlObj.search = `?${redactedPairs.join('&')}`;
}

/**
 * 清理 URL 用於日誌記錄，只移除已知追蹤參數，保留有意義的 query 參數
 *
 * 設計原則：
 * - 移除已知廣告追蹤參數（utm_*、gclid 等）保護隱私
 * - 遮蔽敏感 query 參數值（token、code、session 等），保留鍵名便於偵錯
 * - 保留有意義的 query（如 WordPress ?p=7741、分頁 ?page=2 等）便於偵錯
 * - 移除 fragment (#hash)
 *
 * @param {string} url - 原始 URL
 * @param {string} [baseOrigin='http://localhost'] - 相對路徑解析基底
 * @returns {string} 清理後的 URL
 */
const LOG_FALLBACK_BASE_ORIGIN = 'http://localhost';

/**
 * @param {string} url
 * @returns {boolean}
 */
function _hasUrlScheme(url) {
  return /^[a-zA-Z][\w+.-]*:/.test(url);
}

/**
 * @param {string} url
 * @param {boolean} hasScheme
 * @returns {boolean}
 */
function _isRelativePathLike(url, hasScheme) {
  return /^(?:[/?#]|\.\.?\/)/.test(url) || (!hasScheme && url.includes('/'));
}

/**
 * 解析日誌 URL：依是否含 scheme 選擇直接解析或以 base origin 解析。
 * 解析失敗時 throw，由 caller 統一回 [invalid-url]。
 *
 * @param {string} url
 * @param {boolean} hasScheme
 * @param {string} baseOrigin
 * @returns {URL}
 */
function _resolveLoggingUrlObject(url, hasScheme, baseOrigin) {
  if (hasScheme) {
    return new URL(url);
  }
  let safeBaseOrigin = LOG_FALLBACK_BASE_ORIGIN;
  try {
    safeBaseOrigin = new URL(baseOrigin).origin;
  } catch {
    safeBaseOrigin = LOG_FALLBACK_BASE_ORIGIN;
  }
  return new URL(url, safeBaseOrigin);
}

export function sanitizeUrlForLogging(url, baseOrigin = LOG_FALLBACK_BASE_ORIGIN) {
  if (!url || typeof url !== 'string') {
    return '[empty-url]';
  }

  const hasScheme = _hasUrlScheme(url);
  if (!hasScheme && !_isRelativePathLike(url, hasScheme)) {
    return '[invalid-url]';
  }

  try {
    const urlObj = _resolveLoggingUrlObject(url, hasScheme, baseOrigin);
    // 移除 URL userinfo 防止認證資訊洩漏
    urlObj.username = '';
    urlObj.password = '';
    // 移除已知追蹤參數
    for (const param of LOG_TRACKING_PARAMS) {
      urlObj.searchParams.delete(param);
    }
    // 移除 fragment
    urlObj.hash = '';

    // 遮蔽敏感 query 參數值（保留 query key 便於偵錯）
    _redactSensitiveQueryInUrlString(urlObj, SANITIZED_LABEL);
    return urlObj.toString();
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

function _isNonNullObject(val) {
  return typeof val === 'object' && val !== null;
}

function _isHeadersField(key, val) {
  return key.toLowerCase() === 'headers' && _isNonNullObject(val);
}

function _isUrlField(key, val) {
  return /url/i.test(key) && typeof val === 'string';
}

function _isTitleOrNameField(key, val) {
  return /^(?:title|name)$/i.test(key) && typeof val === 'string';
}

function _isPropertiesField(key) {
  return /^properties$/i.test(key);
}

/**
 * 壓縮含協議（如 chrome-extension://）的 stack trace 行：
 * 保留 protocol + host，移除中間路徑，只留最後的檔名與行號。
 *
 * @param {string} line
 * @returns {string}
 */
function _stripProtocolUrlPath(line) {
  const protocolIdx = line.indexOf('://');
  if (protocolIdx === -1) {
    return line;
  }
  const protocolAndHostEnd = line.indexOf('/', protocolIdx + 3);
  if (protocolAndHostEnd === -1) {
    return line;
  }
  const pathAndSuffix = line.slice(Math.max(0, protocolAndHostEnd + 1));
  const lastPathSep = pathAndSuffix.lastIndexOf('/');
  if (lastPathSep === -1) {
    return line;
  }
  const protocolPart = line.slice(0, Math.max(0, protocolAndHostEnd));
  return `${protocolPart}/${pathAndSuffix.slice(Math.max(0, lastPathSep + 1))}`;
}

function _isPathWithPosition(value) {
  const trimmed = value.trim();
  return (
    trimmed.includes('/') &&
    PATH_POSITION_SUFFIX_PATTERN.test(trimmed) &&
    !WHITESPACE_PATTERN.test(trimmed)
  );
}

function _stripDirectoryFromPathToken(pathToken) {
  const trimmedEndLength = pathToken.trimEnd().length;
  const trailingWhitespace = pathToken.slice(trimmedEndLength);
  const path = pathToken.slice(0, trimmedEndLength);
  const lastSep = path.lastIndexOf('/');
  if (lastSep === -1) {
    return pathToken;
  }
  return `${path.slice(lastSep + 1)}${trailingWhitespace}`;
}

function _stripParenthesizedBareFilePath(line) {
  const openParen = line.lastIndexOf('(');
  const closeParen = line.lastIndexOf(')');
  if (openParen === -1 || closeParen <= openParen) {
    return null;
  }

  const pathToken = line.slice(openParen + 1, closeParen);
  if (!_isPathWithPosition(pathToken)) {
    return null;
  }

  return `${line.slice(0, openParen + 1)}${_stripDirectoryFromPathToken(
    pathToken
  )}${line.slice(closeParen)}`;
}

function _stripAtBareFilePath(line) {
  const atMatch = STACK_FRAME_AT_PREFIX_PATTERN.exec(line);
  if (!atMatch) {
    return null;
  }

  const pathToken = line.slice(atMatch[0].length);
  if (!_isPathWithPosition(pathToken)) {
    return line;
  }

  return `${atMatch[0]}${_stripDirectoryFromPathToken(pathToken)}`;
}

function _stripBarePathLine(line) {
  if (!_isPathWithPosition(line)) {
    return line;
  }

  const leadingWhitespaceLength = line.length - line.trimStart().length;
  const leadingWhitespace = line.slice(0, leadingWhitespaceLength);
  return `${leadingWhitespace}${_stripDirectoryFromPathToken(line.trimStart())}`;
}

/**
 * 壓縮無協議的 stack frame 路徑（如 "at fn (/a/b/c.js:1:2)" 或裸
 * "/a/b/c.js:1:2"）：移除目錄部分只保留檔名，保留 frame 前綴。
 *
 * @param {string} line
 * @returns {string}
 */
function _stripBareFilePath(line) {
  const stackFrameResult = _stripParenthesizedBareFilePath(line) ?? _stripAtBareFilePath(line);
  if (stackFrameResult !== null) {
    return stackFrameResult;
  }

  return _stripBarePathLine(line);
}

function _isBareFilePathStackFrame(line) {
  return (
    line.includes('/') &&
    STACK_FRAME_POSITION_SUFFIX_PATTERN.test(line) &&
    (STACK_FRAME_AT_PREFIX_PATTERN.test(line) || _isPathWithPosition(line))
  );
}

/**
 * 驗證並脫敏 JWT 候選字串
 *
 * @param {string} match
 * @returns {string}
 */
function _redactJwtCandidate(match) {
  if (match.split('.').length === 3) {
    return '[REDACTED_JWT]';
  }
  return match;
}

/**
 * 驗證是否為標準 UUID 格式 (8-4-4-4-12) 的連字號位置
 *
 * @param {string} match
 * @returns {boolean}
 */
function _isStandardUuidShape(match) {
  return match[8] === '-' && match[13] === '-' && match[18] === '-' && match[23] === '-';
}

/**
 * 驗證並截斷 UUID 候選字串
 *
 * @param {string} match
 * @returns {string}
 */
function _redactUuidCandidate(match) {
  if (_isStandardUuidShape(match)) {
    return `${match.slice(0, 8)}***`;
  }
  return match;
}

/**
 * 脫敏 Email 匹配項
 *
 * @param {string} email
 * @returns {string}
 */
function _maskEmailMatch(email) {
  return maskSensitiveString(email, 1, 4);
}

export const LogSanitizer = {
  /**
   * 清洗單條日誌條目
   *
   * @param {string} message - 日誌訊息
   * @param {object} context - 日誌上下文
   * @param {object} [options] - 配置選項
   * @returns {object} { message, context } 脫敏後的結果
   */
  sanitizeEntry(message, context, options = {}) {
    return {
      message: this._sanitizeString(message),
      context: this._sanitizeValue(context, 0, new WeakSet(), options),
    };
  },

  /**
   * 清洗日誌列表
   *
   * @param {Array<object>} logs - 原始日誌陣列
   * @param {object} [options] - 配置選項（如 isDev）
   * @returns {Array<object>} 脫敏後的日誌副本
   * 注意：除了 `message` 和 `context` 會被重新處理外，其他頂層屬性僅進行淺拷貝 (Shallow Copy)。
   */
  sanitize(logs, options = {}) {
    if (!Array.isArray(logs)) {
      return [];
    }

    // map 回傳新陣列；深拷貝已在 sanitizeEntry 的遞歸清理中完成
    return logs.map(log => ({
      ...log,
      ...this.sanitizeEntry(log.message, log.context, options),
    }));
  },

  /**
   * 遞歸清理值（支持對象、數組、字符串）
   *
   * @param {*} value - 要清理的值
   * @param {number} depth - 當前遞歸深度
   * @param {WeakSet} [seen] - 用於檢測循環引用的集合
   * @param {object} [options] - 配置選項
   * @returns {*} 清理後的值
   */
  _sanitizeValue(value, depth, seen = new WeakSet(), options = {}) {
    if (depth > MAX_DEPTH) {
      return '[MAX_DEPTH_REACHED]';
    }

    if (value === null || value === undefined) {
      return value;
    }

    // 函式直接回傳標記，不加入 seen（避免共享引用被誤判為循環）
    if (typeof value === 'function') {
      return '[Function]';
    }

    if (typeof value === 'string') {
      return this._sanitizeString(value);
    }

    if (typeof value === 'object') {
      return this._sanitizeObjectLike(value, depth, seen, options);
    }

    // 其餘原始型別（number / boolean / bigint / symbol）原樣回傳
    return value;
  },

  /**
   * 處理物件型別（array / Error / 一般物件）的遞迴清理，
   * 並維護 seen 的 DFS 加入/回溯，避免共享引用被誤判為循環。
   *
   * @param {object} value
   * @param {number} depth
   * @param {WeakSet} seen
   * @param {object} options
   * @returns {*}
   */
  _sanitizeObjectLike(value, depth, seen, options) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    let result;
    if (Array.isArray(value)) {
      result = this._sanitizeArray(value, depth, seen, options);
    } else if (value instanceof Error) {
      result = this._sanitizeError(value, depth, seen, options);
    } else {
      result = this._sanitizeObject(value, depth, seen, options);
    }

    // DFS 回溯：處理完畢後移除，避免共享引用被誤判為循環
    seen.delete(value);
    return result;
  },

  /**
   * 清理陣列
   *
   * @param {Array} arr - 要清理的陣列
   * @param {number} depth - 當前深度
   * @param {WeakSet} seen - 循環引用集合
   * @param {object} options - 配置選項
   * @returns {Array} 清理後的陣列
   */
  _sanitizeArray(arr, depth, seen, options) {
    return arr.map(item => this._sanitizeValue(item, depth + 1, seen, options));
  },

  /**
   * 清理 Error 對象
   *
   * @param {Error} error - 要清理的錯誤對象
   * @param {number} depth - 當前深度
   * @param {WeakSet} seen - 循環引用集合
   * @param {object} options - 配置選項
   * @returns {object} 清理後的錯誤信息對象
   */
  _sanitizeError(error, depth, seen, options) {
    const sanitized = {
      name: error.name || 'Error',
    };

    // 嘗試保留其他自定義屬性
    for (const key of Object.keys(error)) {
      if (!RESERVED_ERROR_KEYS.has(key)) {
        sanitized[key] = this._sanitizeValue(error[key], depth + 1, seen, options);
      }
    }

    sanitized.message = this._sanitizeString(error.message);
    sanitized.stack = this._sanitizeStackTrace(error.stack, options);

    return sanitized;
  },

  /**
   * 清理一般對象
   *
   * @param {object} obj - 要清理的對象
   * @param {number} depth - 當前深度
   * @param {WeakSet} seen - 循環引用集合
   * @param {object} options - 配置選項
   * @returns {object} 清理後的對象
   */
  _sanitizeObject(obj, depth, seen, options) {
    const safeObj = {};
    for (const [key, val] of Object.entries(obj)) {
      // 1. 敏感鍵名（優先級最高）
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        safeObj[key] = '[REDACTED_SENSITIVE_KEY]';
        continue;
      }
      // 2. headers 物件白名單清洗
      if (_isHeadersField(key, val)) {
        safeObj[key] = this._sanitizeHeaders(val);
        continue;
      }
      // 3. url 欄位
      if (_isUrlField(key, val)) {
        safeObj[key] = sanitizeUrlForLogging(val);
        continue;
      }
      // 4. title / name 欄位
      if (_isTitleOrNameField(key, val)) {
        safeObj[key] = '[REDACTED_TITLE]';
        continue;
      }
      // 5. properties 欄位
      if (_isPropertiesField(key)) {
        safeObj[key] = '[REDACTED_PROPERTIES]';
        continue;
      }
      // 6. 一般值遞迴清理
      safeObj[key] = this._sanitizeValue(val, depth + 1, seen, options);
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
   * @param {object} [_options] - 配置選項（保留供未來擴展使用）
   * @returns {string} 清洗後的 stack trace
   */
  /**
   * 清洗單行 stack trace：壓縮路徑並遮蔽 Extension ID。
   *
   * @param {string} line
   * @returns {string}
   */
  _sanitizeStackTraceLine(line) {
    let sanitized = line.includes('://') ? _stripProtocolUrlPath(line) : line;
    if (!line.includes('://') && _isBareFilePathStackFrame(sanitized)) {
      sanitized = _stripBareFilePath(sanitized);
    }

    // 2. 移除 Extension ID（chrome-extension://xxx）
    sanitized = sanitized.replaceAll(/chrome-extension:\/\/[\da-z]+/gi, 'chrome-extension://[ID]');

    // 3. 移除精確的行號和列號（:16:13），只保留檔案名
    // [Security Policy] 根據新架構，生產環境保留行號以協助除錯 (詳見 SECURE_LOGGING_ARCHITECTURE.md)

    return sanitized;
  },

  _sanitizeStackTrace(stack, _options = {}) {
    if (!stack || typeof stack !== 'string') {
      return stack;
    }

    return stack
      .split('\n')
      .map(line => this._sanitizeStackTraceLine(line))
      .join('\n');
  },

  /**
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
    safeStr = safeStr.replaceAll(/\beyJ[\w.-]+\b/g, _redactJwtCandidate);

    // 4. 常見 API Key 格式 (sk-, gh-, key-)
    safeStr = safeStr.replaceAll(
      /\b(?:sk|ghp|gho|xoxb|xoxp|key)-[\dA-Za-z]{20,}\b/g,
      '[REDACTED_API_KEY]'
    );

    // 5. 特殊 Token 模式 (Notion Tokens often start with secret_)
    safeStr = safeStr.replaceAll(/secret_[\dA-Za-z]+/g, SANITIZED_LABEL);

    // 6. Email 脫敏 (使用簡單且安全的匹配模式)
    safeStr = safeStr.replaceAll(/\b[\w%+.-]+@[\d.A-Za-z-]+\.[A-Za-z]{2,}\b/g, _maskEmailMatch);

    // 7. UUID 截斷
    // 策略：匹配 36 位 Hex/連字號字串，在 JS 中驗證格式
    safeStr = safeStr.replaceAll(/\b[\dA-Fa-f-]{36}\b/g, _redactUuidCandidate);

    return safeStr;
  },
};
