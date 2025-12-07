/**
 * PageContentService - 頁面內容提取服務
 *
 * 職責:
 * - 封裝頁面內容提取的注入邏輯
 * - 整合 ContentExtractor, MetadataExtractor, ContentBridge
 * - 提供統一的內容提取接口給 background.js
 *
 * 架構:
 * PageContentService (Background)
 *   ↓ injects
 * ContentExtractor + ContentBridge (Content Script)
 *   ↓ returns
 * { title, blocks, siteIcon }
 */

// 此服務通過 InjectionService 執行腳本注入，不直接調用 chrome API

/**
 * 頁面內容提取所需的腳本文件列表
 */
const CONTENT_EXTRACTION_SCRIPTS = [
  'scripts/utils.js',
  'lib/Readability.js',
  'lib/turndown.js',
  'lib/turndown-plugin-gfm.js',
  'scripts/utils/htmlToNotionConverter.js',
  'scripts/performance/PerformanceOptimizer.js',
  'scripts/config/selectors.js',
  'scripts/utils/pageComplexityDetector.js',
  'scripts/content/extractors/MetadataExtractor.js',
  'scripts/content/extractors/ReadabilityAdapter.js',
  'scripts/content/extractors/ContentExtractor.js',
  'scripts/content/converters/ContentBridge.js',
];

/**
 * PageContentService 類
 */
class PageContentService {
  /**
   * @param {Object} options - 配置選項
   * @param {Object} options.injectionService - InjectionService 實例
   * @param {Object} options.logger - 日誌對象
   */
  constructor(options = {}) {
    this.injectionService = options.injectionService;
    this.logger = options.logger || console;
  }

  /**
   * 提取頁面內容並轉換為 Notion blocks
   *
   * @param {number} tabId - 目標標籤頁 ID
   * @param {Object} options - 提取選項
   * @param {boolean} options.includeFeaturedImage - 是否包含封面圖
   * @returns {Promise<{title: string, blocks: Array, siteIcon: string|null}>}
   */
  async extractContent(tabId, options = {}) {
    // _includeFeaturedImage 保留供未來版本使用，當前注入腳本內固定為 true
    const { includeFeaturedImage: _includeFeaturedImage = true } = options;

    this.logger.log?.('📄 [PageContentService] 開始提取頁面內容...');

    if (!this.injectionService) {
      throw new Error('InjectionService is required for PageContentService');
    }

    try {
      // 注入必要的腳本並執行提取
      const result = await this.injectionService.injectWithResponse(
        tabId,
        () => {
          // 這個函數在頁面上下文中執行，window 對象來自目標頁面
          const PageLogger = window.Logger || console;

          try {
            PageLogger.log?.('🚀 [PageContentService] 執行內容提取...');

            // 使用 ContentBridge 整合提取流程
            if (typeof window.extractAndBridge === 'function') {
              const bridgeResult = window.extractAndBridge(document, {
                includeFeaturedImage: true,
              });

              PageLogger.log?.(
                `✅ [PageContentService] 提取完成: ${bridgeResult.blocks?.length || 0} blocks`
              );

              return bridgeResult;
            }

            // Fallback: 使用 ContentExtractor + bridgeContentToBlocks
            if (
              typeof window.ContentExtractor?.extract === 'function' &&
              typeof window.bridgeContentToBlocks === 'function'
            ) {
              const extracted = window.ContentExtractor.extract(document);
              const fallbackResult = window.bridgeContentToBlocks(extracted, {
                includeFeaturedImage: true,
              });

              PageLogger.log?.(
                `✅ [PageContentService] Fallback 提取完成: ${fallbackResult.blocks?.length || 0} blocks`
              );

              return fallbackResult;
            }

            // 最終 Fallback: 返回基本結構
            PageLogger.warn?.(
              '⚠️ [PageContentService] Content extractors not available, using basic fallback'
            );

            return {
              title: document.title || 'Untitled',
              blocks: [
                {
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [
                      {
                        type: 'text',
                        text: {
                          content: 'Content extraction failed: Required scripts not loaded.',
                        },
                      },
                    ],
                  },
                },
              ],
              siteIcon: null,
            };
          } catch (error) {
            PageLogger.error?.('❌ [PageContentService] 內容提取失敗:', error);

            return {
              title: document.title || 'Untitled',
              blocks: [
                {
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [
                      {
                        type: 'text',
                        text: { content: `Content extraction failed: ${error.message}` },
                      },
                    ],
                  },
                },
              ],
              siteIcon: null,
            };
          }
        },
        CONTENT_EXTRACTION_SCRIPTS
      );

      // 處理注入結果
      if (result && result.length > 0) {
        const extractedContent = result[0]?.result;

        if (extractedContent?.title && extractedContent?.blocks) {
          this.logger.log?.(
            `✅ [PageContentService] 成功提取: "${extractedContent.title}" (${extractedContent.blocks.length} blocks)`
          );
          return extractedContent;
        }
      }

      // 結果無效
      this.logger.warn?.('⚠️ [PageContentService] 提取結果無效');
      return {
        title: 'Untitled',
        blocks: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                { type: 'text', text: { content: 'Content extraction returned invalid result.' } },
              ],
            },
          },
        ],
        siteIcon: null,
      };
    } catch (error) {
      this.logger.error?.('❌ [PageContentService] 注入或提取失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取內容提取所需的腳本列表
   * @returns {string[]}
   */
  static getRequiredScripts() {
    return [...CONTENT_EXTRACTION_SCRIPTS];
  }
}

// 導出
export { PageContentService, CONTENT_EXTRACTION_SCRIPTS };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PageContentService,
    CONTENT_EXTRACTION_SCRIPTS,
  };
}

if (typeof window !== 'undefined') {
  window.PageContentService = PageContentService;
  window.CONTENT_EXTRACTION_SCRIPTS = CONTENT_EXTRACTION_SCRIPTS;
}
