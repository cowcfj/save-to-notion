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
import { NextJsExtractor } from './NextJsExtractor.js';
import { detectPageComplexity, selectExtractor } from '../../utils/pageComplexityDetector.js';

const ContentExtractor = {
  /**
   * 執行內容提取
   *
   * @param {Document} doc - DOM Document
   * @returns {object} 提取結果 { content, type, metadata, rawArticle, blocks? }
   *                   (blocks 為可選的預先提取 Notion 區塊)
   */
  extract(doc) {
    Logger.log('開始內容提取', { action: 'extract' });

    // 0. 優先檢查 Next.js 結構化數據
    try {
      if (NextJsExtractor.detect(doc)) {
        Logger.log('檢測到 Next.js 網站，嘗試結構化提取', { action: 'extract' });
        const nextResult = NextJsExtractor.extract(doc);
        if (nextResult) {
          // 合併 metadata: 先獲取基礎 metadata (favicon 等)，再用 Next.js 的 metadata 覆蓋
          const baseMetadata = MetadataExtractor.extract(doc, null);
          const nextMetadata = nextResult.metadata || {};
          const finalMetadata = { ...baseMetadata, ...nextMetadata };

          // 確保 byline 被映射到 author
          if (nextMetadata.byline) {
            finalMetadata.author = nextMetadata.byline;
          }

          return {
            content: nextResult.content, // HTML (可能為空)
            blocks: nextResult.blocks, // Notion Blocks
            type: nextResult.type, // 'nextjs'
            metadata: finalMetadata,
            rawArticle: nextResult.rawArticle,
            debug: {
              extractor: 'nextjs',
            },
          };
        }
        Logger.info('Next.js 結構化提取未返回有效結果，回退到標準流程', { action: 'extract' });
      }
    } catch (error) {
      Logger.warn('Next.js detection/extraction failed, falling back to standard extraction', {
        action: 'extract',
        error: error.message,
      });
    }

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
  },

  /**
   * 使用 Readability 提取內容
   *
   * @param {Document} doc - DOM Document
   * @returns {object|null} 提取結果
   */
  extractReadability(doc) {
    Logger.log('執行 Readability 提取', { action: 'extractReadability' });

    // 使用 ReadabilityAdapter (包裝在 try-catch 中以確保 fallback 可以執行)
    let article = null;
    try {
      article = parseArticleWithReadability(doc);
    } catch (readabilityError) {
      Logger.info('Readability 解析失敗，將嘗試備案程序', {
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
    Logger.info('Readability 質量檢查未通過，嘗試備案程序', { action: 'extractReadability' });

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
  },

  /**
   * 提取技術文檔/Markdown 內容
   * 委託給 MarkdownExtractor 處理 (支持 DOM 清洗和更精確的容器定位)
   *
   * @param {Document} doc - DOM Document
   * @returns {object|null} 提取結果
   */
  extractTechnicalContent(doc) {
    return MarkdownExtractor.extract(doc);
  },
};

export { ContentExtractor };
