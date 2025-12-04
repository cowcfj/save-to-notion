/**
 * ContentExtractor - 內容提取入口
 *
 * 職責:
 * - 協調內容提取流程
 * - 根據頁面類型選擇提取策略 (Readability vs Markdown/Technical)
 * - 整合 ReadabilityAdapter 和 MetadataExtractor
 * - 返回標準化的提取結果
 */

/* global Logger */

import { readabilityAdapter } from './ReadabilityAdapter.js';
import { metadataExtractor } from './MetadataExtractor.js';
// 假設 pageComplexityDetector 可用或已被打包
// 在測試環境中我們將 Mock 它
// 假設 pageComplexityDetector 可用或已被打包
// 在測試環境中我們將 Mock 它
let pageComplexityDetector = null;
try {
  pageComplexityDetector = require('../../utils/pageComplexityDetector');
} catch (_error) {
  // Fallback or mock for environment where require fails
  pageComplexityDetector = {
    detectPageComplexity: () => ({}),
    selectExtractor: () => ({ extractor: 'readability' }),
  };
}

class ContentExtractor {
  /**
   * 執行內容提取
   * @param {Document} doc - DOM Document
   * @param {Object} _options - 配置選項
   * @returns {Promise<Object>} 提取結果 { content, type, metadata, rawArticle }
   */
  async extract(doc, _options = {}) {
    Logger.log('🚀 Starting content extraction...');

    // 1. 檢測頁面複雜度與類型
    const complexity = pageComplexityDetector.detectPageComplexity(doc);
    const selection = pageComplexityDetector.selectExtractor(complexity);

    Logger.log(`📊 Page analysis: ${selection.extractor} (Confidence: ${selection.confidence}%)`);

    let result = null;

    // 2. 根據選擇的策略執行提取
    // 'extractus' 在這裡對應 Markdown/Technical 策略 (基於 pageComplexityDetector 的定義)
    if (selection.extractor === 'extractus') {
      result = ContentExtractor.extractTechnicalContent(doc);
    }

    // 如果 Technical 策略失敗或未選擇，回退到 Readability
    if (!result) {
      result = ContentExtractor.extractReadability(doc);
    }

    // 3. 提取元數據
    const metadata = metadataExtractor.extract(doc, result ? result.rawArticle : null);

    // 4. 組合最終結果
    return {
      content: result ? result.content : null,
      type: result ? result.type : 'html', // 'html' or 'markdown'
      metadata,
      rawArticle: result ? result.rawArticle : null,
      debug: {
        complexity,
        selection,
      },
    };
  }

  /**
   * 使用 Readability 提取內容
   */
  static extractReadability(doc) {
    Logger.log('📖 Executing Readability extraction...');

    // 使用 ReadabilityAdapter
    // 注意: ReadabilityAdapter 目前是同步的，但為了未來擴展保持 async 簽名
    const article = readabilityAdapter.parseArticleWithReadability(doc);

    if (readabilityAdapter.isContentGood(article)) {
      return {
        content: article.content,
        type: 'html',
        rawArticle: article,
      };
    }

    // 嘗試 Fallback
    Logger.warn('⚠️ Readability quality check failed, attempting fallbacks...');

    const cmsContent = readabilityAdapter.findContentCmsFallback();
    if (cmsContent) {
      Logger.log('✅ Using CMS fallback content');
      return { content: cmsContent, type: 'html', rawArticle: null };
    }

    const listContent = readabilityAdapter.extractLargestListFallback();
    if (listContent) {
      Logger.log('✅ Using List fallback content');
      return { content: listContent, type: 'html', rawArticle: null };
    }

    return null;
  }

  /**
   * 提取技術文檔/Markdown 內容
   * 嘗試獲取原始 Markdown 或提取特定 DOM 區域
   */
  static extractTechnicalContent(doc) {
    Logger.log('🔧 Executing Technical/Markdown extraction...');

    // 策略 2: 提取特定 DOM 區域
    const techSelectors = ['.markdown-body', '.docs-content', '.documentation', 'article', 'main'];
    for (const selector of techSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        Logger.log(`✅ Found technical content container: ${selector}`);
        return {
          content: element.innerHTML, // 返回 HTML，由 MarkdownConverter 轉換
          type: 'html',
          rawArticle: { title: doc.title, content: element.innerHTML },
        };
      }
    }

    return null;
  }
}

const contentExtractor = new ContentExtractor();

export { ContentExtractor, contentExtractor };
