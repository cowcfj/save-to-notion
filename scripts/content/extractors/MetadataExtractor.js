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
import {
  FAVICON_SELECTORS,
  FEATURED_IMAGE_SELECTORS,
  SITE_ICON_SELECTORS,
  AVATAR_KEYWORDS,
  AVATAR_ANCESTOR_SCAN_DEPTH,
  AVATAR_MAX_DIMENSION,
  IMAGE_SRC_ATTRIBUTES,
  ICON_SIZE_SCALABLE_SENTINEL,
  ICON_SCORE,
} from '../../config/shared/content.js';
import { UI_MESSAGES } from '../../config/shared/messages.js';
import { isTitleConsistent } from '../../utils/contentUtils.js';

const AUTHOR_META_SELECTORS = [
  'meta[name="author"]',
  'meta[property="article:author"]',
  'meta[name="twitter:creator"]',
];

const DESCRIPTION_META_SELECTORS = [
  'meta[name="description"]',
  'meta[property="og:description"]',
  'meta[name="twitter:description"]',
];

const normalizeReadabilityTitleCandidate = readabilityArticle => {
  const title = readabilityArticle?.title;
  return typeof title === 'string' && title ? title : null;
};

const extractFirstMetaContent = (doc, selectors) => {
  for (const selector of selectors) {
    const meta = doc.querySelector(selector);
    const content = meta?.getAttribute('content');
    if (content) {
      return content;
    }
  }
  return null;
};

const extractDirectImageSrcAttribute = img => {
  for (const attr of IMAGE_SRC_ATTRIBUTES) {
    const value = img.getAttribute(attr);
    if (value?.trim() && !value.startsWith('data:')) {
      return value.trim();
    }
  }
  return null;
};

const selectFirstValidImageCandidate = candidates => {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && !value.startsWith('data:')) {
      return value;
    }
  }
  return null;
};

const parseSrcsetCandidates = srcset => srcset.split(/,\s+/).map(str => str.trim().split(' ')[0]);

const extractSourceCandidate = source => {
  const srcset = source.getAttribute('srcset') || source.dataset.srcset;
  if (srcset) {
    return selectFirstValidImageCandidate(parseSrcsetCandidates(srcset));
  }
  const src = source.getAttribute('src') || source.dataset.src;
  return selectFirstValidImageCandidate([src]);
};

const extractPictureSourceCandidate = img => {
  const sources = img.closest('picture')?.querySelectorAll('source');
  if (!sources?.length) {
    return null;
  }

  for (const source of sources) {
    const candidate = extractSourceCandidate(source);
    if (candidate) {
      return candidate;
    }
  }
  return null;
};

