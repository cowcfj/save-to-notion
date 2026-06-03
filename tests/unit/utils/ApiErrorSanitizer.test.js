/**
 * ApiErrorSanitizer 單元測試
 *
 * 測試 scripts/utils/ApiErrorSanitizer.js 的功能
 */

import { sanitizeApiError } from '../../../scripts/utils/ApiErrorSanitizer.js';
import * as ApiErrorSanitizerExports from '../../../scripts/utils/ApiErrorSanitizer.js';

describe('ApiErrorSanitizer', () => {
  describe('export surface', () => {
    test('應只匯出 sanitizeApiError', () => {
      expect(ApiErrorSanitizerExports).toHaveProperty('sanitizeApiError');
      expect(Object.keys(ApiErrorSanitizerExports)).toHaveLength(1);
    });
  });

  describe('sanitizeApiError', () => {
    describe('API Key 格式無效', () => {
      test('"api key is invalid" 應返回 API Key（因為包含 api key）', () => {
        const result = sanitizeApiError('api key is invalid');
        expect(result).toBe('API_KEY_NOT_CONFIGURED');
      });

      test('"malformed: api_key" 應返回 API Key', () => {
        const result = sanitizeApiError('malformed: api_key');
        expect(result).toBe('API_KEY_NOT_CONFIGURED');
      });
    });

    describe('Integration 連接斷開', () => {
      test('"unauthorized: API token is invalid" 應返回 API Key', () => {
        const result = sanitizeApiError('unauthorized: API token is invalid');
        expect(result).toBe('API_KEY_NOT_CONFIGURED');
      });

      test('"unauthorized: integration not found" 應返回 Page ID is missing', () => {
        const result = sanitizeApiError('unauthorized: integration not found');
        expect(result).toBe('MISSING_PAGE_ID');
      });
    });

    describe('一般認證錯誤', () => {
      test.each([['Unauthorized access'], ['authentication failed'], ['api key required']])(
        '"%s" 應返回 API Key 錯誤訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('API_KEY_NOT_CONFIGURED');
        }
      );
    });

    describe('資料庫權限不足', () => {
      // AUTH_FORBIDDEN 優先於 DATA_SOURCE：'forbidden' / 'permission denied'
      // 是更精確的權限訊號，會被歸為 INTEGRATION_FORBIDDEN。
      test.each([['database forbidden'], ['database permission denied']])(
        '"%s" 應返回 INTEGRATION_FORBIDDEN（AUTH_FORBIDDEN 優先）',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('INTEGRATION_FORBIDDEN');
        }
      );

      // 'access denied' 不屬於 AUTH_FORBIDDEN，但含 'database'：
      // PERMISSION + PERMISSION_DB → DATABASE_ACCESS_DENIED。
      test('"database access denied" 應返回 DATABASE_ACCESS_DENIED', () => {
        const result = sanitizeApiError('database access denied');
        expect(result).toBe('DATABASE_ACCESS_DENIED');
      });
    });

    describe('一般權限不足錯誤 (Forbidden/Auth)', () => {
      test.each([['forbidden: access denied'], ['Forbidden'], ['permission denied']])(
        '"%s" 應返回資料庫權限不足訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('INTEGRATION_FORBIDDEN');
        }
      );
    });

    describe('一般權限不足錯誤 (Access Denied)', () => {
      test.each([['access denied to resource']])('"%s" 應返回不能存取內容訊息', input => {
        const result = sanitizeApiError(input);
        expect(result).toBe('TAB_RESTRICTED_PAGE');
      });
    });

    describe('優先順序邊緣情況', () => {
      test('"unauthorized: invalid token" 應返回 API Key（Auth 優先於 Validation）', () => {
        const result = sanitizeApiError('unauthorized: invalid token');
        expect(result).toBe('API_KEY_NOT_CONFIGURED');
      });

      test('"database permission denied" 應返回 INTEGRATION_FORBIDDEN（AUTH_FORBIDDEN 優先於 DATA_SOURCE）', () => {
        const result = sanitizeApiError('database permission denied');
        expect(result).toBe('INTEGRATION_FORBIDDEN');
      });

      test('"unauthorized" 純粹無其他關鍵字應返回 API Key', () => {
        const result = sanitizeApiError('unauthorized');
        expect(result).toBe('API_KEY_NOT_CONFIGURED');
      });

      test('"invalid token" (通用 token) 應返回 validation_error (不再是 Auth 若無其他 Auth 關鍵字)', () => {
        const result = sanitizeApiError('invalid token provided');
        expect(result).toBe('VALIDATION_ERROR');
      });

      test('"invalid api token" 應返回 API Key', () => {
        const result = sanitizeApiError('invalid api token provided');
        expect(result).toBe('API_KEY_NOT_CONFIGURED');
      });
    });

    describe('速率限制錯誤', () => {
      test.each([['rate limit exceeded'], ['too many requests'], ['Rate Limit']])(
        '"%s" 應返回速率限制訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('RATE_LIMITED');
        }
      );
    });

    describe('資源不存在錯誤', () => {
      test.each([['not found'], ['resource does not exist'], ['page not found']])(
        '"%s" 應返回資源不存在訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('MISSING_PAGE_ID');
        }
      );
    });

    describe('驗證錯誤', () => {
      test.each([['validation failed'], ['invalid image url'], ['media upload failed']])(
        '"%s" 應返回數據格式訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('VALIDATION_ERROR');
        }
      );
    });

    describe('網絡錯誤', () => {
      test.each([['network error'], ['fetch failed'], ['ENOTFOUND api.notion.com']])(
        '"%s" 應返回網絡錯誤訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('NETWORK_ERROR');
        }
      );
    });

    describe('超時錯誤', () => {
      // 超時錯誤必須先於 NETWORK_ERROR 識別，否則會被「網路連線異常」訊息覆蓋
      // 喪失「請求超時」的精確語意（PATTERNS.TIMEOUT vs PATTERNS.NETWORK_ERROR）。
      test.each([['timeout waiting for response'], ['Request timeout'], ['connection timed out']])(
        '"%s" 應返回 TIMEOUT 分類',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('TIMEOUT');
        }
      );

      test('內部 TIMEOUT token 應 fast-path 原樣回傳', () => {
        expect(sanitizeApiError('TIMEOUT')).toBe('TIMEOUT');
      });
    });

    describe('服務錯誤', () => {
      test.each([['service unavailable'], ['internal error occurred']])(
        '"%s" 應返回服務不可用訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('INTERNAL_SERVER_ERROR');
        }
      );
    });

    describe('chrome.tabs 錯誤', () => {
      test.each([
        ['No tab with id: 1234'],
        ['no tab with id: 5678'],
        ['Error: No tab with id: 999'],
      ])('"%s" 應返回 NO_TAB_WITH_ID', input => {
        expect(sanitizeApiError(input)).toBe('NO_TAB_WITH_ID');
      });
    });

    describe('chrome.runtime content-script 未就緒', () => {
      test.each([['Receiving end does not exist'], ['Error: Receiving end does not exist.']])(
        '"%s" 應返回 CONTENT_SCRIPT_NOT_READY',
        input => {
          expect(sanitizeApiError(input)).toBe('CONTENT_SCRIPT_NOT_READY');
        }
      );

      // chrome 實際拋出的複合訊息：'Could not establish connection. Receiving end does not exist.'
      // 兩條 mapping 同時命中時，priority 必須給更具體的 receiving-end axis（content script 已 unmount）。
      test('chrome 複合訊息應命中 CONTENT_SCRIPT_NOT_READY（更具體 axis 勝出）', () => {
        const composite = 'Could not establish connection. Receiving end does not exist.';
        expect(sanitizeApiError(composite)).toBe('CONTENT_SCRIPT_NOT_READY');
      });

      // Priority guard：NOT_FOUND keyword 含 'does not exist'，是 'receiving end does not exist'
      // 的子串。若 _checkSimpleMappings priority 被未來 PR 倒置，此測試會失敗並明確報告誤分類。
      test('priority guard：receiving-end 訊息 MUST NOT 落到 MISSING_PAGE_ID', () => {
        expect(sanitizeApiError('Receiving end does not exist')).not.toBe('MISSING_PAGE_ID');
      });
    });

    describe('chrome.runtime 連線失敗', () => {
      test.each([
        ['Could not establish connection'],
        ['could not establish connection. unknown extension.'],
      ])('"%s" 應返回 TAB_COMMUNICATION_FAILED', input => {
        expect(sanitizeApiError(input)).toBe('TAB_COMMUNICATION_FAILED');
      });
    });

    describe('數據庫錯誤', () => {
      test('數據庫相關錯誤（帶頁面上下文）應返回權限提示', () => {
        const result = sanitizeApiError('database not accessible', 'create_page');
        expect(result).toBe('MISSING_DATA_SOURCE');
      });
    });

    describe('通用錯誤', () => {
      test('未知錯誤應返回通用訊息', () => {
        const result = sanitizeApiError('some unknown error xyz');
        expect(result).toBe('UNKNOWN_ERROR');
      });

      test('錯誤對象應被正確處理', () => {
        const result = sanitizeApiError({ message: 'unauthorized' });
        expect(result).toBe('API_KEY_NOT_CONFIGURED');
      });

      test('空錯誤應返回通用訊息', () => {
        const result = sanitizeApiError({});
        expect(result).toBe('UNKNOWN_ERROR');
      });

      test('內部 PATTERNS key 應 fast-path 原樣回傳（避免 keyword 比對誤判為 UNKNOWN_ERROR）', () => {
        // 模擬 handlerUtils.getActiveTab 拋出 new Error(TECHNICAL.NO_ACTIVE_TAB) 的情境：
        // Phase 2 後 TECHNICAL value 從英文 short phrase 升級為 SCREAMING_SNAKE token，
        // sanitizer 必須認得這是內部 vocabulary 而非外部訊息，直接回傳同一個 token。
        expect(sanitizeApiError('NO_ACTIVE_TAB')).toBe('NO_ACTIVE_TAB');
        expect(sanitizeApiError('API_KEY_NOT_CONFIGURED')).toBe('API_KEY_NOT_CONFIGURED');
        expect(sanitizeApiError(new Error('NO_ACTIVE_TAB'))).toBe('NO_ACTIVE_TAB');
      });
    });

    describe('XSS 防護', () => {
      test('包含中文的惡意字串應被轉義', () => {
        const malicious = '發生錯誤<script>alert("XSS")</script>';
        const result = sanitizeApiError(malicious);
        expect(result).toBe(malicious); // 根據新的設計，sanitizeApiError 不再轉義，而是依賴 UI 層的 textContent
        expect(result).toContain('<script>');
      });

      test('包含中文的 img onerror 攻擊應被轉義', () => {
        const malicious = '請稍後再試<img src=x onerror=alert(1)>';
        const result = sanitizeApiError(malicious);
        expect(result).toContain('<img');
        expect(result).not.toContain('&lt;img');
      });

      test('純中文字串應保持不變', () => {
        const chinese = '這是一段中文錯誤訊息';
        const result = sanitizeApiError(chinese);
        expect(result).toBe(chinese);
      });

      test('含特殊字符的中文訊息應被轉義', () => {
        const withSpecialChars = '錯誤: "a" & "b"';
        const result = sanitizeApiError(withSpecialChars);
        expect(result).toBe(withSpecialChars);
      });
    });
  });
});
