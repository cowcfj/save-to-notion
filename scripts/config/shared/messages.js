/**
 * Shared messaging 配置
 */

import { DATA_SOURCE_MESSAGES } from '../messages/dataSourceMessages.js';
import { HIGHLIGHTER_MESSAGES } from '../messages/highlighterMessages.js';
import { BACKGROUND_MESSAGES } from '../messages/backgroundMessages.js';
import { deepFreeze } from './deepFreeze.js';

const AUTH = {
  STATUS_CONNECTED: '已連接到 Notion',
  STATUS_DISCONNECTED: '未連接到 Notion',

  ACTION_CONNECT: '連接到 Notion',
  ACTION_RECONNECT: '重新設置',
  OAUTH_ACTION_CONNECT: '以 OAuth 連接 Notion',
  OAUTH_CONNECTING: '連接中...',
  OAUTH_UNAVAILABLE: '目前環境不支援 OAuth（缺少 identity 權限或擴充功能版本不完整）',
  MISSING_ENV_CONFIG:
    'OAuth 功能未啟用，請在應用程式設定中配置 OAuth client ID，或依 README 完成設定流程',

  NOTIFY_SUCCESS: 'Notion 連接成功！',
  NOTIFY_ERROR: 'Notion 連接失敗，請重試。',
  OAUTH_TARGET_REQUIRED: '已連接 Notion，下一步請選擇保存目標並按儲存。',
  OAUTH_SERVER_MISCONFIGURATION: 'OAuth 伺服器設定異常，請稍後再試或聯絡開發者',
  OAUTH_INVALID_REDIRECT_URI: 'OAuth redirect URI 設定不符，請確認伺服器與 Notion 整合設定',
  OAUTH_USER_CANCELLED: '您取消了 Notion 授權，請重試',
  OAUTH_REDIRECT_URI_FORMAT_MISMATCH:
    'Notion 授權碼生成失敗，可能是 redirect_uri 格式不符。請確認 Notion Integration 中登記的 URI 與擴充功能 URL 完全一致（注意尾部斜線）',
  OAUTH_CALLBACK_ERROR_GENERIC: oauthError =>
    `Notion 授權失敗 (${oauthError})，請確認 Integration 設定正確`,

  OPENING_NOTION: '正在打開 Notion...',
  OPEN_NOTION_FAILED: error => `打開 Notion 頁面失敗: ${error}`,
};

const SETUP = {
  MISSING_CONFIG: '請先完成設定頁面的配置',
};

const SETTINGS = {
  SAVE_SUCCESS: '設置已成功保存！',
  SAVE_FAILED: '保存失敗，請查看控制台日誌或稍後再試。',
  KEY_INPUT_REQUIRED: '請輸入 API Key',
  INVALID_ID: '保存目標 ID 格式無效。請輸入有效的 32 字符 ID 或完整的 Notion URL',
  DEBUG_LOGS_ENABLED: '已啟用偵測日誌（前端日誌將轉送到背景頁）',
  DEBUG_LOGS_DISABLED: '已停用偵測日誌',
  DEBUG_LOGS_TOGGLE_FAILED: error => `切換日誌模式失敗: ${error}`,
  DISCONNECT_SUCCESS: '已成功斷開與 Notion 的連接。',
  DISCONNECT_FAILED: error => `斷開連接失敗: ${error}`,
  API_KEY_FORMAT_ERROR: 'API Key 格式不正確，長度太短',
  TEST_API_LABEL: '測試 API Key',
  TESTING_LABEL: '測試中...',
};

const DATA_SOURCE = DATA_SOURCE_MESSAGES;