const normalizeIconFormatUrl = url => {
  if (typeof url !== 'string') {
    return '';
  }
  try {
    return new URL(url, 'https://example.invalid').pathname.toLowerCase();
  } catch {
    return url.split(/[?#]/)[0].toLowerCase();
  }
};

const ICON_FORMAT_SCORE_RULES = [
  {
    score: ICON_SCORE.SVG_FORMAT,
    urlChecks: [url => url.endsWith('.svg'), url => url.includes('image/svg')],
    typeChecks: [type => type && type.includes('svg')],
  },
  {
    score: ICON_SCORE.PNG_FORMAT,
    urlChecks: [url => url.endsWith('.png')],
    typeChecks: [type => type && type.includes('png')],
  },
  {
    score: ICON_SCORE.ICO_FORMAT,
    urlChecks: [url => url.endsWith('.ico')],
    typeChecks: [type => type && type.includes('ico')],
  },
  {
    score: ICON_SCORE.JPEG_FORMAT,
    urlChecks: [url => url.endsWith('.jpg'), url => url.endsWith('.jpeg')],
    typeChecks: [type => type && type.includes('jpeg')],
  },
];

const ICON_SIZE_SCORE_RULES = [
  {
    score: ICON_SCORE.SCALABLE_SIZE,
    matches: size => size === ICON_SIZE_SCALABLE_SENTINEL,
  },
  {
    score: ICON_SCORE.IDEAL_SIZE,
    matches: size => size >= 180 && size <= 256,
  },
  {
    score: ICON_SCORE.LARGE_SIZE,
    matches: size => size > 256,
  },
  {
    score: ICON_SCORE.MEDIUM_SIZE,
    matches: size => size >= 120,
  },
  {
    score: ICON_SCORE.SMALL_SIZE,
    matches: size => size > 0,
  },
];

const matchesIconFormatRule = (icon, rule) => {
  if (rule.urlChecks.some(checkUrl => checkUrl(icon.url))) {
    return true;
  }
  return rule.typeChecks.some(checkType => checkType(icon.type));
};

const resolveIconFormatScore = icon => {
  const rule = ICON_FORMAT_SCORE_RULES.find(formatRule => matchesIconFormatRule(icon, formatRule));
  return rule ? rule.score : 0;
};

const resolveIconSizeScore = size => {
  const rule = ICON_SIZE_SCORE_RULES.find(sizeRule => sizeRule.matches(size));
  return rule ? rule.score : 0;
};

const resolveIconTypeScore = icon => {
  if (icon.iconType === 'apple-touch') {
    return ICON_SCORE.APPLE_TOUCH_TYPE;
  }
  return 0;
};

const resolveIconPriorityScore = icon =>
  (ICON_SCORE.MAX_PRIORITY_BASE - icon.priority) * ICON_SCORE.PRIORITY_MULTIPLIER;

const MetadataExtractor = {
  /**
   * 提取頁面元數據（完整版本）
   *
   * @param {Document} doc - DOM Document 對象
   * @param {object} [readabilityArticle] - Readability 解析結果 (可選)
   * @returns {object} 元數據對象
   */
  extract(doc, readabilityArticle = null) {
    return {
      title: MetadataExtractor.extractTitle(doc, readabilityArticle),
      url: doc.location ? doc.location.href : '',
      author: MetadataExtractor.extractAuthor(doc, readabilityArticle),
      description: MetadataExtractor.extractDescription(doc, readabilityArticle),
      favicon: MetadataExtractor.extractFavicon(doc),
      siteIcon: MetadataExtractor.extractSiteIcon(doc),
      featuredImage: MetadataExtractor.extractFeaturedImage(doc),
    };
  },
  /**
   * 提取標題
   * 優先級: Readability.title > document.title > 未命名頁面
   *
   * @param {Document} doc - DOM Document 對象
   * @param {object} [readabilityArticle] - Readability 解析結果
   * @returns {string} 頁面標題
   */
  extractTitle(doc, readabilityArticle) {
    const docTitle = doc.title || '';
    const readabilityTitle = normalizeReadabilityTitleCandidate(readabilityArticle);

    if (!readabilityTitle) {
      return docTitle || UI_MESSAGES.DATA_SOURCE.UNTITLED_PAGE;
    }
    if (isTitleConsistent(readabilityTitle, docTitle)) {
      return readabilityTitle;
    }
    return docTitle || UI_MESSAGES.DATA_SOURCE.UNTITLED_PAGE;
  },

  /**
   * 提取作者
   * 優先級: Readability.byline > meta[name="author"] > meta[property="article:author"]
   *
   * @param {Document} doc - DOM Document 對象
   * @param {object} [readabilityArticle] - Readability 解析結果
   * @returns {string|null} 作者名稱或 null
   */
  extractAuthor(doc, readabilityArticle) {
    if (readabilityArticle?.byline) {
      return readabilityArticle.byline;
    }

    return extractFirstMetaContent(doc, AUTHOR_META_SELECTORS);
  },

  /**
   * 提取描述
   * 優先級: Readability.excerpt > meta[name="description"] > meta[property="og:description"]
   *
   * @param {Document} doc - DOM Document 對象
   * @param {object} [readabilityArticle] - Readability 解析結果
   * @returns {string|null} 頁面描述或 null
   */
  extractDescription(doc, readabilityArticle) {
    if (readabilityArticle?.excerpt) {
      return readabilityArticle.excerpt;
    }

    return extractFirstMetaContent(doc, DESCRIPTION_META_SELECTORS);
  },

  /**
   * 提取 Favicon（簡單版本）
   *
   * @param {Document} doc - DOM Document 對象
   * @returns {string|null} Favicon URL
   */
  extractFavicon(doc) {
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
  },

  /**
   * 提取網站 Icon（智能版本，帶評分選擇）
   *
   * @param {Document} doc - DOM Document 對象
   * @returns {string|null} 最佳 icon URL
   */
  extractSiteIcon(doc) {
    const candidates = this._collectSiteIconCandidates(doc);

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
  },

  /**
   * 提取封面圖/特色圖片
   *
   * @param {Document} doc - DOM Document 對象
   * @returns {string|null} 封面圖 URL
   */
  extractFeaturedImage(doc) {
    for (const selector of FEATURED_IMAGE_SELECTORS) {
      const imageUrl = this._tryExtractImageFromSelector(doc, selector);
      if (imageUrl) {
        return imageUrl;
      }
    }
    return null;
  },

  /**
   * 嘗試從選擇器提取有效的圖片 URL
   *
   * @param {Document} doc
   * @param {string} selector
   * @returns {string|null}
   */
  _tryExtractImageFromSelector(doc, selector) {
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
    return null;
  },

  _elementIdentityContainsAvatarKeyword(element, attributes) {
    const identityValues = attributes.map(attr => (element[attr] || '').toLowerCase());
    return AVATAR_KEYWORDS.some(keyword =>
      identityValues.some(identityValue => identityValue.includes(keyword))
    );
  },

  hasAvatarKeywordInImageIdentity(img) {
    return MetadataExtractor._elementIdentityContainsAvatarKeyword(img, ['className', 'id', 'alt']);
  },

  hasAvatarKeywordInAncestorIdentity(img) {
    let parent = img.parentElement;
    for (let level = 0; level < AVATAR_ANCESTOR_SCAN_DEPTH && parent; level++) {
      if (MetadataExtractor._elementIdentityContainsAvatarKeyword(parent, ['className', 'id'])) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  },

  isSmallAvatarLikeImage(img) {
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    const hasResolvedSize = width > 0 && height > 0;
    if (!hasResolvedSize) {
      return false;
    }
    return width < AVATAR_MAX_DIMENSION && height < AVATAR_MAX_DIMENSION;
  },

  /**
   * 檢查圖片是否為作者頭像/Logo
   *
   * @param {HTMLImageElement} img - 圖片元素
   * @returns {boolean} 是否為頭像
   */
  isAvatarImage(img) {
    if (!img) {
      return false;
    }

    return [
      MetadataExtractor.hasAvatarKeywordInImageIdentity(img),
      MetadataExtractor.hasAvatarKeywordInAncestorIdentity(img),
      MetadataExtractor.isSmallAvatarLikeImage(img),
    ].some(Boolean);
  },

  /**
   * 提取圖片 src（支持懶加載屬性）
   *
   * @param {HTMLImageElement} img - 圖片元素
   * @returns {string|null} 圖片 URL
   */
  extractImageSrc(img) {
    return extractDirectImageSrcAttribute(img) || extractPictureSourceCandidate(img);
  },

  /**
   * 驗證圖片 URL 是否有效
   *
   * @param {string} url - 圖片 URL
   * @returns {boolean} 是否有效
   */
  isValidImageUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  },

  /**
   * 解析尺寸字符串（如 "180x180"）
   *
   * @param {string} sizeStr - 尺寸字符串
   * @returns {number} 尺寸數值
   */
  parseSizeString(sizeStr) {
    if (!sizeStr?.trim()) {
      return 0;
    }

    const trimmed = sizeStr.trim();

    // 處理 "any" 格式（通常是 SVG）
    if (trimmed.toLowerCase() === 'any') {
      return ICON_SIZE_SCALABLE_SENTINEL;
    }

    // 處理 "180x180" 格式
    // 使用錨點 ^ 並移除不必要的捕獲組，避免回溯攻擊
    const match = /^(\d+)x\d+/i.exec(trimmed);
    if (match) {
      return Number.parseInt(match[1]);
    }

    // 處理只有數字的情況
    const numMatch = /^\d+/.exec(trimmed);
    if (numMatch) {
      return Number.parseInt(numMatch[0]);
    }

    return 0;
  },

  /**
   * 從候選 icons 中智能選擇最佳的
   *
   * @param {Array} candidates - 候選 icon 列表
   * @returns {object|null} 最佳 icon
   */
  selectBestIcon(candidates) {
    if (candidates.length === 0) {
      return null;
    }
    if (candidates.length === 1) {
      return candidates[0];
    }

    const scored = candidates.map(icon => ({
      ...icon,
      score: this._calculateIconScore(icon),
    }));

    scored.sort((iconA, iconB) => iconB.score - iconA.score);
    return scored[0];
  },

  /**
   * 收集站點圖標候選者
   *
   * @param {Document} doc
   * @returns {Array}
   */
  _collectSiteIconCandidates(doc) {
    const candidates = [];

    for (const iconSource of SITE_ICON_SELECTORS) {
      try {
        const elements = doc.querySelectorAll(iconSource.selector);
        for (const element of elements) {
          const candidate = this._buildSiteIconCandidate(element, doc, iconSource);
          if (candidate) {
            candidates.push(candidate);
          }
        }
      } catch {
        // 忽略選擇器錯誤
      }
    }

    return candidates;
  },

  /**
   * 處理單個圖標元素
   *
   * @param {Element} element - DOM 元素
   * @param {Document} doc - 文檔對象
   * @param {object} iconSource - 圖標來源配置
   * @returns {object|null} 處理後的圖標對象或 null
   */
  _buildSiteIconCandidate(element, doc, iconSource) {
    const iconUrl = element.getAttribute(iconSource.attr);
    if (!iconUrl?.trim() || iconUrl.startsWith('data:')) {
      return null;
    }

    try {
      const absoluteUrl = new URL(iconUrl, doc.baseURI).href;
      const sizes = element.getAttribute('sizes') || '';
      const type = element.getAttribute('type') || '';
      const size = MetadataExtractor.parseSizeString(sizes);

      return {
        url: absoluteUrl,
        priority: iconSource.priority,
        size,
        type,
        iconType: iconSource.iconType,
        sizes,
        selector: iconSource.selector,
      };
    } catch {
      return null;
    }
  },

  /**
   * 計算圖標分數
   *
   * @param {object} icon
   * @returns {number}
   */
  _calculateIconScore(icon) {
    const iconInput = icon || {};
    const normalizedIcon = {
      ...iconInput,
      url: normalizeIconFormatUrl(iconInput.url),
      type: typeof iconInput.type === 'string' ? iconInput.type.toLowerCase() : '',
    };
    const size = iconInput.size || 0;

    return (
      resolveIconFormatScore(normalizedIcon) +
      resolveIconSizeScore(size) +
      resolveIconTypeScore(normalizedIcon) +
      resolveIconPriorityScore(normalizedIcon)
    );
  },
};

export { MetadataExtractor };
