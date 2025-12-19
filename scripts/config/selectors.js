/**
 * DOM 選擇器配置模組
 * 集中管理所有 DOM 選擇器，便於統一調整提取策略
 *
 * 注意：此模組必須為純 ES6 模組，不可依賴 window 或 document
 */

// ==========================================
// 封面圖選擇器
// ==========================================

/**
 * 封面圖/特色圖片選擇器（來自 content.js collectFeaturedImage）
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
];

// ==========================================
// 文章區域選擇器
// ==========================================

/**
 * 文章區域選擇器（來自 content.js collectAdditionalImages 策略 2）
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
 * 排除選擇器（來自 content.js collectAdditionalImages 策略 3）
 * 用於過濾非內容區域的圖片
 */
export const EXCLUSION_SELECTORS = [
  'header:not(.article-header):not(.post-header)', // 排除普通 header，但保留文章 header
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
// CMS 內容選擇器
// ==========================================

/**
 * WordPress 和其他 CMS 內容選擇器（來自 content.js findContentCmsFallback）
 */
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
  // 移動版常用選擇器
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

/**
 * Drupal 特定選擇器
 */
export const DRUPAL_SELECTORS = {
  nodeContent: '.node__content',
  imageField: '.field--name-field-image',
  bodyField: '.field--name-field-body',
};

/**
 * 文章結構選擇器（來自 content.js findContentCmsFallback 策略 3）
 */
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
  // 通用文章標籤
  'article',
  'main article',
  '.article',
  '.post',
  '.entry',
  '.news',
  '.story',
  // ID 選擇器（常見的）
  '#content',
  '#main-content',
  '#article-content',
  '#post-content',
  '#article',
  '#post',
  '#main',
];

// ==========================================
// 元數據選擇器
// ==========================================

/**
 * Favicon 選擇器（來自 MetadataExtractor.js）
 */
export const FAVICON_SELECTORS = [
  'link[rel="icon"]',
  'link[rel="shortcut icon"]',
  'link[rel="apple-touch-icon"]',
];

/**
 * Site Icon 選擇器配置（來自 MetadataExtractor.js extractSiteIcon）
 * 帶優先級和類型信息，用於智能選擇最佳 icon
 */
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

/**
 * 作者頭像/Logo 關鍵字（用於過濾，來自 MetadataExtractor.js）
 */
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
// 技術文檔選擇器
// ==========================================

/**
 * 技術文檔/Markdown 內容選擇器（來自 ContentExtractor.js）
 */
/**
 * 技術文檔/Markdown 內容選擇器（來自 ContentExtractor.js）
 * 注意：僅包含明確的容器類名，避免使用通用標籤（如 article, main）以防止誤抓
 */
export const TECHNICAL_CONTENT_SELECTORS = [
  '.markdown-body', // GitHub
  '.docs-content', // Generic Docs
  '.documentation', // Generic Docs
  '.gitbook-root', // GitBook
  '.md-content', // MkDocs
  '.prose', // Tailwind Typography (確認是否過於寬泛? 通常 safe)
  '#readme', // GitHub/NPM
];

// ==========================================
// 廣告元素選擇器
// ==========================================

/**
 * 廣告元素選擇器（用於頁面複雜度檢測）
 * 來源：Issue #178 - 擴充 pageComplexityDetector 廣告元素選擇器
 *
 * 注意事項：
 * - 避免過於寬鬆的選擇器（如 [class*="ad"] 可能誤判 .add-button）
 * - 使用 [class*="ad-"] 確保只匹配帶連字符的 class
 */
export const AD_SELECTORS = [
  // 精確匹配選擇器（不被屬性選擇器涵蓋）
  '.advertisement',
  '[id^="div-gpt-ad"]',
  '.google-auto-placed',
  '.adsbygoogle',
  '.sponsor',
  '.sponsor-content',
  // 屬性包含選擇器（涵蓋 .ad-container, .ad-banner, .ad-widget 等）
  '[class*="ad-"]',
  '[id*="ad-"]',
  '[id*="sponsor"]',
];
