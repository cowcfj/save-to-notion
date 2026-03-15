/**
 * messages.js 動態訊息函式煙霧測試
 * 驗證所有 arrow function message builders 回傳正確型別且嵌入參數
 */

const { UI_MESSAGES, ERROR_MESSAGES } = require('../../../scripts/config/messages');
const { ErrorHandler } = require('../../../scripts/utils/ErrorHandler.js');

describe('配置模組 - messages.js 動態函式', () => {
  const SEARCH_TERM = '測試關鍵字';
  const LOAD_COUNT = 5;
  const FOUND_COUNT = 10;
  const NO_RESULT_TERM = '搜尋詞';
  const LOAD_FAILED_REASON = '網路錯誤';
  const EXPORT_ID = 42;
  const DEBUG_LOGS_TOGGLE_FAILED_REASON = '權限不足';
  const DISCONNECT_FAILED_REASON = '逾時';
  const OPEN_NOTION_FAILED_REASON = '找不到分頁';
  const CLEAR_SUCCESS_COUNT = 3;
  const REMAINING_COUNT = 7;
  const PAGE_COUNT = 2;
  const HIGHLIGHT_COUNT = 15;
  const SYNC_SUCCESS_COUNT = 8;
  const RESTORE_SIZE = 100;
  const CLEANUP_FAILED_REASON = '磁碟已滿';
  const HEALTH_CODE = 4;
  const LEGACY_SAVED_COUNT = 12;
  const USAGE_TOO_LARGE = '50';
  const USAGE_LARGE = '30';
  const UNIFIED_CLEANUP_ITEM_COUNT = 10;
  const UNIFIED_CLEANUP_SIZE = 256;
  const CLEANUP_SUMMARY_ITEMS = ['殘留資料', '損壞項目'];
  const CLEANUP_SUMMARY_SIZE = 128;
  const HEALTH_MIGRATION_LEFTOVER_COUNT = 6;
  const HEALTH_MIGRATION_LEFTOVER_SIZE = 512;

  const singleParamFunctions = [
    { path: 'DATA_SOURCE.SEARCHING', fn: UI_MESSAGES.DATA_SOURCE.SEARCHING, arg: SEARCH_TERM },
    { path: 'DATA_SOURCE.LOAD_SUCCESS', fn: UI_MESSAGES.DATA_SOURCE.LOAD_SUCCESS, arg: LOAD_COUNT },
    { path: 'DATA_SOURCE.FOUND_COUNT', fn: UI_MESSAGES.DATA_SOURCE.FOUND_COUNT, arg: FOUND_COUNT },
    { path: 'DATA_SOURCE.NO_RESULT', fn: UI_MESSAGES.DATA_SOURCE.NO_RESULT, arg: NO_RESULT_TERM },
    {
      path: 'DATA_SOURCE.LOAD_FAILED',
      fn: UI_MESSAGES.DATA_SOURCE.LOAD_FAILED,
      arg: LOAD_FAILED_REASON,
    },
    { path: 'LOGS.EXPORT_SUCCESS', fn: UI_MESSAGES.LOGS.EXPORT_SUCCESS, arg: EXPORT_ID },
    {
      path: 'SETTINGS.DEBUG_LOGS_TOGGLE_FAILED',
      fn: UI_MESSAGES.SETTINGS.DEBUG_LOGS_TOGGLE_FAILED,
      arg: DEBUG_LOGS_TOGGLE_FAILED_REASON,
    },
    {
      path: 'SETTINGS.DISCONNECT_FAILED',
      fn: UI_MESSAGES.SETTINGS.DISCONNECT_FAILED,
      arg: DISCONNECT_FAILED_REASON,
    },
    {
      path: 'AUTH.OPEN_NOTION_FAILED',
      fn: UI_MESSAGES.AUTH.OPEN_NOTION_FAILED,
      arg: OPEN_NOTION_FAILED_REASON,
    },
    { path: 'POPUP.CLEAR_SUCCESS', fn: UI_MESSAGES.POPUP.CLEAR_SUCCESS, arg: CLEAR_SUCCESS_COUNT },
    {
      path: 'SIDEPANEL.REMAINING_COUNT',
      fn: UI_MESSAGES.SIDEPANEL.REMAINING_COUNT,
      arg: REMAINING_COUNT,
    },
    { path: 'SIDEPANEL.PAGE_COUNT', fn: UI_MESSAGES.SIDEPANEL.PAGE_COUNT, arg: PAGE_COUNT },
    {
      path: 'SIDEPANEL.HIGHLIGHT_COUNT',
      fn: UI_MESSAGES.SIDEPANEL.HIGHLIGHT_COUNT,
      arg: HIGHLIGHT_COUNT,
    },
    {
      path: 'HIGHLIGHTS.SYNC_SUCCESS_COUNT',
      fn: UI_MESSAGES.HIGHLIGHTS.SYNC_SUCCESS_COUNT,
      arg: SYNC_SUCCESS_COUNT,
    },
    { path: 'STORAGE.RESTORE_SUCCESS', fn: UI_MESSAGES.STORAGE.RESTORE_SUCCESS, arg: RESTORE_SIZE },
    {
      path: 'STORAGE.CLEANUP_FAILED',
      fn: UI_MESSAGES.STORAGE.CLEANUP_FAILED,
      arg: CLEANUP_FAILED_REASON,
    },
    {
      path: 'STORAGE.HEALTH_CORRUPTED',
      fn: UI_MESSAGES.STORAGE.HEALTH_CORRUPTED,
      arg: HEALTH_CODE,
    },
    {
      path: 'STORAGE.HEALTH_LEGACY_SAVED',
      fn: UI_MESSAGES.STORAGE.HEALTH_LEGACY_SAVED,
      arg: LEGACY_SAVED_COUNT,
    },
    {
      path: 'STORAGE.USAGE_TOO_LARGE',
      fn: UI_MESSAGES.STORAGE.USAGE_TOO_LARGE,
      arg: USAGE_TOO_LARGE,
    },
    { path: 'STORAGE.USAGE_LARGE', fn: UI_MESSAGES.STORAGE.USAGE_LARGE, arg: USAGE_LARGE },
  ];

  test.each(singleParamFunctions)('UI_MESSAGES.$path 應回傳包含參數的字串', ({ fn, arg }) => {
    const result = fn(arg);
    expect(typeof result).toBe('string');
    expect(result).toContain(String(arg));
  });

  describe('雙參數函式', () => {
    test('STORAGE.UNIFIED_CLEANUP_SUCCESS 應包含兩個參數', () => {
      const result = UI_MESSAGES.STORAGE.UNIFIED_CLEANUP_SUCCESS(
        UNIFIED_CLEANUP_ITEM_COUNT,
        UNIFIED_CLEANUP_SIZE
      );
      expect(typeof result).toBe('string');
      expect(result).toContain(String(UNIFIED_CLEANUP_ITEM_COUNT));
      expect(result).toContain(String(UNIFIED_CLEANUP_SIZE));
    });

    test('STORAGE.CLEANUP_SUMMARY 應包含清理項目與空間', () => {
      const result = UI_MESSAGES.STORAGE.CLEANUP_SUMMARY(
        CLEANUP_SUMMARY_ITEMS,
        CLEANUP_SUMMARY_SIZE
      );
      expect(typeof result).toBe('string');
      expect(result).toContain(CLEANUP_SUMMARY_ITEMS[0]);
      expect(result).toContain(String(CLEANUP_SUMMARY_SIZE));
    });

    test('STORAGE.HEALTH_MIGRATION_LEFTOVERS 應包含數量與大小', () => {
      const result = UI_MESSAGES.STORAGE.HEALTH_MIGRATION_LEFTOVERS(
        HEALTH_MIGRATION_LEFTOVER_COUNT,
        HEALTH_MIGRATION_LEFTOVER_SIZE
      );
      expect(typeof result).toBe('string');
      expect(result).toContain(String(HEALTH_MIGRATION_LEFTOVER_COUNT));
      expect(result).toContain(String(HEALTH_MIGRATION_LEFTOVER_SIZE));
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

    test('應處理空字串與零值鍵', () => {
      const emptyMapping = ERROR_MESSAGES.PATTERNS[''];
      const zeroMapping = ERROR_MESSAGES.PATTERNS[0];
      const emptyExpected = emptyMapping ?? ERROR_MESSAGES.DEFAULT;
      const zeroExpected = zeroMapping ?? ERROR_MESSAGES.DEFAULT;

      expect(ErrorHandler.formatUserMessage('')).toBe(emptyExpected);
      expect(ErrorHandler.formatUserMessage(0)).toBe(zeroExpected);
    });

    test('應處理 undefined/null 鍵', () => {
      expect(ErrorHandler.formatUserMessage(undefined)).toBe(ERROR_MESSAGES.DEFAULT);
      expect(ErrorHandler.formatUserMessage(null)).toBe(ERROR_MESSAGES.DEFAULT);
    });
  });
});
