/**
 * @jest-environment jsdom
 */

import { sanitizeSvgIcon, createSafeIcon } from '../../../../scripts/highlighter/utils/safeIcon.js';
import Logger from '../../../../scripts/utils/Logger.js';

describe('highlighter safeIcon utility', () => {
  describe('sanitizeSvgIcon', () => {
    test('應正確保留安全的 SVG 與 path 等元素與屬性', () => {
      const input = '<svg viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z" fill="red" /></svg>';
      const output = sanitizeSvgIcon(input);
      expect(output).toContain('<svg');
      expect(output).toContain('viewBox="0 0 24 24"');
      expect(output).toContain('<path');
      expect(output).toContain('d="M12 2L2 22h20L12 2z"');
    });

    test('應徹底移除惡意的 script 與事件屬性', () => {
      const input = '<svg><script>alert(1)</script><path d="M1" onload="alert(2)" /></svg>';
      const output = sanitizeSvgIcon(input);
      expect(output).not.toContain('<script>');
      expect(output).not.toContain('onload');
    });

    test('應空值返回空字串', () => {
      expect(sanitizeSvgIcon('')).toBe('');
      expect(sanitizeSvgIcon(null)).toBe('');
      expect(sanitizeSvgIcon(undefined)).toBe('');
    });

    test('應保留 SVG path fill-rule 與 clip-rule 屬性', () => {
      const input =
        '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M1 1" /></svg>';
      const output = sanitizeSvgIcon(input);

      expect(output).toContain('fill-rule="evenodd"');
      expect(output).toContain('clip-rule="evenodd"');
    });
  });

  describe('createSafeIcon', () => {
    test('非 SVG 輸入時應使用 textContent 建立一般的 span 節點', () => {
      const span = createSafeIcon('Normal Text');
      expect(span.tagName).toBe('SPAN');
      expect(span.className).toBe('icon');
      expect(span.textContent).toBe('Normal Text');
      expect(span.querySelector('svg')).toBeNull();
    });

    test('安全的 SVG 輸入應能解析為帶有 icon-svg class 的 SVG 元素，並置於 .icon 內', () => {
      const input = '<svg viewBox="0 0 24 24"><path d="M1" /></svg>';
      const span = createSafeIcon(input);
      expect(span.tagName).toBe('SPAN');
      expect(span.className).toBe('icon');

      const svg = span.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg.classList.contains('icon-svg')).toBe(true);
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    });

    test('惡意的 SVG 應被過濾，並返回不含惡意程式碼的空 .icon span 節點', () => {
      const input = '<svg><script>alert(1)</script></svg>';
      const span = createSafeIcon(input);
      expect(span.tagName).toBe('SPAN');
      expect(span.className).toBe('icon');
      expect(span.querySelector('script')).toBeNull();
    });

    test('自動補足缺失的 XML namespace (xmlns)', () => {
      const input = '<svg><path d="M1" /></svg>';
      const span = createSafeIcon(input);
      const svg = span.querySelector('svg');
      expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    });

    test('對於無效的 XML (parsererror)，應記錄警告並返回空 span 節點', () => {
      const originalParse = DOMParser.prototype.parseFromString;
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      DOMParser.prototype.parseFromString = function (str, type) {
        if (type === 'image/svg+xml' && str.includes('parsererror-trigger')) {
          return {
            documentElement: {
              tagName: 'parsererror',
            },
          };
        }
        return originalParse.call(this, str, type);
      };
      try {
        const input = '<svg class="parsererror-trigger"><path d="M1" /></svg>';
        const span = createSafeIcon(input);
        expect(span.tagName).toBe('SPAN');
        expect(span.className).toBe('icon');
        expect(span.children).toHaveLength(0);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            action: 'createSafeIcon',
            result: 'failure',
            reason: 'xml_parser_error',
          })
        );
        expect(warnSpy.mock.calls[0][1]).not.toHaveProperty('content');
      } finally {
        DOMParser.prototype.parseFromString = originalParse;
        warnSpy.mockRestore();
      }
    });

    test('解析結果不是 svg 時應記錄安全 metadata 而非原始 SVG', () => {
      const originalParse = DOMParser.prototype.parseFromString;
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      let parseCount = 0;
      DOMParser.prototype.parseFromString = function () {
        parseCount += 1;
        if (parseCount === 1) {
          return Reflect.apply(originalParse, this, arguments);
        }

        return {
          documentElement: {
            tagName: 'html',
          },
        };
      };

      try {
        const input = '<svg><path d="M1" /></svg>';
        const span = createSafeIcon(input);
        expect(span.tagName).toBe('SPAN');
        expect(span.children).toHaveLength(0);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            action: 'createSafeIcon',
            result: 'failure',
            reason: 'unexpected_root_element',
            svgLength: input.length,
          })
        );
        expect(warnSpy.mock.calls[0][1]).not.toHaveProperty('content');
      } finally {
        DOMParser.prototype.parseFromString = originalParse;
        warnSpy.mockRestore();
      }
    });
  });
});
