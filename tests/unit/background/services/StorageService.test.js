/**
 * StorageService 單元測試
 */

const {
  StorageService,
  normalizeUrl,
  URL_TRACKING_PARAMS,
} = require('../../../../scripts/background/services/StorageService');

describe('normalizeUrl', () => {
  it('應該移除 hash', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
  });

  it('應該移除追蹤參數', () => {
    const url = 'https://example.com/page?utm_source=google&normal=keep';
    expect(normalizeUrl(url)).toBe('https://example.com/page?normal=keep');
  });

  it('應該移除所有追蹤參數', () => {
    URL_TRACKING_PARAMS.forEach(param => {
      const url = `https://example.com/page?${param}=value&normal=keep`;
      const result = normalizeUrl(url);
      expect(result).not.toContain(param);
      expect(result).toContain('normal=keep');
    });
  });

  it('應該標準化尾部斜線', () => {
    expect(normalizeUrl('https://example.com/page/')).toBe('https://example.com/page');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('應該處理相對 URL', () => {
    expect(normalizeUrl('/relative/path')).toBe('/relative/path');
  });

  it('應該處理空值', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl(null)).toBe('');
  });

  it('應該處理無效 URL', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });

  it('應該總是返回字串類型', () => {
    expect(normalizeUrl(123)).toBe('123');
    expect(normalizeUrl({ custom: 'obj' })).toBe('[object Object]');
    expect(normalizeUrl(['a', 'b'])).toBe('a,b');
    expect(normalizeUrl(true)).toBe('true');
  });
});

describe('StorageService', () => {
  let service = null;
  let mockStorage = null;
  let mockLogger = null;

  beforeEach(() => {
    mockStorage = {
      local: {
        get: jest.fn((keys, sendResult) => sendResult({})),
        set: jest.fn((data, callback) => callback?.()),
        remove: jest.fn((keys, callback) => callback?.()),
      },
      sync: {
        get: jest.fn((keys, sendResult) => sendResult({})),
        set: jest.fn((data, callback) => callback?.()),
      },
    };
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    service = new StorageService({
      chromeStorage: mockStorage,
      logger: mockLogger,
    });
  });

  describe('getSavedPageData', () => {
    it('應該正確獲取保存的頁面數據', async () => {
      const pageData = { title: 'Test Page', savedAt: 12345 };
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ 'saved_https://example.com/page': pageData });
      });

      const result = await service.getSavedPageData('https://example.com/page');
      expect(result).toEqual(pageData);
    });

    it('應該在沒有數據時返回 null', async () => {
      const result = await service.getSavedPageData('https://example.com/page');
      expect(result).toBeNull();
    });

    it('應該標準化 URL', async () => {
      await service.getSavedPageData('https://example.com/page#section');
      expect(mockStorage.local.get).toHaveBeenCalledWith(
        ['saved_https://example.com/page'],
        expect.any(Function)
      );
    });
  });

  describe('setSavedPageData', () => {
    it('應該正確設置頁面數據', async () => {
      const data = { title: 'Test Page' };
      await service.setSavedPageData('https://example.com/page', data);

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'saved_https://example.com/page': expect.objectContaining({
            title: 'Test Page',
            lastUpdated: expect.any(Number),
          }),
        }),
        expect.any(Function)
      );
    });
  });

  describe('clearPageState', () => {
    it('應該清除頁面狀態和標註', async () => {
      await service.clearPageState('https://example.com/page');

      expect(mockStorage.local.remove).toHaveBeenCalledWith(
        ['saved_https://example.com/page', 'highlights_https://example.com/page'],
        expect.any(Function)
      );
    });
  });

  describe('getConfig', () => {
    it('應該從 sync storage 獲取配置', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        callback({ apiKey: 'test-key' });
      });

      const result = await service.getConfig(['apiKey']);
      expect(result).toEqual({ apiKey: 'test-key' });
    });
  });

  describe('setConfig', () => {
    it('應該正確設置配置', async () => {
      await service.setConfig({ apiKey: 'new-key' });
      expect(mockStorage.sync.set).toHaveBeenCalledWith(
        { apiKey: 'new-key' },
        expect.any(Function)
      );
    });
  });

  describe('getHighlights', () => {
    it('應該獲取標註數據', async () => {
      const highlights = [{ text: 'test', color: 'yellow' }];
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({ 'highlights_https://example.com/page': highlights });
      });

      const result = await service.getHighlights('https://example.com/page');
      expect(result).toEqual(highlights);
    });

    it('應該在沒有標註時返回空數組', async () => {
      const result = await service.getHighlights('https://example.com/page');
      expect(result).toEqual([]);
    });
  });

  describe('setHighlights', () => {
    it('應該正確設置標註', async () => {
      const highlights = [{ text: 'test', color: 'yellow' }];
      await service.setHighlights('https://example.com/page', highlights);

      expect(mockStorage.local.set).toHaveBeenCalledWith(
        { 'highlights_https://example.com/page': highlights },
        expect.any(Function)
      );
    });
  });

  describe('getAllSavedPageUrls', () => {
    it('應該返回所有已保存頁面的 URL', async () => {
      mockStorage.local.get.mockImplementation((keys, callback) => {
        callback({
          'saved_https://example.com/page1': {},
          'saved_https://example.com/page2': {},
          'highlights_https://example.com/page1': [],
          other_key: 'value',
        });
      });

      const result = await service.getAllSavedPageUrls();
      expect(result).toEqual(['https://example.com/page1', 'https://example.com/page2']);
    });
  });

  describe('error handling', () => {
    it('應該在沒有 storage 時拋出錯誤', () => {
      // 暫時移除 global.chrome 以確保 storage 為 null
      const originalChrome = global.chrome;
      delete global.chrome;

      const serviceNoStorage = new StorageService({ chromeStorage: null });
      expect(() => serviceNoStorage.getSavedPageData('url')).toThrow(
        'Chrome storage not available'
      );

      global.chrome = originalChrome;
    });
  });
});