const OPTIONS = {
  DESTINATION: {
    SECTION_TITLE: '保存目標',
    PROFILE_NAME_LABEL: '保存目標名稱（選填）',
    PROFILE_NAME_PLACEHOLDER: '例如：Inbox、Research、讀書筆記',
    SELECT_FROM_NOTION_LABEL: '從 Notion 選擇',
    SEARCH_PLACEHOLDER: DATA_SOURCE.SEARCH_PLACEHOLDER,
    SELECTOR_TOGGLE_ARIA_LABEL: '切換資料來源選單',
    REFRESH_TITLE: '重新整理',
    LOADING_INLINE: '載入中...',
    FALLBACK_OPTION: '選擇資料來源...',
    DEFAULT_PROFILE_NAME: BACKGROUND_MESSAGES.DESTINATION_PROFILE.DEFAULT_PROFILE_NAME,
    DEFAULT_NAME: suffix => `保存目標 ${suffix}`,
    PROFILE_NAME_REQUIRED: '保存目標名稱不可為空白。',
    PROFILE_NAME_ARIA_LABEL: '保存目標名稱',
    ACTION_SAVE_NAME: '儲存',
    ACTION_CANCEL_NAME: '取消',
    ACTION_RENAME: '重新命名',
    ACTION_APPLY: '套用',
    ACTION_DELETE: '刪除',
    LIMIT_ACCOUNT_SIGN_IN: '登入帳號後可建立第二個保存目標。',
    LIMIT_PAID_PLAN: '更多保存目標會在付費方案開放。',
    MANUAL_ID_LABEL: '或貼上 ID',
    MANUAL_ID_PLACEHOLDER: '輸入 Page ID 或 Database ID',
    HELP_PREFIX: '找不到目標時，可在「或貼上 ID」欄位輸入 Page ID 或 Database ID；需要協助可參考',
    HELP_LINK_TEXT: '手動輸入 ID',
    HELP_SUFFIX: '。',
    ADD_BUTTON: '新增保存目標',
    CREATE_LIMIT_REACHED: BACKGROUND_MESSAGES.DESTINATION_PROFILE.CREATE_LIMIT_REACHED,
    CREATE_FAILED: '新增保存目標失敗，請稍後再試。',
    APPLY_SUCCESS: profileName => `已套用 ${profileName} 到編輯欄位`,
    ACTION_FAILED: '保存目標操作失敗，請稍後再試。',
  },
  INTERFACE: {
    SECTION_TITLE: '介面設定',
    ZOOM_LABEL: '介面縮放',
    ZOOM_MEDIUM_OPTION: '中 (100%) - 預設',
    ZOOM_LARGE_OPTION: '大 (110%)',
    ZOOM_HELP: '調整擴充功能設定頁面的顯示比例。',
    FLOATING_RAIL_LABEL: '顯示快捷工具列',
    FLOATING_RAIL_HELP: '關閉後不會自動顯示右側小按鈕，但仍可透過彈出視窗開始標註。',
    FLOATING_RAIL_POSITION_LABEL: '懸浮按鈕位置',
    FLOATING_RAIL_POSITION_TOP_OPTION: '右偏上',
    FLOATING_RAIL_POSITION_MIDDLE_OPTION: '右中',
    FLOATING_RAIL_POSITION_BOTTOM_OPTION: '右偏下',
    FLOATING_RAIL_SIZE_LABEL: '懸浮按鈕大小',
    FLOATING_RAIL_SIZE_LARGE_OPTION: '大',
    FLOATING_RAIL_SIZE_SMALL_OPTION: '小',
  },
  SETTINGS: {
    SAVE_BUTTON: '儲存設定',
  },
  ABOUT: {
    SECTION_TITLE: '關於作者',
    PROFILE_TITLE: '個人介紹',
    LINKS_TITLE: '連結',
    OPEN_SOURCE_LABEL: '開源專案',
    SOCIAL_LABEL: '個人社群',
    SUPPORT_TITLE: '支持作者',
    SUPPORT_DESC: '如果這個擴充功能對你有幫助，歡迎透過以下方式支持持續開發：',
  },
  TEMPLATES: {
    SECTION_TITLE: '外觀樣式',
    SECTION_DESC: '自定義頁面外觀與標註樣式',
    PAGE_PROPERTIES_TITLE: '頁面屬性',
    TITLE_TEMPLATE_LABEL: '標題格式',
    TITLE_TEMPLATE_PLACEHOLDER: '{title} - {date}',
    TITLE_TEMPLATE_HELP: '可用變數：{title}, {date}, {time}, {datetime}, {url}, {domain}',
    PREVIEW_BUTTON: '預覽效果',
    PREVIEW_RESULT_LABEL: '預覽結果：',
    PREVIEW_SAMPLE_TITLE: '範例網頁標題 - Notion Clipper',
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
    HIGHLIGHT_CONTENT_STYLE_HELP: '選擇標註文字在 Notion 頁面原文中的標示方式（首次保存時生效）。',
    SAVE_BUTTON: '儲存外觀樣式',
  },
  GUIDE: {
    SECTION_TITLE: '使用指南',
    SECTION_DESC: '了解如何最有效地使用 Notion Smart Clipper',
    QUICK_START_TITLE: '快速開始',
    QUICK_START_STEP_1_TITLE: '1. 連接到 Notion',
    QUICK_START_STEP_1_DESC:
      '在「一般設定」點擊「以 OAuth 連接 Notion」授權，或選擇手動配置輸入 API Key。',
    QUICK_START_STEP_2_TITLE: '2. 預備資料庫',
    QUICK_START_STEP_2_DESC: '確保您的 Notion 中已有資料庫，且該資料庫已授權給本擴展存取。',
    QUICK_START_STEP_3_TITLE: '3. 開始剪藏',
    QUICK_START_STEP_3_DESC: '在任意網頁點擊擴展圖標，選擇目標資料庫後即可一鍵保存！',
    FEATURES_TITLE: '核心功能',
    FEATURES_ONE_CLICK_TITLE: '一鍵保存',
    FEATURES_ONE_CLICK_DESC: '智能提取文章內容、圖片與 icon',
    FEATURES_MULTI_COLOR_TITLE: '多色標註',
    FEATURES_MULTI_COLOR_DESC: '支持 4 種顏色與 3 種樣式(背景/文字/底線)',
    FEATURES_SHORTCUT_TITLE: '快捷鍵支援',
    FEATURES_SHORTCUT_DESC_PREFIX: '按 ',
    FEATURES_SHORTCUT_CTRL_KEY: 'Ctrl+S',
    FEATURES_SHORTCUT_DESC_MIDDLE: ' (Mac: ',
    FEATURES_SHORTCUT_CMD_KEY: 'Cmd+S',
    FEATURES_SHORTCUT_DESC_SUFFIX: ') 快速開啟標註工具',
    FEATURES_TEMPLATE_TITLE: '自定義模板',
    FEATURES_TEMPLATE_DESC: '支持 {title}, {date} 等變數',
    FEATURES_SYNC_TITLE: '狀態同步',
    FEATURES_SYNC_DESC: '圖標徽章即時顯示保存狀態',
    FEATURES_SIDEBAR_TITLE: '側邊欄管理標註',
    FEATURES_SIDEBAR_DESC: '在右側邊欄集中查看、管理與刪除所有標註',
    FAQ_TITLE: '常見問題',
    FAQ_VIEW_FULL_GUIDE: '查看完整指南',
    FAQ_TOKEN_QUESTION: 'API Key 無法連接?',
    FAQ_TOKEN_ANSWER_PREFIX: '請確認 Token 格式正確(以 ',
    FAQ_TOKEN_ANSWER_CODE: 'secret_',
    FAQ_TOKEN_ANSWER_SUFFIX: ' 開頭),並確保網路連接正常。',
    FAQ_DATABASE_QUESTION: '數據庫列表為空?',
    FAQ_DATABASE_ANSWER:
      '請在 Notion 頁面右上角的三點菜單中，找到 "Connections" 並添加您的 Integration。',
    FAQ_HIGHLIGHT_QUESTION: '標註沒有顯示?',
    FAQ_HIGHLIGHT_ANSWER: '請嘗試刷新頁面。此功能需要 Chrome 105+ 支持。',
    CTA_READ_FULL_GUIDE: '閱讀完整用戶指南與 FAQ',
  },
};

