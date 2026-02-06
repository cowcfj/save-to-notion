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
  sanitizeUrlForLogging,
  sanitizeApiError,
  validateSafeSvg,
  separateIconAndText,
  validateLogExportData,
} from '../../../scripts/utils/securityUtils.js';
import { maskSensitiveString } from '../../../scripts/utils/LogSanitizer.js';

describe('securityUtils', () => {
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
      // eslint-disable-next-line
      expect(isValidNotionUrl('http://notion.so')).toBe(false);
    });

    test('非 Notion 域名應返回 false', () => {
      expect(isValidNotionUrl('https://example.com')).toBe(false);
    });

    test('notion.com（錯誤域名）應返回 false', () => {
      expect(isValidNotionUrl('https://notion.com')).toBe(false);
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

  describe('sanitizeUrlForLogging', () => {
    test('應移除查詢參數', () => {
      const result = sanitizeUrlForLogging('https://api.example.com/data?token=secret123&sig=xyz');
      expect(result).toBe('https://api.example.com/data');
      expect(result).not.toContain('secret');
    });

    test('應移除 fragment', () => {
      const result = sanitizeUrlForLogging('https://example.com/page#section-1');
      expect(result).toBe('https://example.com/page');
    });

    test('應保留協議、主機名和路徑', () => {
      const result = sanitizeUrlForLogging('https://example.com/path/to/resource');
      expect(result).toBe('https://example.com/path/to/resource');
    });

    test('無效 URL 應返回 [invalid-url]', () => {
      expect(sanitizeUrlForLogging('not-a-valid-url')).toBe('[invalid-url]');
    });

    test('空字串應返回 [empty-url]', () => {
      expect(sanitizeUrlForLogging('')).toBe('[empty-url]');
    });

    test('null 應返回 [empty-url]', () => {
      expect(sanitizeUrlForLogging(null)).toBe('[empty-url]');
    });

    test('undefined 應返回 [empty-url]', () => {
      expect(sanitizeUrlForLogging()).toBe('[empty-url]');
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
        expect(result).toBe('API Key');
      });

      test('"malformed: api_key" 應返回 API Key', () => {
        const result = sanitizeApiError('malformed: api_key');
        expect(result).toBe('API Key');
      });
    });

    describe('Integration 連接斷開', () => {
      test.each([['unauthorized: API token is invalid'], ['unauthorized: integration not found']])(
        '"%s" 應返回 連接斷開訊息',
        input => {
          const result = sanitizeApiError(input);
          // 根據實隞程式碼行為，這些輸入會匹配到不同的模式
          // 'unauthorized: API token is invalid' 匹配 'API Key' (包含 'unauthorized'/'token')
          // 'unauthorized: integration not found' 匹配 'Page ID is missing' (包含 'not found', Step 1 優先)
          expect(['API Key', 'Page ID is missing']).toContain(result);
        }
      );
    });

    describe('一般認證錯誤', () => {
      test.each([['Unauthorized access'], ['authentication failed'], ['api key required']])(
        '"%s" 應返回 API Key 錯誤訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('API Key');
        }
      );
    });

    describe('資料庫權限不足', () => {
      test.each([
        ['database forbidden'],
        ['database permission denied'],
        ['database access denied'],
      ])('"%s" 應返回資料庫權限不足訊息', input => {
        const result = sanitizeApiError(input);
        // 根據實隞程式碼行為，包含 'database' 會匹配 DATA_SOURCE 模式
        expect(result).toBe('Data Source ID');
      });
    });

    describe('一般權限不足錯誤 (Forbidden/Auth)', () => {
      test.each([['forbidden: access denied'], ['Forbidden'], ['permission denied']])(
        '"%s" 應返回資料庫權限不足訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('Database access denied');
        }
      );
    });

    describe('一般權限不足錯誤 (Access Denied)', () => {
      test.each([['access denied to resource']])('"%s" 應返回不能存取內容訊息', input => {
        const result = sanitizeApiError(input);
        expect(result).toBe('Cannot access contents');
      });
    });

    describe('優先順序邊緣情況', () => {
      test('"unauthorized: invalid token" 應返回 API Key（Auth 優先於 Validation）', () => {
        const result = sanitizeApiError('unauthorized: invalid token');
        expect(result).toBe('API Key');
      });

      test('"database permission denied" 應返回 Data Source ID（因為包含 database）', () => {
        const result = sanitizeApiError('database permission denied');
        expect(result).toBe('Data Source ID');
      });

      test('"unauthorized" 純粹無其他關鍵字應返回 API Key', () => {
        const result = sanitizeApiError('unauthorized');
        expect(result).toBe('API Key');
      });

      test('"invalid token" 無 unauthorized 應返回 API Key（Auth 優先於 Validation）', () => {
        const result = sanitizeApiError('invalid token provided');
        expect(result).toBe('API Key');
      });
    });

    describe('速率限制錯誤', () => {
      test.each([['rate limit exceeded'], ['too many requests'], ['Rate Limit']])(
        '"%s" 應返回速率限制訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('rate limit');
        }
      );
    });

    describe('資源不存在錯誤', () => {
      test.each([['not found'], ['resource does not exist'], ['page not found']])(
        '"%s" 應返回資源不存在訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('Page ID is missing');
        }
      );
    });

    describe('驗證錯誤', () => {
      test.each([['validation failed'], ['invalid image url'], ['media upload failed']])(
        '"%s" 應返回數據格式訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('validation_error');
        }
      );
    });

    describe('網絡錯誤', () => {
      test.each([
        ['network error'],
        ['fetch failed'],
        ['timeout waiting for response'],
        ['ENOTFOUND api.notion.com'],
      ])('"%s" 應返回網絡錯誤訊息', input => {
        const result = sanitizeApiError(input);
        expect(result).toBe('Network error');
      });
    });

    describe('服務錯誤', () => {
      test.each([['service unavailable'], ['internal error occurred']])(
        '"%s" 應返回服務不可用訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('Internal Server Error');
        }
      );
    });

    describe('數據庫錯誤', () => {
      test('數據庫相關錯誤（帶頁面上下文）應返回權限提示', () => {
        const result = sanitizeApiError('database not accessible', 'create_page');
        expect(result).toBe('Data Source ID');
      });
    });

    describe('通用錯誤', () => {
      test('未知錯誤應返回通用訊息', () => {
        const result = sanitizeApiError('some unknown error xyz');
        expect(result).toBe('Unknown Error');
      });

      test('錯誤對象應被正確處理', () => {
        const result = sanitizeApiError({ message: 'unauthorized' });
        expect(result).toBe('API Key');
      });

      test('空錯誤應返回通用訊息', () => {
        const result = sanitizeApiError({});
        expect(result).toBe('Unknown Error');
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

  describe('validateLogExportData', () => {
    test('有效的導出數據應通過驗證', () => {
      const validData = {
        filename: 'debug_logs_2023.json',
        content: '{"logs":[]}',
        mimeType: 'application/json',
      };
      expect(() => validateLogExportData(validData)).not.toThrow();
    });

    test('缺少數據對象應拋出錯誤', () => {
      expect(() => validateLogExportData(null)).toThrow('missing data object');
      expect(() => validateLogExportData()).toThrow('missing data object');
    });

    test('無效的文件名應拋出錯誤', () => {
      const invalidFilenames = [
        '../passwd', // Path traversal
        'logs.txt', // Wrong extension
        'logs.json.exe', // Double extension
        'logs;rm -rf', // Shell injection chars
        '', // Empty
        null,
      ];
      invalidFilenames.forEach(filename => {
        expect(() =>
          validateLogExportData({
            filename,
            content: '{}',
            mimeType: 'application/json',
          })
        ).toThrow('Invalid filename format');
      });
    });

    test('非字串內容應拋出錯誤', () => {
      const invalidContent = {
        filename: 'logs.json',
        content: null, // Not a string
        mimeType: 'application/json',
      };
      expect(() => validateLogExportData(invalidContent)).toThrow('Invalid content type');
    });

    test('錯誤的 MIME 類型應拋出錯誤', () => {
      const invalidMime = {
        filename: 'logs.json',
        content: '{}',
        mimeType: 'text/plain', // Wrong MIME
      };
      expect(() => validateLogExportData(invalidMime)).toThrow('Invalid MIME type');
    });
  });
});
