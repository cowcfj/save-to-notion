/**
 * PageContentService - 頁面內容提取服務
 *
 * 職責:
 * - 封裝頁面內容提取的注入邏輯
 * - 使用 dist/content.bundle.js 中的 extractPageContent
 * - 提供統一的內容提取接口給 background.js
 *
 * 架構:
 * PageContentService (Background)
 *   ↓ injects
 * dist/content.bundle.js → extractPageContent()
 *   ↓ returns
 * { title, blocks, siteIcon, coverImage }
 */

import Logger from '../../utils/Logger.js';

import { CONTENT_QUALITY } from '../../config/shared/content.js';

// 此服務通過 InjectionService 執行腳本注入，不直接調用 chrome API

/**
 * 頁面內容提取所需的腳本文件列表
 * 使用 Rollup 打包的 bundle，包含所有 Content Extractors
 */
const CONTENT_EXTRACTION_SCRIPTS = [
  // Content Script bundle（包含 ContentExtractor, ConverterFactory, Logger, ImageUtils 等）
  'dist/content.bundle.js',
];

async function extractPageContentInPage(defaultPageTitle) {
  /* eslint-disable unicorn/consistent-function-scoping -- chrome.scripting.executeScript 序列化限制：func 無法捕獲外部閉包，必須內聯定義 */
  // 此函數在頁面上下文中執行
  const PageLogger = globalThis.Logger || console;

  // Helper: 建立 fallback paragraph block
  function buildParagraphBlock(message) {
    return {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: message },
          },
        ],
      },
    };
  }

  // Helper: 建立 failed / fallback result
  function buildPageFallbackResult(titleFallback, message) {
    return {
      extractionStatus: 'failed',
      title: document.title || titleFallback,
      blocks: [buildParagraphBlock(message)],
      siteIcon: null,
      coverImage: null,
    };
  }

  // Helper: 標準化提取結果
  function normalizeExtractPageContentResult(extractResult, titleFallback) {
    const contentBlocks = extractResult.blocks || [];
    const imageBlocks = extractResult.additionalImages || [];
    const coverImage = extractResult.coverImage || null;

    return {
      extractionStatus: extractResult.extractionStatus || 'success',
      title: extractResult.title || document.title || titleFallback,
      blocks: [...contentBlocks, ...imageBlocks],
      siteIcon: extractResult.metadata?.siteIcon || extractResult.metadata?.favicon || null,
      coverImage,
    };
  }
  /* eslint-enable unicorn/consistent-function-scoping */

  try {
    PageLogger.log?.('[PageContentService] 調用 extractPageContent');

    // Guard: extractPageContent 不可用
    if (typeof globalThis.extractPageContent !== 'function') {
      PageLogger.warn?.('[PageContentService] extractPageContent 不可用');
      return buildPageFallbackResult(
        defaultPageTitle,
        'Content extraction: extractPageContent not available.'
      );
    }

    const extractResult = await globalThis.extractPageContent();
    const normalized = normalizeExtractPageContentResult(extractResult, defaultPageTitle);

    PageLogger.log?.('✅ [PageContentService] 提取成功', {
      contentBlocks: (extractResult.blocks || []).length,
      imageBlocks: (extractResult.additionalImages || []).length,
      hasCoverImage: Boolean(extractResult.coverImage),
    });

    return normalized;
  } catch (error) {
    PageLogger.error?.('[PageContentService] 提取失敗', { error });
    return buildPageFallbackResult(defaultPageTitle, `Extraction failed: ${error.message}`);
  }
}

/**
 * PageContentService 類
 */
class PageContentService {
  /**
   * @param {object} options - 配置選項
   * @param {object} options.injectionService - InjectionService 實例
   * @param {object} options.logger - 日誌對象
   */
  constructor(options = {}) {
    this.injectionService = options.injectionService;
    this.logger = options.logger || Logger;
  }

  /**
   * 提取頁面內容並轉換為 Notion blocks
   *
   * @param {number} tabId - 目標標籤頁 ID
   * @param {object} _options - 提取選項（保留供未來使用）
   * @returns {Promise<{title: string, blocks: Array, siteIcon: string|null, coverImage: string|null}>}
   */
  async extractContent(tabId, _options = {}) {
    this.logger.start?.('[PageContentService] 開始提取頁面內容', { tabId });

    if (!this.injectionService) {
      throw new Error('InjectionService is required for PageContentService');
    }

    try {
      // 注入 bundle 並執行提取
      const result = await this.injectionService.injectWithResponse(
        tabId,
        extractPageContentInPage,
        CONTENT_EXTRACTION_SCRIPTS,
        [CONTENT_QUALITY.DEFAULT_PAGE_TITLE]
      );

      // 處理注入結果
      return this._handleExtractionResult(result);
    } catch (error) {
      this.logger.error?.('[PageContentService] 注入失敗', { error });
      throw error;
    }
  }

  /**
   * 判斷結果是否為完整有效的提取結構
   *
   * @param {object} result - 提取結果
   * @param {string} status - 期望的 extractionStatus ('success' 或 'failed')
   * @returns {boolean}
   * @private
   */
  _isCompleteExtractionResult(result, status) {
    return result?.extractionStatus === status && result?.title && Array.isArray(result?.blocks);
  }

  /**
   * 建立無效提取結果的回退結構
   *
   * @returns {object}
   * @private
   */
  _buildInvalidExtractionResult() {
    return {
      extractionStatus: 'failed',
      title: CONTENT_QUALITY.DEFAULT_PAGE_TITLE,
      blocks: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: 'Invalid extraction result.' } }],
          },
        },
      ],
      siteIcon: null,
      coverImage: null,
    };
  }

  /**
   * 處理提取結果，處理 Logging 副作用並返回最終格式
   *
   * @param {object} result - 注入腳本返回的結果
   * @returns {object}
   * @private
   */
  _handleExtractionResult(result) {
    // 1. 失敗但完整的結果
    if (this._isCompleteExtractionResult(result, 'failed')) {
      this.logger.warn?.('[PageContentService] 提取失敗結果已返回', {
        title: result.title,
        blockCount: result.blocks.length,
        error: result.error || null,
      });
      return result;
    }

    // 2. 成功的結果
    if (this._isCompleteExtractionResult(result, 'success')) {
      this.logger.success?.('[PageContentService] 提取成功', {
        title: result.title,
        blockCount: result.blocks.length,
        hasSiteIcon: Boolean(result.siteIcon),
        hasCoverImage: Boolean(result.coverImage),
      });
      return result;
    }

    // 3. 無效的結果
    this.logger.warn?.('[PageContentService] 提取結果無效', {
      resultKeys: Object.keys(result || {}),
    });
    return this._buildInvalidExtractionResult();
  }

  /**
   * 獲取內容提取所需的腳本列表
   *
   * @returns {string[]}
   */
  static getRequiredScripts() {
    return [...CONTENT_EXTRACTION_SCRIPTS];
  }
}

// 導出
export { PageContentService, CONTENT_EXTRACTION_SCRIPTS };
