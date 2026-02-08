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
};

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

  // 文章頭部區域
  '.article-header img',
  'header.article-header img',
  '.post-header img',
  '.entry-header img',

  // 通用特色圖片容器
  'figure.featured img',
  'figure.hero img',
  '[class*="featured"] img:first-of-type',
  '[class*="hero"] img:first-of-type',
  '[class*="cover"] img:first-of-type',

  // 文章開頭的第一張圖片
  'article > figure:first-of-type img',
  'article > div:first-of-type img',
  '.article > figure:first-of-type img',
  '.post > figure:first-of-type img',
  '.post > div:first-of-type img',
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
  'main',
  '[role="main"]',
  '.article',
  '.post',
  '.entry-content',
  '.post-content',
  '.article-content',
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
// UI 選擇器 (Options & Toolbar)
// ==========================================

export const OPTIONS_PAGE_SELECTORS = {
  STATUS_CONTAINER: '#status',
  MANUAL_SECTION: '.manual-section',
  TEST_API_BUTTON: '#test-api-button',
  HIDDEN_CLASS: 'hidden',
  STATUS_MESSAGE_CLASS: 'status-message',
};

export const TOOLBAR_SELECTORS = {
  CONTAINER: '#notion-highlighter-v2',
  MINI_ICON: '#notion-highlighter-mini-icon',
  TOGGLE_HIGHLIGHT: '#toggle-highlight-v2',
  MINIMIZE: '#minimize-highlight-v2',
  CLOSE: '#close-highlight-v2',
  COLOR_PICKER: '#color-picker-v2',
  SYNC_TO_NOTION: '#sync-to-notion-v2',
  OPEN_NOTION: '#open-notion-v2',
  MANAGE_HIGHLIGHTS: '#manage-highlights-v2',
  HIGHLIGHT_LIST: '#highlight-list-v2',
  STATUS_CONTAINER: '#highlight-status-v2',
  COUNT_DISPLAY: '#highlight-count-v2',
  LIST_OPEN_NOTION: '#list-open-notion-v2',
};
