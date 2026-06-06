/**
 * messages.js 動態訊息函式煙霧測試
 * 驗證所有 arrow function message builders 回傳正確型別且嵌入參數
 */

const {
  UI_MESSAGES,
  ERROR_MESSAGES,
  ERROR_TYPES,
  API_ERROR_PATTERNS,
} = require('../../../scripts/config/shared/messages.js');
const { ErrorHandler } = require('../../../scripts/utils/ErrorHandler.js');
const fs = require('node:fs');
const path = require('node:path');
const { deepFreeze } = require('../../../scripts/config/shared/deepFreeze.js');
const { BACKGROUND_MESSAGES } = require('../../../scripts/config/messages/backgroundMessages.js');

function readProjectSource(relativePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readFileSync(path.resolve(__dirname, '../../..', relativePath), 'utf8');
}

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
  const DESTINATION_NAME_SUFFIX = '1234';
  const DESTINATION_PROFILE_NAME = 'Second';
  const CLEAR_SUCCESS_COUNT = 3;
  const REMAINING_COUNT = 7;
  const PAGE_COUNT = 2;
  const HIGHLIGHT_COUNT = 15;
  const SYNC_SUCCESS_COUNT = 8;
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
  const TIMESTAMP_VALUE = '2026/04/19 20:00';
  const TIMEZONE_LABEL = 'Asia/Hong_Kong';

  describe('deepFreeze helper', () => {
    test('應遞迴凍結 object 與 function object，primitive 則原樣回傳', () => {
      function formatter() {
        return 'ok';
      }
      formatter.meta = { label: 'format' };

      const target = {
        nested: { enabled: true },
        formatter,
      };

      const result = deepFreeze(target);

      expect(result).toBe(target);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.nested)).toBe(true);
      expect(Object.isFrozen(result.formatter)).toBe(true);
      expect(Object.isFrozen(result.formatter.meta)).toBe(true);
      expect(deepFreeze('copy')).toBe('copy');
      expect(deepFreeze(null)).toBeNull();
    });
  });

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
    {
      path: 'OPTIONS.DESTINATION.DEFAULT_NAME',
      fn: UI_MESSAGES.OPTIONS.DESTINATION.DEFAULT_NAME,
      arg: DESTINATION_NAME_SUFFIX,
    },
    {
      path: 'OPTIONS.DESTINATION.APPLY_SUCCESS',
      fn: UI_MESSAGES.OPTIONS.DESTINATION.APPLY_SUCCESS,
      arg: DESTINATION_PROFILE_NAME,
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
      CLEANUP_SUMMARY_ITEMS.forEach(item => {
        expect(result).toContain(item);
      });
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

    test('CLOUD_SYNC.TIMESTAMP_WITH_TIMEZONE 應以本地化括號組合時間與時區', () => {
      const result = UI_MESSAGES.CLOUD_SYNC.TIMESTAMP_WITH_TIMEZONE(
        TIMESTAMP_VALUE,
        TIMEZONE_LABEL
      );

      expect(result).toBe(`${TIMESTAMP_VALUE}（${TIMEZONE_LABEL}）`);
    });
  });

  describe('三參數函式', () => {
    test('STORAGE.IMPORT_SUCCESS 應包含新增/覆蓋/跳過三個數字', () => {
      const newCount = 3;
      const overwriteCount = 5;
      const skipCount = 7;
      const result = UI_MESSAGES.STORAGE.IMPORT_SUCCESS(newCount, overwriteCount, skipCount);

      expect(typeof result).toBe('string');
      expect(result).toContain(String(newCount));
      expect(result).toContain(String(overwriteCount));
      expect(result).toContain(String(skipCount));
      expect(result).toContain('新增');
      expect(result).toContain('覆蓋');
      expect(result).toContain('跳過');
    });

    test('STORAGE.MIGRATION_DELETE_RESULT_SUMMARY 應包含成功/失敗/總計三個數字', () => {
      const success = 2;
      const failed = 1;
      const total = 3;
      const result = UI_MESSAGES.STORAGE.MIGRATION_DELETE_RESULT_SUMMARY(success, failed, total);

      expect(typeof result).toBe('string');
      expect(result).toContain(String(success));
      expect(result).toContain(String(failed));
      expect(result).toContain(String(total));
      expect(result).toContain('成功');
      expect(result).toContain('失敗');
      expect(result).toContain('總計');
    });
  });

  describe('靜態訊息匯出完整性', () => {
    test('UI_MESSAGES.POPUP 應包含 popup 靜態 UI 字串', () => {
      expect(UI_MESSAGES.POPUP).toEqual(
        expect.objectContaining({
          DOCUMENT_TITLE: 'Save to Notion',
          HEADING: 'Save to Notion',
          INITIAL_STATUS: '準備儲存',
          START_HIGHLIGHT: '開始標註',
          SAVE_PAGE: '儲存頁面',
          OPEN_NOTION: '開啟 Notion',
          MANAGE_HIGHLIGHTS: '管理標註',
          SETTINGS_LINK: '設定',
          DESTINATION_LABEL_PREFIX: '保存目標：',
          SIDE_PANEL_UNAVAILABLE: '側邊欄無法在此頁面開啟。',
        })
      );
    });

    test('UI_MESSAGES.OPTIONS 應包含 options 靜態 UI 字串', () => {
      expect(UI_MESSAGES.OPTIONS).toEqual(
        expect.objectContaining({
          DESTINATION: expect.objectContaining({
            SEARCH_PLACEHOLDER: '搜尋保存目標...',
            DEFAULT_NAME: expect.any(Function),
            MANUAL_ID_LABEL: '或貼上 ID',
            HELP_LINK_TEXT: '手動輸入 ID',
            ADD_BUTTON: '新增保存目標',
            CREATE_LIMIT_REACHED: '已達目的地數量上限。',
            CREATE_FAILED: '新增保存目標失敗，請稍後再試。',
            APPLY_SUCCESS: expect.any(Function),
            ACTION_FAILED: '保存目標操作失敗，請稍後再試。',
          }),
          INTERFACE: expect.objectContaining({
            ZOOM_LABEL: '介面縮放',
            ZOOM_HELP: '調整擴充功能設定頁面的顯示比例。',
          }),
          SETTINGS: expect.objectContaining({
            SAVE_BUTTON: '儲存設定',
          }),
          TEMPLATES: expect.objectContaining({
            SECTION_TITLE: '外觀樣式',
            SECTION_DESC: '自定義頁面外觀與標註樣式',
            PAGE_PROPERTIES_TITLE: '頁面屬性',
            TITLE_TEMPLATE_LABEL: '標題格式',
            TITLE_TEMPLATE_PLACEHOLDER: '{title} - {date}',
            TITLE_TEMPLATE_HELP: '可用變數：{title}, {date}, {time}, {datetime}, {url}, {domain}',
            PREVIEW_BUTTON: '預覽效果',
            ADD_SOURCE_LABEL: '在內容末尾添加來源連結',
            ADD_TIMESTAMP_LABEL: '在內容開頭添加保存時間',
            APPEARANCE_TITLE: '外觀設定',
            HIGHLIGHT_STYLE_LABEL: '標註樣式',
            HIGHLIGHT_STYLE_BACKGROUND: '背景顏色',
            HIGHLIGHT_STYLE_TEXT: '文字顏色',
            HIGHLIGHT_STYLE_UNDERLINE: '底線',
            HIGHLIGHT_STYLE_HELP: '選擇標註在網頁上的顯示方式。',
            HIGHLIGHT_CONTENT_STYLE_LABEL: 'Notion 同步樣式',
            HIGHLIGHT_CONTENT_STYLE_COLOR_SYNC: '對應顏色背景（預設）',
            HIGHLIGHT_CONTENT_STYLE_COLOR_TEXT: '對應顏色文字',
            HIGHLIGHT_CONTENT_STYLE_BOLD: '粗體',
            HIGHLIGHT_CONTENT_STYLE_NONE: '關閉',
            HIGHLIGHT_CONTENT_STYLE_HELP:
              '選擇標註文字在 Notion 頁面原文中的標示方式（首次保存時生效）。',
            SAVE_BUTTON: '儲存外觀樣式',
          }),
        })
      );
    });

    test('UI_MESSAGES.DATA_SOURCE 應使用台灣慣用搜尋文案', () => {
      expect(UI_MESSAGES.DATA_SOURCE.TRY_DIFFERENT_KEYWORD).toBe('嘗試使用不同的關鍵字搜尋');
    });

    test('ERROR_TYPES 應為凍結物件，避免 runtime mutation', () => {
      expect(Object.isFrozen(ERROR_TYPES)).toBe(true);
      expect(ERROR_TYPES).toEqual(
        expect.objectContaining({
          EXTRACTION_FAILED: 'extraction_failed',
          INTERNAL: 'internal',
        })
      );
    });

    test('ERROR_MESSAGES.PATTERNS 應包含錯誤映射', () => {
      expect(typeof ERROR_MESSAGES.PATTERNS).toBe('object');
      expect(Object.keys(ERROR_MESSAGES.PATTERNS).length).toBeGreaterThan(0);
    });

    test('ERROR_MESSAGES nested registries 應為遞迴凍結物件', () => {
      expect(Object.isFrozen(ERROR_MESSAGES.TECHNICAL)).toBe(true);
      expect(Object.isFrozen(ERROR_MESSAGES.USER_MESSAGES)).toBe(true);
      expect(Object.isFrozen(ERROR_MESSAGES.PATTERNS)).toBe(true);
      expect(Object.isFrozen(API_ERROR_PATTERNS.AUTH)).toBe(true);
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

  describe('Leaf 模組與 UI_MESSAGES facade 相容性', () => {
    const {
      HIGHLIGHTER_MESSAGES,
    } = require('../../../scripts/config/messages/highlighterMessages.js');
    const {
      DATA_SOURCE_MESSAGES,
    } = require('../../../scripts/config/messages/dataSourceMessages.js');

    test('各個 Leaf 模組應該被凍結', () => {
      expect(Object.isFrozen(BACKGROUND_MESSAGES)).toBe(true);
      expect(Object.isFrozen(BACKGROUND_MESSAGES.POPUP)).toBe(true);
      expect(Object.isFrozen(BACKGROUND_MESSAGES.HIGHLIGHTS)).toBe(true);
      expect(Object.isFrozen(BACKGROUND_MESSAGES.STORAGE)).toBe(true);
      expect(Object.isFrozen(HIGHLIGHTER_MESSAGES)).toBe(true);
      expect(Object.isFrozen(DATA_SOURCE_MESSAGES)).toBe(true);
    });

    test('UI_MESSAGES 應該被凍結', () => {
      expect(Object.isFrozen(UI_MESSAGES)).toBe(true);
      expect(Object.isFrozen(UI_MESSAGES.OPTIONS)).toBe(true);
      expect(Object.isFrozen(UI_MESSAGES.OPTIONS.DESTINATION)).toBe(true);
      expect(Object.isFrozen(UI_MESSAGES.STORAGE)).toBe(true);
      expect(Object.isFrozen(UI_MESSAGES.TOOLBAR)).toBe(true);
    });

    test('DATA_SOURCE 應該指向同一個 DATA_SOURCE_MESSAGES 物件', () => {
      expect(UI_MESSAGES.DATA_SOURCE).toBe(DATA_SOURCE_MESSAGES);
    });

    test('FLOATING_RAIL 欄位應該與 HIGHLIGHTER_MESSAGES 一致', () => {
      expect(UI_MESSAGES.FLOATING_RAIL).toEqual(HIGHLIGHTER_MESSAGES.FLOATING_RAIL);
    });

    test('TOAST 欄位應該與 HIGHLIGHTER_MESSAGES 一致', () => {
      expect(UI_MESSAGES.TOAST).toEqual(HIGHLIGHTER_MESSAGES.TOAST);
    });

    test('BACKGROUND POPUP 欄位應該完全一致', () => {
      expect(UI_MESSAGES.POPUP.DELETION_PENDING).toBe(BACKGROUND_MESSAGES.POPUP.DELETION_PENDING);
      expect(UI_MESSAGES.POPUP.DELETED_PAGE).toBe(BACKGROUND_MESSAGES.POPUP.DELETED_PAGE);
    });

    test('HIGHLIGHTS 欄位應該與 BACKGROUND_MESSAGES 一致', () => {
      expect(UI_MESSAGES.HIGHLIGHTS).toBe(BACKGROUND_MESSAGES.HIGHLIGHTS);
    });

    test('BACKGROUND STORAGE 欄位應該完全一致', () => {
      expect(UI_MESSAGES.STORAGE.MIGRATION_BATCH_DELETE_SUCCESS(5)).toBe(
        BACKGROUND_MESSAGES.STORAGE.MIGRATION_BATCH_DELETE_SUCCESS(5)
      );
      expect(UI_MESSAGES.STORAGE.MIGRATION_BATCH_DELETE_PARTIAL(5, 2)).toBe(
        BACKGROUND_MESSAGES.STORAGE.MIGRATION_BATCH_DELETE_PARTIAL(5, 2)
      );
    });

    test('highlighter toolbar 訊息應與 UI_MESSAGES.TOOLBAR 一致', () => {
      expect(UI_MESSAGES.TOOLBAR.SYNCING).toBe(HIGHLIGHTER_MESSAGES.TOOLBAR.SYNCING);
      expect(UI_MESSAGES.TOOLBAR.SYNC_SUCCESS).toBe(HIGHLIGHTER_MESSAGES.TOOLBAR.SYNC_SUCCESS);
      expect(UI_MESSAGES.TOOLBAR.SYNC_FAILED).toBe(HIGHLIGHTER_MESSAGES.TOOLBAR.SYNC_FAILED);
      expect(UI_MESSAGES.TOOLBAR.PAGE_NOT_SAVED_HINT).toBe(
        HIGHLIGHTER_MESSAGES.TOOLBAR.PAGE_NOT_SAVED_HINT
      );
    });

    test('門面 re-exports 的 error registry 欄位應與 errorMessages.js 完全一致', () => {
      const errorMessagesModule = require('../../../scripts/config/messages/errorMessages.js');
      const facadeModule = require('../../../scripts/config/shared/messages.js');

      expect(facadeModule.LOG_LEVELS).toBe(errorMessagesModule.LOG_LEVELS);
      expect(facadeModule.ERROR_TYPES).toBe(errorMessagesModule.ERROR_TYPES);
      expect(facadeModule.SECURITY_ERROR_MESSAGES).toBe(
        errorMessagesModule.SECURITY_ERROR_MESSAGES
      );
      expect(facadeModule.API_ERROR_PATTERNS).toBe(errorMessagesModule.API_ERROR_PATTERNS);
      expect(facadeModule.HIGHLIGHT_ERROR_CODES).toBe(errorMessagesModule.HIGHLIGHT_ERROR_CODES);
      expect(facadeModule.ERROR_MESSAGES).toBe(errorMessagesModule.ERROR_MESSAGES);
    });

    test('生產程式碼不應引用舊的訊息葉路徑', () => {
      const fs = require('node:fs');
      const projectRoot = path.resolve(__dirname, '../../..');
      const scriptsDir = path.join(projectRoot, 'scripts');

      function scanDir(dir) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const files = fs.readdirSync(dir);
        let results = [];
        for (const file of files) {
          const fullPath = path.join(dir, file);
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            results = results.concat(scanDir(fullPath));
          } else if (file.endsWith('.js')) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const jsFiles = scanDir(scriptsDir);
      const oldPathsRegex =
        /config\/(?:shared\/(?:errorMessages|backgroundMessages|dataSourceMessages)|runtimeActions\/errorMessages|contentSafe\/(?:contentExtractionMessages|highlighterMessages|toolbarMessages))\.js/;

      const violations = [];
      for (const file of jsFiles) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const content = fs.readFileSync(file, 'utf8');
        if (oldPathsRegex.test(content)) {
          violations.push(path.relative(projectRoot, file));
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('Inline 解耦字串不變量 (Invariant) 保護', () => {
    test('UI_MESSAGES.OPTIONS.DESTINATION.DEFAULT_PROFILE_NAME 應為 預設', () => {
      expect(UI_MESSAGES.OPTIONS.DESTINATION.DEFAULT_PROFILE_NAME).toBe('預設');
    });

    test('UI_MESSAGES.OPTIONS.DESTINATION.CREATE_LIMIT_REACHED 應為 已達目的地數量上限。', () => {
      expect(UI_MESSAGES.OPTIONS.DESTINATION.CREATE_LIMIT_REACHED).toBe('已達目的地數量上限。');
    });

    test('UI_MESSAGES.OPTIONS.DESTINATION 應 re-use BACKGROUND_MESSAGES destination profile leaf', () => {
      expect(UI_MESSAGES.OPTIONS.DESTINATION.DEFAULT_PROFILE_NAME).toBe(
        BACKGROUND_MESSAGES.DESTINATION_PROFILE.DEFAULT_PROFILE_NAME
      );
      expect(UI_MESSAGES.OPTIONS.DESTINATION.CREATE_LIMIT_REACHED).toBe(
        BACKGROUND_MESSAGES.DESTINATION_PROFILE.CREATE_LIMIT_REACHED
      );
    });

    test('UI_MESSAGES.CLOUD_SYNC.TRANSIENT_AUTH_ERROR 應為 臨時登入失效，請重新登入 Google 帳號或刷新 token 後再試。', () => {
      expect(UI_MESSAGES.CLOUD_SYNC.TRANSIENT_AUTH_ERROR).toBe(
        '臨時登入失效，請重新登入 Google 帳號或刷新 token 後再試。'
      );
    });

    test('UI_MESSAGES.CLOUD_SYNC 應 re-use BACKGROUND_MESSAGES drive sync leaf', () => {
      expect(UI_MESSAGES.CLOUD_SYNC.TRANSIENT_AUTH_ERROR).toBe(
        BACKGROUND_MESSAGES.DRIVE_SYNC.TRANSIENT_AUTH_ERROR
      );
    });

    test('UI_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED 應為 無法開啟登入頁面，請稍後再試', () => {
      expect(UI_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED).toBe('無法開啟登入頁面，請稍後再試');
    });

    test('UI_MESSAGES.ACCOUNT 應 re-use BACKGROUND_MESSAGES account leaf', () => {
      expect(UI_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED).toBe(
        BACKGROUND_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED
      );
    });

    test.each([
      {
        path: 'scripts/auth/accountLoginInitiator.js',
        message: BACKGROUND_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED,
        reference: 'BACKGROUND_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED',
      },
      {
        path: 'scripts/auth/driveClient.js',
        message: BACKGROUND_MESSAGES.DRIVE_SYNC.TRANSIENT_AUTH_ERROR,
        reference: 'BACKGROUND_MESSAGES.DRIVE_SYNC.TRANSIENT_AUTH_ERROR',
      },
      {
        path: 'scripts/destinations/ProfileStore.js',
        message: BACKGROUND_MESSAGES.DESTINATION_PROFILE.DEFAULT_PROFILE_NAME,
        reference: 'BACKGROUND_MESSAGES.DESTINATION_PROFILE.DEFAULT_PROFILE_NAME',
      },
      {
        path: 'scripts/destinations/ProfileStore.js',
        message: BACKGROUND_MESSAGES.DESTINATION_PROFILE.CREATE_LIMIT_REACHED,
        reference: 'BACKGROUND_MESSAGES.DESTINATION_PROFILE.CREATE_LIMIT_REACHED',
      },
    ])(
      '$path 應引用 bundle-safe message leaf 而不是直接內嵌 "$message"',
      ({ path: filePath, message, reference }) => {
        const source = readProjectSource(filePath);
        expect(source).toContain(reference);
        expect(source).not.toContain(`'${message}'`);
      }
    );
  });
});
