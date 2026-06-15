import { PAGE_PREFIX } from '../../scripts/config/shared/storage.js';
import { buildAliasState } from './status-fixtures.js';

/**
 * 建立一個乾淨的 StorageService 測試環境，包含 mockStorage 與 mockLogger
 *
 * @param {Function} StorageService - StorageService 建構子
 * @returns {object} { service, mockStorage, mockLogger }
 */
export function createStorageServiceHarness(StorageService) {
  const mockStorage = {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
    },
    sync: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
    },
  };
  const mockLogger = {
    log: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  };
  const service = new StorageService({
    chromeStorage: mockStorage,
    logger: mockLogger,
  });
  return { service, mockStorage, mockLogger };
}

/**
 * 將給定的 storageData 模擬為 mockStorage.local.get 的查詢來源
 *
 * 完整模擬 Chrome Storage API 規範：
 * - keys 為 null、undefined 或空陣列時，回傳完整的 storageData
 * - 否則只回傳指定 keys 的內容
 *
 * @param {object} mockStorage - 模擬的 chromeStorage
 * @param {object} storageData - 查詢要回傳的 Key-Value 對照表
 */
export function mockStorageLookup(mockStorage, storageData) {
  mockStorage.local.get.mockImplementation(keys => {
    // Chrome Storage API 規範：keys 為 null/undefined/空陣列時回傳完整內容
    const isEmptyKeys = Array.isArray(keys) && keys.length === 0;
    const shouldReturnAll = keys === null || keys === undefined || isEmptyKeys;

    if (shouldReturnAll) {
      return Promise.resolve({ ...storageData });
    }
    const keyList = Array.isArray(keys) ? keys : [keys];
    const result = {};
    keyList.forEach(k => {
      if (storageData && k in storageData) {
        result[k] = storageData[k];
      }
    });
    return Promise.resolve(result);
  });
}

/**
 * 模擬讀取時升級的微任務佇列排空
 */
export async function flushReadTimeUpgrade() {
  await new Promise(process.nextTick);
  await new Promise(process.nextTick);
}

/**
 * 扁平化所有被呼叫 local.remove 刪除的 key
 *
 * @param {object} mockStorage - 模擬的 chromeStorage
 * @returns {Array<string>} 扁平後的刪除鍵列表
 */
export function flattenRemovedKeys(mockStorage) {
  return mockStorage.local.remove.mock.calls.flatMap(args => args[0]);
}

/**
 * 建立具有 URL Alias 指向的 page_state 資料，用於 lookup 測試
 *
 * @param {object} params
 * @param {string} params.originalUrl
 * @param {string} params.stableUrl
 * @param {object} params.pageState
 * @returns {object} 模擬的 storage 資料塊
 */
export function buildAliasPageState({ originalUrl, stableUrl, pageState }) {
  return {
    ...buildAliasState({ originalUrl, stableUrl }),
    [`${PAGE_PREFIX}${stableUrl}`]: pageState,
  };
}

/**
 * 驗證 lock spy 呼叫目標 key 是否正確且符合次數
 *
 * @param {object} lockSpy - _withLock 的 Jest Spy
 * @param {string} stablePageKey - 預期的鎖定 Key
 * @param {number} [expectedCount=1] - 預期的鎖定次數，若為 undefined / null 則驗證至少大於 0 次且首個為目標 Key
 */
export function expectLockKeysToTarget(lockSpy, stablePageKey, expectedCount = 1) {
  const lockKeys = lockSpy.mock.calls.map(call => call[0]);
  if (expectedCount !== undefined && expectedCount !== null) {
    expect(lockKeys).toHaveLength(expectedCount);
    expect(lockKeys.every(k => k === stablePageKey)).toBe(true);
  } else {
    expect(lockKeys.length).toBeGreaterThan(0);
    expect(lockKeys[0]).toBe(stablePageKey);
  }
}
