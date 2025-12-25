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
  maskSensitiveString,
  sanitizeApiError,
} from '../../../scripts/utils/securityUtils.js';

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
      global.chrome = {
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
      global.chrome = {
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
      expect(sanitizeUrlForLogging(undefined)).toBe('[empty-url]');
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
      expect(maskSensitiveString(undefined)).toBe('[empty]');
    });

    test('剛好等於可見長度的字串應全部遮蔽', () => {
      const result = maskSensitiveString('12345678', 4, 4);
      expect(result).toBe('***');
    });
  });

  describe('sanitizeApiError', () => {
    describe('權限/認證錯誤', () => {
      test.each([
        ['unauthorized: API token is invalid'],
        ['Unauthorized access'],
        ['invalid token provided'],
        ['invalid api key'],
        ['authentication failed'],
      ])('"%s" 應返回 API Key 錯誤訊息', input => {
        const result = sanitizeApiError(input);
        expect(result).toBe('API Key 無效或已過期，請檢查設置');
      });
    });

    describe('權限不足錯誤', () => {
      test.each([
        ['forbidden: access denied'],
        ['Forbidden'],
        ['permission denied'],
        ['access denied to resource'],
      ])('"%s" 應返回權限不足訊息', input => {
        const result = sanitizeApiError(input);
        expect(result).toBe('權限不足，請確認已授予擴充功能適當的 Notion 權限');
      });
    });

    describe('速率限制錯誤', () => {
      test.each([['rate limit exceeded'], ['too many requests'], ['Rate Limit']])(
        '"%s" 應返回速率限制訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('請求過於頻繁，請稍候再試');
        }
      );
    });

    describe('資源不存在錯誤', () => {
      test.each([['not found'], ['resource does not exist'], ['page not found']])(
        '"%s" 應返回資源不存在訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('找不到指定的資源，可能已被刪除');
        }
      );
    });

    describe('驗證錯誤', () => {
      test.each([['validation failed'], ['invalid image url'], ['media upload failed']])(
        '"%s" 應返回數據格式訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('數據格式不符合要求，已嘗試自動修正');
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
        expect(result).toBe('網絡連接失敗，請檢查網絡狀態後重試');
      });
    });

    describe('服務錯誤', () => {
      test.each([['service unavailable'], ['internal error occurred']])(
        '"%s" 應返回服務不可用訊息',
        input => {
          const result = sanitizeApiError(input);
          expect(result).toBe('Notion 服務暫時不可用，請稍後再試');
        }
      );
    });

    describe('數據庫錯誤', () => {
      test('數據庫相關錯誤（帶頁面上下文）應返回權限提示', () => {
        const result = sanitizeApiError('database not accessible', 'create_page');
        expect(result).toBe('無法訪問目標數據庫，請確認 API Key 權限設置');
      });
    });

    describe('通用錯誤', () => {
      test('未知錯誤應返回通用訊息', () => {
        const result = sanitizeApiError('some unknown error xyz');
        expect(result).toBe('操作失敗，請稍後再試。如問題持續，請查看擴充功能設置');
      });

      test('錯誤對象應被正確處理', () => {
        const result = sanitizeApiError({ message: 'unauthorized' });
        expect(result).toBe('API Key 無效或已過期，請檢查設置');
      });

      test('空錯誤應返回通用訊息', () => {
        const result = sanitizeApiError({});
        expect(result).toBe('操作失敗，請稍後再試。如問題持續，請查看擴充功能設置');
      });
    });
  });
});
