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
import { LOG_ICONS, CONTENT_QUALITY } from '../../config/constants.js';

// 此服務通過 InjectionService 執行腳本注入，不直接調用 chrome API

/**
 * 頁面內容提取所需的腳本文件列表
 * 使用 Rollup 打包的 bundle，包含所有 Content Extractors
 */
const CONTENT_EXTRACTION_SCRIPTS = [
  // 基礎依賴
  'lib/Readability.js',
  // Content Script bundle（包含 ContentExtractor, ConverterFactory, Logger, ImageUtils 等）
  'dist/content.bundle.js',
];

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
        async defaultPageTitle => {
          // 此函數在頁面上下文中執行
          const PageLogger = globalThis.Logger || console;

          try {
            PageLogger.log?.('[PageContentService] 調用 extractPageContent');

            // 使用 content.bundle.js 暴露的 extractPageContent
            if (typeof globalThis.extractPageContent === 'function') {
              const extractResult = await globalThis.extractPageContent();

              const contentBlocks = extractResult.blocks || [];
              const imageBlocks = extractResult.additionalImages || [];
              const coverImage = extractResult.coverImage || null;

              PageLogger.log?.('✅ [PageContentService] 提取成功', {
                contentBlocks: contentBlocks.length,
                imageBlocks: imageBlocks.length,
                hasCoverImage: Boolean(coverImage),
              });

              // 適配返回格式：添加 siteIcon 和 coverImage
              return {
                title: extractResult.title || document.title || defaultPageTitle,
                blocks: [...contentBlocks, ...imageBlocks],
                siteIcon:
                  extractResult.metadata?.siteIcon || extractResult.metadata?.favicon || null,
                coverImage, // 封面圖片 URL（供 Notion cover 使用）
              };
            }

            // Fallback: 基本提取
            PageLogger.warn?.('[PageContentService] extractPageContent 不可用');
            return {
              title: document.title || defaultPageTitle,
              blocks: [
                {
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [
                      {
                        type: 'text',
                        text: { content: 'Content extraction: extractPageContent not available.' },
                      },
                    ],
                  },
                },
              ],
              siteIcon: null,
              coverImage: null,
            };
          } catch (error) {
            PageLogger.error?.('[PageContentService] 提取失敗', { error });
            return {
              title: document.title || defaultPageTitle,
              blocks: [
                {
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [
                      {
                        type: 'text',
                        text: { content: `Extraction failed: ${error.message}` },
                      },
                    ],
                  },
                },
              ],
              siteIcon: null,
              coverImage: null,
            };
          }
        },
        CONTENT_EXTRACTION_SCRIPTS,
        [CONTENT_QUALITY.DEFAULT_PAGE_TITLE]
      );

      // 處理注入結果
      // 注意：injectWithResponse 已經解包了 results[0].result，直接返回函數執行結果
      if (result?.title && result?.blocks) {
        this.logger.info?.(`${LOG_ICONS.SUCCESS} [PageContentService] 提取成功`, {
          title: result.title,
          blockCount: result.blocks.length,
          hasSiteIcon: Boolean(result.siteIcon),
        });
        return result;
      }

      // 結果無效
      this.logger.warn?.(`${LOG_ICONS.WARN} [PageContentService] 提取結果無效`, {
        resultKeys: Object.keys(result || {}),
      });
      return {
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
    } catch (error) {
      this.logger.error?.(`${LOG_ICONS.ERROR} [PageContentService] 注入失敗`, { error });
      throw error;
    }
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
