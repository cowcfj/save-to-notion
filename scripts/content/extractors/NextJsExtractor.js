/**
 * NextJsExtractor.js
 * 專門負責處理 Next.js 網站的結構化數據提取
 *
 * 職責:
 * 1. 檢測頁面是否為 Next.js 網站 (檢查 __NEXT_DATA__)
 * 2. 解析 JSON 數據並提取文章內容
 * 3. 將 JSON blocks 轉換為 Notion Block 格式
 */

import Logger from '../../utils/Logger.js';
import { NEXTJS_CONFIG } from '../../config/extraction.js';

export const NextJsExtractor = {
  /**
   * 檢測頁面是否為 Next.js 網站
   *
   * @param {Document} doc
   * @returns {boolean}
   */
  detect(doc) {
    return Boolean(doc.querySelector('#__NEXT_DATA__'));
  },

  /**
   * 從 __NEXT_DATA__ 提取內容
   *
   * @param {Document} doc
   * @returns {{ content: string, blocks: Array, metadata: object, type: 'nextjs' } | null}
   */
  extract(doc) {
    const action = 'NextJsExtractor.extract';
    try {
      const script = doc.querySelector('#__NEXT_DATA__');
      if (!script) {
        return null;
      }

      const jsonData = script.textContent;
      if (!jsonData || jsonData.length > NEXTJS_CONFIG.MAX_JSON_SIZE) {
        Logger.warn('Next.js 數據過大或為空', {
          action,
          length: jsonData?.length,
        });
        return null;
      }

      const parsedData = JSON.parse(jsonData);
      const articleData = this._findArticleData(parsedData);

      if (!articleData) {
        Logger.warn('未能在 __NEXT_DATA__ 中找到文章數據', { action });
        return null;
      }

      Logger.log('成功提取 Next.js 文章數據', {
        action,
        title: articleData.title,
      });

      const rawBlocks = [...(articleData.blocks || [])];

      // HK01 handling: Inject teaser as the first summary block if present
      if (Array.isArray(articleData.teaser) && articleData.teaser.length > 0) {
        rawBlocks.unshift({
          blockType: 'summary',
          summary: articleData.teaser,
        });
      }

      const blocks = this.convertBlocks(rawBlocks);

      return {
        content: '',
        blocks,
        metadata: {
          title: articleData.title,
          excerpt: articleData.excerpt || articleData.description,
          byline: articleData.author?.name || articleData.author,
        },
        type: 'nextjs',
        rawArticle: articleData,
      };
    } catch (error) {
      Logger.error('Next.js 提取過程發生錯誤', {
        action,
        error: error.message,
      });
      return null;
    }
  },

  /**
   * 遞歸查找文章數據
   *
   * @param {object} data
   * @returns {object|null}
   */
  _findArticleData(data) {
    if (!data) {
      return null;
    }

    for (const path of NEXTJS_CONFIG.ARTICLE_PATHS) {
      const result = this._getValueByPath(data, path);
      if (result && (result.blocks || result.content)) {
        return result;
      }
    }
    return null;
  },

  /**
   * 根據路徑獲取對象值
   *
   * @param {object} obj
   * @param {string} path 'a.b.c'
   * @returns {any}
   */
  _getValueByPath(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  },

  /**
   * 將 JSON blocks 轉換為 Notion blocks
   *
   * @param {Array} jsonBlocks
   * @returns {Array}
   */
  convertBlocks(jsonBlocks) {
    if (!Array.isArray(jsonBlocks)) {
      return [];
    }

    return jsonBlocks
      .flatMap(block => {
        const type = NEXTJS_CONFIG.BLOCK_TYPE_MAP[block.blockType] || 'paragraph';

        // 處理 HK01 'summary' 區塊 (數組形式)
        if (block.blockType === 'summary' && Array.isArray(block.summary)) {
          const summaryText = block.summary.join('\n');
          return [
            {
              object: 'block',
              type: 'quote',
              quote: {
                rich_text: [
                  {
                    type: 'text',
                    text: { content: summaryText },
                  },
                ],
              },
            },
          ];
        }

        // 處理 HK01 'text' 區塊 (htmlTokens)
        if (block.blockType === 'text' && Array.isArray(block.htmlTokens)) {
          const paragraphs = [];
          block.htmlTokens.forEach(tokenGroup => {
            if (Array.isArray(tokenGroup)) {
              let paragraphText = '';
              tokenGroup.forEach(token => {
                if (token.type === 'text' && token.content) {
                  paragraphText += token.content;
                }
              });

              if (paragraphText.trim()) {
                paragraphs.push({
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [
                      {
                        type: 'text',
                        text: { content: paragraphText },
                      },
                    ],
                  },
                });
              }
            }
          });
          return paragraphs;
        }

        switch (type) {
          case 'image': {
            return [
              {
                object: 'block',
                type: 'image',
                image: {
                  type: 'external',
                  external: {
                    url: block.image?.cdnUrl || block.image?.url || '',
                  },
                  caption: block.image?.caption
                    ? [
                        {
                          type: 'text',
                          text: { content: block.image.caption },
                        },
                      ]
                    : [],
                },
              },
            ];
          }

          case 'heading_1':
          case 'heading_2':
          case 'heading_3': {
            return [
              {
                object: 'block',
                type,
                [type]: {
                  rich_text: [
                    {
                      type: 'text',
                      text: { content: block.text || '' },
                    },
                  ],
                },
              },
            ];
          }

          case 'quote': {
            return [
              {
                object: 'block',
                type: 'quote',
                quote: {
                  rich_text: [
                    {
                      type: 'text',
                      text: { content: block.text || '' },
                    },
                  ],
                },
              },
            ];
          }

          default: {
            const content = block.text ? this._stripHtml(block.text) : '';
            // 如果默認處理產生空內容，且不是已處理的特殊類型，則嘗試返回空
            // 但為了保持一致性，如果確實沒有 text 字段，可能是一個未知類型的塊
            if (!Boolean(content)) {
              return [];
            }

            return [
              {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [
                    {
                      type: 'text',
                      text: { content },
                    },
                  ],
                },
              },
            ];
          }
        }
      })
      .filter(block => {
        if (block.type === 'image') {
          return Boolean(block.image.external.url);
        }
        return true;
      });
  },

  _stripHtml(html) {
    if (!html) {
      return '';
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Remove script and style tags to prevent their content from being included in textContent
    doc.querySelectorAll('script, style').forEach(el => el.remove());
    return doc.body.textContent || '';
  },
};
