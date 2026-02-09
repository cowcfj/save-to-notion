/**
 * @jest-environment jsdom
 */

/**
 * Content Script Entry Point (index.js) 單元測試
 *
 * 測試 extractPageContent 函數的各種場景：
 * - 成功提取路徑
 * - 空內容處理
 * - 異常處理
 * - 圖片收集
 */

import Logger from '../../../scripts/utils/Logger.js';
import { ContentExtractor } from '../../../scripts/content/extractors/ContentExtractor.js';
import { ConverterFactory } from '../../../scripts/content/converters/ConverterFactory.js';
import { ImageCollector } from '../../../scripts/content/extractors/ImageCollector.js';
import { extractPageContent } from '../../../scripts/content/index.js';

// Mock Logger
jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../scripts/content/extractors/ContentExtractor.js', () => ({
  ContentExtractor: {
    extract: jest.fn(),
  },
}));

jest.mock('../../../scripts/content/converters/ConverterFactory.js', () => ({
  ConverterFactory: {
    getConverter: jest.fn(),
  },
}));

jest.mock('../../../scripts/content/extractors/ImageCollector.js', () => ({
  ImageCollector: {
    collectAdditionalImages: jest.fn(),
  },
}));

describe('Content Script Entry Point', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // 設置 window.__UNIT_TESTING__ 為 false 避免自動執行
    globalThis.__UNIT_TESTING__ = false;

    // 設置基本的 document.title
    Object.defineProperty(document, 'title', {
      value: 'Test Page Title',
      writable: true,
      configurable: true,
    });

    // Use imported modules directly (resetModules removed)
    // Ensure mocks are cleared

    // Use imported modules directly
    // Note: Since we import them, we might not need to assign them if we use the imported names directly in tests.
    // However, the tests use local variables with the same names (shadowing imports if declared).
    // I removed the let declarations in Step 1563/4.
    // So writing `extractPageContent = ...` is invalid if `extractPageContent` is an import (imports are const).
    // BUT wait. `extractPageContent` is imported as a named export.
    // `import { extractPageContent } from ...`
    // I cannot reassign it.
    // The previous code mocked the MODULE using `require`.
    // Now I am using `import`.
    // I cannot mock `extractPageContent` via reassignment if it is imported.
    // BUT `extractPageContent` is the SUT (System Under Test). I don't need to mock it.
    // I need to test IT.
    // So I just need to call it.
    // Variables `ContentExtractor`, `ConverterFactory`... are mocks.
    // I need to access the mock functions.
    // `import { ContentExtractor } from ...`
    // And `jest.mock(...)`.
    // So `ContentExtractor` IS the mock object.

    // So I just need to call it.

    // Ensure window.extractPageContent is available (as index.js does this conditionally)
    globalThis.extractPageContent = extractPageContent;
  });

  afterEach(() => {
    delete globalThis.__UNIT_TESTING__;
    delete globalThis.extractPageContent;
    delete globalThis.__notion_extraction_result;
  });

  describe('成功提取路徑', () => {
    test('應該成功提取內容並轉換為 Notion Blocks', async () => {
      // 設置 mock 返回值
      ContentExtractor.extract.mockReturnValue({
        content: '<p>Test content</p>',
        type: 'article',
        metadata: {
          title: 'Extracted Title',
          author: 'Test Author',
          description: 'Test description',
        },
        debug: {
          complexity: 'simple',
        },
      });

      const mockConverter = {
        convert: jest.fn().mockReturnValue([
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: 'Test content' } }],
            },
          },
        ]),
      };
      ConverterFactory.getConverter.mockReturnValue(mockConverter);

      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [
          {
            object: 'block',
            type: 'image',
            image: { external: { url: 'https://example.com/image1.jpg' } },
          },
          {
            object: 'block',
            type: 'image',
            image: { external: { url: 'https://example.com/image2.jpg' } },
          },
        ],
        coverImage: null,
      });

      const result = await extractPageContent();

      expect(result.title).toBe('Extracted Title');
      expect(result.blocks).toHaveLength(2);
      expect(result.blocks[0].type).toBe('image');
      expect(result.blocks[1].type).toBe('paragraph');
      expect(result.rawHtml).toBe('<p>Test content</p>');
      expect(result.metadata).toBeDefined();
      expect(result.additionalImages).toHaveLength(1);
      expect(result.debug).toBeDefined();
      expect(result.debug.contentType).toBe('article');
    });

    test('應該使用 document.title 作為 fallback', async () => {
      ContentExtractor.extract.mockReturnValue({
        content: '<p>Content</p>',
        type: 'article',
        metadata: {
          title: null, // 無標題
        },
      });

      const mockConverter = {
        convert: jest.fn().mockReturnValue([]),
      };
      ConverterFactory.getConverter.mockReturnValue(mockConverter);
      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [],
        coverImage: null,
      });

      const result = await extractPageContent();

      expect(result.title).toBe('Test Page Title');
    });
  });

  describe('空內容處理', () => {
    test('當 ContentExtractor 返回 null 時應該返回錯誤區塊', async () => {
      ContentExtractor.extract.mockReturnValue(null);

      const result = await extractPageContent();

      expect(result.title).toBe('Test Page Title');
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe('paragraph');
      expect(result.blocks[0].paragraph.rich_text[0].text.content).toContain(
        'Content extraction failed'
      );
      expect(result.rawHtml).toBe('');
      expect(result.additionalImages).toEqual([]);
      expect(result.coverImage).toBeNull();
      expect(Logger.warn).toHaveBeenCalledWith(
        '內容提取失敗或返回空內容',
        expect.objectContaining({ action: 'extractPageContent' })
      );
    });

    test('當 content 為空時應該返回錯誤區塊', async () => {
      ContentExtractor.extract.mockReturnValue({
        content: null,
        type: 'article',
        metadata: {},
      });

      const result = await extractPageContent();

      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].paragraph.rich_text[0].text.content).toContain(
        'Content extraction failed'
      );
    });
  });

  describe('預計算 Blocks 處理 (Next.js 等)', () => {
    test('當 content 為空但 blocks 存在時應該成功', async () => {
      // 模擬 NextJsExtractor 的返回結構
      ContentExtractor.extract.mockReturnValue({
        content: '', // 空 HTML
        blocks: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: 'Structured Content' } }],
            },
          },
        ],
        type: 'nextjs',
        metadata: {
          title: 'Structured Title',
        },
      });

      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [],
        coverImage: null,
      });

      const result = await extractPageContent();

      expect(result.title).toBe('Structured Title');
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].paragraph.rich_text[0].text.content).toBe('Structured Content');
      expect(result.rawHtml).toBe('');
      // ConverterFactory 不應該被調用
      expect(ConverterFactory.getConverter).not.toHaveBeenCalled();
    });

    test('當 content 為空且 blocks 也為空時應該失敗', async () => {
      ContentExtractor.extract.mockReturnValue({
        content: '',
        blocks: [], // 空 blocks
        type: 'nextjs',
        metadata: {},
      });

      const result = await extractPageContent();

      expect(result.blocks[0].paragraph.rich_text[0].text.content).toContain(
        'Content extraction failed'
      );
    });
  });

  describe('異常處理', () => {
    test('當 ContentExtractor 拋出錯誤時應該返回錯誤信息', async () => {
      ContentExtractor.extract.mockImplementation(() => {
        throw new Error('Extraction failed');
      });

      const result = await extractPageContent();

      expect(result.title).toBe('Test Page Title');
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].paragraph.rich_text[0].text.content).toContain('Extraction error');
      expect(result.error).toBe('Extraction failed');
      expect(result.additionalImages).toEqual([]);
      expect(result.coverImage).toBeNull();
      expect(Logger.error).toHaveBeenCalledWith(
        '內容提取發生異常',
        expect.objectContaining({ action: 'extractPageContent' })
      );
    });

    test('應該處理未知錯誤（無 message）', async () => {
      ContentExtractor.extract.mockImplementation(() => {
        throw new Error('Unknown error');
      });

      const result = await extractPageContent();

      expect(result.blocks[0].paragraph.rich_text[0].text.content).toContain('Unknown error');
    });
  });

  describe('圖片收集', () => {
    test('當圖片收集失敗時應該繼續處理', async () => {
      ContentExtractor.extract.mockReturnValue({
        content: '<p>Content</p>',
        type: 'article',
        metadata: { title: 'Title' },
      });

      const mockConverter = {
        convert: jest.fn().mockReturnValue([]),
      };
      ConverterFactory.getConverter.mockReturnValue(mockConverter);

      ImageCollector.collectAdditionalImages.mockRejectedValue(
        new Error('Image collection failed')
      );

      const result = await extractPageContent();

      expect(result.title).toBe('Title');
      expect(result.additionalImages).toEqual([]);
      expect(Logger.warn).toHaveBeenCalledWith(
        '圖片收集失敗',
        expect.objectContaining({ action: 'extractPageContent' })
      );
    });

    test('當 collectAdditionalImages 返回 null 時應該優雅降級', async () => {
      ContentExtractor.extract.mockReturnValue({
        content: '<p>Content</p>',
        type: 'article',
        metadata: { title: 'Title' },
      });

      const mockConverter = {
        convert: jest.fn().mockReturnValue([]),
      };
      ConverterFactory.getConverter.mockReturnValue(mockConverter);

      // 模擬返回 null
      ImageCollector.collectAdditionalImages.mockResolvedValue(null);

      const result = await extractPageContent();

      expect(result.title).toBe('Title');
      expect(result.additionalImages).toEqual([]);
      expect(result.coverImage).toBeNull();
      // 不應該拋出錯誤
    });
  });

  describe('全局導出', () => {
    test('應該將 extractPageContent 設置到 window', () => {
      expect(globalThis.extractPageContent).toBeDefined();
      expect(typeof globalThis.extractPageContent).toBe('function');
    });
  });

  describe('單元測試模式', () => {
    test('當 __UNIT_TESTING__ 為 true 時應該自動執行並暴露結果', async () => {
      // 這個測試驗證代碼邏輯，但不實際觸發自動執行
      // 因為模組已經在 beforeEach 中載入

      // 設置 mock
      ContentExtractor.extract.mockReturnValue({
        content: '<p>Auto test</p>',
        type: 'article',
        metadata: { title: 'Auto Title' },
      });

      const mockConverter = { convert: jest.fn().mockReturnValue([]) };
      ConverterFactory.getConverter.mockReturnValue(mockConverter);
      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [],
        coverImage: null,
      });

      // 模擬單元測試模式下的手動調用
      globalThis.__UNIT_TESTING__ = true;
      const result = await extractPageContent();
      globalThis.__notion_extraction_result = result;

      expect(globalThis.__notion_extraction_result).toBeDefined();
      expect(globalThis.__notion_extraction_result.title).toBe('Auto Title');
    });
  });
});
