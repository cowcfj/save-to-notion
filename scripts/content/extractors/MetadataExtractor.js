/**
 * MetadataExtractor - 元數據提取器
 *
 * 職責:
 * - 提取頁面標題 (Title)
 * - 提取頁面作者 (Author)
 * - 提取頁面描述 (Description)
 * - 提取 Favicon
 * - 整合 Readability 解析結果與頁面 Meta 標籤
 */
import { FAVICON_SELECTORS } from '../../config/selectors.js';
class MetadataExtractor {
  /**
   * 提取頁面元數據
   * @param {Document} doc - DOM Document 對象
   * @param {Object} [readabilityArticle] - Readability 解析結果 (可選)
   * @returns {Object} 元數據對象
   */
  /**
   * 提取頁面元數據
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
    };
  }

  /**
   * 提取標題
   * 優先級: Readability.title > document.title > 'Untitled Page'
   */
  // prettier-ignore
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
  // prettier-ignore
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
  // prettier-ignore
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
   * 提取 Favicon
   * 查找 link[rel="icon"] 等標籤
   */
  // prettier-ignore
  static extractFavicon(doc) {
    // 使用配置中的選擇器
    const selectors = FAVICON_SELECTORS;

    for (const selector of selectors) {
      const link = doc.querySelector(selector);
      if (link?.href) {
        return link.href;
      }
    }

    // Default fallback (relative to origin)
    if (doc.location) {
      return new URL('/favicon.ico', doc.location.origin).href;
    }
    return null;
  }
}

const metadataExtractor = new MetadataExtractor();

export { MetadataExtractor, metadataExtractor };