const STORAGE = {
  BACKUP_START: '正在備份數據...',
  BACKUP_SUCCESS: '數據備份成功！備份文件已下載。',
  BACKUP_FAILED: '備份失敗：',
  IMPORT_START: '正在匯入數據...',
  IMPORT_FAILED: '匯入失敗：',
  INVALID_BACKUP_FORMAT: '無效的備份文件格式',

  IMPORT_SELECT_MODE: '請選擇匯入模式：',
  IMPORT_MODE_HINT:
    '「新增 + 覆蓋衝突」會合併備份，並以備份資料覆蓋衝突項；「僅匯入新資料」最安全，不會改動任何現有標註；「全部覆蓋」會清除所有現有資料。',
  IMPORT_MODE_OVERWRITE_ALL: '全部覆蓋',
  IMPORT_MODE_NEW_ONLY: '僅匯入新資料',
  IMPORT_MODE_NEW_AND_OVERWRITE: '新增 + 覆蓋衝突',
  IMPORT_CANCEL: '取消',
  IMPORT_CANCELED: '已取消匯入。',
  IMPORT_SUCCESS: (newCount, overwriteCount, skipCount) =>
    `匯入完成！新增 ${newCount} 項、覆蓋 ${overwriteCount} 項、跳過 ${skipCount} 項相同資料。正在重新整理...`,
  IMPORT_NOTHING_TO_DO: '備份與本地資料一致，無需匯入。',
  IMPORT_NEW_ONLY_ALL_CONFLICTS: skipCount =>
    `僅新增模式下無新項可匯入，已跳過 ${skipCount} 項衝突。`,

  CLEANUP_EXECUTING: '正在執行數據優化...',
  UNIFIED_CLEANUP_SUCCESS: (keys, size) =>
    `數據優化完成！已清理 ${keys} 個項目，釋放 ${size} KB 空間`,
  CLEANUP_SUMMARY: (parts, spaceKB) => `可清理：${parts.join('、')}，預計釋放 ${spaceKB} KB`,
  NO_CLEANUP_NEEDED: '無可清理項目',
  CLEANUP_FAILED: errorMsg => `清理失敗：${errorMsg}`,

  MIGRATION_DELETE_PARTIAL_COMPLETE: '部分刪除完成',
  MIGRATION_DELETE_FAILED: '刪除失敗',
  MIGRATION_BATCH_DELETE_SUCCESS: BACKGROUND_MESSAGES.STORAGE.MIGRATION_BATCH_DELETE_SUCCESS,
  MIGRATION_BATCH_DELETE_PARTIAL: BACKGROUND_MESSAGES.STORAGE.MIGRATION_BATCH_DELETE_PARTIAL,
  MIGRATION_DELETE_RESULT_SUMMARY: (success, failed, total) =>
    `成功: ${success}, 失敗: ${failed}, 總計: ${total}`,

  HEALTH_CORRUPTED: count => `發現 ${count} 個損壞的數據項`,
  HEALTH_MIGRATION_LEFTOVERS: (count, size) => `${count} 個舊版格式升級殘留（${size} KB）`,
  HEALTH_LEGACY_SAVED: count => `${count} 個舊版網頁保存紀錄（重訪相關網頁時會自動升級）`,
  HEALTH_OK: '數據完整',
  HEALTH_NEEDS_CLEANUP: '發現可清理項目，建議執行清理以維持最佳狀態',

  USAGE_TOO_LARGE: size => `數據量過大 (${size} MB)，可能影響擴展性能，建議立即清理`,
  USAGE_LARGE: size => `數據量較大 (${size} MB)，建議清理不需要的標記數據以維持最佳性能`,
};

