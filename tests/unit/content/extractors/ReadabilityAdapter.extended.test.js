/**
 * @jest-environment jsdom
 */

/**
 * ReadabilityAdapter - 額外函數測試
 *
 * 補充測試覆蓋以下函數：
 * - safeQueryElements
 * - expandCollapsibleElements
 * - cachedQuery
 * - findContentCmsFallback
 * - extractLargestListFallback
 * - createOptimizedDocumentClone
 * - parseArticleWithReadability
 */

// Mock Logger
const Logger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};
global.Logger = Logger;

// Mock PerformanceOptimizer（可選依賴）
global.PerformanceOptimizer = undefined;
global.performanceOptimizer = undefined;

// Mock Readability（用於 parseArticleWithReadability）
global.Readability = undefined;

// 引入模組
const {
  safeQueryElements,
  expandCollapsibleElements,
  cachedQuery,
  findContentCmsFallback,
  extractLargestListFallback,
  createOptimizedDocumentClone,
  parseArticleWithReadability,
} = require('../../../../scripts/content/extractors/ReadabilityAdapter.js');

describe('ReadabilityAdapter - 額外函數測試', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('safeQueryElements', () => {
    test('應該在正常情況下返回查詢結果', () => {
      document.body.innerHTML = '<div><p>1</p><p>2</p></div>';
      const result = safeQueryElements(document.body, 'p');
      expect(result).toHaveLength(2);
    });

    test('當 container 為 null 時應該返回空數組', () => {
      const result = safeQueryElements(null, 'p');
      expect(result).toEqual([]);
    });

    test('當 selector 為空時應該返回空數組', () => {
      const result = safeQueryElements(document.body, '');
      expect(result).toEqual([]);
    });

    test('當 selector 無效時應該返回空數組並記錄警告', () => {
      const result = safeQueryElements(document.body, '[[invalid');
      expect(result).toEqual([]);
      expect(Logger.warn).toHaveBeenCalled();
    });
  });

  describe('cachedQuery', () => {
    test('應該在無 PerformanceOptimizer 時使用原生 querySelector', () => {
      document.body.innerHTML = '<div id="test">content</div>';
      const result = cachedQuery('#test', document, { single: true });
      expect(result).toBeTruthy();
      expect(result.id).toBe('test');
    });

    test('應該在無 PerformanceOptimizer 時使用原生 querySelectorAll', () => {
      document.body.innerHTML = '<p>1</p><p>2</p>';
      const result = cachedQuery('p', document);
      expect(result).toHaveLength(2);
    });

    test('當 PerformanceOptimizer 可用時應該使用緩存查詢', () => {
      const mockCachedQuery = jest.fn().mockReturnValue(['mock result']);
      window.performanceOptimizer = { cachedQuery: mockCachedQuery };
      global.PerformanceOptimizer = {};

      const result = cachedQuery('.test', document, { single: true });

      expect(mockCachedQuery).toHaveBeenCalledWith('.test', document, { single: true });
      expect(result).toEqual(['mock result']);

      // 清理
      delete window.performanceOptimizer;
      global.PerformanceOptimizer = undefined;
    });
  });

  describe('expandCollapsibleElements', () => {
    test('應該展開 <details> 元素', async () => {
      document.body.innerHTML = '<details><summary>Title</summary><p>Content</p></details>';

      await expandCollapsibleElements(50);

      const details = document.querySelector('details');
      expect(details.hasAttribute('open')).toBe(true);
    });

    test('應該處理 aria-expanded 控制的元素', async () => {
      document.body.innerHTML = `
        <button aria-expanded="false" aria-controls="content">Toggle</button>
        <div id="content" aria-hidden="true" class="collapsed">Hidden content</div>
      `;

      await expandCollapsibleElements(50);

      const button = document.querySelector('button');
      const content = document.getElementById('content');

      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(content.hasAttribute('aria-hidden')).toBe(false);
    });

    test('應該移除 collapsed 類別', async () => {
      document.body.innerHTML = '<div class="collapsed">Content</div>';

      await expandCollapsibleElements(50);

      const div = document.querySelector('div');
      expect(div.classList.contains('collapsed')).toBe(false);
      expect(div.classList.contains('expanded-by-clipper')).toBe(true);
    });

    test('應該處理帶 hidden 屬性的元素', async () => {
      document.body.innerHTML = '<div hidden>This is a lot of content that should be shown</div>';

      await expandCollapsibleElements(50);

      const div = document.querySelector('div');
      expect(div.hasAttribute('hidden')).toBe(false);
    });

    test('當發生錯誤時應該返回空數組', async () => {
      // Mock 一個會拋出錯誤的 querySelectorAll
      const originalQuerySelectorAll = document.querySelectorAll;
      document.querySelectorAll = jest.fn().mockImplementation(() => {
        throw new Error('Query failed');
      });

      const result = await expandCollapsibleElements(50);

      expect(result).toEqual([]);
      expect(Logger.warn).toHaveBeenCalled();

      document.querySelectorAll = originalQuerySelectorAll;
    });
  });

  describe('findContentCmsFallback', () => {
    test('應該找到 Drupal 結構的內容', () => {
      document.body.innerHTML = `
        <div class="node__content">
          <div class="field--name-field-image"><img src="test.jpg"></div>
          <div class="field--name-field-body"><p>${'a'.repeat(300)}</p></div>
        </div>
      `;

      const result = findContentCmsFallback();

      expect(result).toBeTruthy();
      expect(result).toContain('img');
    });

    test('應該找到常見 CMS 選擇器的內容', () => {
      document.body.innerHTML = `
        <article class="post-content"><p>${'a'.repeat(300)}</p></article>
      `;

      const result = findContentCmsFallback();

      expect(result).toBeTruthy();
    });

    test('應該找到最大的內容區塊', () => {
      document.body.innerHTML = `
        <main>
          <article>
            <p>${'a'.repeat(400)}</p>
            <p>${'b'.repeat(400)}</p>
          </article>
        </main>
      `;

      const result = findContentCmsFallback();

      expect(result).toBeTruthy();
    });

    test('當無內容時應該返回 null', () => {
      document.body.innerHTML = '<div>short</div>';

      const result = findContentCmsFallback();

      expect(result).toBeNull();
    });
  });

  describe('extractLargestListFallback', () => {
    test('應該找到最大的列表', () => {
      document.body.innerHTML = `
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
          <li>Item 4</li>
          <li>Item 5</li>
        </ul>
      `;

      const result = extractLargestListFallback();

      expect(result).toBeTruthy();
      expect(result).toContain('Item 1');
    });

    test('應該包含前面的標題', () => {
      document.body.innerHTML = `
        <h2>List Title</h2>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
          <li>Item 4</li>
        </ul>
      `;

      const result = extractLargestListFallback();

      expect(result).toBeTruthy();
      expect(result).toContain('List Title');
    });

    test('當無列表時應該返回 null', () => {
      document.body.innerHTML = '<p>No lists here</p>';

      const result = extractLargestListFallback();

      expect(result).toBeNull();
    });

    test('應該過濾太短的列表', () => {
      document.body.innerHTML = `
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
      `;

      const result = extractLargestListFallback();

      expect(result).toBeNull();
    });

    test('當發生錯誤時應該返回 null', () => {
      const originalQuerySelectorAll = document.querySelectorAll;
      document.querySelectorAll = jest.fn().mockImplementation(() => {
        throw new Error('Query failed');
      });

      const result = extractLargestListFallback();

      expect(result).toBeNull();
      expect(Logger.warn).toHaveBeenCalled();

      document.querySelectorAll = originalQuerySelectorAll;
    });
  });

  describe('createOptimizedDocumentClone', () => {
    test('應該創建文檔副本', () => {
      document.body.innerHTML = '<article><p>Content</p></article>';

      const clonedDoc = createOptimizedDocumentClone();

      expect(clonedDoc).toBeTruthy();
      expect(clonedDoc.body.innerHTML).toBeTruthy();
    });

    test('應該移除廣告元素', () => {
      document.body.innerHTML = `
        <article><p>Content</p></article>
        <div class="advertisement">Ad here</div>
      `;

      const clonedDoc = createOptimizedDocumentClone();

      expect(clonedDoc.querySelector('.advertisement')).toBeNull();
    });

    test('應該移除 script 和 style 元素', () => {
      document.body.innerHTML = `
        <script>console.log('test')</script>
        <style>.test{}</style>
        <article><p>Content</p></article>
      `;

      const clonedDoc = createOptimizedDocumentClone();

      expect(clonedDoc.querySelectorAll('script')).toHaveLength(0);
      expect(clonedDoc.querySelectorAll('style')).toHaveLength(0);
    });

    test('應該移除導航元素', () => {
      document.body.innerHTML = `
        <nav>Navigation</nav>
        <aside>Sidebar</aside>
        <article><p>Content</p></article>
      `;

      const clonedDoc = createOptimizedDocumentClone();

      expect(clonedDoc.querySelector('nav')).toBeNull();
      expect(clonedDoc.querySelector('aside')).toBeNull();
    });
  });

  describe('parseArticleWithReadability', () => {
    test('當 Readability 不可用時應該拋出錯誤', () => {
      global.Readability = undefined;

      expect(() => parseArticleWithReadability()).toThrow('Readability library not loaded');
    });

    test('應該成功解析文章', () => {
      // Mock Readability
      global.Readability = jest.fn().mockImplementation(() => ({
        parse: () => ({
          title: 'Test Article',
          content: '<p>Article content here</p>',
        }),
      }));

      document.body.innerHTML = '<article><p>Content</p></article>';

      const result = parseArticleWithReadability();

      expect(result).toBeTruthy();
      expect(result.title).toBe('Test Article');
      expect(result.content).toContain('Article content');
    });

    test('當 Readability 返回 null 時應該拋出錯誤', () => {
      global.Readability = jest.fn().mockImplementation(() => ({
        parse: () => null,
      }));

      expect(() => parseArticleWithReadability()).toThrow('Readability parsing returned no result');
    });

    test('當解析結果無 content 時應該拋出錯誤', () => {
      global.Readability = jest.fn().mockImplementation(() => ({
        parse: () => ({
          title: 'Title',
          content: null,
        }),
      }));

      expect(() => parseArticleWithReadability()).toThrow('Parsed article has no valid content');
    });

    test('當解析結果無 title 時應該使用 document.title', () => {
      Object.defineProperty(document, 'title', {
        value: 'Document Title',
        writable: true,
        configurable: true,
      });

      global.Readability = jest.fn().mockImplementation(() => ({
        parse: () => ({
          title: null,
          content: '<p>Content</p>',
        }),
      }));

      const result = parseArticleWithReadability();

      expect(result.title).toBe('Document Title');
    });

    test('當 Readability.parse 拋出錯誤時應該重新拋出', () => {
      global.Readability = jest.fn().mockImplementation(() => ({
        parse: () => {
          throw new Error('Parse error');
        },
      }));

      expect(() => parseArticleWithReadability()).toThrow('Readability parsing error: Parse error');
    });
  });
});
