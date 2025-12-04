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
let pageComplexityDetector;
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
      result = await this.extractTechnicalContent(doc);
    }

    // 如果 Technical 策略失敗或未選擇，回退到 Readability
    if (!result) {
      result = await this.extractReadability(doc);
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
  async extractReadability(doc) {
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
  async extractTechnicalContent(doc) {
    Logger.log('🔧 Executing Technical/Markdown extraction...');

    const currentUrl = doc.location.href;

    // 策略 1: 嘗試獲取原始 Markdown (針對 GitHub Pages 等)
    // 這裡簡化實現，實際邏輯可從 htmlToNotionConverter.js 遷移
    if (currentUrl.includes('github.io') || currentUrl.includes('/docs/')) {
      // TODO: 實現 fetchRawMarkdown 邏輯
      // 暫時返回 null 讓其回退到 Readability 或 DOM 提取
    }

    // 策略 2: 提取特定 DOM 區域
    const techSelectors = ['.markdown-body', '.docs-content', '.documentation', 'article', 'main'];
    for (const selector of techSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        Logger.log(`✅ Found technical content container: ${selector}`);
        return {
          content: element.innerHTML, // 返回 HTML，由 MarkdownConverter 轉換
          type: 'html', // 標記為 HTML，但 ConverterFactory 會根據上下文選用 MarkdownConverter?
          // 不，如果這裡是 HTML，ConverterFactory 默認用 DomConverter。
          // 但如果是技術文檔，我們希望用 MarkdownConverter (Turndown)。
          // 所以這裡應該標記為 'markdown' (表示目標格式) 或者 'html-for-markdown'
          // 簡單起見，我們可以在 ConverterFactory 中增加邏輯，或者在這裡就調用 Turndown?
          // 根據架構，ContentExtractor 只負責提取。
          // 如果我們返回 HTML 但希望用 MarkdownConverter，我們需要一個標記。
          // 讓我們返回 type: 'html'，但在 metadata 或 debug 中標記 isTechnical?
          // 或者，ContentExtractor 可以直接返回 type: 'markdown' 如果它獲取了 MD，
          // 如果它獲取了 HTML 但認為適合轉 MD，可以返回 type: 'html-technical'。

          // 為了配合 ConverterFactory，我們約定：
          // 如果是技術文檔 HTML，我們返回 type: 'html'，但依靠 ConverterFactory 的智能判斷？
          // 不，ConverterFactory 根據 type 選擇。
          // 所以如果我們想用 MarkdownConverter，我們應該傳 'markdown' 給 ConverterFactory?
          // 但 MarkdownConverter.convertHtml 接受 HTML。
          // 所以我們可以返回 type: 'markdown' (意圖)，內容是 HTML?
          // 這有點混淆。
          // 讓我們保持簡單：如果提取的是 HTML，就返回 'html'。
          // 如果提取的是 Markdown 文本，就返回 'markdown'。
          // 對於技術文檔，如果我們提取了 HTML，我們可能希望用 DomConverter (通用) 或者 MarkdownConverter (Turndown)。
          // htmlToNotionConverter.js 傾向於用 Turndown 處理技術文檔。
          // 所以我們應該讓 ConverterFactory 知道這一點。
          // 暫時返回 'html'，後續在 index.js 中根據 complexity 決定傳給 ConverterFactory 的 type。
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