const POPUP = {
  DOCUMENT_TITLE: 'Save to Notion',
  HEADING: 'Save to Notion',
  INITIAL_STATUS: '準備儲存',
  SAVE_PAGE: '儲存頁面',
  OPEN_NOTION: '開啟 Notion',
  MANAGE_HIGHLIGHTS: '管理標註',
  SETTINGS_LINK: '設定',
  DESTINATION_LABEL_PREFIX: '保存目標：',
  SAVING: '儲存中...',
  SAVE_FAILED_PREFIX: '儲存失敗：',
  HIGHLIGHT_STARTING: '載入標註模式...',
  HIGHLIGHT_ACTIVATED: '標註模式已啟動！',
  HIGHLIGHT_FAILED: '啟動標註模式失敗。',
  OPEN_NOTION_FAILED: '開啟 Notion 頁面失敗。',
  CLEAR_CONFIRM: '確定要清除頁面上的所有標註嗎？這個操作無法復原。',
  CLEARING: '正在清除標註...',
  CLEAR_FAILED: '清除標註失敗。',
  CLEAR_SUCCESS: count => `已成功清除 ${count} 條標註！`,
  HIGHLIGHT_FAILED_PREFIX: '啟動標註失敗：',
  PAGE_READY: '頁面已儲存，可開始標註。',
  START_HIGHLIGHT: '開始標註',
  DELETED_PAGE: BACKGROUND_MESSAGES.POPUP.DELETED_PAGE,
  DELETION_PENDING: BACKGROUND_MESSAGES.POPUP.DELETION_PENDING,
  SAVE_SUCCESS: '儲存成功！',
  RECREATED: '重建成功 (原頁面已刪除)',
  HIGHLIGHTS_UPDATED: '標註已更新',
  UPDATED: '更新成功',
  CREATED: '建立成功',
  SIDE_PANEL_UNAVAILABLE: '側邊欄無法在此頁面開啟。',
};

