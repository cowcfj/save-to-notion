/**
 * 提取配置模組 (Extraction Configuration)
 * 統一管理所有內容提取相關的配置，包括 DOM 選擇器、JSON 路徑映射、Block 類型映射等。
 * 取代原有的 selectors.js 與分散的配置。
 */

// ==========================================
// Next.js 提取配置
// ==========================================

export const NEXTJS_CONFIG = {
  // 常見 Next.js 網站的文章數據路徑
  ARTICLE_PATHS: [
    // BBC News (Pages Router, {type, model} 巢狀格式)
    'props.pageProps.pageData',

    // Yahoo News App Router (RSC format)
    'pageData.pageState.article.data.contentMeta', // Contains storyAtoms
    'props.pageData.pageState.article.data.contentMeta',
    'props.pageData.pageState.article.data',
    'pageData.pageState.article.data',
    'props.pageData.pageState.article',
    'pageData.pageState.article',
    'initialArticle.data',
    'initialArticle',

    // 標準路徑
    'props.initialProps.pageProps.article', // HK01
    'props.pageProps.article',
    'props.pageProps.post',
    'props.pageProps.content',
    'props.pageProps.data',
  ],

  // Block 類型映射
  BLOCK_TYPE_MAP: {
    text: 'paragraph',
    paragraph: 'paragraph',
    image: 'image',
    heading: 'heading_2', // 默認映射
    heading1: 'heading_1',
    heading2: 'heading_2',
    heading3: 'heading_3',
    heading_1: 'heading_1',
    heading_2: 'heading_2',
    heading_3: 'heading_3',
    quote: 'quote',
    blockquote: 'quote',
    list: 'bulleted_list_item',
    code: 'code',
  },

  // JSON 大小限制 (2MB)
  MAX_JSON_SIZE: 2 * 1024 * 1024,

  // 最小有效區塊數
  MIN_VALID_BLOCKS: 3,

  // [NEW] 啟發式搜索特徵
  HEURISTIC_PATTERNS: {
    // 用於驗證內容是否有效的欄位 (OR 邏輯 - 滿足其一即可)
    VALIDATION_FIELDS: ['blocks', 'content', 'body', 'markup', 'storyAtoms'],
    // 用於評分的關鍵字
    SCORE_KEYWORDS: ['article', 'post', 'detail', 'story'],
    // 排除的鍵名
    EXCLUDE_KEYS: [
      'header',
      'footer',
      'menu',
      'navigation',
      'sidebar',
      // Yahoo 推薦區塊
      'postArticleStream',
      'recommendedContentsResp',
      'breakingNews',
      'mostPopular',
      'taboola',
      'trendingNow',
    ],
  },

  // [NEW] App Router 特徵
  APP_ROUTER_SELECTOR: 'script:not([id]):not([src])', // 粗篩，再透過內容過濾
};

// ==========================================
// 常量定義
// ==========================================

export const DOM_STABILITY = {
  THRESHOLD_MS: 150,
  MAX_WAIT_MS: 500,
};
export const OG_IMAGE_SELECTOR = 'meta[property="og:image"]';
export const MINGPAO_GALLERY_SELECTOR = '#zoomedimg a.fancybox';
export const BBC_IMAGE_BASE_URL = 'https://ichef.bbci.co.uk/ace/ws';
export const BBC_DEFAULT_IMAGE_WIDTH = 1024;
export const EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX = /https?%3A%2F%2F/i;

// ==========================================
// 封面圖選擇器 (原 selectors.js)
// ==========================================

/**
 * 封面圖/特色圖片選擇器
 * 按優先級排序
 */
export const FEATURED_IMAGE_SELECTORS = [
  // Drupal
  '.field--name-field-image img',
  '.field-name-field-image img',

  // WordPress 和常見 CMS
  '.cover-image img',
  '.post-thumbnail img',
  '.entry-thumbnail img',
  '.wp-post-image',

  // Mingpao Gallery
  MINGPAO_GALLERY_SELECTOR, // High-res link
  '#zoomedimg .imgLiquid', // Background image container

  // 文章頭部區域
  'header img',
  '.article-header img',
  '.entry-header img',
  '.page-header img',

  // 通用特色圖片容器
  'figure.featured img',
  '.featured-media img',
  '.wp-block-post-featured-image img',
  '.featured-image img',
  'div[class~="featured-image"] img',
  '.hero-image img',
  'div[class~="hero"] img',

  // 特定網站適配
  OG_IMAGE_SELECTOR,

  // 第一張大圖 (作為回退)
  'article img:first-of-type',
  '.article > figure:first-of-type img',
  '.post > figure:first-of-type img',
  '.post > div:first-of-type img',

  // 特定網站配置
  '.d-block.w-100', // Yahoo Carousel
  'figure.image img', // HK01 (部分)
];

