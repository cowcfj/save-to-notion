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
});
