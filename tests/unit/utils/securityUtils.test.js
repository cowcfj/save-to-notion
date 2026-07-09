/**
 * securityUtils 單元測試
 *
 * 測試 scripts/utils/securityUtils.js 的所有功能
 * - URL 驗證函數
 * - 請求來源驗證
 * - 日誌安全函數
 */

let isValidUrl;
let isValidNotionUrl;
let validateInternalRequest;
let validateContentScriptRequest;
let validateSafeSvg;
let separateIconAndText;
let isSafeSvgAttribute;
let validateBackupData;
let createSafeIcon;
let securityUtilsExports;
let maskSensitiveString;
let SECURITY_CONSTANTS;

beforeAll(async () => {
  securityUtilsExports = await import('../../../scripts/utils/securityUtils.js');
  ({
    isValidUrl,
    isValidNotionUrl,
    validateInternalRequest,
    validateContentScriptRequest,
    validateSafeSvg,
    separateIconAndText,
    isSafeSvgAttribute,
    validateBackupData,
    createSafeIcon,
  } = securityUtilsExports);
  ({ maskSensitiveString } = await import('../../../scripts/utils/LogSanitizer.js'));
  ({ SECURITY_CONSTANTS } = await import('../../../scripts/config/shared/core.js'));
});

describe('securityUtils', () => {
  describe('export surface', () => {
    test('sanitizeApiError 不應由 securityUtils 匯出', () => {
      expect(securityUtilsExports).not.toHaveProperty('sanitizeApiError');
    });
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
    test.each([
      ['有效的 HTTP URL', 'http://example.com', true],
      ['有效的 HTTPS URL', 'https://example.com', true],
      ['帶路徑的 URL', 'https://example.com/path/to/resource', true],
      ['帶查詢參數的 URL', 'https://example.com?foo=bar&baz=qux', true],
      ['無效的 URL', 'not-a-valid-url', false],
      ['FTP 協議', 'ftp://example.com', false],
      ['file 協議', 'file:///path/to/file', false],
      ['空字串', '', false],
    ])('%s 應返回 %s', (_name, url, expected) => {
      expect(isValidUrl(url)).toBe(expected);
    });
  });

  describe('isValidNotionUrl', () => {
    test.each([
      ['notion.so 主域名', 'https://notion.so', true],
      ['www.notion.so', 'https://www.notion.so', true],
      ['notion.so 子域名', 'https://myworkspace.notion.so', true],
      ['帶路徑的 Notion URL', 'https://notion.so/page-id-123', true],
      ['HTTP 協議（僅允許 HTTPS）', 'http://notion.so', false],
      ['非 Notion 域名', 'https://example.com', false],
      ['notion.com 主域名', 'https://notion.com', true],
      ['app.notion.com 子域名', 'https://app.notion.com', true],
      ['notion.com.evil.com 偽造子域名', 'https://notion.com.evil.com', false],
      ['notion.so.evil.com 偽造子域名', 'https://notion.so.evil.com', false],
      ['無效 URL', 'not-a-url', false],
    ])('%s 應返回 %s', (_name, url, expected) => {
      expect(isValidNotionUrl(url)).toBe(expected);
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
    test.each([
      ['應正確遮蔽中間部分', ['secret-token-example-1234567890'], 'secr***7890'],
      ['應使用自定義顯示長度', ['abcdefghij', 2, 2], 'ab***ij'],
      ['太短的字串應全部遮蔽', ['short'], '***'],
      ['空字串應返回 [empty]', [''], '[empty]'],
      ['null 應返回 [empty]', [null], '[empty]'],
      ['undefined 應返回 [empty]', [], '[empty]'],
      ['剛好等於可見長度的字串應全部遮蔽', ['12345678', 4, 4], '***'],
    ])('%s', (_name, args, expected) => {
      expect(maskSensitiveString(...args)).toBe(expected);
    });
  });

  describe('validateSafeSvg', () => {
    describe('安全的 SVG', () => {
      test.each([
        ['基本的安全 SVG', '<svg width="16" height="16"><circle cx="8" cy="8" r="8"/></svg>'],
        [
          '包含多個元素的 SVG',
          '<svg viewBox="0 0 24 24"><path d="M12 2L2 7"/><circle cx="12" cy="12" r="10"/></svg>',
        ],
        [
          '包含安全屬性的 SVG',
          '<svg width="16" height="16" fill="none" stroke="currentColor"><rect x="0" y="0" width="16" height="16"/></svg>',
        ],
        [
          '包含漸變的 SVG',
          '<svg><defs><linearGradient id="grad"><stop offset="0%"/><stop offset="100%"/></linearGradient></defs><circle fill="url(#grad)"/></svg>',
        ],
      ])('%s 應通過驗證', (_name, safeSvg) => {
        expect(validateSafeSvg(safeSvg)).toBe(true);
      });
    });

    describe('格式完整性驗證', () => {
      test.each([
        ['缺少結束標籤的 SVG', '<svg width="16" height="16"><circle cx="8" cy="8" r="8"/>'],
        ['只有開始標籤的 SVG', '<svg width="16" height="16">'],
        ['結束標籤寫錯的 SVG', '<svg width="16" height="16"></svgg>'],
      ])('%s 應被拒絕', (_name, svg) => {
        expect(validateSafeSvg(svg)).toBe(false);
      });
    });

    describe('危險模式偵測', () => {
      test.each([
        ['包含 <script> 標籤的 SVG', '<svg><script>alert("XSS")</script></svg>'],
        [
          '包含 javascript: 協議的 SVG',
          '<svg><a href="javascript:alert(\'XSS\')"><text>Click</text></a></svg>',
        ],
        [
          '包含 onerror 事件的 SVG',
          '<svg><image href="invalid.jpg" onerror="alert(\'XSS\')"/></svg>',
        ],
        ['包含 onload 事件的 SVG', '<svg onload="alert(\'XSS\')"><circle/></svg>'],
        ['包含 onclick 事件的 SVG', '<svg><rect onclick="alert(\'XSS\')" /></svg>'],
        [
          '包含 onanimationstart 事件的 SVG',
          '<svg><circle onanimationstart="alert(\'XSS\')"/></svg>',
        ],
        ['包含 <embed> 標籤的 SVG', '<svg><embed src="malicious.swf"/></svg>'],
        ['包含 <object> 標籤的 SVG', '<svg><object data="malicious.html"/></svg>'],
        ['包含 <iframe> 標籤的 SVG', '<svg><iframe src="http://evil.com"/></svg>'],
        [
          '包含 <foreignObject> 標籤的 SVG',
          '<svg><foreignObject><body onload="alert(\'XSS\')"/></foreignObject></svg>',
        ],
        [
          '包含 data:text/html 協議的 SVG',
          '<svg><image href="data:text/html,<script>alert(\'XSS\')</script>"/></svg>',
        ],
      ])('%s 應被拒絕', (_name, dangerousSvg) => {
        expect(validateSafeSvg(dangerousSvg)).toBe(false);
      });
    });

    describe('白名單機制', () => {
      test.each([
        ['包含未在白名單中的標籤', '<svg><video src="malicious.mp4"/></svg>'],
        ['包含 <div> 標籤的 SVG', '<svg><div>Content</div></svg>'],
        ['包含 <style> 標籤的 SVG', '<svg><style>circle { fill: red; }</style><circle/></svg>'],
      ])('%s 應被拒絕', (_name, invalidSvg) => {
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
      test.each([
        ['空字串應返回 true（視為安全）', '', true],
        ['null 應返回 true', null, true],
        ['undefined 應返回 true', undefined, true],
        ['非 SVG 普通文本應返回 true（不在驗證範圍）', '普通文本', true],
        ['非 SVG emoji 文本應返回 true（不在驗證範圍）', '✅ 成功', true],
        ['帶有空白前後綴的 SVG 應正確驗證', '  <svg><circle/></svg>  ', true],
        ['大小寫混合的危險標籤應被檢測', '<svg><SCRIPT>alert("XSS")</SCRIPT></svg>', false],
        ['複雜嵌套的安全 SVG 應通過驗證', '<svg><g><g><circle/></g><rect/></g></svg>', true],
      ])('%s', (_name, svg, expected) => {
        expect(validateSafeSvg(svg)).toBe(expected);
      });
    });
  });

  describe('separateIconAndText', () => {
    describe('SVG 圖標分離', () => {
      test.each([
        [
          '應正確分離 SVG 圖標和文本',
          '<svg width="16" height="16"></svg> 操作成功',
          '<svg width="16" height="16"></svg>',
          ' 操作成功',
        ],
        [
          '應處理複雜的 SVG 標籤',
          '<svg viewBox="0 0 24 24"><path d="M12 2L2 7"/></svg>載入中...',
          '<svg viewBox="0 0 24 24"><path d="M12 2L2 7"/></svg>',
          '載入中...',
        ],
        [
          '應處理包含屬性的 SVG',
          '<svg width="16" height="16" fill="none" stroke="currentColor"></svg>完成',
          '<svg width="16" height="16" fill="none" stroke="currentColor"></svg>',
          '完成',
        ],
      ])('%s', (_name, message, expectedIcon, expectedText) => {
        const result = separateIconAndText(message);
        expect(result.icon).toBe(expectedIcon);
        expect(result.text).toBe(expectedText);
      });
    });

    describe('Emoji 圖標分離', () => {
      test.each([
        ['應正確分離 Emoji 圖標和文本', '✅ 操作成功', '✅', ' 操作成功'],
        ['應處理其他 Emoji', '❌ 操作失敗', '❌', ' 操作失敗'],
        ['應處理表情符號', '🎉 慶祝成功', '🎉', ' 慶祝成功'],
        ['應處理 ZWJ family emoji 序列', '👨‍👩‍👧‍👦 家庭設定已更新', '👨‍👩‍👧‍👦', ' 家庭設定已更新'],
        ['應處理膚色修飾符與 ZWJ emoji 序列', '👩🏽‍⚕️ 健康資料已同步', '👩🏽‍⚕️', ' 健康資料已同步'],
        ['應處理 regional indicator pair 旗幟 emoji', '🇺🇸 英文內容已保存', '🇺🇸', ' 英文內容已保存'],
      ])('%s', (_name, message, expectedIcon, expectedText) => {
        const result = separateIconAndText(message);
        expect(result.icon).toBe(expectedIcon);
        expect(result.text).toBe(expectedText);
      });
    });

    describe('純文本消息', () => {
      test.each([
        ['應正確處理不含圖標的純文本', '這是純文本消息'],
        ['應處理中間包含 SVG 文本的消息（不應分離）', '文本 <svg> 標籤'],
        ['應處理中間包含現代 Emoji 序列的消息（不應分離）', '狀態 👩🏽‍⚕️ 已同步'],
        ['應處理文字後接旗幟 Emoji 的消息（不應分離）', '地區 🇺🇸 已設定'],
      ])('%s', (_name, message) => {
        const result = separateIconAndText(message);
        expect(result.icon).toBe('');
        expect(result.text).toBe(message);
      });
    });

    describe('邊界情況', () => {
      test.each([
        ['空字串應返回空結果', '', '', ''],
        ['null 應返回空結果', null, '', ''],
        ['undefined 應返回空結果', undefined, '', ''],
        ['只有圖標無文本應正確處理', '✅', '✅', ''],
        ['只有 SVG 無文本應正確處理', '<svg></svg>', '<svg></svg>', ''],
      ])('%s', (_name, message, expectedIcon, expectedText) => {
        const result = separateIconAndText(message);
        expect(result.icon).toBe(expectedIcon);
        expect(result.text).toBe(expectedText);
      });

      test('SVG 前綴後接 Emoji 序列時應維持 SVG 分離邏輯', () => {
        const svgIcon = '<svg viewBox="0 0 24 24"><path d="M12 2L2 7"/></svg>';
        const result = separateIconAndText(`${svgIcon} 👩🏽‍⚕️ 已同步`);
        expect(result.icon).toBe(svgIcon);
        expect(result.text).toBe(' 👩🏽‍⚕️ 已同步');
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
      for (const [name, value] of [
        ['onclick', 'alert(1)'],
        ['onmouseover', 'true'],
      ]) {
        expect(isSafeSvgAttribute(name, value)).toBe(false);
      }
    });

    test('不在白名單內的屬性應被拒絕', () => {
      for (const [name, value] of [
        ['data-malicious', 'true'],
        ['unknown-attr', '123'],
      ]) {
        expect(isSafeSvgAttribute(name, value)).toBe(false);
      }
    });

    test('白名單內的非 URL 屬性應被允許', () => {
      for (const [name, value] of [
        ['cx', '10'],
        ['fill', '#fff'],
      ]) {
        expect(isSafeSvgAttribute(name, value)).toBe(true);
      }
    });

    test('href / src 包含 javascript: 協議應被拒絕', () => {
      for (const [name, value] of [
        ['href', 'javascript:alert(1)'],
        ['href', '  javascript: void 0;'],
        ['src', 'DATA:text/html,<html>'],
      ]) {
        expect(isSafeSvgAttribute(name, value)).toBe(false);
      }
    });

    test('不安全的 URL 協議應被拒絕', () => {
      for (const [name, value] of [
        ['href', 'ftp://example.com/a.svg'],
        ['src', 'unknownproto:test'],
        ['href', 'data:image/svg+xml;base64,123'],
      ]) {
        expect(isSafeSvgAttribute(name, value)).toBe(false);
      }
    });

    test('非法的 URL 字串應觸發 catch 並且拒絕', () => {
      expect(isSafeSvgAttribute('href', 'http://%')).toBe(false);
    });

    test('安全的 URL 協議應被允許 (https, http, relative)', () => {
      for (const [name, value] of [
        ['href', 'https://example.com/icon.svg'],
        ['src', 'http://example.com/icon.svg'],
        ['src', '/relative/path.svg'],
      ]) {
        expect(isSafeSvgAttribute(name, value)).toBe(true);
      }
    });
  });

  describe('validateBackupData', () => {
    test.each([
      ['非 object payload', null, 'must be an object'],
      ['缺少 version', { timestamp: '123', data: {} }, 'Invalid backup version'],
      ['缺少 timestamp', { version: '1', data: {} }, 'Invalid backup timestamp'],
      ['缺少 data', { version: '1', timestamp: '123' }, 'Invalid backup data structure'],
    ])('%s 應拋出錯誤', (_name, payload, expectedMessage) => {
      expect(() => validateBackupData(payload)).toThrow(expectedMessage);
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
