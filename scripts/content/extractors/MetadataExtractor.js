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
} from '../../config/extraction.js';

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
   * 優先級: Readability.title > document.title > 'Untitled Page'
   *
   * @param {Document} doc - DOM Document 對象
   * @param {object} [readabilityArticle] - Readability 解析結果
   * @returns {string} 頁面標題
   */
  extractTitle(doc, readabilityArticle) {
    const docTitle = doc.title || '';
    const rTitle = readabilityArticle?.title;

    if (rTitle && typeof rTitle === 'string' && this._isTitleConsistent(rTitle, docTitle)) {
      return rTitle;
    }
    return docTitle || 'Untitled Page';
  },

  /**
   * 檢查標題是否一致
   *
   * @param {string} title - 候選標題 (來自 Readability)
   * @param {string} docTitle - 文檔標題 (來自 document.title)
   * @returns {boolean}
   */
  _isTitleConsistent(title, docTitle) {
    if (!title || !docTitle) {
      return true;
    }

    const cleanTitle = title.trim();
    const cleanDocTitle = docTitle.trim();

    // 標題太短容易誤殺，直接放行
    if (cleanTitle.length <= 4) {
      return true;
    }

    // 取前 15 個字元作為特徵值
    // 因為 document.title 常會有後綴 (e.g. " | HK01")
    const signature = cleanTitle.slice(0, 15);

    return cleanDocTitle.includes(signature);
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

    const authorMeta =
      doc.querySelector('meta[name="author"]') ||
      doc.querySelector('meta[property="article:author"]') ||
      doc.querySelector('meta[name="twitter:creator"]');

    return authorMeta ? authorMeta.getAttribute('content') : null;
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

    const descMeta =
      doc.querySelector('meta[name="description"]') ||
      doc.querySelector('meta[property="og:description"]') ||
      doc.querySelector('meta[name="twitter:description"]');

    return descMeta ? descMeta.getAttribute('content') : null;
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

  /**
   * 檢查圖片是否為作者頭像/Logo
   *
   * @param {HTMLImageElement} img - 圖片元素
   * @returns {boolean} 是否為頭像
   */
  isAvatarImage(img) {
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
  },

  /**
   * 提取圖片 src（支持懶加載屬性）
   *
   * @param {HTMLImageElement} img - 圖片元素
   * @returns {string|null} 圖片 URL
   */
  extractImageSrc(img) {
    const srcAttributes = IMAGE_SRC_ATTRIBUTES;

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
        const srcset = source.getAttribute('srcset') || source.dataset.srcset;
        if (srcset) {
          const urls = srcset.split(',').map(str => str.trim().split(' ')[0]);
          if (urls.length > 0 && !urls[0].startsWith('data:')) {
            return urls[0];
          }
        }
      }
    }

    return null;
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
   * 解析尺寸字符串（內部輔助）
   *
   * @param {string} sizeStr
   * @returns {number}
   */
  _parseAnySize(sizeStr) {
    if (sizeStr.toLowerCase() === 'any') {
      return 999;
    }
    return 0;
  },

  /**
   * 從候選 icons 中智能選擇最佳的
   *
   * @param {Array} candidates - 候選 icon 列表
   * @returns {object | null} 最佳 icon
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

    for (const { selector, attr, priority, iconType } of SITE_ICON_SELECTORS) {
      try {
        const elements = doc.querySelectorAll(selector);
        for (const element of elements) {
          const candidate = this._processIconElement(element, doc, attr, priority, iconType);
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
   * @param {string} attr - 屬性名
   * @param {number} priority - 優先級
   * @param {string} iconType - 圖標類型
   * @returns {object|null} 處理後的圖標對象或 null
   */
  _processIconElement(element, doc, attr, priority, iconType) {
    const iconUrl = element.getAttribute(attr);
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
        priority,
        size,
        type,
        iconType,
        sizes,
        selector: attr,
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

    return score;
  },
};

const metadataExtractor = MetadataExtractor;

export { MetadataExtractor, metadataExtractor };
