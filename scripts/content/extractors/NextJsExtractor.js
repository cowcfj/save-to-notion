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
    if (doc.querySelector('#__NEXT_DATA__')) {
      return true;
    }
    // Check for App Router (Next.js 13+)
    const appRouterScripts = doc.querySelectorAll(NEXTJS_CONFIG.APP_ROUTER_SELECTOR);
    for (const script of appRouterScripts) {
      if (script.textContent.includes('self.__next_f.push')) {
        return true;
      }
    }
    return false;
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
      let extractionSource = 'unknown';
      let rawData = this._getPagesRouterData(doc);

      if (rawData) {
        extractionSource = 'pages-router';
      } else {
        rawData = this._getAppRouterData(doc);
        if (rawData) {
          extractionSource = 'app-router';
        }
      }

      if (!rawData) {
        Logger.warn('未能提取任何 Next.js 數據', { action });
        return null; // 讓 fallback 機制接手 (如 Readability)
      }

      const articleData = this._findArticleData(rawData);

      if (!articleData) {
        Logger.info('在數據中未找到結構化文章內容，將使用標準提取', {
          action,
          source: extractionSource,
        });
        return null;
      }

      Logger.log('成功提取 Next.js 文章數據', {
        action,
        source: extractionSource,
        title: articleData.title,
      });

      const rawBlocks = [...(articleData.blocks || [])];

      // Generic teaser handling
      if (Array.isArray(articleData.teaser) && articleData.teaser.length > 0) {
        rawBlocks.unshift({
          blockType: 'summary',
          summary: articleData.teaser,
        });
      }

      const blocks = this.convertBlocks(rawBlocks);

      // 嘗試從數據中提取 Metadata，如果沒有則使用空值，讓外層去補
      // 注意：App Router 的數據通常不包含 metadata (meta tags 在 head 中)
      const metadata = {
        title: articleData.title,
        excerpt: articleData.excerpt || articleData.description,
        byline: articleData.author?.name || articleData.author,
      };

      return {
        content: '', // Next.js 提取器不生成 HTML content
        blocks,
        metadata,
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

    // 1. 嘗試已知路徑 (Fast Path)
    for (const path of NEXTJS_CONFIG.ARTICLE_PATHS) {
      const result = this._getValueByPath(data, path);
      // 基本驗證：必須包含 blocks 或 content
      if (result && (Array.isArray(result.blocks) || result.content)) {
        return result;
      }
    }

    // 2. 啟發式搜索 (Slow Path / Deep Search)
    // 當已知路徑都找不到時，掃描整個物件樹
    Logger.log('NextJsExtractor: 使用啟發式搜索');
    return this._heuristicSearch(data);
  },

  /**
   * 獲取 Pages Router 數據
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  _getPagesRouterData(doc) {
    const script = doc.querySelector('#__NEXT_DATA__');
    if (!script) {
      return null;
    }

    const jsonData = script.textContent;
    if (jsonData && jsonData.length <= NEXTJS_CONFIG.MAX_JSON_SIZE) {
      try {
        return JSON.parse(jsonData);
      } catch (error) {
        Logger.warn('解析 __NEXT_DATA__ 失敗', { error: error.message });
      }
    } else {
      Logger.warn('Next.js 數據過大或為空', {
        length: jsonData?.length,
      });
    }
    return null;
  },

  /**
   * App Router 數據提取
   * 解析 self.__next_f.push 的內容
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  _getAppRouterData(doc) {
    const scripts = doc.querySelectorAll(NEXTJS_CONFIG.APP_ROUTER_SELECTOR);
    const fragments = [];

    scripts.forEach(script => {
      const scriptFragments = this._parseAppRouterScript(script.textContent);
      fragments.push(...scriptFragments);
    });

    if (fragments.length === 0) {
      return null;
    }

    return { appRouterFragments: fragments };
  },

  /**
   * 解析 App Router 腳本內容
   *
   * @param {string} content
   * @returns {Array} fragments
   */
  _parseAppRouterScript(content) {
    if (!content?.includes('self.__next_f.push')) {
      return [];
    }

    const fragments = [];
    const parts = content.split('self.__next_f.push(');

    // 第一個 part 是 push 之前的內容 (通常是空的或 misc)，跳過
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      // part 應該是以 JSON 開始，後面跟著 ')' 和可能的 ';' 或換行
      // 我們需要找到最後一個 ')'
      const lastParen = part.lastIndexOf(')');

      if (lastParen !== -1) {
        const potentialJson = part.slice(0, lastParen);
        try {
          const args = JSON.parse(potentialJson);
          if (Array.isArray(args) && args.length > 1) {
            fragments.push(this._parseRscPayload(args[1]));
          }
        } catch {
          // 忽略解析錯誤
        }
      }
    }

    return fragments;
  },

  /**
   * 解析 RSC Payload
   * 嘗試將 "1:{"... 格式的字串解析為對象
   *
   * @param {any} chunk
   * @returns {any}
   */
  _parseRscPayload(chunk) {
    if (typeof chunk !== 'string') {
      return chunk;
    }

    try {
      const colonIndex = chunk.indexOf(':');
      if (colonIndex !== -1) {
        const payload = chunk.slice(colonIndex + 1);
        // 如果看起來像 JSON 物件或陣列，嘗試解析
        if (payload.startsWith('{') || payload.startsWith('[')) {
          return JSON.parse(payload);
        }
      }
    } catch {
      // 解析失敗則返回原始字串
    }

    return chunk;
  },

  /**
   * 啟發式搜索
   * 遞歸遍歷物件，尋找最像文章數據的節點
   *
   * @param {object} root
   * @param {number} depth
   * @param {number} maxDepth
   * @returns {object|null}
   */
  _heuristicSearch(root, depth = 0, maxDepth = 6) {
    if (depth > maxDepth || !root || typeof root !== 'object') {
      return null;
    }

    // 1. 計算當前節點分數
    const score = this._calculateScore(root);
    if (score >= 50) {
      // 找到高可信度節點
      return root;
    }

    // 2. 遞歸遍歷子節點
    for (const key in root) {
      // 跳過排除的鍵名
      if (NEXTJS_CONFIG.HEURISTIC_PATTERNS.EXCLUDE_KEYS.includes(key.toLowerCase())) {
        continue;
      }

      const value = root[key];
      // 只遍歷物件或陣列
      if (typeof value === 'object' && value !== null) {
        const candidate = this._heuristicSearch(value, depth + 1, maxDepth);
        if (candidate) {
          return candidate;
        }
      }
    }

    return null;
  },

  /**
   * 計算節點分數
   *
   * @param {object} node
   * @returns {number}
   */
  _calculateScore(node) {
    if (!node || typeof node !== 'object') {
      return 0;
    }
    let score = 0;

    // 規則 1: 包含 blocks 陣列且非空
    if (Array.isArray(node.blocks) && node.blocks.length > 0) {
      score += 50;
    }

    // 規則 2: 包含 htmlTokens (HK01 特有)
    // 提高權重，因為這通常是我們想要的內容
    if (Array.isArray(node.htmlTokens) && node.htmlTokens.length > 0) {
      score += 60;
    }

    // 規則 3: 包含 rich_text (Notion 格式)
    if (Array.isArray(node.rich_text)) {
      score += 30;
    }

    // 規則 4: 鍵名特徵 (這裡我們無法知道當前節點的鍵名，只能檢查它是否包含特定屬性)
    // 通常文章物件會包含 title, author 等
    if (node.title && typeof node.title === 'string') {
      score += 10;
    }
    if (node.author) {
      score += 5;
    }

    // 規則 5: HK01 或其他內容結構特徵
    // 如果包含 paragraphs 數組
    if (Array.isArray(node.paragraphs) && node.paragraphs.length > 0) {
      score += 40;
    }
    // 如果包含 text 和 id (HK01 內容塊常見)
    if (node.text && typeof node.text === 'string' && node.id) {
      score += 15;
    }

    // 檢查是否包含必要的 Blocks 結構 (如果沒有顯式的 blocks 欄位)
    // 這對於 App Router 的 RSC Payload 很有用，那裡的結構可能很深
    // 但目前我們只看顯式的 blocks/content 字段
    if (node.content && typeof node.content === 'string' && node.content.length > 100) {
      // 可能是純文本內容
      score += 20;
    }

    // 驗證必要欄位
    // 如果分數很高但缺乏關鍵欄位，可能需要扣分或忽略
    // 這裡我們假設如果有 blocks/htmlTokens 就足夠強了
    return score;
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
        // 先處理特殊類型，避免被 BLOCK_TYPE_MAP 默認行為攔截
        // 1. 處理 HK01 'summary' 區塊 (數組形式)
        // summary 不在 BLOCK_TYPE_MAP 中，若不先處理會回退為 'paragraph'
        if (block.blockType === 'summary' && Array.isArray(block.summary)) {
          const summaryText = block.summary.join('\n');
          return [
            {
              object: 'block',
              type: 'quote',
              quote: {
                rich_text: this._createRichTextChunks(summaryText),
              },
            },
          ];
        }

        // 2. 處理 HK01 'text' 區塊 (htmlTokens)
        // text 在 BLOCK_TYPE_MAP 中映射為 'paragraph'，但這裡需要特殊解析邏輯
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
                    rich_text: this._createRichTextChunks(paragraphText),
                  },
                });
              }
            }
          });
          return paragraphs;
        }

        const type = NEXTJS_CONFIG.BLOCK_TYPE_MAP[block.blockType] || 'paragraph';

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
                      text: { content: block.text ? this._stripHtml(block.text) : '' },
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
                      text: { content: block.text ? this._stripHtml(block.text) : '' },
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
            if (!content) {
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

  /**
   * 將長文本分割為 Notion rich_text 對象數組
   * 每個文本對象不超過 2000 字符，且數組總長度不超過 100
   *
   * @param {string} text
   * @returns {Array} rich_text 數組
   */
  _createRichTextChunks(text) {
    if (!text) {
      return [];
    }

    const MAX_LENGTH = 2000;
    const MAX_ITEMS = 100;
    const chunks = [];

    for (let i = 0; i < text.length; i += MAX_LENGTH) {
      if (chunks.length >= MAX_ITEMS) {
        break; // 達到 Notion 限制，截斷剩餘內容
      }
      chunks.push({
        type: 'text',
        text: {
          content: text.slice(i, i + MAX_LENGTH),
        },
      });
    }

    return chunks;
  },
};
