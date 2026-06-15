/**
 * StorageService 單元測試 - 核心行為
 */

import {
  StorageService,
  normalizeUrl,
  URL_TRACKING_PARAMS,
  SAVED_PREFIX,
  HIGHLIGHTS_PREFIX,
  PAGE_PREFIX,
  URL_ALIAS_PREFIX,
  STORAGE_ERROR,
} from '../../../../scripts/background/services/StorageService.js';
import { createStorageServiceHarness } from '../../../helpers/storageServiceTestHarness.js';

jest.mock('../../../../scripts/utils/urlUtils.js', () => {
  const original = jest.requireActual('../../../../scripts/utils/urlUtils.js');
  return {
    ...original,
    computeStableUrl: jest.fn(url => `${url}_stable`),
  };
});

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

describe('StorageService - Core', () => {
  let service = null;
  let mockStorage = null;
  let mockLogger = null;

  beforeEach(() => {
    ({ service, mockStorage, mockLogger } = createStorageServiceHarness(StorageService));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('_buildPageObject', () => {
    it('升級舊資料時不會把 lastVerifiedAt: 0 轉成 null', () => {
      const savedData = { title: 'Test', notionPageId: 'page', lastVerifiedAt: 0, savedAt: 0 };
      const result = service._buildPageObject(savedData, [], 'https://example.com/test');
      expect(result.notion.lastVerifiedAt).toBe(0);
      expect(result.notion.savedAt).toBe(0);
      expect(result.notion.pageId).toBe('page');
    });

    it('升級舊資料時不會把 metadata.createdAt 的 0 轉成現在時間', () => {
      const savedData = { title: 'Test', notionPageId: 'page', savedAt: 0, lastUpdated: 12_345 };
      const result = service._buildPageObject(savedData, [], 'https://example.com/test');

      expect(result.metadata.createdAt).toBe(0);
    });

    it('升級舊資料時會忽略空字串 notion 欄位並回退到有效值', () => {
      const savedData = {
        title: 'Test',
        notionPageId: '',
        pageId: 'legacy-page-id',
        notionUrl: '   ',
        url: 'https://www.notion.so/legacy-page-id',
      };

      const result = service._buildPageObject(savedData, [], 'https://example.com/test');

      expect(result.notion.pageId).toBe('legacy-page-id');
      expect(result.notion.url).toBe('https://www.notion.so/legacy-page-id');
    });
  });

  describe('clearPageState', () => {
    it('應該清除頁面狀態（Phase 3: 刪除 page_* keys）', async () => {
      await service.clearPageState('https://example.com/page');

      const removeCall = mockStorage.local.remove.mock.calls[0][0];
      expect(removeCall).toContain(`${PAGE_PREFIX}https://example.com/page`);
      expect(removeCall).toContain(`${PAGE_PREFIX}https://example.com/page_stable`);
      expect(removeCall).toContain(`${SAVED_PREFIX}https://example.com/page`);
      expect(mockLogger.log).toHaveBeenCalledWith('Cleared saved page metadata', {
        url: 'https://example.com/page',
      });
    });
  });

  describe('clearLegacyKeys', () => {
    it('應該清除 normalized URL 的三種 keys（Phase 3: page_* + saved_* + highlights_*）', async () => {
      await service.clearLegacyKeys('https://example.com/article?utm_source=test');

      expect(mockStorage.local.remove).toHaveBeenCalledWith([
        `${PAGE_PREFIX}https://example.com/article`,
        `${SAVED_PREFIX}https://example.com/article`,
        `${HIGHLIGHTS_PREFIX}https://example.com/article`,
      ]);

      const removeCall = mockStorage.local.remove.mock.calls[0][0];
      expect(removeCall).toHaveLength(3);
    });

    it('應該記錄成功日誌', async () => {
      await service.clearLegacyKeys('https://example.com/page');

      expect(mockLogger.log).toHaveBeenCalledWith('Cleared legacy keys', {
        url: 'https://example.com/page',
      });
    });

    it('應該處理錯誤', async () => {
      mockStorage.local.remove.mockRejectedValue(new Error('Remove failed'));

      await expect(service.clearLegacyKeys('https://example.com/page')).rejects.toThrow(
        'Remove failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[StorageService] clearLegacyKeys failed',
        expect.any(Object)
      );
    });
  });

  describe('setUrlAlias', () => {
    it('應該設定 URL alias 映射', async () => {
      const originalUrl = 'https://example.com/original';
      const stableUrl = 'https://example.com/stable';

      await service.setUrlAlias(originalUrl, stableUrl);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        [`${URL_ALIAS_PREFIX}${originalUrl}`]: stableUrl,
      });
    });

    it('如果兩者相同則不應設定 alias', async () => {
      await service.setUrlAlias('https://example.com/same', 'https://example.com/same');
      expect(mockStorage.local.set).not.toHaveBeenCalled();
    });

    it('如果 URL 標準化後相同則不應設定 alias', async () => {
      const url1 = 'https://example.com/page?utm_source=test';
      const url2 = 'https://example.com/page';
      await service.setUrlAlias(url1, url2);
      expect(mockStorage.local.set).not.toHaveBeenCalled();
    });

    it('應該處理無效輸入 (null/empty)', async () => {
      await service.setUrlAlias(null, 'stable');
      await service.setUrlAlias('original', null);
      await service.setUrlAlias('', 'stable');
      await service.setUrlAlias('original', '');
      expect(mockStorage.local.set).not.toHaveBeenCalled();
    });

    it('應該記錄並拋出存儲錯誤', async () => {
      mockStorage.local.set.mockRejectedValue(new Error('Storage Error'));
      const originalUrl = 'https://example.com/original';
      const stableUrl = 'https://example.com/stable';

      await expect(service.setUrlAlias(originalUrl, stableUrl)).rejects.toThrow('Storage Error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[StorageService] setUrlAlias failed',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('getConfig', () => {
    it('應該從 sync storage 獲取配置', async () => {
      mockStorage.sync.get.mockResolvedValue({ apiKey: 'test-key' });

      const result = await service.getConfig(['apiKey']);
      expect(result).toEqual({ apiKey: 'test-key' });
    });
  });

  describe('setConfig', () => {
    it('應該正確設置配置', async () => {
      await service.setConfig({ apiKey: 'new-key' });
      expect(mockStorage.sync.set).toHaveBeenCalledWith({ apiKey: 'new-key' });
    });

    it('應該將 local key 儲存到 local storage', async () => {
      await service.setConfig({ notionDataSourceId: 'ds_local_123' });

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        notionDataSourceId: 'ds_local_123',
      });
      expect(mockStorage.sync.set).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('應該在沒有 storage 時拋出錯誤', async () => {
      const originalChrome = globalThis.chrome;
      delete globalThis.chrome;

      const serviceNoStorage = new StorageService({ chromeStorage: null });

      await expect(serviceNoStorage.getSavedPageData('url')).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.setSavedPageData('url', {})).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.clearPageState('url')).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.getConfig(['key'])).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.setConfig({ key: 'val' })).rejects.toThrow(STORAGE_ERROR);
      await expect(serviceNoStorage.updateHighlights('url', [])).rejects.toThrow(STORAGE_ERROR);

      globalThis.chrome = originalChrome;
    });

    it('應該在 storage.local.get 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.get.mockRejectedValue(new Error('Storage fail'));
      await expect(service.getSavedPageData('url')).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 storage.local.set 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.set.mockRejectedValue(new Error('Storage fail'));
      await expect(service.setSavedPageData('url', {})).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 storage.local.remove 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.remove.mockRejectedValue(new Error('Storage fail'));
      await expect(service.clearPageState('url')).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 storage.sync.get 失敗時記錄錯誤並拋出', async () => {
      mockStorage.sync.get.mockRejectedValue(new Error('Storage fail'));
      await expect(service.getConfig(['key'])).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 storage.sync.set 失敗時記錄錯誤並拋出', async () => {
      mockStorage.sync.set.mockRejectedValue(new Error('Storage fail'));
      await expect(service.setConfig({ key: 'val' })).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });

    it('應該在 updateHighlights 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.get.mockRejectedValue(new Error('Storage fail'));
      await expect(service.updateHighlights('url', [])).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('StorageService'), {
        error: expect.any(Error),
      });
    });
  });
});
