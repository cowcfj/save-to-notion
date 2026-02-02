import { maskSensitiveString, sanitizeUrlForLogging } from './securityUtils.js';

const MAX_DEPTH = 3;
const SANITIZED_LABEL = '[REDACTED_TOKEN]';

export class LogSanitizer {
  /**
   * 清洗日誌列表
   * @param {Array<Object>} logs - 原始日誌陣列
   * @returns {Array<Object>} 脫敏後的日誌副本
   */
  static sanitize(logs) {
    if (!Array.isArray(logs)) {
      return [];
    }

    // Map returns a new array, deep cloning is done during sanitization properties
    return logs.map(log => ({
      ...log,
      message: this._sanitizeString(log.message),
      context: this._sanitizeValue(log.context, 0),
    }));
  }

  /**
   * 遞歸清理值（支持對象、數組、字符串）
   */
  static _sanitizeValue(value, depth) {
    if (depth > MAX_DEPTH) {
      return '[MAX_DEPTH_REACHED]';
    }

    if (value === null || value === undefined) {
      return value;
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
      return value.map(item => this._sanitizeValue(item, depth + 1));
    }

    // 處理對象
    if (typeof value === 'object') {
      const safeObj = {};
      for (const [key, val] of Object.entries(value)) {
        // 特定字段名的特殊處理 (Heuristics)
        if (/url/i.test(key) && typeof val === 'string') {
          safeObj[key] = sanitizeUrlForLogging(val);
        } else {
          safeObj[key] = this._sanitizeValue(val, depth + 1);
        }
      }
      return safeObj;
    }

    // 其他類型（數字、布林值）直接返回
    return value;
  }

  /**
   * 清理字串內容
   */
  static _sanitizeString(str) {
    if (!str || typeof str !== 'string') {
      return str;
    }

    let safeStr = str;

    // 1. 特殊 Token 模式 (Notion Tokens often start with secret_)
    safeStr = safeStr.replace(/secret_[a-zA-Z0-9]+/g, SANITIZED_LABEL);

    // 2. Email 脫敏
    // 簡單的 Email 正則，匹配常見格式
    safeStr = safeStr.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, email => {
      // 保留首尾字符，遮蔽中間
      return maskSensitiveString(email, 1, 4);
    });

    // 3. UUID 截斷 (8-4-4-4-12 format)
    // 避免誤殺，從嚴匹配
    safeStr = safeStr.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      uuid => {
        return `${uuid.slice(0, 8)}***`;
      }
    );

    return safeStr;
  }
}
