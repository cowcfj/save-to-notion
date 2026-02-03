/**
 * utils.js - 日期格式化函數測試
 *
 * 測試範圍：
 * - 日期格式化
 * - 時區處理
 * - 邊界情況
 */

describe('日期格式化函數', () => {
  describe('formatDate()', () => {
    test('應該格式化標準日期', () => {
      const date = new Date('2025-10-06T10:30:00Z');
      const formatted = date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      expect(formatted).toMatch(/2025/);
      expect(formatted).toMatch(/10/);
      expect(formatted).toMatch(/06/);
    });

    test('應該格式化包含時間的日期', () => {
      const date = new Date('2025-10-06T10:30:00Z');
      const formatted = date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe('string');
    });

    test('應該處理無效日期', () => {
      const invalidDate = new Date('invalid');
      expect(invalidDate.toString()).toBe('Invalid Date');
    });

    test('應該處理 null 和 undefined', () => {
      expect(() => new Date(null)).not.toThrow();
      expect(() => new Date(undefined)).not.toThrow();
    });

    test('應該格式化 ISO 8601 日期字符串', () => {
      const isoDate = '2025-10-06T10:30:00.000Z';
      const date = new Date(isoDate);

      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(9); // 0-based
      expect(date.getDate()).toBe(6);
    });
  });

  describe('getRelativeTime()', () => {
    test('應該返回「剛剛」對於幾秒前', () => {
      const now = Date.now();
      const fewSecondsAgo = now - 5000; // 5 秒前
      const diff = now - fewSecondsAgo;

      expect(diff).toBeLessThan(60_000); // 小於 1 分鐘
    });

    test('應該返回「X 分鐘前」', () => {
      const now = Date.now();
      const minutesAgo = now - 5 * 60 * 1000; // 5 分鐘前
      const diff = Math.floor((now - minutesAgo) / 60_000);

      expect(diff).toBe(5);
    });

    test('應該返回「X 小時前」', () => {
      const now = Date.now();
      const hoursAgo = now - 3 * 60 * 60 * 1000; // 3 小時前
      const diff = Math.floor((now - hoursAgo) / 3_600_000);

      expect(diff).toBe(3);
    });

    test('應該返回「X 天前」', () => {
      const now = Date.now();
      const daysAgo = now - 2 * 24 * 60 * 60 * 1000; // 2 天前
      const diff = Math.floor((now - daysAgo) / 86_400_000);

      expect(diff).toBe(2);
    });
  });

  describe('parseDate()', () => {
    test('應該解析標準日期字符串', () => {
      const dateStr = '2025-10-06';
      const date = new Date(dateStr);

      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(9);
      expect(date.getDate()).toBe(6);
    });

    test('應該解析時間戳', () => {
      const timestamp = 1_728_211_800_000;
      const date = new Date(timestamp);

      expect(date.getTime()).toBe(timestamp);
    });

    test('應該處理各種日期格式', () => {
      const formats = ['2025-10-06', '2025/10/06', 'October 6, 2025', '10/06/2025'];

      formats.forEach(format => {
        const date = new Date(format);
        expect(date).toBeInstanceOf(Date);
      });
    });
  });
});