/**
 * 圖片源屬性列表（用於處理懶加載）
 */
export const IMAGE_SRC_ATTRIBUTES = [
  'src',
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-lazy',
  'data-url',
  'data-image',
];

// ==========================================
// 文章區域選擇器 (原 selectors.js)
// ==========================================

/**
 * 文章區域選擇器
 */
export const ARTICLE_SELECTORS = [
  'article',
  '.article',
  '.post',
  '.entry-content',
  '.post-content',
  '.article-content',
];

/**
 * 圖片專用選擇器 (Image Selectors)
 * 用於 ImageCollector.js 直接查找圖片，不作為文章容器
 */
export const IMAGE_SELECTORS = [
  // Mingpao
  MINGPAO_GALLERY_SELECTOR, // Lightbox link
  '#zoomedimg .imgLiquid', // Lightbox BG
  '#topimage', // Top image container

  // Metadata
  // OG_IMAGE_SELECTOR removed: it's a meta tag, not a container for img tags
];

/**
 * 圖集/畫廊選擇器 (Gallery Selectors)
 * 用於 ImageCollector.js 收集圖集圖片
 */
export const GALLERY_SELECTORS = [
  MINGPAO_GALLERY_SELECTOR, // Mingpao Lightbox (high-res images)
  // NOTE: Do NOT add #topimage a - those anchors have javascript:void(0) href,
  // causing fallback to child <img> thumbnails instead of high-res images.
  '.gallery-item a',
  '.slideshow .slide a',
];

/**
 * 排除選擇器
 * 用於過濾非內容區域的圖片
 */
/**
 * 基礎雜訊選擇器集合 (NOISE_SELECTORS)
 * 供 EXCLUSION_SELECTORS 和 GENERIC_CLEANING_RULES 共用
 */
export const NOISE_SELECTORS = [
  // 導航與側邊欄
  'nav',
  'aside',
  '.sidebar',
  '.side-bar',
  '.navigation',
  '.menu',
  '.nav',
  '.navbar',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',

  // 社交與互動
  '.social',
  '.social-share',
  '.share-buttons',
  '.social-links',
  '[class~="social"]',
  '[class~="share"]',
  '#social-share',

  // 評論與互動
  '.comments',
  '.comment-list',
  '.comment-section',
  '.comment-area',

  // 廣告與推薦
  '.advertisement',
  '.ads',
  '.ad',
  '.banner',
  '.ad-container',
  '.related',
  '.related-posts',
  '.related-articles',
  '.recommended',
  '.widget',
  '.widgets',

  // 前綴/後綴匹配 (比 *contains* 更安全，避免誤殺正文)
  // 評論區塊 (comment-xxx 或 xxx-comment 命名慣例)
  '[class^="comment-"]',
  '[class$="-comment"]',
  '[class$="-comments"]',
  '[id^="comment-"]',
  '[id$="-comment"]',
  '[id$="-comments"]',
  // 推薦區塊
  '[class^="recommend"]',
  '[id^="recommend"]',
  // 相關文章區塊
  '[class^="related-"]',
  '[class$="-related"]',
  '[id^="related-"]',
  '[id$="-related"]',
  // 分享按鈕 (share-xxx 命名慣例，避免匹配 sharepoint, share-price 等)
  '[class^="share-"]',
  '[class$="-share"]',
  '[id^="share-"]',
  '[id$="-share"]',
];

/**
 * 排除選擇器
 * 用於過濾非內容區域的圖片
 */
export const EXCLUSION_SELECTORS = [
  ...NOISE_SELECTORS,
  'header:not(.article-header):not(.post-header)',
  'footer',
  '.header:not(.article-header):not(.post-header)',
  '.footer',
  '.site-header',
  '.site-footer',
  '.site-nav',
  // Yahoo News (2024+ App Router 版本)
  '[class*="w-article-aside"]', // 側邊欄整體容器
  '#module-most-popular', // 熱門新聞區塊
  '#recommended-article-stream',
  '.stream-card',
  '.recommendation-contents',
  '.bg-toast-background',
  '#module-preference-stream',
  '[id^="taboola-stream"]',
  '.trc_rbox',
  '.trc-content-sponsored', // Taboola 贊助內容
  '#mktbanner',
  // 保留通用模式
  '[class*="infinite-scroll"]',
  '[class*="endless-scroll"]',
  '[data-component="stream"]',
  // 通用推薦與建議內容
  '[class*="recommendation"]',
  '[class*="suggested"]',
];

// ==========================================
// CMS 內容選擇器 (原 selectors.js)
// ==========================================

