/**
 * TabService.migration.test.js
 *
 * 專門用於測試 TabService 中注入頁面的遷移腳本 (_migrationScript)。
 *
 * Jest 30 相容性說明：
 * - 設置 jest-environment-options url 讓 JSDOM 的 location.href 對應正確域名
 * - 在各測試中直接用 localStorage.setItem/clear 操作真實 JSDOM localStorage
 * - 不使用 delete globalThis.location（會破壞 JSDOM window，導致 localStorage 失效）
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/page"}
 */

import { _migrationScript } from '../../../../scripts/background/services/TabService.js';

const BASE_URL = 'https://example.com/page';

describe('TabService Migration Script', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.history.pushState({}, 'Base', BASE_URL);

    globalThis.chrome = {
      runtime: {
        getManifest: jest.fn().mockReturnValue({ version_name: '1.0.0-prod' }),
      },
    };

    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    localStorage.clear();
    globalThis.history.pushState({}, 'Base', BASE_URL);
    jest.restoreAllMocks();
  });

  test('應該在無數據時返回 migrated: false', () => {
    const result = _migrationScript([]);
    expect(result).toEqual({ migrated: false });
  });

  test('應該能找到精確匹配的 key 並遷移數據', () => {
    const url = 'https://example.com/page';
    const key = `highlights_${url}`;
    const data = [{ text: 'test' }];
    localStorage.setItem(key, JSON.stringify(data));

    const result = _migrationScript([]);

    expect(result).toEqual({ migrated: true, data, foundKey: key });
    expect(localStorage.getItem(key)).toBeNull();
  });

  test('應該正確移除 tracking params 並匹配標準化 URL', () => {
    globalThis.history.pushState({}, 'Tracking', 'https://example.com/page?utm_source=fb&id=123');
    const key = 'highlights_https://example.com/page?id=123';
    const data = [{ text: 'tracking-test' }];
    localStorage.setItem(key, JSON.stringify(data));

    const result = _migrationScript(['utm_source']);

    expect(result).toEqual({ migrated: true, data, foundKey: key });
    expect(localStorage.getItem(key)).toBeNull();
  });

  test('應該能通過遍歷找到 highlights_ 開頭的 key (Fallback)', () => {
    const key = 'highlights_https://example.com/old-page';
    const data = [{ text: 'old-data' }];
    localStorage.setItem(key, JSON.stringify(data));

    const result = _migrationScript([]);

    expect(result).toEqual({ migrated: true, data, foundKey: key });
    expect(localStorage.getItem(key)).toBeNull();
  });

  test('當 malformed 與同源可解析 key 共存時，應優先遷移同源可解析 key', () => {
    globalThis.history.pushState({}, 'Same Origin', 'https://example.com/page');

    const malformedKey = 'highlights_not-a-valid-url%%';
    const malformedData = [{ text: 'legacy-malformed' }];
    localStorage.setItem(malformedKey, JSON.stringify(malformedData));

    const sameOriginKey = 'highlights_https://example.com/preferred';
    const sameOriginData = [{ text: 'preferred-same-origin' }];
    localStorage.setItem(sameOriginKey, JSON.stringify(sameOriginData));

    const result = _migrationScript([]);

    expect(result).toEqual({ migrated: true, data: sameOriginData, foundKey: sameOriginKey });
    expect(localStorage.getItem(sameOriginKey)).toBeNull();
    expect(localStorage.getItem(malformedKey)).toBe(JSON.stringify(malformedData));
  });

  test('後備方案不應遷移其他域名的 highlights（安全修復驗證）', () => {
    // 當前 location 是 example.com，key 屬於 other.com — 不應被遷移
    const key = 'highlights_https://other.com/page';
    const data = [{ text: 'wrong-site' }];
    localStorage.setItem(key, JSON.stringify(data));

    const result = _migrationScript([]);

    expect(result).toEqual({ migrated: false });
    expect(localStorage.getItem(key)).toBe(JSON.stringify(data));
  });

  test('後備方案應跳過非 highlights_ 開頭的 key', () => {
    localStorage.setItem('other_key', 'some-data');
    const legacyKey = 'highlights_old-page';
    const data = [{ text: 'legacy-data' }];
    localStorage.setItem(legacyKey, JSON.stringify(data));

    const result = _migrationScript([]);

    expect(result).toEqual({ migrated: true, data, foundKey: legacyKey });
    expect(localStorage.getItem(legacyKey)).toBeNull();
    // other_key 應該不被修改
    expect(localStorage.getItem('other_key')).toBe('some-data');
  });

  test('當 URL 解析失敗時 (getCurrentOrigin catch)，應安全回退到 legacy key', () => {
    const originalURL = globalThis.URL;
    globalThis.URL = jest.fn().mockImplementation(() => {
      throw new TypeError('Invalid URL');
    });

    const legacyKey = 'highlights_legacy-key';
    const data = [{ text: 'legacy-data' }];
    localStorage.setItem(legacyKey, JSON.stringify(data));

    try {
      const result = _migrationScript([]);
      expect(result).toEqual({ migrated: true, data, foundKey: legacyKey });
    } finally {
      globalThis.URL = originalURL;
    }
  });

  test('應該能處理 JSON 解析錯誤', () => {
    const key = 'highlights_https://example.com/page';
    localStorage.setItem(key, 'invalid-json');

    const result = _migrationScript([]);

    expect(result).toEqual({ migrated: false });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Parse error'),
      expect.any(Object)
    );
  });

  test('應處理 trailing slash', () => {
    globalThis.history.pushState({}, 'Slash', 'https://example.com/test/');
    localStorage.setItem('highlights_https://example.com/test', '[{"text":"hi"}]');

    const result = _migrationScript([]);

    expect(result.migrated).toBe(true);
  });

  test('應處理 normalize 拋出例外', () => {
    globalThis.history.pushState({}, 'Test', 'https://example.com/test');
    localStorage.setItem('highlights_https://example.com/test', '[{"text":"hi"}]');

    const originalURL = globalThis.URL;
    try {
      globalThis.URL = jest.fn().mockImplementation(() => {
        throw new Error('mock error');
      });

      const result = _migrationScript([]);

      expect(result.migrated).toBe(true);
    } finally {
      globalThis.URL = originalURL;
    }
  });

  test('應處理取得的 raw 資料為 falsy 的情況', () => {
    globalThis.history.pushState({}, 'Test', 'https://example.com/test');
    localStorage.setItem('highlights_https://example.com/test', '');

    const result = _migrationScript([]);

    expect(result.migrated).toBe(false);
  });

  test('應找不到 key 時返回 migrated: false', () => {
    const result = _migrationScript(['utm_source']);

    expect(result.migrated).toBe(false);
  });

  test('應成功遷移資料 (Highlights_ 開頭)', () => {
    localStorage.setItem('highlights_https://example.com/test', JSON.stringify([{ text: 'hi' }]));

    const result = _migrationScript(['utm_source']);

    expect(result.migrated).toBe(true);
    expect(result.data[0].text).toBe('hi');
    expect(localStorage.getItem('highlights_https://example.com/test')).toBeNull();
  });

  test('應成功遷移資料 (Fallback 遍歷)', () => {
    globalThis.history.pushState({}, 'Other', 'https://example.com/other');
    localStorage.setItem('highlights_some-old-key', JSON.stringify([{ text: 'hi2' }]));

    const result = _migrationScript([]);

    expect(result.migrated).toBe(true);
    expect(result.data[0].text).toBe('hi2');
  });

  test('解析錯誤應被捕捉並返回 false', () => {
    localStorage.setItem('highlights_https://example.com/test', 'invalid-json');

    const result = _migrationScript(['utm_source']);

    expect(result.migrated).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  test('異常應被捕獲並返回 false', () => {
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('simulate error');
    });

    const result = _migrationScript(['utm_source']);

    expect(result.migrated).toBe(false);
    expect(result.error).toBeDefined();
    getItemSpy.mockRestore();
  });
});
