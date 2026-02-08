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

      const blocks = this.convertBlocks(articleData.blocks || []);

      return {
        content: '',
        blocks,
        metadata: {
          title: articleData.title,
          excerpt: articleData.excerpt || articleData.description,
          byline: articleData.author?.name || articleData.author,
          siteName: 'HK01',
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
      .map(block => {
        const type = NEXTJS_CONFIG.BLOCK_TYPE_MAP[block.blockType] || 'paragraph';

        switch (type) {
          case 'image': {
            return {
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
            };
          }

          case 'heading_1':
          case 'heading_2':
          case 'heading_3': {
            return {
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
            };
          }

          case 'quote': {
            return {
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
            };
          }

          default: {
            return {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: { content: this._stripHtml(block.text || '') },
                  },
                ],
              },
            };
          }
        }
      })
      .filter(block => {
        return !(block.type === 'image' && !block.image.external.url);
      });
  },

  _stripHtml(html) {
    if (!html) {
      return '';
    }
    return html.replaceAll(/<[^>]*>?/g, '');
  },
};
