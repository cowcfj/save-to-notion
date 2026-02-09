/**
 * @jest-environment jsdom
 */

// Mock Logger
const Logger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};
globalThis.Logger = Logger;

// Mock PerformanceOptimizer (if needed)
globalThis.PerformanceOptimizer = {
  cachedQuery: jest.fn(),
};

// Mock Config to ensure stable test environment
jest.mock('../../../../scripts/config/extraction.js', () => ({
  GENERIC_CLEANING_RULES: ['.ad', '.promo', '#remove-me'],
  CMS_CLEANING_RULES: {
    wordpress: {
      remove: ['.sharedaddy', '.jp-relatedposts'],
      signals: [],
    },
    drupal: {
      remove: ['.drupal-ads'],
      signals: [],
    },
  },
  CMS_CONTENT_SELECTORS: [],
  ARTICLE_STRUCTURE_SELECTORS: [],
}));

// Mock ReadabilityAdapter dependencies if needed, but we want to test the function itself.
// Since performSmartCleaning is exported, we can just require it.
// The config mock above needs to be hoisted, which jest.mock does automatically.

const {
  performSmartCleaning,
} = require('../../../../scripts/content/extractors/ReadabilityAdapter.js');

describe('ReadabilityAdapter - performSmartCleaning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Basic Functionality', () => {
    test('當輸入為 null 或 undefined 時應返回空字串', () => {
      expect(performSmartCleaning(null)).toBe('');
      expect(performSmartCleaning(undefined)).toBe('');
    });

    test('當輸入為空字串時應返回空字串', () => {
      expect(performSmartCleaning('')).toBe('');
    });

    test('應保留普通內容', () => {
      const html = '<div class="content">Hello World</div>';
      const result = performSmartCleaning(html, null);
      expect(result).toBe(html); // Or structure equivalence
    });
  });

  describe('Generic Cleaning', () => {
    test('應移除符合 GENERIC_CLEANING_RULES 的元素', () => {
      const html = `
        <div class="content">Content</div>
        <div class="ad">Ad</div>
        <div class="promo">Promo</div>
        <div id="remove-me">Remove Me</div>
      `;
      const result = performSmartCleaning(html, null);

      // Check removed
      expect(result).not.toContain('class="ad"');
      expect(result).not.toContain('class="promo"');
      expect(result).not.toContain('id="remove-me"');

      // Check kept
      expect(result).toContain('class="content"');
    });
  });

  describe('Display: None Cleaning', () => {
    test('應移除 style 包含 display: none 的元素', () => {
      const html = `
        <div style="display: none">Hidden 1</div>
        <div style="display:none">Hidden 2</div>
        <div style="DISPLAY: NONE">Hidden 3</div>
        <div style="  display  :  none  ">Hidden 4</div>
        <div style="color: red">Visible</div>
      `;
      const result = performSmartCleaning(html, null);

      expect(result).not.toContain('Hidden 1');
      expect(result).not.toContain('Hidden 2');
      expect(result).not.toContain('Hidden 3');
      expect(result).not.toContain('Hidden 4');
      expect(result).toContain('Visible');
    });

    test('不應移除其他 display 屬性的元素', () => {
      const html = `
        <div style="display: block">Block</div>
        <div style="display: flex">Flex</div>
      `;
      const result = performSmartCleaning(html, null);

      expect(result).toContain('Block');
      expect(result).toContain('Flex');
    });
  });

  describe('CMS Specific Cleaning', () => {
    test('應移除指定 CMS 的特定元素 (WordPress)', () => {
      const html = `
        <div class="content">Content</div>
        <div class="sharedaddy">Share Buttons</div>
        <div class="jp-relatedposts">Related Posts</div>
      `;
      const result = performSmartCleaning(html, 'wordpress');

      expect(result).not.toContain('sharedaddy');
      expect(result).not.toContain('jp-relatedposts');
      expect(result).toContain('class="content"');
    });

    test('應移除指定 CMS 的特定元素 (Drupal)', () => {
      const html = `
        <div class="content">Content</div>
        <div class="drupal-ads">Drupal Ads</div>
      `;
      const result = performSmartCleaning(html, 'drupal');

      expect(result).not.toContain('drupal-ads');
      expect(result).toContain('class="content"');
    });

    test('不應移除不匹配 CMS 的元素', () => {
      const html = `
        <div class="content">Content</div>
        <div class="sharedaddy">Share Buttons (should keep if not wordpress)</div>
      `;
      // Pass null or a different CMS type
      const result = performSmartCleaning(html, 'drupal');

      expect(result).toContain('sharedaddy');
    });
  });

  describe('Whitelist Protection', () => {
    test('應保留帶有 data-keep 屬性的元素，即使匹配刪除規則', () => {
      const html = `
        <div class="ad" data-keep="true">Keep Me</div>
        <div style="display: none" data-keep="true">Keep Hidden</div>
      `;
      const result = performSmartCleaning(html, null);

      expect(result).toContain('Keep Me');
      expect(result).toContain('Keep Hidden');
    });

    test('應保留 role="main" 的元素', () => {
      const html = `
        <div class="ad" role="main">Main Content Misidentified</div>
      `;
      const result = performSmartCleaning(html, null);
      expect(result).toContain('Main Content Misidentified');
    });

    test('應保留長文本內容 (> 300 chars)', () => {
      const longText = 'a'.repeat(301);
      const html = `
        <div class="ad">${longText}</div>
        <div class="ad">Short</div>
      `;
      const result = performSmartCleaning(html, null);

      expect(result).toContain(longText);
      expect(result).not.toContain('Short');
    });
  });

  describe('Security Cleaning', () => {
    test('應移除所有 on* 事件屬性', () => {
      const html = `
        <div onclick="alert(1)">Click Me</div>
        <img src="x" onerror="stealData()">
        <a href="#" OnMouseOver="bad()">Hover</a>
      `;
      const parser = new DOMParser();
      // performSmartCleaning returns HTML string, parse it back to check attributes easily
      const resultHtml = performSmartCleaning(html, null);
      const doc = parser.parseFromString(resultHtml, 'text/html');

      expect(doc.body.innerHTML).toContain('Click Me');
      expect(doc.querySelector('div').hasAttribute('onclick')).toBe(false);
      expect(doc.querySelector('img').hasAttribute('onerror')).toBe(false);
      expect(doc.querySelector('a').hasAttribute('onmouseover')).toBe(false);
      // Case insensitive check might depend on browser implementation, but standard says attributes are removed
    });
  });
});
