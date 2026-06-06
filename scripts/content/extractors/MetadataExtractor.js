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
  IMAGE_SRC_ATTRIBUTES,
} from '../../config/shared/content.js';
import { DATA_SOURCE_MESSAGES } from '../../config/messages/dataSourceMessages.js';
import { isTitleConsistent } from '../../utils/contentUtils.js';

const UNTITLED_PAGE_LABEL = DATA_SOURCE_MESSAGES.UNTITLED_PAGE;

const extractFirstMetaContent = (doc, ...selectors) => {
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
  return url.split(/[?#]/)[0].toLowerCase();
};

const ICON_FORMAT_SCORE_RULES = [
  { score: 1000, extensions: ['.svg'], urlNeedles: ['image/svg'], typeNeedle: 'svg' },
  { score: 500, extensions: ['.png'], urlNeedles: [], typeNeedle: 'png' },
  { score: 100, extensions: ['.ico'], urlNeedles: [], typeNeedle: 'ico' },
  { score: 200, extensions: ['.jpg', '.jpeg'], urlNeedles: [], typeNeedle: 'jpeg' },
];

const ICON_SIZE_SCORE_RULES = [
  { score: 500, min: 999, max: 999 },
  { score: 300, min: 180, max: 256 },
  { score: 200, min: 257, max: Infinity },
  { score: 100, min: 120, max: Infinity },
  { score: 50, min: 1, max: Infinity },
];

const ICON_TYPE_SCORE = {
  'apple-touch': 50,
};

const endsWithAny = (value, suffixes) => suffixes.some(suffix => value.endsWith(suffix));

const includesAny = (value, needles) => needles.some(needle => value.includes(needle));

const matchesIconFormatRule = (url, type, rule) =>
  [
    endsWithAny(url, rule.extensions),
    includesAny(url, rule.urlNeedles),
    type.includes(rule.typeNeedle),
  ].some(Boolean);

const matchesIconSizeRule = (size, rule) => [size >= rule.min, size <= rule.max].every(Boolean);

const resolveIconFormatScore = (url, type) =>
  ICON_FORMAT_SCORE_RULES.find(rule => matchesIconFormatRule(url, type, rule))?.score || 0;

const resolveIconSizeScore = size =>
  ICON_SIZE_SCORE_RULES.find(rule => matchesIconSizeRule(size, rule))?.score || 0;

const resolveIconTypeScore = iconType => ICON_TYPE_SCORE[iconType] || 0;

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
    const readabilityTitle = readabilityArticle?.title;

    if (typeof readabilityTitle !== 'string' || !readabilityTitle) {
      return docTitle || UNTITLED_PAGE_LABEL;
    }
    if (isTitleConsistent(readabilityTitle, docTitle)) {
      return readabilityTitle;
    }
    return docTitle || UNTITLED_PAGE_LABEL;
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

    return extractFirstMetaContent(
      doc,
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="twitter:creator"]'
    );
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

    return extractFirstMetaContent(
      doc,
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]'
    );
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
    for (let level = 0; level < 3 && parent; level++) {
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
    return width < 200 && height < 200;
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
      return 999;
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
    const url = normalizeIconFormatUrl(iconInput.url);
    const type = typeof iconInput.type === 'string' ? iconInput.type.toLowerCase() : '';
    const size = iconInput.size || 0;

    return (
      resolveIconFormatScore(url, type) +
      resolveIconSizeScore(size) +
      resolveIconTypeScore(iconInput.iconType) +
      (10 - iconInput.priority) * 10
    );
  },
};

export { MetadataExtractor };