const SIDEPANEL = {
  NOT_SUPPORTED: '不支援此頁面',
  LOAD_FAILED: '載入標註失敗',
  SYNCING: '同步中...',
  SYNC_SUCCESS: '同步成功',
  SYNC_FAILED: '同步失敗',
  OPENING: '開啟中...',
  OPEN_SUCCESS: '開啟成功',
  OPEN_FAILED: '開啟失敗',
  ALL_SYNCED: '已全部同步',
  NO_HIGHLIGHTS: '此網頁尚無標註',
  NO_HIGHLIGHTS_SUBTITLE: '選取文字即可開始標註',
  PAGE_NOT_SAVED: '此頁尚未保存至 Notion',
  REMAINING_COUNT: count => `還有 ${count} 筆`,
  PAGE_COUNT: count => `${count} 個頁面`,
  HIGHLIGHT_COUNT: count => `${count} 個標註`,
};

const HIGHLIGHTS = BACKGROUND_MESSAGES.HIGHLIGHTS;

const TOOLBAR = {
  SYNCING: '正在同步...',
  SYNC_SUCCESS: '同步成功',
  SYNC_FAILED: '同步失敗',
  SYNC_FAILED_PREFIX: '同步失敗：',
  PAGE_NOT_SAVED_HINT: '請先保存頁面到 Notion',
  ...HIGHLIGHTER_MESSAGES.TOOLBAR,
};

const FLOATING_RAIL = HIGHLIGHTER_MESSAGES.FLOATING_RAIL;

const TOAST = HIGHLIGHTER_MESSAGES.TOAST;

const CLOUD_SYNC_DOWNLOAD_CONFIRM_DESCRIPTION =
  '從 Google Drive 還原資料會把雲端版本合併到本機，雲端有的項目會新增或覆蓋，本機獨有項目會保留。';
const CLOUD_SYNC_DOWNLOAD_CONFIRM_ENDING = '確定要繼續嗎？';

const CLOUD_SYNC = {
  LAST_UPLOAD_PREFIX: '上次上載：',
  LAST_REMOTE_PREFIX: '雲端備份：',
  CONFLICT_REMOTE_PREFIX: '雲端最後更新：',
  NEVER_UPLOADED: '尚未上載',
  TIMESTAMP_WITH_TIMEZONE: (time, zone) => `${time}（${zone}）`,

  SYNC_FAILED_PREFIX: '同步失敗：',
  ERROR_TIME_PREFIX: '發生時間：',

  LOADING_ACCOUNT_STATUS: '檢查登入與雲端狀態中...',
  LOADING_STATUS_SYNC: '檢查雲端狀態中...',
  LOADING_UPLOAD: '上載到雲端中...',
  LOADING_FORCE_UPLOAD: '強制上載中...',
  LOADING_DOWNLOAD: '從雲端還原中...',
  LOADING_DISCONNECT: '中斷連線中...',

  UPLOAD_SUCCESS: '上載成功！',
  DOWNLOAD_SUCCESS: '還原成功！頁面資料已從雲端更新。',
  DISCONNECT_SUCCESS: '已中斷 Google Drive 連線',

  CONNECT_FAILED_PREFIX: '連接失敗：',
  UPLOAD_FAILED_PREFIX: '上載失敗：',
  DOWNLOAD_FAILED_PREFIX: '還原失敗：',
  DISCONNECT_FAILED: '中斷連線失敗，請重試',

  BG_NO_RESPONSE: '背景無回應',
  UPLOAD_FAILED_GENERIC: '上載失敗',
  DOWNLOAD_FAILED_GENERIC: '下載失敗',

  CONFIRM_DOWNLOAD: `${CLOUD_SYNC_DOWNLOAD_CONFIRM_DESCRIPTION}\n\n${CLOUD_SYNC_DOWNLOAD_CONFIRM_ENDING}`,
  CONFIRM_DOWNLOAD_WITH_SUMMARY: (remoteTime, sourceLabel) =>
    `${CLOUD_SYNC_DOWNLOAD_CONFIRM_DESCRIPTION}\n\n雲端備份時間：${remoteTime}\n來源裝置：${sourceLabel}\n\n${CLOUD_SYNC_DOWNLOAD_CONFIRM_ENDING}`,
  UNKNOWN_TIME: '未知',
  SOURCE_THIS_DEVICE: '此裝置',
  SOURCE_OTHER_DEVICE: '其他裝置',
  SOURCE_UNKNOWN: '未知來源',
  CONFIRM_DISCONNECT:
    '確定要中斷 Google Drive 連線嗎？\n\n本地資料不受影響，但雲端同步功能將停用。',
  CONFIRM_FORCE_UPLOAD: '確定要強制上載並覆蓋較新的雲端版本嗎？\n\n此操作無法還原。',

  FREQUENCY_LABEL: '自動同步頻率',
  FREQUENCY_BETA_LABEL: '測試版',
  FREQUENCY_OFF: '停用（僅手動）',
  FREQUENCY_DAILY: '每日',
  FREQUENCY_WEEKLY: '每週',
  FREQUENCY_MONTHLY: '每30天',
  AUTO_SYNC_NEEDS_REVIEW: '❗ 雲端備份較新，請手動處理',
  FREQUENCY_SAVE_SUCCESS: '自動同步設定已儲存',
  FREQUENCY_SAVE_FAILED: '設定儲存失敗，請重試',

  SOURCE_WARNING: '⚠️ 目前雲端備份來自其他裝置或擴展安裝',
  CONFIRM_CROSS_INSTALL_UPLOAD:
    '目前雲端備份來自其他裝置或擴展安裝。\n\n若繼續上載，可能覆蓋該裝置最近的備份。確定要繼續嗎？',
  TRANSIENT_AUTH_ERROR: BACKGROUND_MESSAGES.DRIVE_SYNC.TRANSIENT_AUTH_ERROR,
};