export const CMS_CONTENT_SELECTORS = [
  '.entry-content',
  '.post-content',
  '.article-content',
  '.content-area',
  '.single-content',
  '.main-content',
  '.txt4', // Mingpao
  '.page-content',
  '.content-wrapper',
  '.article-wrapper',
  '.post-wrapper',
  '.content-body',
  '.article-text',
  '.post-text',
  '.content-main',
  '.article-main',
  // 移動版
  '.mobile-content',
  '.m-content',
  '.content',
  '.text-content',
  '.article-detail',
  '.post-detail',
  '.detail-content',
  '.news-content',
  '.story-content',
];

export const DRUPAL_SELECTORS = {
  nodeContent: '.node__content',
  imageField: '.field--name-field-image',
  bodyField: '.field--name-field-body',
};

export const ARTICLE_STRUCTURE_SELECTORS = [
  'article[role="main"]',
  'article.post',
  'article.article',
  'article.content',
  'article.entry',
  '.post-body',
  '.article-body',
  '.entry-body',
  '.news-body',
  '.story-body',
  '.content-text',
  '.article-container',
  '.post-container',
  '.content-container',
  'article',
  'main article',
  '.article',
  '.post',
  '.entry',
  '.news',
  '.story',
  '#content',
  '#main-content',
  '#article-content',
  '#post-content',
  '#article',
  '#post',
  '#main',
];

// ==========================================
// 元數據選擇器 (原 selectors.js)
// ==========================================

export const FAVICON_SELECTORS = [
  'link[rel="icon"]',
  'link[rel="shortcut icon"]',
  'link[rel="apple-touch-icon"]',
];

export const SITE_ICON_SELECTORS = [
  { selector: 'link[rel="apple-touch-icon"]', attr: 'href', priority: 1, iconType: 'apple-touch' },
  {
    selector: 'link[rel="apple-touch-icon-precomposed"]',
    attr: 'href',
    priority: 2,
    iconType: 'apple-touch',
  },
  { selector: 'link[rel="icon"]', attr: 'href', priority: 3, iconType: 'standard' },
  { selector: 'link[rel="shortcut icon"]', attr: 'href', priority: 4, iconType: 'standard' },
];

export const AVATAR_KEYWORDS = [
  'avatar',
  'profile',
  'author',
  'user-image',
  'user-avatar',
  'byline',
  'author-image',
  'author-photo',
  'profile-pic',
  'user-photo',
];

// ==========================================
// 技術文檔選擇器 (原 selectors.js)
// ==========================================

export const TECHNICAL_CONTENT_SELECTORS = [
  '.markdown-body', // GitHub
  '.docs-content', // Generic Docs
  '.documentation', // Generic Docs
  '.gitbook-root', // GitBook
  '.md-content', // MkDocs
  '.prose', // Tailwind Typography
  '#readme', // GitHub/NPM
];

// ==========================================
// 廣告與 Preloader (原 selectors.js)
// ==========================================

export const AD_SELECTORS = [
  '.advertisement',
  '.ads',
  '.ad',
  '.google-auto-placed',
  '.adsbygoogle',
  '.sponsor',
  '.sponsor-content',
  '[id^="div-gpt-ad"]',
  '[class^="ad-"]',
  '[class*=" ad-"]',
  '[id^="ad-"]',
  '[id*="-ad-"]',
  '[id*="sponsor"]',
];

export const PRELOADER_SELECTORS = {
  article: 'article',
  mainContent: 'main, [role="main"], #content, .content',
};

// ==========================================
// 智慧清洗規則 (Smart Cleaning)
// ==========================================

export const CMS_CLEANING_RULES = {
  wordpress: {
    signals: [
      { type: 'meta', name: 'generator', pattern: /WordPress/i },
      { type: 'class', target: 'body', pattern: /wordpress/i },
    ],
    remove: ['.wpc-related-posts', '.sharedaddy', '.jp-relatedposts', '#comments', '.author-bio'],
  },
  // 可擴展其他 CMS
};

/**
 * 網域專屬清洗規則 (Domain Specific Cleaning)
 * 針對無法使用通用規則或需要特殊處理容器的邊緣網站
 */
export const DOMAIN_CLEANING_RULES = {
  'news.qq.com': {
    container: 'div.content-left', // Readability 解析前先過濾掉這個外層以外的 DOM
    remove: [
      // 專屬雜訊：只存放通用規則無法涵蓋的怪異選取器
    ],
  },
  'hk01.com': {
    container: 'main article, [role="main"] article',
    remove: ['.related-articles'],
  },
};

