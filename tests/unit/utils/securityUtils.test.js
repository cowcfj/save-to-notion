/* eslint-disable sonarjs/no-clear-text-protocols */
/**
 * securityUtils 單元測試
 *
 * 測試 scripts/utils/securityUtils.js 的所有功能
 * - URL 驗證函數
 * - 請求來源驗證
 * - 日誌安全函數
 */

import {
  isValidUrl,
  isValidNotionUrl,
  validateInternalRequest,
  validateContentScriptRequest,
  sanitizeApiError,
  validateSafeSvg,
  separateIconAndText,
  isSafeSvgAttribute,
  validateBackupData,
  createSafeIcon,
} from '../../../scripts/utils/securityUtils.js';
import * as securityUtilsExports from '../../../scripts/utils/securityUtils.js';
import { maskSensitiveString } from '../../../scripts/utils/LogSanitizer.js';
import { SECURITY_CONSTANTS } from '../../../scripts/config/shared/core.js';

describe('securityUtils', () => {
  describe('export surface', () => {
    test('content performance validation helpers 不應由 securityUtils 匯出', () => {
      expect(securityUtilsExports).not.toHaveProperty('validateSafeDomElement');
      expect(securityUtilsExports).not.toHaveProperty('validatePreloaderCache');
    });

    test('日誌脫敏與日誌導出驗證工具不應由 securityUtils 匯出', () => {
      expect(securityUtilsExports).not.toHaveProperty('sanitizeUrlForLogging');
      expect(securityUtilsExports).not.toHaveProperty('maskSensitiveString');
      expect(securityUtilsExports).not.toHaveProperty('LogSanitizer');
      expect(securityUtilsExports).not.toHaveProperty('validateLogExportData');
    });
  });

  describe('isValidUrl', () => {
    test('有效的 HTTP URL 應返回 true', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    test('有效的 HTTPS URL 應返回 true', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
    });

    test('帶路徑的 URL 應返回 true', () => {
      expect(isValidUrl('https://example.com/path/to/resource')).toBe(true);
    });

    test('帶查詢參數的 URL 應返回 true', () => {
      expect(isValidUrl('https://example.com?foo=bar&baz=qux')).toBe(true);
    });

    test('無效的 URL 應返回 false', () => {
      expect(isValidUrl('not-a-valid-url')).toBe(false);
    });

    test('FTP 協議應返回 false', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
    });

    test('file 協議應返回 false', () => {
      expect(isValidUrl('file:///path/to/file')).toBe(false);
    });

    test('空字串應返回 false', () => {
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('isValidNotionUrl', () => {
    test('notion.so 主域名應返回 true', () => {
      expect(isValidNotionUrl('https://notion.so')).toBe(true);
    });

    test('www.notion.so 應返回 true', () => {
      expect(isValidNotionUrl('https://www.notion.so')).toBe(true);
    });

    test('notion.so 子域名應返回 true', () => {
      expect(isValidNotionUrl('https://myworkspace.notion.so')).toBe(true);
    });

    test('帶路徑的 Notion URL 應返回 true', () => {
      expect(isValidNotionUrl('https://notion.so/page-id-123')).toBe(true);
    });

    test('HTTP 協議應返回 false（僅允許 HTTPS）', () => {
      expect(isValidNotionUrl('http://notion.so')).toBe(false);
    });

    test('非 Notion 域名應返回 false', () => {
      expect(isValidNotionUrl('https://example.com')).toBe(false);
    });

    test('notion.com 主域名應返回 true', () => {
      expect(isValidNotionUrl('https://notion.com')).toBe(true);
    });

    test('app.notion.com 子域名應返回 true', () => {
      expect(isValidNotionUrl('https://app.notion.com')).toBe(true);
    });

    test('notion.com.evil.com 偽造子域名應返回 false', () => {
      expect(isValidNotionUrl('https://notion.com.evil.com')).toBe(false);
    });

    test('偽造子域名應返回 false', () => {
      expect(isValidNotionUrl('https://notion.so.evil.com')).toBe(false);
    });

    test('無效 URL 應返回 false', () => {
      expect(isValidNotionUrl('not-a-url')).toBe(false);
    });
  });

  describe('validateInternalRequest', () => {
    const mockRuntimeId = 'mock-extension-id';

    beforeEach(() => {
      globalThis.chrome = {
        runtime: {
          id: mockRuntimeId,
        },
      };
    });

    test('來自擴充功能內部（Popup）的請求應通過', () => {
      const sender = { id: mockRuntimeId };
      expect(validateInternalRequest(sender)).toBeNull();
    });

    test('來自擴充功能選項頁面（Options in Tab）的請求應通過', () => {
      const sender = {
        id: mockRuntimeId,
        tab: { id: 1 },
        url: `chrome-extension://${mockRuntimeId}/options.html`,
      };
      expect(validateInternalRequest(sender)).toBeNull();
    });

    test('sender.id 不匹配時應拒絕', () => {
      const sender = { id: 'different-extension-id' };
      const result = validateInternalRequest(sender);
      expect(result).not.toBeNull();
      expect(result.success).toBe(false);
      expect(result.error).toContain('拒絕訪問');
    });

    test('來自外部網頁標籤的請求應拒絕', () => {
      const sender = {
        id: mockRuntimeId,
        tab: { id: 1 },
        url: 'https://example.com',
      };
      const result = validateInternalRequest(sender);
      expect(result).not.toBeNull();
      expect(result.success).toBe(false);
    });
  });

  describe('validateContentScriptRequest', () => {
    const mockRuntimeId = 'mock-extension-id';

    beforeEach(() => {
      globalThis.chrome = {
        runtime: {
          id: mockRuntimeId,
        },
      };
    });

    test('有效的 Content Script 請求應通過', () => {
      const sender = {
        id: mockRuntimeId,
        tab: { id: 123 },
      };
      expect(validateContentScriptRequest(sender)).toBeNull();
    });

    test('sender.id 不匹配時應拒絕', () => {
      const sender = {
        id: 'different-extension-id',
        tab: { id: 123 },
      };
      const result = validateContentScriptRequest(sender);
      expect(result).not.toBeNull();
      expect(result.success).toBe(false);
      expect(result.error).toContain('僅限本擴充功能');
    });

    test('缺少 sender.tab 時應拒絕', () => {
      const sender = { id: mockRuntimeId };
      const result = validateContentScriptRequest(sender);
      expect(result).not.toBeNull();
      expect(result.success).toBe(false);
      expect(result.error).toContain('標籤頁上下文');
    });

    test('sender.tab.id 為空時應拒絕', () => {
      const sender = {
        id: mockRuntimeId,
        tab: {},
      };
      const result = validateContentScriptRequest(sender);
      expect(result).not.toBeNull();
      expect(result.success).toBe(false);
    });
  });

  describe('maskSensitiveString', () => {
    test('應正確遮蔽中間部分', () => {
      const result = maskSensitiveString('secret-token-example-1234567890');
      expect(result).toBe('secr***7890');
    });

    test('應使用自定義顯示長度', () => {
      const result = maskSensitiveString('abcdefghij', 2, 2);
      expect(result).toBe('ab***ij');
    });

    test('太短的字串應全部遮蔽', () => {
      const result = maskSensitiveString('short');
      expect(result).toBe('***');
    });

    test('空字串應返回 [empty]', () => {
      expect(maskSensitiveString('')).toBe('[empty]');
    });

    test('null 應返回 [empty]', () => {
      expect(maskSensitiveString(null)).toBe('[empty]');
    });

    test('undefined 應返回 [empty]', () => {
      expect(maskSensitiveString()).toBe('[empty]');
    });

    test('剛好等於可見長度的字串應全部遮蔽', () => {
      const result = maskSensitiveString('12345678', 4, 4);
      expect(result).toBe('***');
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
        // Phase 2 後 TECHNICAL value 從英文短語升級為 SCREAMING_SNAKE token，
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

  describe('validateSafeSvg', () => {
    describe('安全的 SVG', () => {
      test('基本的安全 SVG 應通過驗證', () => {
        const safeSvg = '<svg width="16" height="16"><circle cx="8" cy="8" r="8"/></svg>';
        expect(validateSafeSvg(safeSvg)).toBe(true);
      });

      test('包含多個元素的 SVG 應通過驗證', () => {
        const safeSvg =
          '<svg viewBox="0 0 24 24"><path d="M12 2L2 7"/><circle cx="12" cy="12" r="10"/></svg>';
        expect(validateSafeSvg(safeSvg)).toBe(true);
      });

      test('包含安全屬性的 SVG 應通過驗證', () => {
        const safeSvg =
          '<svg width="16" height="16" fill="none" stroke="currentColor"><rect x="0" y="0" width="16" height="16"/></svg>';
        expect(validateSafeSvg(safeSvg)).toBe(true);
      });

      test('包含漸變的 SVG 應通過驗證', () => {
        const safeSvg =
          '<svg><defs><linearGradient id="grad"><stop offset="0%"/><stop offset="100%"/></linearGradient></defs><circle fill="url(#grad)"/></svg>';
        expect(validateSafeSvg(safeSvg)).toBe(true);
      });
    });

    describe('格式完整性驗證', () => {
      test('缺少結束標籤的 SVG 應被拒絕', () => {
        const incompleteSvg = '<svg width="16" height="16"><circle cx="8" cy="8" r="8"/>';
        expect(validateSafeSvg(incompleteSvg)).toBe(false);
      });

      test('只有開始標籤的 SVG 應被拒絕', () => {
        const incompleteSvg = '<svg width="16" height="16">';
        expect(validateSafeSvg(incompleteSvg)).toBe(false);
      });

      test('結束標籤寫錯的 SVG 應被拒絕', () => {
        const invalidSvg = '<svg width="16" height="16"></svgg>';
        expect(validateSafeSvg(invalidSvg)).toBe(false);
      });
    });

    describe('危險模式偵測', () => {
      test('包含 <script> 標籤的 SVG 應被拒絕', () => {
        const dangerousSvg = '<svg><script>alert("XSS")</script></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });

      test('包含 javascript: 協議的 SVG 應被拒絕', () => {
        const dangerousSvg =
          '<svg><a href="javascript:alert(\'XSS\')"><text>Click</text></a></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });

      test('包含 onerror 事件的 SVG 應被拒絕', () => {
        const dangerousSvg = '<svg><image href="invalid.jpg" onerror="alert(\'XSS\')"/></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });

      test('包含 onload 事件的 SVG 應被拒絕', () => {
        const dangerousSvg = '<svg onload="alert(\'XSS\')"><circle/></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });

      test('包含 onclick 事件的 SVG 應被拒絕', () => {
        const dangerousSvg = '<svg><rect onclick="alert(\'XSS\')" /></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });

      test('包含 onanimationstart 事件的 SVG 應被拒絕', () => {
        const dangerousSvg = '<svg><circle onanimationstart="alert(\'XSS\')"/></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });

      test('包含 <embed> 標籤的 SVG 應被拒絕', () => {
        const dangerousSvg = '<svg><embed src="malicious.swf"/></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });

      test('包含 <object> 標籤的 SVG 應被拒絕', () => {
        const dangerousSvg = '<svg><object data="malicious.html"/></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });

      test('包含 <iframe> 標籤的 SVG 應被拒絕', () => {
        const dangerousSvg = '<svg><iframe src="http://evil.com"/></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });

      test('包含 <foreignObject> 標籤的 SVG 應被拒絕', () => {
        const dangerousSvg =
          '<svg><foreignObject><body onload="alert(\'XSS\')"/></foreignObject></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });

      test('包含 data:text/html 協議的 SVG 應被拒絕', () => {
        const dangerousSvg =
          '<svg><image href="data:text/html,<script>alert(\'XSS\')</script>"/></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });
    });

    describe('白名單機制', () => {
      test('包含未在白名單中的標籤應被拒絕', () => {
        const invalidSvg = '<svg><video src="malicious.mp4"/></svg>';
        expect(validateSafeSvg(invalidSvg)).toBe(false);
      });

      test('包含 <div> 標籤的 SVG 應被拒絕', () => {
        const invalidSvg = '<svg><div>Content</div></svg>';
        expect(validateSafeSvg(invalidSvg)).toBe(false);
      });

      test('包含 <style> 標籤的 SVG 應被拒絕（不在白名單）', () => {
        const invalidSvg = '<svg><style>circle { fill: red; }</style><circle/></svg>';
        expect(validateSafeSvg(invalidSvg)).toBe(false);
      });

      test('所有白名單標籤都應被接受', () => {
        const validTags = [
          'path',
          'circle',
          'rect',
          'line',
          'polyline',
          'polygon',
          'ellipse',
          'g',
          'defs',
          'use',
          'symbol',
          'linearGradient',
          'radialGradient',
        ];

        validTags.forEach(tag => {
          const svg = `<svg><${tag}/></svg>`;
          expect(validateSafeSvg(svg)).toBe(true);
        });
      });
    });

    describe('邊界情況', () => {
      test('空字串應返回 true（視為安全）', () => {
        expect(validateSafeSvg('')).toBe(true);
      });

      test('null 應返回 true', () => {
        expect(validateSafeSvg(null)).toBe(true);
      });

      test('undefined 應返回 true', () => {
        expect(validateSafeSvg()).toBe(true);
      });

      test('非 SVG 內容應返回 true（不在驗證範圍）', () => {
        expect(validateSafeSvg('普通文本')).toBe(true);
        expect(validateSafeSvg('✅ 成功')).toBe(true);
      });

      test('帶有空白前後綴的 SVG 應正確驗證', () => {
        const svgWithWhitespace = '  <svg><circle/></svg>  ';
        expect(validateSafeSvg(svgWithWhitespace)).toBe(true);
      });

      test('大小寫混合的危險標籤應被檢測', () => {
        const dangerousSvg = '<svg><SCRIPT>alert("XSS")</SCRIPT></svg>';
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });

      test('複雜嵌套的安全 SVG 應通過驗證', () => {
        const complexSvg = '<svg><g><g><circle/></g><rect/></g></svg>';
        expect(validateSafeSvg(complexSvg)).toBe(true);
      });
    });
  });

  describe('separateIconAndText', () => {
    describe('SVG 圖標分離', () => {
      test('應正確分離 SVG 圖標和文本', () => {
        const message = '<svg width="16" height="16"></svg> 操作成功';
        const result = separateIconAndText(message);
        expect(result.icon).toBe('<svg width="16" height="16"></svg>');
        expect(result.text).toBe(' 操作成功');
      });

      test('應處理複雜的 SVG 標籤', () => {
        const svgIcon = '<svg viewBox="0 0 24 24"><path d="M12 2L2 7"/></svg>';
        const message = `${svgIcon}載入中...`;
        const result = separateIconAndText(message);
        expect(result.icon).toBe(svgIcon);
        expect(result.text).toBe('載入中...');
      });

      test('應處理包含屬性的 SVG', () => {
        const message = '<svg width="16" height="16" fill="none" stroke="currentColor"></svg>完成';
        const result = separateIconAndText(message);
        expect(result.icon).toBe(
          '<svg width="16" height="16" fill="none" stroke="currentColor"></svg>'
        );
        expect(result.text).toBe('完成');
      });
    });

    describe('Emoji 圖標分離', () => {
      test('應正確分離 Emoji 圖標和文本', () => {
        const message = '✅ 操作成功';
        const result = separateIconAndText(message);
        expect(result.icon).toBe('✅');
        expect(result.text).toBe(' 操作成功');
      });

      test('應處理其他 Emoji', () => {
        const message = '❌ 操作失敗';
        const result = separateIconAndText(message);
        expect(result.icon).toBe('❌');
        expect(result.text).toBe(' 操作失敗');
      });

      test('應處理表情符號', () => {
        const message = '🎉 慶祝成功';
        const result = separateIconAndText(message);
        expect(result.icon).toBe('🎉');
        expect(result.text).toBe(' 慶祝成功');
      });
    });

    describe('純文本消息', () => {
      test('應正確處理不含圖標的純文本', () => {
        const message = '這是純文本消息';
        const result = separateIconAndText(message);
        expect(result.icon).toBe('');
        expect(result.text).toBe('這是純文本消息');
      });

      test('應處理中間包含 SVG 文本的消息（不應分離）', () => {
        const message = '文本 <svg> 標籤';
        const result = separateIconAndText(message);
        expect(result.icon).toBe('');
        expect(result.text).toBe('文本 <svg> 標籤');
      });
    });

    describe('邊界情況', () => {
      test('空字串應返回空結果', () => {
        const result = separateIconAndText('');
        expect(result.icon).toBe('');
        expect(result.text).toBe('');
      });

      test('null 應返回空結果', () => {
        const result = separateIconAndText(null);
        expect(result.icon).toBe('');
        expect(result.text).toBe('');
      });

      test('undefined 應返回空結果', () => {
        const result = separateIconAndText();
        expect(result.icon).toBe('');
        expect(result.text).toBe('');
      });

      test('只有圖標無文本應正確處理', () => {
        const result = separateIconAndText('✅');
        expect(result.icon).toBe('✅');
        expect(result.text).toBe('');
      });

      test('只有 SVG 無文本應正確處理', () => {
        const result = separateIconAndText('<svg></svg>');
        expect(result.icon).toBe('<svg></svg>');
        expect(result.text).toBe('');
      });
    });
  });

  describe('isSafeSvgAttribute', () => {
    let originalAllowed;
    beforeEach(() => {
      originalAllowed = [...SECURITY_CONSTANTS.SVG_ALLOWED_ATTRS];
      SECURITY_CONSTANTS.SVG_ALLOWED_ATTRS.push('href', 'src');
    });
    afterEach(() => {
      SECURITY_CONSTANTS.SVG_ALLOWED_ATTRS = originalAllowed;
    });

    test('on* 開頭的屬性應被拒絕', () => {
      expect(isSafeSvgAttribute('onclick', 'alert(1)')).toBe(false);
      expect(isSafeSvgAttribute('onmouseover', 'true')).toBe(false);
    });

    test('不在白名單內的屬性應被拒絕', () => {
      expect(isSafeSvgAttribute('data-malicious', 'true')).toBe(false);
      expect(isSafeSvgAttribute('unknown-attr', '123')).toBe(false);
    });

    test('白名單內的非 URL 屬性應被允許', () => {
      expect(isSafeSvgAttribute('cx', '10')).toBe(true);
      expect(isSafeSvgAttribute('fill', '#fff')).toBe(true);
    });

    test('href / src 包含 javascript: 協議應被拒絕', () => {
      expect(isSafeSvgAttribute('href', 'javascript:alert(1)')).toBe(false);
      expect(isSafeSvgAttribute('href', '  javascript: void 0;')).toBe(false);
      expect(isSafeSvgAttribute('src', 'DATA:text/html,<html>')).toBe(false);
    });

    test('不安全的 URL 協議應被拒絕', () => {
      expect(isSafeSvgAttribute('href', 'ftp://example.com/a.svg')).toBe(false);
      expect(isSafeSvgAttribute('src', 'unknownproto:test')).toBe(false);
      expect(isSafeSvgAttribute('href', 'data:image/svg+xml;base64,123')).toBe(false);
    });

    test('非法的 URL 字串應觸發 catch 並且拒絕', () => {
      expect(isSafeSvgAttribute('href', 'http://%')).toBe(false);
    });

    test('安全的 URL 協議應被允許 (https, http, relative)', () => {
      expect(isSafeSvgAttribute('href', 'https://example.com/icon.svg')).toBe(true);

      expect(isSafeSvgAttribute('src', 'http://example.com/icon.svg')).toBe(true);
      expect(isSafeSvgAttribute('src', '/relative/path.svg')).toBe(true);
    });
  });

  describe('validateBackupData', () => {
    test('無效備份結構應拋出錯誤', () => {
      expect(() => validateBackupData(null)).toThrow('must be an object');
      expect(() => validateBackupData({ timestamp: '123', data: {} })).toThrow(
        'Invalid backup version'
      );
      expect(() => validateBackupData({ version: '1', data: {} })).toThrow(
        'Invalid backup timestamp'
      );
      expect(() => validateBackupData({ version: '1', timestamp: '123' })).toThrow(
        'Invalid backup data structure'
      );
    });

    test('包含 __proto__ 污染鍵值的備份應拋出安全警告', () => {
      const maliciousPayload = {
        version: '1',
        timestamp: '123456789',
        data: {},
      };
      Object.defineProperty(maliciousPayload.data, '__proto__', {
        value: { polluted: true },
        enumerable: true,
      });
      expect(() => validateBackupData(maliciousPayload)).toThrow('Security Alert');
    });

    test('包含 constructor 污染鍵值的備份應拋出安全警告', () => {
      const maliciousPayload = {
        version: '1',
        timestamp: '123456789',
        data: {},
      };
      Object.defineProperty(maliciousPayload.data, 'constructor', {
        value: { name: 'Function' },
        enumerable: true,
      });
      expect(() => validateBackupData(maliciousPayload)).toThrow('Security Alert');
    });

    test('合法備份應通過驗證', () => {
      const validPayload = {
        version: '1',
        timestamp: '123456789',
        data: {
          settings: { theme: 'dark' },
        },
      };
      expect(() => validateBackupData(validPayload)).not.toThrow();
    });
  });

  describe('createSafeIcon', () => {
    // 雖然無法完全在 jsdom 測試 DOMParser 的深層解析行為，但可以測試分支邏輯
    let mockDOMParser;
    let originalDOMParser;

    beforeEach(() => {
      originalDOMParser = globalThis.DOMParser;
      mockDOMParser = jest.fn().mockImplementation(() => ({
        parseFromString: jest.fn().mockReturnValue({
          documentElement: {
            tagName: 'svg',
            classList: { contains: jest.fn().mockReturnValue(false), add: jest.fn() },
          },
        }),
      }));
      globalThis.DOMParser = mockDOMParser;
    });

    afterEach(() => {
      jest.restoreAllMocks();
      globalThis.DOMParser = originalDOMParser;
    });

    test('如果不是以 <svg 開頭，應返回純文本的 span', () => {
      const result = createSafeIcon('Normal text');
      expect(result.tagName.toLowerCase()).toBe('span');
      expect(result.textContent).toBe('Normal text');
    });

    test('如果 validateSafeSvg 失敗，應返回空的 span', () => {
      // 傳入惡意的 svg
      const result = createSafeIcon('<svg><script>alert()</script></svg>');
      expect(result.tagName.toLowerCase()).toBe('span');
      expect(result.innerHTML).toBe('');
    });

    test('如果解析結果是 parsererror，應返回空的 span', () => {
      globalThis.DOMParser = jest.fn().mockImplementation(() => ({
        parseFromString: jest.fn().mockReturnValue({
          documentElement: { tagName: 'parsererror' },
        }),
      }));
      const result = createSafeIcon('<svg>something bad</svg>');
      expect(result.tagName.toLowerCase()).toBe('span');
      expect(result.innerHTML).toBe('');
    });

    test('如果解析出不是 svg 標籤，應返回空的 span', () => {
      globalThis.DOMParser = jest.fn().mockImplementation(() => ({
        parseFromString: jest.fn().mockReturnValue({
          documentElement: { tagName: 'html', classList: { contains: jest.fn() } },
        }),
      }));
      // MUST use valid SVG tags so validateSafeSvg passes and it reaches the parser block
      const result = createSafeIcon('<svg><path></path></svg>');
      expect(result.tagName.toLowerCase()).toBe('span');
      expect(result.innerHTML).toBe('');
    });

    test('如果解析成功，應包裝並返回含有 svg 的 span', () => {
      // 在 jsdom 裡直接不用 mock，使用原生的 DOMParser
      globalThis.DOMParser = originalDOMParser;
      const result = createSafeIcon('<svg width="16"><path d="M1 1"/></svg>');
      expect(result.tagName.toLowerCase()).toBe('span');
      expect(result.className).toBe('icon');
      expect(result.querySelector('svg')).not.toBeNull();
      expect(result.querySelector('svg').classList.contains('icon-svg')).toBe(true);
      expect(result.querySelector('svg').getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    });
  });
});