const LOGS = {
  EXPORT_SUCCESS: count => `已成功匯出 ${count} 條日誌`,
  EXPORT_FAILED_PREFIX: '匯出失敗：',
  EXPORTING: '匯出中...',
};

const ACCOUNT = {
  AVATAR_ALT: '使用者頭像',
  LOGIN_BUTTON: '登入',
  LOGIN_ARIA_LABEL: '使用 Google 登入',
  SIGNED_IN_BUTTON: '已登入',
  MANAGEMENT_LABEL: '帳號管理',
  MANAGEMENT_LABEL_WITH_NAME: accountLabel => `帳號管理：${accountLabel}`,
  LOGIN_PAGE_OPEN_FAILED: BACKGROUND_MESSAGES.ACCOUNT.LOGIN_PAGE_OPEN_FAILED,
  ACCOUNT_MANAGEMENT_OPEN_FAILED: '無法開啟帳號管理頁面',
  LOCKED_LOGIN_REQUIRED: '需先登入 Google 帳號。',
  LOCKED_COMING_SOON: '功能即將推出。',
  TRANSIENT_REFRESH_ERROR: '無法更新登入狀態，將稍後自動重試。',
  LOGOUT_SUCCESS: '已成功登出',
  LOGOUT_FAILED: '登出失敗，請重試',
};

const AUTH_BRIDGE = {
  TITLE_MISSING_TICKET: '登入失敗：缺少驗證票據',
  DETAIL_MISSING_TICKET: '未在 URL 中找到 account_ticket，請重新登入。',
  TITLE_MISCONFIGURED: '登入設定異常，請稍後再試',
  DETAIL_MISCONFIGURED: 'OAUTH_SERVER_URL 未設定或格式無效。',
  STATUS_VERIFYING: '正在驗證登入資訊...',
  TITLE_EXCHANGE_FAILED: '登入失敗：無法完成 Session 交換',
  STATUS_FETCHING_PROFILE: '正在取得帳號資訊...',
  TITLE_PROFILE_FAILED: '登入失敗：無法取得帳號資訊',
  TITLE_STORAGE_FAILED: '登入失敗：無法儲存 Session',
  STATUS_SUCCESS: '登入成功！',
  TITLE_UNEXPECTED: '發生未預期錯誤',
};

export const UI_MESSAGES = deepFreeze({
  OPTIONS,
  DATA_SOURCE,
  LOGS,
  SETTINGS,
  AUTH,
  ACCOUNT,
  AUTH_BRIDGE,
  SETUP,
  POPUP,
  SIDEPANEL,
  HIGHLIGHTS,
  TOOLBAR,
  FLOATING_RAIL,
  TOAST,
  STORAGE,
  CLOUD_SYNC,
});

export {
  LOG_LEVELS,
  ERROR_TYPES,
  SECURITY_ERROR_MESSAGES,
  API_ERROR_PATTERNS,
  HIGHLIGHT_ERROR_CODES,
  ERROR_MESSAGES,
} from '../messages/errorMessages.js';
