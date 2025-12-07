/**
 * MetadataExtractor - 元數據提取器
 *
 * 職責:
 * - 提取頁面標題 (Title)
 * - 提取頁面作者 (Author)
 * - 提取頁面描述 (Description)
 * - 提取 Favicon / Site Icon
 * - 提取封面圖 (Featured Image)
 * - 整合 Readability 解析結果與頁面 Meta 標籤
 */
import { FAVICON_SELECTORS } from '../../config/selectors.js';

/**
 * 封面圖選擇器（按優先級排序）
 */
const FEATURED_IMAGE_SELECTORS = [
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

/**
 * 作者頭像/Logo 關鍵字（用於過濾）
 */
const AVATAR_KEYWORDS = [
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

/**
 * Site Icon 選擇器配置
 */
const SITE_ICON_SELECTORS = [
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

class MetadataExtractor {
  /**
   * 提取頁面元數據（完整版本）
   * @param {Document} doc - DOM Document 對象
   * @param {Object} [readabilityArticle] - Readability 解析結果 (可選)
   * @returns {Object} 元數據對象
   */
  static extract(doc, readabilityArticle = null) {
    return {
      title: MetadataExtractor.extractTitle(doc, readabilityArticle),
      url: doc.location ? doc.location.href : '',
      author: MetadataExtractor.extractAuthor(doc, readabilityArticle),
      description: MetadataExtractor.extractDescription(doc, readabilityArticle),
      favicon: MetadataExtractor.extractFavicon(doc),
      siteIcon: MetadataExtractor.extractSiteIcon(doc),
      featuredImage: MetadataExtractor.extractFeaturedImage(doc),
    };
  }

  /**
   * 提取標題
   * 優先級: Readability.title > document.title > 'Untitled Page'
   */
  static extractTitle(doc, readabilityArticle) {
    if (readabilityArticle?.title && typeof readabilityArticle.title === 'string') {
      return readabilityArticle.title;
    }
    return doc.title || 'Untitled Page';
  }

  /**
   * 提取作者
   * 優先級: Readability.byline > meta[name="author"] > meta[property="article:author"]
   */
  static extractAuthor(doc, readabilityArticle) {
    if (readabilityArticle?.byline) {
      return readabilityArticle.byline;
    }

    const authorMeta =
      doc.querySelector('meta[name="author"]') ||
      doc.querySelector('meta[property="article:author"]') ||
      doc.querySelector('meta[name="twitter:creator"]');

    return authorMeta ? authorMeta.getAttribute('content') : null;
  }

  /**
   * 提取描述
   * 優先級: Readability.excerpt > meta[name="description"] > meta[property="og:description"]
   */
  static extractDescription(doc, readabilityArticle) {
    if (readabilityArticle?.excerpt) {
      return readabilityArticle.excerpt;
    }

    const descMeta =
      doc.querySelector('meta[name="description"]') ||
      doc.querySelector('meta[property="og:description"]') ||
      doc.querySelector('meta[name="twitter:description"]');

    return descMeta ? descMeta.getAttribute('content') : null;
  }

  /**
   * 提取 Favicon（簡單版本）
   */
  static extractFavicon(doc) {
    const selectors = FAVICON_SELECTORS;

    for (const selector of selectors) {
      const link = doc.querySelector(selector);
      if (link?.href) {
        return link.href;
      }
    }

    if (doc.location) {
      return new URL('/favicon.ico', doc.location.origin).href;
    }
    return null;
  }

  /**
   * 提取網站 Icon（智能版本，帶評分選擇）
   * @param {Document} doc - DOM Document 對象
   * @returns {string|null} 最佳 icon URL
   */
  static extractSiteIcon(doc) {
    const candidates = [];

    for (const { selector, attr, priority, iconType } of SITE_ICON_SELECTORS) {
      try {
        const elements = doc.querySelectorAll(selector);
        for (const element of elements) {
          const iconUrl = element.getAttribute(attr);
          if (iconUrl?.trim() && !iconUrl.startsWith('data:')) {
            try {
              const absoluteUrl = new URL(iconUrl, doc.baseURI).href;
              const sizes = element.getAttribute('sizes') || '';
              const type = element.getAttribute('type') || '';
              const size = MetadataExtractor.parseSizeString(sizes);

              candidates.push({
                url: absoluteUrl,
                priority,
                size,
                type,
                iconType,
                sizes,
                selector,
              });
            } catch {
              // 忽略無效 URL
            }
          }
        }
      } catch {
        // 忽略選擇器錯誤
      }
    }

    if (candidates.length > 0) {
      const bestIcon = MetadataExtractor.selectBestIcon(candidates);
      if (bestIcon) {
        return bestIcon.url;
      }
    }

    // 回退到默認 favicon.ico
    try {
      return new URL('/favicon.ico', doc.baseURI).href;
    } catch {
      return null;
    }
  }

  /**
   * 提取封面圖/特色圖片
   * @param {Document} doc - DOM Document 對象
   * @returns {string|null} 封面圖 URL
   */
  static extractFeaturedImage(doc) {
    for (const selector of FEATURED_IMAGE_SELECTORS) {
      try {
        const img = doc.querySelector(selector);
        if (img && !MetadataExtractor.isAvatarImage(img)) {
          const src = MetadataExtractor.extractImageSrc(img);
          if (src) {
            try {
              const absoluteUrl = new URL(src, doc.baseURI).href;
              if (MetadataExtractor.isValidImageUrl(absoluteUrl)) {
                return absoluteUrl;
              }
            } catch {
              // 忽略無效 URL
            }
          }
        }
      } catch {
        // 忽略選擇器錯誤
      }
    }
    return null;
  }

  /**
   * 檢查圖片是否為作者頭像/Logo
   * @param {HTMLImageElement} img - 圖片元素
   * @returns {boolean} 是否為頭像
   */
  static isAvatarImage(img) {
    const imgClass = (img.className || '').toLowerCase();
    const imgId = (img.id || '').toLowerCase();
    const imgAlt = (img.alt || '').toLowerCase();

    // 檢查圖片本身的屬性
    for (const keyword of AVATAR_KEYWORDS) {
      if (imgClass.includes(keyword) || imgId.includes(keyword) || imgAlt.includes(keyword)) {
        return true;
      }
    }

    // 檢查父元素（向上最多 3 層）
    let parent = img.parentElement;
    for (let level = 0; level < 3 && parent; level++) {
      const parentClass = (parent.className || '').toLowerCase();
      const parentId = (parent.id || '').toLowerCase();

      for (const keyword of AVATAR_KEYWORDS) {
        if (parentClass.includes(keyword) || parentId.includes(keyword)) {
          return true;
        }
      }
      parent = parent.parentElement;
    }

    // 檢查尺寸（頭像通常 < 200x200）
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;

    return width > 0 && height > 0 && width < 200 && height < 200;
  }

  /**
   * 提取圖片 src（支持懶加載屬性）
   * @param {HTMLImageElement} img - 圖片元素
   * @returns {string|null} 圖片 URL
   */
  static extractImageSrc(img) {
    const srcAttributes = [
      'src',
      'data-src',
      'data-lazy-src',
      'data-original',
      'data-lazy',
      'data-url',
      'data-image',
    ];

    for (const attr of srcAttributes) {
      const value = img.getAttribute(attr);
      if (value?.trim() && !value.startsWith('data:')) {
        return value.trim();
      }
    }

    // 檢查 picture 元素
    const picture = img.closest('picture');
    if (picture) {
      const source = picture.querySelector('source');
      if (source) {
        const srcset = source.getAttribute('srcset') || source.getAttribute('data-srcset');
        if (srcset) {
          const urls = srcset.split(',').map(str => str.trim().split(' ')[0]);
          if (urls.length > 0 && !urls[0].startsWith('data:')) {
            return urls[0];
          }
        }
      }
    }

    return null;
  }

  /**
   * 驗證圖片 URL 是否有效
   * @param {string} url - 圖片 URL
   * @returns {boolean} 是否有效
   */
  static isValidImageUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * 解析尺寸字符串（如 "180x180"）
   * @param {string} sizeStr - 尺寸字符串
   * @returns {number} 尺寸數值
   */
  static parseSizeString(sizeStr) {
    if (!sizeStr || !sizeStr.trim()) {
      return 0;
    }

    // 處理 "any" 格式（通常是 SVG）
    if (sizeStr.toLowerCase() === 'any') {
      return 999;
    }

    // 處理 "180x180" 格式
    const match = sizeStr.match(/(\d+)x(\d+)/i);
    if (match) {
      return parseInt(match[1]);
    }

    // 處理只有數字的情況
    const numMatch = sizeStr.match(/\d+/);
    if (numMatch) {
      return parseInt(numMatch[0]);
    }

    return 0;
  }

  /**
   * 從候選 icons 中智能選擇最佳的
   * @param {Array} candidates - 候選 icon 列表
   * @returns {Object|null} 最佳 icon
   */
  static selectBestIcon(candidates) {
    if (candidates.length === 0) {
      return null;
    }
    if (candidates.length === 1) {
      return candidates[0];
    }

    const scored = candidates.map(icon => {
      let score = 0;
      const url = icon.url.toLowerCase();

      // 格式評分
      if (url.endsWith('.svg') || url.includes('image/svg') || icon.type.includes('svg')) {
        score += 1000; // SVG 矢量圖
      } else if (url.endsWith('.png') || icon.type.includes('png')) {
        score += 500;
      } else if (url.endsWith('.ico') || icon.type.includes('ico')) {
        score += 100;
      } else if (url.endsWith('.jpg') || url.endsWith('.jpeg') || icon.type.includes('jpeg')) {
        score += 200;
      }

      // 尺寸評分
      const size = icon.size || 0;
      if (size === 999) {
        score += 500; // SVG "any"
      } else if (size >= 180 && size <= 256) {
        score += 300; // 理想尺寸
      } else if (size > 256) {
        score += 200;
      } else if (size >= 120) {
        score += 100;
      } else if (size > 0) {
        score += 50;
      }

      // 類型評分
      if (icon.iconType === 'apple-touch') {
        score += 50;
      }

      // 優先級評分
      score += (10 - icon.priority) * 10;

      return { ...icon, score };
    });

    scored.sort((iconA, iconB) => iconB.score - iconA.score);
    return scored[0];
  }
}

const metadataExtractor = new MetadataExtractor();

export {
  MetadataExtractor,
  metadataExtractor,
  FEATURED_IMAGE_SELECTORS,
  AVATAR_KEYWORDS,
  SITE_ICON_SELECTORS,
};
