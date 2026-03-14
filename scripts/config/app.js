/**
 * 擴充功能系統級別配置模組
 * 管理 Extension 生命週期、瀏覽器限制與安全防護相關常數
 */

// ==========================================
// 受限協議配置（擴展無法注入的頁面類型）
// ==========================================

/**
 * 受限協議列表（擴展無法注入腳本的頁面）
 * 用於 InjectionService 和 saveHandlers 的前置檢查
 */
export const RESTRICTED_PROTOCOLS = [
  'chrome:',
  'edge:',
  'about:',
  'data:',
  'chrome-extension:',
  'view-source:',
  'file:', // 本地文件（PDF 等）
];

// ==========================================
// Handlers 相關常量
// ==========================================

export const HANDLER_CONSTANTS = {
  BUNDLE_READY_RETRY_DELAY: 150, // Bundle 就緒檢查重試延遲 (ms)
  BUNDLE_READY_MAX_RETRIES: 10, // Bundle 就緒檢查最大重試次數
  PAGE_STATUS_CACHE_TTL: 60 * 1000, // 頁面保存狀態緩存時間 (60秒)
  IMAGE_RETRY_DELAY: 500, // 圖片驗證錯誤重試延遲 (ms)
  CHECK_DELAY: 500, // 頁面存在性檢查延遲 (ms)
};

// ==========================================
// TabService 相關常量
// ==========================================

export const TAB_SERVICE = {
  LOADING_TIMEOUT_MS: 10_000, // 頁面載入超時時間 (ms)
  STATUS_UPDATE_DELAY_MS: 1000, // 狀態更新延遲 (ms)
  PRELOADER_PING_TIMEOUT_MS: 500, // Preloader PING 超時 (ms)
};

// ==========================================
// 安全驗證相關常量
// ==========================================

export const SECURITY_CONSTANTS = {
  // SVG 驗證白名單標籤 (來自 securityUtils.js)
  SVG_ALLOWED_TAGS: [
    'svg',
    'path',
    'circle',
    'rect',
    'line',
    'polyline',
    'polygon',
    'ellipse',
    'g',
    'defs',
    'use',
    'symbol',
    'title',
    'desc',
    'lineargradient', // 注意：轉為小寫比較
    'radialgradient',
    'stop',
    'clippath',
    'mask',
    'pattern',
    'text',
    'tspan',
    'image', // 允許圖片（但已在危險模式中檢查 data: 協議）
    'a', // 允許連結（但已在危險模式中檢查 javascript: 協議）
  ],

  // SVG 驗證白名單屬性 (來自 securityUtils.js)
  SVG_ALLOWED_ATTRS: [
    'viewBox',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'width',
    'height',
    'class',
    'id',
    'xmlns',
    'x',
    'y',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'd',
    'points',
    'x1',
    'y1',
    'x2',
    'y2',
    'transform',
    'opacity',
  ],

  // 安全 URL 協議
  SAFE_URL_PROTOCOLS: ['http:', 'https:', ''],
};
