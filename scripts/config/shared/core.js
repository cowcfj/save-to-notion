/**
 * Shared core 配置
 */

/**
 * 瀏覽器限制配置
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
  'file:',
];

/**
 * 時序配置
 * Handler 重試延遲、TabService 超時等時間相關常數
 */
export const HANDLER_CONSTANTS = {
  BUNDLE_READY_RETRY_DELAY: 150,
  BUNDLE_READY_MAX_RETRIES: 10,
  PAGE_STATUS_CACHE_TTL: 60 * 1000,
  IMAGE_RETRY_DELAY: 500,
  CHECK_DELAY: 500,
};

export const TAB_SERVICE = {
  LOADING_TIMEOUT_MS: 10_000,
  STATUS_UPDATE_DELAY_MS: 1000,
  PRELOADER_PING_TIMEOUT_MS: 500,
};

/**
 * 安全驗證常量
 * SVG 白名單、安全 URL 協議等
 */
export const SECURITY_CONSTANTS = {
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
    'lineargradient',
    'radialgradient',
    'stop',
    'clippath',
    'mask',
    'pattern',
    'text',
    'tspan',
    'image',
    'a',
  ],

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

  SAFE_URL_PROTOCOLS: ['http:', 'https:'],
};
