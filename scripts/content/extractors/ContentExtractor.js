/**
 * ContentExtractor - 內容提取入口
 *
 * 職責:
 * - 協調內容提取流程
 * - 根據頁面類型選擇提取策略 (Readability vs Markdown/Technical)
 * - 整合 ReadabilityAdapter 和 MetadataExtractor
 * - 返回標準化的提取結果
 */

import Logger from '../../utils/Logger.js';
import {
  parseArticleWithReadability,
  isContentGood,
  findContentCmsFallback,
  extractLargestListFallback,
} from './ReadabilityAdapter.js';
import { MetadataExtractor } from './MetadataExtractor.js';
import { MarkdownExtractor } from './MarkdownExtractor.js';

import { detectPageComplexity, selectExtractor } from '../../utils/pageComplexityDetector.js';

class ContentExtractor {
  /**
   * 執行內容提取
   * @param {Document} doc - DOM Document
   * @returns {Object} 提取結果 { content, type, metadata, rawArticle }
   */
  static extract(doc) {
    Logger.log('開始內容提取', { action: 'extract' });

    // 1. 檢測頁面複雜度與類型
    const complexity = detectPageComplexity(doc);
    const selection = selectExtractor(complexity);

    Logger.log('頁面分析結果', {
      action: 'extract',
      extractor: selection.extractor,
      confidence: `${selection.confidence}%`,
    });

    let result = null;

    // 2. 根據選擇的策略執行提取
    // 'markdown' 在這裡對應 Markdown/Technical 策略 (基於 pageComplexityDetector 的定義)
    if (selection.extractor === 'markdown') {
      result = ContentExtractor.extractTechnicalContent(doc);
    }

    // 如果 Technical 策略失敗或未選擇，回退到 Readability
    if (!result) {
      result = ContentExtractor.extractReadability(doc);
    }

    // 3. 提取元數據
    // 使用 MetadataExtractor 類靜態方法
    const metadata = MetadataExtractor.extract(doc, result ? result.rawArticle : null);

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
    Logger.log('執行 Readability 提取', { action: 'extractReadability' });

    // 使用 ReadabilityAdapter (包裝在 try-catch 中以確保 fallback 可以執行)
    let article = null;
    try {
      article = parseArticleWithReadability(doc);
    } catch (readabilityError) {
      Logger.warn('Readability 解析失敗', {
        action: 'extractReadability',
        error: readabilityError.message,
      });
      // 繼續執行 fallback 邏輯
    }

    if (article && isContentGood(article)) {
      return {
        content: article.content,
        type: 'html',
        rawArticle: article,
      };
    }

    // 嘗試 Fallback
    Logger.warn('Readability 質量檢查失敗，嘗試備案程序', { action: 'extractReadability' });

    const cmsContent = findContentCmsFallback();
    if (cmsContent) {
      Logger.log('利用 CMS 備案內容', { action: 'extractReadability' });
      return { content: cmsContent, type: 'html', rawArticle: null };
    }

    const listContent = extractLargestListFallback();
    if (listContent) {
      Logger.log('利用列表備案內容', { action: 'extractReadability' });
      return { content: listContent, type: 'html', rawArticle: null };
    }

    return null;
  }

  /**
   * 提取技術文檔/Markdown 內容
   * 委託給 MarkdownExtractor 處理 (支持 DOM 清洗和更精確的容器定位)
   */
  static extractTechnicalContent(doc) {
    return MarkdownExtractor.extract(doc);
  }
}

export { ContentExtractor };
