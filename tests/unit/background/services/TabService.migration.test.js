/**
 * TabService.migration.test.js
 *
 * 專門用於測試 TabService 中注入頁面的遷移腳本 (_migrationScript)。
 * 由於該腳本是在 Content Script 環境中執行，此測試需深度模擬 DOM 和 Chrome API。
 */

import { _migrationScript } from '../../../../scripts/background/services/TabService.js';

describe('TabService Migration Script', () => {
  let mockLocalStorage;
  let mockLocation;
  let originalLocation;

  beforeEach(() => {
    // 1. Mock localStorage
    mockLocalStorage = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: jest.fn(key => mockLocalStorage[key] || null),
        removeItem: jest.fn(key => {
          delete mockLocalStorage[key];
        }),
        key: jest.fn(index => Object.keys(mockLocalStorage)[index] || null),
        get length() {
          return Object.keys(mockLocalStorage).length;
        },
      },
      writable: true,
    });

    // 2. Mock location (safely)
    originalLocation = globalThis.location;
    delete globalThis.location;
    mockLocation = { href: 'https://example.com/page', pathname: '/page', search: '' };
    globalThis.location = mockLocation;

    // 3. Mock URL (JSDOM 環境已有，但為了測試穩定性可覆寫或直接使用)
    // JSDOM 的 URL 實現通常足夠

    // 4. Mock chrome (用於 isDev 檢測)
    globalThis.chrome = {
      runtime: {
        getManifest: jest.fn().mockReturnValue({ version_name: '1.0.0-prod' }),
      },
    };

    // 5. Mock console (避免測試輸出噪音)
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore location
    globalThis.location = originalLocation;
    jest.clearAllMocks();
  });

  test('應該在無數據時返回 migrated: false', () => {
    const result = _migrationScript([]);
    expect(result).toEqual({ migrated: false });
  });

  test('應該能找到精確匹配的 key 並遷移數據', () => {
    const url = 'https://example.com/page';
    const key = `highlights_${url}`;
    const data = [{ text: 'test' }];
    mockLocalStorage[key] = JSON.stringify(data);

    const result = _migrationScript([]);

    expect(result).toEqual({ migrated: true, data, foundKey: key });
    expect(localStorage.removeItem).toHaveBeenCalledWith(key);
  });

  test('應該能處理標準化 URL 的匹配 (去除尾部斜線)', () => {
    mockLocation.href = 'https://example.com/page/';
    const normUrl = 'https://example.com/page'; // _migrationScript 內部 normalize 會去除尾部斜線
    const key = `highlights_${normUrl}`;
    const data = [{ text: 'test-norm' }];
    mockLocalStorage[key] = JSON.stringify(data);

    const result = _migrationScript([]);

    expect(result).toEqual({ migrated: true, data, foundKey: key });
  });

  test('應該能通過遍歷找到 highlights_ 開頭的 key (Fallback)', () => {
    const key = 'highlights_https://example.com/old-page';
    const data = [{ text: 'old-data' }];
    mockLocalStorage[key] = JSON.stringify(data);

    const result = _migrationScript([]);

    expect(result).toEqual({ migrated: true, data, foundKey: key });
  });

  test('應該能處理 JSON 解析錯誤', () => {
    const key = 'highlights_https://example.com/page';
    mockLocalStorage[key] = 'invalid-json';

    const result = _migrationScript([]);

    expect(result).toEqual({ migrated: false });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Parse error'),
      expect.any(Object)
    );
  });

  test('應該在開發環境下包含錯誤堆疊', () => {
    globalThis.chrome.runtime.getManifest.mockReturnValue({ version_name: '1.0.0-dev' });
    // 模擬 localStorage.getItem 拋出異常 (罕見但可能)
    jest.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Access Denied');
    });

    const result = _migrationScript([]);

    expect(result.migrated).toBe(false);
    expect(result.error.message).toBe('Access Denied');
    expect(result.error.stack).toBeDefined();
  });

  test('應該正確移除 tracking params', () => {
    mockLocation.href = 'https://example.com/page?utm_source=fb&id=123';
    // _migrationScript 應該會嘗試匹配去除參數後的 URL
    const normUrl = 'https://example.com/page?id=123';
    const key = `highlights_${normUrl}`;
    const data = [{ text: 'tracking-test' }];
    mockLocalStorage[key] = JSON.stringify(data);

    const result = _migrationScript(['utm_source']); // 傳入 trackingParams

    expect(result).toEqual({ migrated: true, data, foundKey: key });
  });
});