/**
 * 通用清洗規則 (應用於所有內容) - Post-process
 * 提取自原 createOptimizedDocumentClone 中的 elementsToRemove
 */
export const GENERIC_CLEANING_RULES = [
  ...NOISE_SELECTORS,
  // 基礎雜訊
  'script',
  'style',
  'link[rel="stylesheet"]',
  // 廣告與追蹤
  '[class^="ad-"]',
  '[class*=" ad-"]',
  '[id^="ad-"]',
  '[id*="-ad-"]',
  '[class*="tracking"]',
  '[class*="analytics"]',
  // 頁首頁尾 (排除文章專屬)
  'footer:not(.article-footer)',
  'header:not(.article-header)',
  // 隱藏內容
  // Note: [style*="display: none"] removed; handled by style regex check in ReadabilityAdapter
  '[hidden]',
];

// ==========================================
// 圖片驗證相關常量
// ==========================================

/**
 * 圖片驗證常量（來自 imageUtils.js）
 */
export const IMAGE_VALIDATION_CONSTANTS = {
  MAX_URL_LENGTH: 2000, // Notion API 限制通常為 2000 字符
  URL_LENGTH_SAFETY_MARGIN: 500, // 安全邊際，避免臨界值問題
  URL_LENGTH_INLINE_SAFETY_MARGIN: 100, // 行內圖片 URL 安全邊際，較寬鬆
  MAX_QUERY_PARAMS: 10, // 查詢參數數量閾值（超過可能為動態 URL）
  SRCSET_WIDTH_MULTIPLIER: 1000, // srcset w 描述符權重（優先於 x）
  MAX_BACKGROUND_URL_LENGTH: 2000, // 背景圖片 URL 最大長度（防止 ReDoS）
  MIN_IMAGE_WIDTH: 550, // 最小圖片寬度 (User Request: 550)
  MIN_IMAGE_HEIGHT: 300, // 最小圖片高度 (調整以支援 16:9 比例)
  MAX_RECURSION_DEPTH: 5, // 遞歸解析最大深度
};

export const IMAGE_VALIDATION = IMAGE_VALIDATION_CONSTANTS;

export const IMAGE_VALIDATION_CONFIG = {
  MAX_CACHE_SIZE: 500, // 緩存大小限制
  CACHE_TTL: 30 * 60 * 1000, // 30分鐘 TTL
  SUPPORTED_PROTOCOLS: ['http:', 'https:', 'data:', 'blob:'],
};

// ==========================================
// 內容質量評估常量
// ==========================================

/**
 * 內容質量評估常量（來自 content.js）
 */
export const CONTENT_QUALITY = {
  MIN_CONTENT_LENGTH: 250, // 內容長度最小值
  MAX_LINK_DENSITY: 0.25, // 最大鏈接密度（25%）
  LIST_EXCEPTION_THRESHOLD: 8, // 列表項數量閾值（允許例外）
  DEFAULT_PAGE_TITLE: 'Untitled', // 預設頁面標題
};

// ==========================================
// 圖片尺寸解析常量
// ==========================================

/** 尺寸未知圖片的有界解析配置 */
export const IMAGE_SIZE_RESOLVE = {
  PER_IMAGE_TIMEOUT_MS: 3000, // 單張圖片 timeout（平衡慢速網路與流程速度）
  TOTAL_BUDGET_MS: 5000, // 整體尺寸解析 budget（避免多張累加拖慢流程）
};

// ==========================================
// 圖片收集相關常量
// ==========================================

/** 圖片數量限制配置 */
export const IMAGE_LIMITS = {
  MAX_MAIN_CONTENT_IMAGES: 6,
  MAX_ADDITIONAL_IMAGES: 2,
  MAIN_CONTENT_SUFFICIENT_THRESHOLD: 2,
  MAX_GALLERY_IMAGES: 6,
  MIN_IMAGES_FOR_ARTICLE_SEARCH: 3, // 觸發文章區域搜索的最小圖片數
  MAX_IMAGES_FROM_ARTICLE_SEARCH: 5, // 文章區域搜索的最大圖片數
  BATCH_PROCESS_THRESHOLD: 5, // 觸發批次處理的圖片數量閾值
};

// ==========================================
// 文本處理相關常量
// ==========================================

export const TEXT_PROCESSING = {
  MAX_RICH_TEXT_LENGTH: 2000, // Notion rich_text 區塊最大長度
  MIN_SPLIT_RATIO: 0.5, // 文本分割時的最小比例
};

// ==========================================
// URL 標準化相關常量
// ==========================================

export const URL_NORMALIZATION = {
  TRACKING_PARAMS: [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
    'mc_cid',
    'mc_eid',
    'igshid',
    'vero_id',
  ],
};
