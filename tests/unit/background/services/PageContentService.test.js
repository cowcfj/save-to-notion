/**
 * PageContentService 單元測試
 */
import {
  PageContentService,
  CONTENT_EXTRACTION_SCRIPTS,
} from '../../../../scripts/background/services/PageContentService.js';

describe('PageContentService', () => {
  let mockInjectionService = null;
  let mockLogger = null;
  let service = null;

  beforeEach(() => {
    mockInjectionService = {
      injectWithResponse: jest.fn(),
    };

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    service = new PageContentService({
      injectionService: mockInjectionService,
      logger: mockLogger,
    });
  });

  describe('constructor', () => {
    test('應正確初始化 injectionService 和 logger', () => {
      expect(service.injectionService).toBe(mockInjectionService);
      expect(service.logger).toBe(mockLogger);
    });

    test('應使用 console 作為預設 logger', () => {
      const serviceWithDefaults = new PageContentService({
        injectionService: mockInjectionService,
      });
      expect(serviceWithDefaults.logger).toBe(console);
    });
  });

  describe('extractContent', () => {
    test('應拋出錯誤當 injectionService 不存在', async () => {
      const serviceWithoutInjector = new PageContentService({ logger: mockLogger });

      await expect(serviceWithoutInjector.extractContent(123)).rejects.toThrow(
        'InjectionService is required'
      );
    });

    test('應調用 injectWithResponse 並返回提取結果', async () => {
      // injectWithResponse 直接返回函數執行結果
      const mockResult = {
        title: 'Test Page',
        blocks: [{ type: 'paragraph', paragraph: { rich_text: [] } }],
        siteIcon: 'https://example.com/icon.png',
      };

      mockInjectionService.injectWithResponse.mockResolvedValue(mockResult);

      const result = await service.extractContent(123);

      expect(mockInjectionService.injectWithResponse).toHaveBeenCalledWith(
        123,
        expect.any(Function),
        CONTENT_EXTRACTION_SCRIPTS
      );
      expect(result.title).toBe('Test Page');
      expect(result.blocks).toHaveLength(1);
      expect(result.siteIcon).toBe('https://example.com/icon.png');
    });

    test('應返回回退結果當提取結果為空', async () => {
      // 空結果或無效結果
      mockInjectionService.injectWithResponse.mockResolvedValue(null);

      const result = await service.extractContent(123);

      expect(result.title).toBe('Untitled');
      expect(result.blocks).toHaveLength(1);
      expect(result.siteIcon).toBeNull();
    });

    test('應返回回退結果當提取結果缺少必要欄位', async () => {
      // 缺少 blocks 的結果
      mockInjectionService.injectWithResponse.mockResolvedValue({ title: 'Test' });

      const result = await service.extractContent(123);

      expect(result.title).toBe('Untitled');
      expect(result.blocks).toHaveLength(1);
    });

    test('應處理 null 結果', async () => {
      mockInjectionService.injectWithResponse.mockResolvedValue(null);

      const result = await service.extractContent(123);

      expect(result.title).toBe('Untitled');
      expect(result.blocks).toHaveLength(1);
    });

    test('應拋出錯誤當注入失敗', async () => {
      const injectionError = new Error('Injection failed');
      mockInjectionService.injectWithResponse.mockRejectedValue(injectionError);

      await expect(service.extractContent(123)).rejects.toThrow('Injection failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('應記錄成功提取的日誌', async () => {
      // injectWithResponse 直接返回函數執行結果，不是包裝在陣列中
      const mockResult = {
        title: 'Test Page',
        blocks: [
          { type: 'paragraph', paragraph: { rich_text: [] } },
          { type: 'heading_1', heading_1: { rich_text: [] } },
        ],
        siteIcon: null,
      };

      mockInjectionService.injectWithResponse.mockResolvedValue(mockResult);

      await service.extractContent(123);

      // 驗證日誌包含成功訊息
      const logCalls = mockLogger.log.mock.calls;
      const successLog = logCalls.find(call => call[0]?.includes('成功'));
      expect(successLog).toBeDefined();
    });
  });

  describe('getRequiredScripts', () => {
    test('應返回腳本列表的副本', () => {
      const scripts = PageContentService.getRequiredScripts();

      expect(scripts).toEqual(CONTENT_EXTRACTION_SCRIPTS);
      expect(scripts).not.toBe(CONTENT_EXTRACTION_SCRIPTS); // 應是副本
    });

    test('應包含必要的腳本', () => {
      const scripts = PageContentService.getRequiredScripts();

      expect(scripts).toContain('lib/Readability.js');
      expect(scripts).toContain('dist/content.bundle.js');
    });
  });

  describe('CONTENT_EXTRACTION_SCRIPTS', () => {
    test('應是一個非空陣列', () => {
      expect(Array.isArray(CONTENT_EXTRACTION_SCRIPTS)).toBe(true);
      expect(CONTENT_EXTRACTION_SCRIPTS.length).toBeGreaterThan(0);
    });

    test('所有項目應是字串', () => {
      CONTENT_EXTRACTION_SCRIPTS.forEach(script => {
        expect(typeof script).toBe('string');
      });
    });

    test('所有腳本路徑應有正確格式', () => {
      CONTENT_EXTRACTION_SCRIPTS.forEach(script => {
        // 支持 scripts/, lib/, dist/ 開頭
        expect(script).toMatch(/^(scripts|lib|dist)\/.+\.(js)$/);
      });
    });
  });
});
