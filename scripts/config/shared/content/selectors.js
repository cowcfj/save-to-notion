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
