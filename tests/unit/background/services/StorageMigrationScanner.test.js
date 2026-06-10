import { StorageMigrationScanner } from '../../../../scripts/background/services/StorageMigrationScanner.js';
import {
  PAGE_PREFIX,
  SAVED_PREFIX,
  HIGHLIGHTS_PREFIX,
} from '../../../../scripts/background/services/StorageService.js';
import { ERROR_MESSAGES } from '../../../../scripts/config/messages/errorMessages.js';

const STORAGE_ERROR = ERROR_MESSAGES.TECHNICAL.CHROME_STORAGE_UNAVAILABLE;

describe('StorageMigrationScanner', () => {
  let scanner;
  let mockStorage;
  let mockLogger;

  beforeEach(() => {
    mockStorage = {
      local: {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
      },
      sync: {
        get: jest.fn(),
        set: jest.fn(),
      },
    };

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    scanner = new StorageMigrationScanner({
      chromeStorage: mockStorage,
      logger: mockLogger,
    });
  });

  describe('getAllSavedPageUrls', () => {
    it('應該返回所有已保存頁面的 URL（Phase 3: page_*.notion 非 null）', async () => {
      mockStorage.local.get.mockResolvedValue({
        [`${PAGE_PREFIX}https://example.com/page1`]: {
          notion: { pageId: 'p1' },
          highlights: [],
          metadata: {},
        },
        [`${PAGE_PREFIX}https://example.com/page2`]: {
          notion: { pageId: 'p2' },
          highlights: [],
          metadata: {},
        },
        // 無 notion 的 page_* 不應被計算
        [`${PAGE_PREFIX}https://example.com/page3`]: {
          notion: null,
          highlights: [],
          metadata: {},
        },
        // 過渡期：舊格式也要計算
        [`${SAVED_PREFIX}https://example.com/page4`]: {},
        other_key: 'value',
      });

      const result = await scanner.getAllSavedPageUrls();
      expect(result.toSorted((a, b) => a.localeCompare(b))).toEqual(
        [
          'https://example.com/page1',
          'https://example.com/page2',
          'https://example.com/page4',
        ].toSorted((a, b) => a.localeCompare(b))
      );
    });

    it('應在提供 allData 時直接使用該資料且不呼召 storage.local.get', async () => {
      const allData = {
        [`${PAGE_PREFIX}https://example.com/all-data-page1`]: {
          notion: { pageId: 'p1' },
          highlights: [],
          metadata: {},
        },
        [`${PAGE_PREFIX}https://example.com/all-data-page2`]: {
          notion: null,
          highlights: [],
          metadata: {},
        },
        [`${SAVED_PREFIX}https://example.com/all-data-page3`]: {},
        other_key: 'value',
      };
      mockStorage.local.get.mockClear();

      const result = await scanner.getAllSavedPageUrls(allData);

      expect(mockStorage.local.get).not.toHaveBeenCalled();
      expect(result.toSorted((a, b) => a.localeCompare(b))).toEqual(
        ['https://example.com/all-data-page1', 'https://example.com/all-data-page3'].toSorted(
          (a, b) => a.localeCompare(b)
        )
      );
    });
  });

  describe('getAllHighlights', () => {
    it('應該返回所有 page_* 和 highlights_* 的標註資料（Phase 3）', async () => {
      mockStorage.local.get.mockResolvedValue({
        // 新格式（Phase 3）
        [`${PAGE_PREFIX}https://example.com/page1`]: {
          notion: { pageId: 'p1' },
          highlights: ['h1'],
          metadata: {},
        },
        // 舊格式（過渡期）
        [`${HIGHLIGHTS_PREFIX}https://example.com/page2`]: {
          url: 'https://example.com/page2',
          highlights: ['h2'],
        },
        // 同 URL 有 page_* 時，highlights_* 不應覆蓋
        [`${HIGHLIGHTS_PREFIX}https://example.com/page1`]: {
          url: 'https://example.com/page1',
          highlights: ['legacy-h1'],
        },
        other_key: 'value',
      });

      const result = await scanner.getAllHighlights();
      // page1 使用 page_* 資料（不被舊 highlights_* 覆蓋）
      expect(result['https://example.com/page1']).toEqual({
        url: 'https://example.com/page1',
        highlights: ['h1'],
      });
      // page2 使用 highlights_* 資料（尚未升級）
      expect(result['https://example.com/page2']).toEqual({
        url: 'https://example.com/page2',
        highlights: ['h2'],
      });
    });

    it('應在提供 allData 時直接使用該資料且不呼召 storage.local.get', async () => {
      const allData = {
        [`${PAGE_PREFIX}https://example.com/all-data-page1`]: {
          notion: { pageId: 'p1' },
          highlights: ['new-h1'],
          metadata: {},
        },
        [`${HIGHLIGHTS_PREFIX}https://example.com/all-data-page1`]: {
          url: 'https://example.com/all-data-page1',
          highlights: ['legacy-h1'],
        },
        [`${HIGHLIGHTS_PREFIX}https://example.com/all-data-page2`]: {
          url: 'https://example.com/all-data-page2',
          highlights: ['legacy-h2'],
        },
        other_key: 'value',
      };
      mockStorage.local.get.mockClear();

      const result = await scanner.getAllHighlights(allData);

      expect(mockStorage.local.get).not.toHaveBeenCalled();
      expect(result['https://example.com/all-data-page1']).toEqual({
        url: 'https://example.com/all-data-page1',
        highlights: ['new-h1'],
      });
      expect(result['https://example.com/all-data-page2']).toEqual({
        url: 'https://example.com/all-data-page2',
        highlights: ['legacy-h2'],
      });
    });

    it('遇到毀損的 page_* entry(value 非物件)應跳過並警告,不應拋錯也不應偽造空 highlights', async () => {
      const allData = {
        [`${PAGE_PREFIX}https://example.com/good`]: {
          notion: { pageId: 'p1' },
          highlights: ['h1'],
          metadata: {},
        },
        [`${PAGE_PREFIX}https://example.com/corrupt-null`]: null,
        [`${PAGE_PREFIX}https://example.com/corrupt-string`]: 'unexpected-string',
      };

      const result = await scanner.getAllHighlights(allData);

      // 健康 entry 正常返回
      expect(result['https://example.com/good']).toEqual({
        url: 'https://example.com/good',
        highlights: ['h1'],
      });
      // 毀損 entry MUST NOT 出現在結果中(避免偽造「URL 存在但 highlights 為空」的假狀態)
      expect(result).not.toHaveProperty('https://example.com/corrupt-null');
      expect(result).not.toHaveProperty('https://example.com/corrupt-string');
      // 毀損 entry MUST 留下 warn 足跡以利後續排查
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('page_* entry has invalid shape'),
        expect.objectContaining({ key: `${PAGE_PREFIX}https://example.com/corrupt-null` })
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('page_* entry has invalid shape'),
        expect.objectContaining({ key: `${PAGE_PREFIX}https://example.com/corrupt-string` })
      );
    });
  });

  describe('Error Handling', () => {
    it('應該在沒有 storage 時拋出錯誤', async () => {
      const originalChrome = globalThis.chrome;
      delete globalThis.chrome;

      const scannerNoStorage = new StorageMigrationScanner({ chromeStorage: null });

      await expect(scannerNoStorage.getAllSavedPageUrls()).rejects.toThrow(STORAGE_ERROR);
      await expect(scannerNoStorage.getAllHighlights()).rejects.toThrow(STORAGE_ERROR);

      globalThis.chrome = originalChrome;
    });

    it('應該在 getAllSavedPageUrls 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.get.mockRejectedValue(new Error('Storage fail'));
      await expect(scanner.getAllSavedPageUrls()).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('StorageMigrationScanner'),
        {
          error: expect.any(Error),
        }
      );
    });

    it('應該在 getAllHighlights 失敗時記錄錯誤並拋出', async () => {
      mockStorage.local.get.mockRejectedValue(new Error('Storage fail'));
      await expect(scanner.getAllHighlights()).rejects.toThrow('Storage fail');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('StorageMigrationScanner'),
        {
          error: expect.any(Error),
        }
      );
    });
  });
});
