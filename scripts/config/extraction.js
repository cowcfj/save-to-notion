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

export const OG_IMAGE_SELECTOR = 'meta[property="og:image"]';
export const MINGPAO_GALLERY_SELECTOR = '#zoomedimg a.fancybox';

// ==========================================
// 封面圖選擇器 (原 selectors.js)
// ==========================================

/**
 * 封面圖/特色圖片選擇器
 * 按優先級排序
 */
export const FEATURED_IMAGE_SELECTORS = [
  // WordPress 和常見 CMS
  '.featured-image img',
  '.hero-image img',
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
  'div[class*="featured-image"] img',
  'div[class*="hero"] img',

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
  // Mingpao Gallery
  MINGPAO_GALLERY_SELECTOR, // Lightbox
  '#zoomedimg .imgLiquid', // Lightbox BG

  // Specific
  OG_IMAGE_SELECTOR,

  '.article',
  '.post',
  '.entry-content',
  '.post-content',
  '.article-content',
  '#topimage',
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
export const EXCLUSION_SELECTORS = [
  'header:not(.article-header):not(.post-header)',
  'footer',
  'nav',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '.header:not(.article-header):not(.post-header)',
  '.footer',
  '.navigation',
  '.nav',
  '.navbar',
  '.sidebar',
  '.side-bar',
  '.widget',
  '.widgets',
  '.comments',
  '.comment-list',
  '.comment-section',
  '.comment-area',
  '.related',
  '.related-posts',
  '.related-articles',
  '.recommended',
  '.advertisement',
  '.ads',
  '.ad',
  '.banner',
  '.ad-container',
  '.social',
  '.social-share',
  '.share-buttons',
  '.social-links',
  '.menu',
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
  '#social-share',
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
 * 通用清洗規則 (應用於所有內容) - Post-process
 * 提取自原 createOptimizedDocumentClone 中的 elementsToRemove
 */
export const GENERIC_CLEANING_RULES = [
  // 基礎雜訊
  'script',
  'style',
  'link[rel="stylesheet"]',
  // 廣告與追蹤
  '[class*="ad"]',
  '[class*="advertisement"]',
  '[id*="ad"]',
  '[class*="tracking"]',
  '[class*="analytics"]',
  // 導航與側邊欄
  'nav',
  'aside',
  '.sidebar',
  '.navigation',
  '.menu',
  // 頁首頁尾 (排除文章專屬)
  'footer:not(.article-footer)',
  'header:not(.article-header)',
  // 社交與互動
  '[class*="social"]',
  '[class*="share"]',
  '.comments',
  '.comment-section',
  // 隱藏內容
  '[style*="display: none"]',
  '[hidden]',
];
