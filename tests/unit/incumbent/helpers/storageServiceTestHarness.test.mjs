/**
 * @jest-environment jsdom
 */
import {
  createStorageServiceHarness,
  mockStorageLookup,
} from '../../../helpers/storageServiceTestHarness.js';

describe('storageServiceTestHarness', () => {
  describe('mockStorageLookup', () => {
    let mockStorage;

    beforeEach(() => {
      mockStorage = {
        local: {
          get: jest.fn(() => Promise.resolve({})),
          set: jest.fn(() => Promise.resolve()),
          remove: jest.fn(() => Promise.resolve()),
        },
      };
    });

    const storageData = {
      key1: 'value1',
      key2: 'value2',
      key3: { nested: 'object' },
    };

    describe('Chrome Storage API 規範：完整內容讀取', () => {
      test('keys 為 null 時應回傳完整 storageData', async () => {
        mockStorageLookup(mockStorage, storageData);

        const result = await mockStorage.local.get(null);

        expect(result).toEqual(storageData);
        expect(result).not.toBe(storageData); // 應該是副本，不是同一個參考
      });

      test('keys 為 undefined 時應回傳完整 storageData', async () => {
        mockStorageLookup(mockStorage, storageData);

        const result = await mockStorage.local.get(undefined);

        expect(result).toEqual(storageData);
      });

      test('keys 為空陣列時應回傳完整 storageData', async () => {
        mockStorageLookup(mockStorage, storageData);

        const result = await mockStorage.local.get([]);

        expect(result).toEqual(storageData);
      });
    });

    describe('部分內容讀取', () => {
      test('keys 為單一字串時應只回傳該 key', async () => {
        mockStorageLookup(mockStorage, storageData);

        const result = await mockStorage.local.get('key1');

        expect(result).toEqual({ key1: 'value1' });
      });

      test('keys 為字串陣列時應回傳對應的 keys', async () => {
        mockStorageLookup(mockStorage, storageData);

        const result = await mockStorage.local.get(['key1', 'key3']);

        expect(result).toEqual({
          key1: 'value1',
          key3: { nested: 'object' },
        });
      });

      test('keys 包含不存在的 key 時不應回傳該 key', async () => {
        mockStorageLookup(mockStorage, storageData);

        const result = await mockStorage.local.get(['key1', 'nonexistent']);

        expect(result).toEqual({ key1: 'value1' });
        expect(result).not.toHaveProperty('nonexistent');
      });
    });

    describe('邊界情況', () => {
      test('storageData 為空物件時，null keys 應回傳空物件', async () => {
        mockStorageLookup(mockStorage, {});

        const result = await mockStorage.local.get(null);

        expect(result).toEqual({});
      });

      test('storageData 為 null 時應安全處理', async () => {
        mockStorageLookup(mockStorage, null);

        const result = await mockStorage.local.get(['key1']);

        expect(result).toEqual({});
      });
    });
  });

  describe('createStorageServiceHarness', () => {
    test('應建立完整的測試環境結構', () => {
      const MockStorageService = jest.fn();
      const { mockStorage, mockLogger } = createStorageServiceHarness(MockStorageService);

      expect(MockStorageService).toHaveBeenCalledWith({
        chromeStorage: mockStorage,
        logger: mockLogger,
      });
      expect(mockStorage.local.get).toBeDefined();
      expect(mockStorage.local.set).toBeDefined();
      expect(mockStorage.local.remove).toBeDefined();
      expect(mockLogger.log).toBeDefined();
      expect(mockLogger.error).toBeDefined();
    });
  });
});
