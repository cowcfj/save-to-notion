/**
 * Shared content extraction 配置
 */

export const NEXTJS_CONFIG = {
  ARTICLE_PATHS: [
    'props.pageProps.pageData',
    'pageData.pageState.article.data.contentMeta',
    'props.pageData.pageState.article.data.contentMeta',
    'props.pageData.pageState.article.data',
    'pageData.pageState.article.data',
    'props.pageData.pageState.article',
    'pageData.pageState.article',
    'initialArticle.data',
    'initialArticle',
    'props.initialProps.pageProps.article',
    'props.pageProps.article',
    'props.pageProps.post',
    'props.pageProps.content',
    'props.pageProps.data',
  ],

  BLOCK_TYPE_MAP: {
    text: 'paragraph',
    paragraph: 'paragraph',
    image: 'image',
    heading: 'heading_2',
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

  MAX_JSON_SIZE: 2 * 1024 * 1024,
  MIN_VALID_BLOCKS: 3,

  HEURISTIC_PATTERNS: {
    VALIDATION_FIELDS: ['blocks', 'content', 'body', 'markup', 'storyAtoms'],
    SCORE_KEYWORDS: ['article', 'post', 'detail', 'story'],
    EXCLUDE_KEYS: [
      'header',
      'footer',
      'menu',
      'navigation',
      'sidebar',
      'postArticleStream',
      'recommendedContentsResp',
      'breakingNews',
      'mostPopular',
      'taboola',
      'trendingNow',
    ],
  },

  APP_ROUTER_SELECTOR: 'script:not([id]):not([src])',
};

export const OG_IMAGE_SELECTOR = 'meta[property="og:image"]';
export const MINGPAO_GALLERY_SELECTOR = '#zoomedimg a.fancybox';
export const BBC_IMAGE_BASE_URL = 'https://ichef.bbci.co.uk/ace/ws';
export const BBC_DEFAULT_IMAGE_WIDTH = 1024;
export const EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX = /https?%3A%2F%2F/i;

export const FEATURED_IMAGE_SELECTORS = [
  '.field--name-field-image img',
  '.field-name-field-image img',
  '.cover-image img',
  '.post-thumbnail img',
  '.entry-thumbnail img',
  '.wp-post-image',
  MINGPAO_GALLERY_SELECTOR,
  '#zoomedimg .imgLiquid',
  'header img',
  '.article-header img',
  '.entry-header img',
  '.page-header img',
  'figure.featured img',
  '.featured-media img',
  '.wp-block-post-featured-image img',
  '.featured-image img',
  'div[class~="featured-image"] img',
  '.hero-image img',
  'div[class~="hero"] img',
  OG_IMAGE_SELECTOR,
  'article img:first-of-type',
  '.article > figure:first-of-type img',
  '.post > figure:first-of-type img',
  '.post > div:first-of-type img',
  '.d-block.w-100',
  'figure.image img',
];

export const IMAGE_SRC_ATTRIBUTES = [
  'src',
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-lazy',
  'data-url',
  'data-image',
];

export const ARTICLE_SELECTORS = [
  'article',
  '.article',
  '.post',
  '.entry-content',
  '.post-content',
  '.article-content',
];

export const IMAGE_SELECTORS = [MINGPAO_GALLERY_SELECTOR, '#zoomedimg .imgLiquid', '#topimage'];

export const GALLERY_SELECTORS = [
  MINGPAO_GALLERY_SELECTOR,
  '.gallery-item a',
  '.slideshow .slide a',
];

export const CMS_CONTENT_SELECTORS = [
  '.entry-content',
  '.post-content',
  '.article-content',
  '.content-area',
  '.single-content',
  '.main-content',
  '.txt4',
  '.page-content',
  '.content-wrapper',
  '.article-wrapper',
  '.post-wrapper',
  '.content-body',
  '.article-text',
  '.post-text',
  '.content-main',
  '.article-main',
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

export const TECHNICAL_CONTENT_SELECTORS = [
  '.markdown-body',
  '.docs-content',
  '.documentation',
  '.gitbook-root',
  '.md-content',
  '.prose',
  '#readme',
];

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

export const NOISE_SELECTORS = [
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
  '.social',
  '.social-share',
  '.share-buttons',
  '.social-links',
  '[class~="social"]',
  '[class~="share"]',
  '#social-share',
  '.comments',
  '.comment-list',
  '.comment-section',
  '.comment-area',
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
  '[class^="comment-"]',
  '[class$="-comment"]',
  '[class$="-comments"]',
  '[id^="comment-"]',
  '[id$="-comment"]',
  '[id$="-comments"]',
  '[class^="recommend"]',
  '[id^="recommend"]',
  '[class^="related-"]',
  '[class$="-related"]',
  '[id^="related-"]',
  '[id$="-related"]',
  '[class^="share-"]',
  '[class$="-share"]',
  '[id^="share-"]',
  '[id$="-share"]',
];

export const EXCLUSION_SELECTORS = [
  ...NOISE_SELECTORS,
  'header:not(.article-header):not(.post-header)',
  'footer',
  '.header:not(.article-header):not(.post-header)',
  '.footer',
  '.site-header',
  '.site-footer',
  '.site-nav',
  '[class*="w-article-aside"]',
  '#module-most-popular',
  '#recommended-article-stream',
  '.stream-card',
  '.recommendation-contents',
  '.bg-toast-background',
  '#module-preference-stream',
  '[id^="taboola-stream"]',
  '.trc_rbox',
  '.trc-content-sponsored',
  '#mktbanner',
  '[class*="infinite-scroll"]',
  '[class*="endless-scroll"]',
  '[data-component="stream"]',
  '[class*="recommendation"]',
  '[class*="suggested"]',
];

export const CMS_CLEANING_RULES = {
  wordpress: {
    signals: [
      { type: 'meta', name: 'generator', pattern: /WordPress/i },
      { type: 'class', target: 'body', pattern: /wordpress/i },
    ],
    remove: ['.wpc-related-posts', '.sharedaddy', '.jp-relatedposts', '#comments', '.author-bio'],
  },
};

export const DOMAIN_CLEANING_RULES = {
  'news.qq.com': {
    container: 'div.content-left',
    remove: [],
  },
  'hk01.com': {
    container: 'main article, [role="main"] article',
    remove: ['.related-articles'],
  },
};

export const GENERIC_CLEANING_RULES = [
  ...NOISE_SELECTORS,
  'script',
  'style',
  'link[rel="stylesheet"]',
  '[class^="ad-"]',
  '[class*=" ad-"]',
  '[id^="ad-"]',
  '[id*="-ad-"]',
  '[class*="tracking"]',
  '[class*="analytics"]',
  'footer:not(.article-footer)',
  'header:not(.article-header)',
  '[hidden]',
];

export const IMAGE_VALIDATION_CONSTANTS = {
  MAX_URL_LENGTH: 2000,
  URL_LENGTH_SAFETY_MARGIN: 500,
  URL_LENGTH_INLINE_SAFETY_MARGIN: 100,
  MAX_QUERY_PARAMS: 10,
  SRCSET_WIDTH_MULTIPLIER: 1000,
  MAX_BACKGROUND_URL_LENGTH: 2000,
  MIN_IMAGE_WIDTH: 550,
  MIN_IMAGE_HEIGHT: 300,
  MAX_RECURSION_DEPTH: 5,
};

export const IMAGE_VALIDATION = IMAGE_VALIDATION_CONSTANTS;

export const IMAGE_VALIDATION_CONFIG = {
  MAX_CACHE_SIZE: 500,
  CACHE_TTL: 30 * 60 * 1000,
  SUPPORTED_PROTOCOLS: ['http:', 'https:', 'data:', 'blob:'],
};

export const IMAGE_SIZE_RESOLVE = {
  PER_IMAGE_TIMEOUT_MS: 3000,
  TOTAL_BUDGET_MS: 5000,
};

export const IMAGE_LIMITS = {
  MAX_MAIN_CONTENT_IMAGES: 6,
  MAX_ADDITIONAL_IMAGES: 2,
  MAIN_CONTENT_SUFFICIENT_THRESHOLD: 2,
  MAX_GALLERY_IMAGES: 6,
  MIN_IMAGES_FOR_ARTICLE_SEARCH: 3,
  MAX_IMAGES_FROM_ARTICLE_SEARCH: 5,
  BATCH_PROCESS_THRESHOLD: 5,
};

export const DOM_STABILITY = {
  THRESHOLD_MS: 150,
  MAX_WAIT_MS: 500,
};

export const CONTENT_QUALITY = {
  MIN_CONTENT_LENGTH: 250,
  MAX_LINK_DENSITY: 0.25,
  LIST_EXCEPTION_THRESHOLD: 8,
  DEFAULT_PAGE_TITLE: 'Untitled',
};

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

export const TEXT_PROCESSING = {
  MAX_RICH_TEXT_LENGTH: 2000,
  MIN_SPLIT_RATIO: 0.5,
};
