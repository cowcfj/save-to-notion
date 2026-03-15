/**
 * messages.js 動態訊息函式煙霧測試
 * 驗證所有 arrow function message builders 回傳正確型別且嵌入參數
 */

const { UI_MESSAGES, ERROR_MESSAGES } = require('../../../scripts/config/messages');

describe('配置模組 - messages.js 動態函式', () => {
  const singleParamFunctions = [
    { path: 'DATA_SOURCE.SEARCHING', fn: UI_MESSAGES.DATA_SOURCE.SEARCHING, arg: '測試關鍵字' },
    { path: 'DATA_SOURCE.LOAD_SUCCESS', fn: UI_MESSAGES.DATA_SOURCE.LOAD_SUCCESS, arg: 5 },
    { path: 'DATA_SOURCE.FOUND_COUNT', fn: UI_MESSAGES.DATA_SOURCE.FOUND_COUNT, arg: 10 },
    { path: 'DATA_SOURCE.NO_RESULT', fn: UI_MESSAGES.DATA_SOURCE.NO_RESULT, arg: '搜尋詞' },
    { path: 'DATA_SOURCE.LOAD_FAILED', fn: UI_MESSAGES.DATA_SOURCE.LOAD_FAILED, arg: '網路錯誤' },
    { path: 'LOGS.EXPORT_SUCCESS', fn: UI_MESSAGES.LOGS.EXPORT_SUCCESS, arg: 42 },
    {
      path: 'SETTINGS.DEBUG_LOGS_TOGGLE_FAILED',
      fn: UI_MESSAGES.SETTINGS.DEBUG_LOGS_TOGGLE_FAILED,
      arg: '權限不足',
    },
    { path: 'SETTINGS.DISCONNECT_FAILED', fn: UI_MESSAGES.SETTINGS.DISCONNECT_FAILED, arg: '逾時' },
    { path: 'AUTH.OPEN_NOTION_FAILED', fn: UI_MESSAGES.AUTH.OPEN_NOTION_FAILED, arg: '找不到分頁' },
    { path: 'POPUP.CLEAR_SUCCESS', fn: UI_MESSAGES.POPUP.CLEAR_SUCCESS, arg: 3 },
    { path: 'SIDEPANEL.REMAINING_COUNT', fn: UI_MESSAGES.SIDEPANEL.REMAINING_COUNT, arg: 7 },
    { path: 'SIDEPANEL.PAGE_COUNT', fn: UI_MESSAGES.SIDEPANEL.PAGE_COUNT, arg: 2 },
    { path: 'SIDEPANEL.HIGHLIGHT_COUNT', fn: UI_MESSAGES.SIDEPANEL.HIGHLIGHT_COUNT, arg: 15 },
    {
      path: 'HIGHLIGHTS.SYNC_SUCCESS_COUNT',
      fn: UI_MESSAGES.HIGHLIGHTS.SYNC_SUCCESS_COUNT,
      arg: 8,
    },
    { path: 'STORAGE.RESTORE_SUCCESS', fn: UI_MESSAGES.STORAGE.RESTORE_SUCCESS, arg: 100 },
    { path: 'STORAGE.CLEANUP_FAILED', fn: UI_MESSAGES.STORAGE.CLEANUP_FAILED, arg: '磁碟已滿' },
    { path: 'STORAGE.HEALTH_CORRUPTED', fn: UI_MESSAGES.STORAGE.HEALTH_CORRUPTED, arg: 4 },
    { path: 'STORAGE.HEALTH_LEGACY_SAVED', fn: UI_MESSAGES.STORAGE.HEALTH_LEGACY_SAVED, arg: 12 },
    { path: 'STORAGE.USAGE_TOO_LARGE', fn: UI_MESSAGES.STORAGE.USAGE_TOO_LARGE, arg: '50' },
    { path: 'STORAGE.USAGE_LARGE', fn: UI_MESSAGES.STORAGE.USAGE_LARGE, arg: '30' },
  ];

  test.each(singleParamFunctions)('UI_MESSAGES.$path 應回傳包含參數的字串', ({ fn, arg }) => {
    const result = fn(arg);
    expect(typeof result).toBe('string');
    expect(result).toContain(String(arg));
  });

  describe('雙參數函式', () => {
    test('STORAGE.UNIFIED_CLEANUP_SUCCESS 應包含兩個參數', () => {
      const result = UI_MESSAGES.STORAGE.UNIFIED_CLEANUP_SUCCESS(10, 256);
      expect(typeof result).toBe('string');
      expect(result).toContain('10');
      expect(result).toContain('256');
    });

    test('STORAGE.CLEANUP_SUMMARY 應包含清理項目與空間', () => {
      const result = UI_MESSAGES.STORAGE.CLEANUP_SUMMARY(['殘留資料', '損壞項目'], 128);
      expect(typeof result).toBe('string');
      expect(result).toContain('殘留資料');
      expect(result).toContain('128');
    });

    test('STORAGE.HEALTH_MIGRATION_LEFTOVERS 應包含數量與大小', () => {
      const result = UI_MESSAGES.STORAGE.HEALTH_MIGRATION_LEFTOVERS(6, 512);
      expect(typeof result).toBe('string');
      expect(result).toContain('6');
      expect(result).toContain('512');
    });
  });

  describe('靜態訊息匯出完整性', () => {
    test('ERROR_MESSAGES.PATTERNS 應包含錯誤映射', () => {
      expect(typeof ERROR_MESSAGES.PATTERNS).toBe('object');
      expect(Object.keys(ERROR_MESSAGES.PATTERNS).length).toBeGreaterThan(0);
    });

    test('ERROR_MESSAGES.DEFAULT 應為字串', () => {
      expect(typeof ERROR_MESSAGES.DEFAULT).toBe('string');
    });
  });
});
