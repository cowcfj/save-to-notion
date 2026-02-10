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
import { isTitleConsistent } from '../../utils/contentUtils.js';

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
      const PAGES_ROUTER = 'pages-router';
      let extractionSource = 'unknown';
      let rawData = this._getPagesRouterData(doc);

      if (rawData) {
        extractionSource = PAGES_ROUTER;
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

      // 檢查 Pages Router 數據是否因 SPA 導航而過期
      if (extractionSource === PAGES_ROUTER && !this._validatePagesRouterData(rawData, doc)) {
        return null;
      }

      const articleData = this._findArticleData(rawData);

      if (!articleData) {
        Logger.info('在數據中未找到結構化文章內容，將使用標準提取', {
          action,
          source: extractionSource,
        });
        return null;
      }

      // 2. 標題一致性檢查 (備用機制，當 asPath 不存在時)
      if (extractionSource === PAGES_ROUTER && articleData?.title) {
        const docTitle = doc.title;
        if (docTitle && !isTitleConsistent(articleData.title, docTitle)) {
          Logger.warn('SPA 導航偵測：__NEXT_DATA__ 標題與 document.title 不符，放棄結構化提取', {
            action,
            articleTitle: articleData.title,
            docTitle,
          });
          return null;
        }
      }

      Logger.log('成功提取 Next.js 文章數據', {
        action,
        source: extractionSource,
        title: articleData.title,
      });

      const blocks = this._processArticleContent(articleData);

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
   * 檢查 __NEXT_DATA__.asPath 是否與當前 URL 匹配
   * 用於偵測 SPA 導航導致的數據過期
   *
   * asPath 在頁面初次載入時寫入，SPA 導航後不會更新。
   * 因此 asPath ≠ pathname 代表用戶已 SPA 導航到其他頁面。
   *
   * @param {string} asPath - __NEXT_DATA__ 中的 asPath (e.g. "/社會新聞/60320801/slug")
   * @param {string} currentPath - 當前 window.location.pathname
   * @returns {boolean} true 表示數據仍然有效
   */
  _isAsPathMatch(asPath, currentPath) {
    if (!asPath || !currentPath) {
      return true; // 無法比對時默認匹配，避免誤殺
    }

    try {
      // 去除 query string，只比較路徑部分
      const asPathClean = decodeURIComponent(asPath.split('?')[0]);
      const currentClean = decodeURIComponent(currentPath);
      return asPathClean === currentClean;
    } catch {
      // decodeURIComponent 可能因格式錯誤拋出異常，此時放行
      return true;
    }
  },

  /**
   * 驗證 Pages Router 數據的有效性 (針對 SPA 導航場景)
   *
   * @param {object} rawData - __NEXT_DATA__ 原始數據
   * @param {Document} doc - 當前文檔對象
   * @returns {boolean} true 表示數據有效，false 表示數據已過期
   */
  _validatePagesRouterData(rawData, doc) {
    // 1. asPath 檢查 (如果有的話)
    if (rawData?.asPath) {
      const currentPath = doc.defaultView?.location?.pathname;
      if (currentPath && !this._isAsPathMatch(rawData.asPath, currentPath)) {
        Logger.warn('SPA 導航偵測：__NEXT_DATA__.asPath 數據已過時', {
          asPath: rawData.asPath,
          currentPath,
        });
        return false;
      }
    }
    return true;
  },

  /**
   * 處理文章內容轉換為 Notion Blocks
   *
   * @param {object} articleData
   * @returns {Array} blocks
   */
  _processArticleContent(articleData) {
    const rawBlocks = [...(articleData.blocks || [])];
    let blocks = [];

    // [NEW] 優先處理 Yahoo storyAtoms (直接轉換為 Notion Blocks)
    if (
      rawBlocks.length === 0 &&
      Array.isArray(articleData.storyAtoms) &&
      articleData.storyAtoms.length > 0
    ) {
      blocks = this._convertStoryAtoms(articleData.storyAtoms);
    }
    // [NEW] 處理 Yahoo 風格的 body/markup 內容 (如果沒有標準 blocks 且沒有 storyAtoms)
    else if (rawBlocks.length === 0) {
      if (articleData.body && typeof articleData.body === 'string') {
        const formattedBody = articleData.body
          .replaceAll(/<\/p>/gi, '\n\n')
          .replaceAll(/<br\s*\/?>/gi, '\n')
          .trim();

        rawBlocks.push({
          blockType: 'paragraph',
          text: formattedBody,
        });
      } else if (articleData.markup && typeof articleData.markup === 'string') {
        const formattedMarkup = articleData.markup
          .replaceAll(/<\/p>/gi, '\n\n')
          .replaceAll(/<br\s*\/?>/gi, '\n')
          .trim();

        rawBlocks.push({
          blockType: 'paragraph',
          text: formattedMarkup,
        });
      }
    }

    // 如果 blocks 尚未生成（即不是 storyAtoms），則處理 rawBlocks
    if (blocks.length === 0) {
      // Generic teaser handling
      if (Array.isArray(articleData.teaser) && articleData.teaser.length > 0) {
        rawBlocks.unshift({
          blockType: 'summary',
          summary: articleData.teaser,
        });
      }

      blocks = this.convertBlocks(rawBlocks);
    }

    return blocks;
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
    // 對於 App Router，需要在每個 fragment 中搜索
    const searchTargets = data.appRouterFragments ? [...data.appRouterFragments, data] : [data];

    const result = this._searchByKnownPaths(searchTargets);
    if (result) {
      return result;
    }

    // 2. 啟發式搜索 (Slow Path / Deep Search)
    Logger.log('NextJsExtractor: 使用啟發式搜索');
    return this._heuristicSearch(data);
  },

  /**
   * 在目標對象列表中使用已知路徑搜索數據
   *
   * @param {Array<object>} targets
   * @returns {object|null}
   */
  _searchByKnownPaths(targets) {
    for (const target of targets) {
      if (!target || typeof target !== 'object') {
        continue;
      }

      for (const path of NEXTJS_CONFIG.ARTICLE_PATHS) {
        const result = this._getValueByPath(target, path);

        if (result) {
          const hasBlocks = Array.isArray(result.blocks);
          const hasContent = typeof result.content === 'string';
          const hasBody = typeof result.body === 'string';
          const hasMarkup = typeof result.markup === 'string';
          const hasStoryAtoms = Array.isArray(result.storyAtoms);

          if (hasBlocks || hasContent || hasBody || hasMarkup || hasStoryAtoms) {
            Logger.log(`NextJsExtractor: 使用路徑 "${path}" 提取成功`);
            return result;
          }
        }
      }
    }
    return null;
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

    const objects = this._parseMultiLineRsc(chunk);

    if (objects.length > 1) {
      return { _rscItems: objects };
    }
    if (objects.length === 1) {
      return objects[0];
    }

    return this._fallbackParseRsc(chunk) || chunk;
  },

  /**
   * 解析多行 RSC 內容
   *
   * @param {string} chunk
   * @returns {Array<object>}
   */
  _parseMultiLineRsc(chunk) {
    const lines = chunk.split('\n').filter(line => line.trim());
    const objects = [];

    for (const line of lines) {
      const parsed = this._tryParseRscLine(line);
      if (parsed) {
        objects.push(parsed);
      }
    }
    return objects;
  },

  /**
   * 嘗試解析單行 RSC
   *
   * @param {string} line
   * @returns {object|null}
   */
  _tryParseRscLine(line) {
    try {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const payload = line.slice(colonIndex + 1);
        if (payload.startsWith('{') || payload.startsWith('[')) {
          const parsed = JSON.parse(payload);
          const extracted = this._extractRscDataObject(parsed);

          if (extracted) {
            return extracted;
          }
          if (typeof parsed === 'object' && parsed !== null) {
            return parsed;
          }
        }
      }
    } catch {
      // 忽略單行解析錯誤
    }
    return null;
  },

  /**
   * 回退：嘗試解析整個 chunk
   *
   * @param {string} chunk
   * @returns {object|null}
   */
  _fallbackParseRsc(chunk) {
    try {
      const colonIndex = chunk.indexOf(':');
      if (colonIndex !== -1) {
        const payload = chunk.slice(colonIndex + 1);
        if (payload.startsWith('{') || payload.startsWith('[')) {
          const parsed = JSON.parse(payload);
          const extracted = this._extractRscDataObject(parsed);
          return extracted || parsed;
        }
      }
    } catch {
      // 解析失敗
    }
    return null;
  },

  /**
   * 提取 RSC 陣列中的數據對象
   * Yahoo RSC 格式: ["$", "$L2a", null, { pageData: {...} }]
   *
   * @param {any} parsed
   * @returns {object|null}
   */
  _extractRscDataObject(parsed) {
    if (!Array.isArray(parsed)) {
      return null;
    }
    // RSC 陣列格式: ["$", "$L...", null, { actualData }]
    // 檢查 index 3 是否為對象
    if (parsed.length >= 4 && typeof parsed[3] === 'object' && parsed[3] !== null) {
      return parsed[3];
    }
    // 有時數據在其他索引位置，搜索第一個有意義的對象
    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) && // 確保這是一個有內容的對象，不只是空對象
        Object.keys(item).length > 0
      ) {
        return item;
      }
    }
    return null;
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

    if (score >= 35) {
      Logger.log(`NextJsExtractor: 找到高可信度節點 (分數=${score})`);
      return root;
    }

    // 2. 遞歸遍歷子節點
    return this._searchChildren(root, depth, maxDepth);
  },

  /**
   * 遞歸遍歷子節點
   *
   * @param {object} root
   * @param {number} depth
   * @param {number} maxDepth
   * @returns {object|null}
   */
  _searchChildren(root, depth, maxDepth) {
    for (const key in root) {
      if (this._shouldSkipKey(key)) {
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
   * 檢查是否應跳過遍歷該鍵
   *
   * @param {string} key
   * @returns {boolean}
   */
  _shouldSkipKey(key) {
    const lowerKey = key.toLowerCase();
    return NEXTJS_CONFIG.HEURISTIC_PATTERNS.EXCLUDE_KEYS.some(exclude => {
      const lowerExclude = exclude.toLowerCase();
      // 統一轉為小寫比對，確保像 'MyPOSTARTICLESTREAMData' 這樣的大小寫混合鍵名也能被過濾
      return lowerKey === lowerExclude || lowerKey.includes(lowerExclude);
    });
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
    score += this._scoreStandardBlocks(node);
    score += this._scoreStructureAndText(node);
    score += this._scoreSpecialCmsFields(node);

    return score;
  },

  /**
   * 計算標準區塊分數
   *
   * @param {object} node
   * @returns {number}
   */
  _scoreStandardBlocks(node) {
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
    return score;
  },

  /**
   * 計算結構和文本特徵分數
   *
   * @param {object} node
   * @returns {number}
   */
  _scoreStructureAndText(node) {
    let score = 0;
    // 規則 4: 鍵名特徵
    if (node.title && typeof node.title === 'string') {
      score += 10;
    }
    if (node.author) {
      score += 5;
    }
    // 規則 5: HK01 或其他內容結構特徵
    if (Array.isArray(node.paragraphs) && node.paragraphs.length > 0) {
      score += 40;
    }
    if (node.text && typeof node.text === 'string' && node.id) {
      score += 15;
    }
    // 檢查是否包含必要的 Blocks 結構 (如果沒有顯式的 blocks 欄位)
    if (node.content && typeof node.content === 'string' && node.content.length > 100) {
      score += 20;
    }
    return score;
  },

  /**
   * 計算特殊 CMS 欄位分數
   *
   * @param {object} node
   * @returns {number}
   */
  _scoreSpecialCmsFields(node) {
    let score = 0;
    // 規則 6: Yahoo 風格的 body 欄位（HTML 字串）
    if (node.body && typeof node.body === 'string' && node.body.length > 200) {
      score += 40;
    }
    // 規則 7: 包含 markup 欄位
    if (node.markup && typeof node.markup === 'string') {
      score += 35;
    }
    // 規則 8: Yahoo storyAtoms
    if (Array.isArray(node.storyAtoms) && node.storyAtoms.length > 0) {
      score += 60;
    }
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
        // 1. 處理 HK01 'summary' 區塊
        const summaryBlock = this._convertSummaryBlock(block);
        if (summaryBlock) {
          return summaryBlock;
        }

        // 2. 處理 HK01 'text' 區塊 (htmlTokens)
        const htmlTokensBlock = this._convertHtmlTokensBlock(block);
        if (htmlTokensBlock) {
          return htmlTokensBlock;
        }

        // 3. 處理 'list' 區塊
        const listBlock = this._convertListBlock(block);
        if (listBlock) {
          return listBlock;
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
                  caption: this._createRichTextChunks(block.image?.caption),
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
                  rich_text: this._createRichTextChunks(
                    block.text ? this._stripHtml(block.text) : ''
                  ),
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
                  rich_text: this._createRichTextChunks(
                    block.text ? this._stripHtml(block.text) : ''
                  ),
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
                  rich_text: this._createRichTextChunks(content),
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

  /**
   * 轉換 Yahoo storyAtoms 為 Notion Blocks
   *
   * @param {Array} atoms
   * @returns {Array}
   */
  _convertStoryAtoms(atoms) {
    if (!Array.isArray(atoms)) {
      return [];
    }

    const blocks = [];

    for (const atom of atoms) {
      if (atom.type === 'text') {
        const block = this._createBlockFromTextAtom(atom);
        if (block) {
          blocks.push(block);
        }
      } else if (atom.type === 'image') {
        const block = this._createBlockFromImageAtom(atom);
        if (block) {
          blocks.push(block);
        }
      }
    }
    return blocks;
  },

  /**
   * 轉換 summary 區塊
   *
   * @param {object} block
   * @returns {Array|null}
   */
  _convertSummaryBlock(block) {
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
    return null;
  },

  /**
   * 轉換 htmlTokens 區塊
   *
   * @param {object} block
   * @returns {Array|null}
   */
  _convertHtmlTokensBlock(block) {
    if (block.blockType === 'text' && Array.isArray(block.htmlTokens)) {
      const paragraphs = [];
      block.htmlTokens.forEach(tokenGroup => {
        if (Array.isArray(tokenGroup)) {
          let paragraphText = '';
          tokenGroup.forEach(token => {
            // 處理所有包含 content 的 token 類型 (e.g. text, specific-link, boldLink)
            if (token.content) {
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
    return null;
  },

  /**
   * 轉換 list 區塊
   *
   * @param {object} block
   * @returns {Array|null}
   */
  _convertListBlock(block) {
    if (block.blockType === 'list' && Array.isArray(block.items)) {
      const listType = block.ordered ? 'numbered_list_item' : 'bulleted_list_item';
      return block.items.map(item => ({
        object: 'block',
        type: listType,
        [listType]: {
          rich_text: this._createRichTextChunks(this._stripHtml(item)),
        },
      }));
    }
    return null;
  },

  /**
   * 根據文本 Atom 創建 Block
   *
   * @param {object} atom
   * @returns {object|null}
   */
  _createBlockFromTextAtom(atom) {
    if (!atom.content) {
      return null;
    }

    const text = this._stripHtml(atom.content).trim();
    if (!text) {
      return null;
    }

    let type = 'paragraph';
    const tagName = (atom.tagName || 'p').toLowerCase();

    switch (tagName) {
      case 'h1': {
        type = 'heading_1';
        break;
      }
      case 'h2': {
        type = 'heading_2';
        break;
      }
      case 'h3': {
        type = 'heading_3';
        break;
      }
      case 'blockquote': {
        type = 'quote';
        break;
      }
    }

    return {
      object: 'block',
      type,
      [type]: {
        rich_text: this._createRichTextChunks(text),
      },
    };
  },

  _createBlockFromImageAtom(atom) {
    // Yahoo 格式: atom.size.resized.url 或 atom.size.original.url
    // 通用格式: atom.url
    const imageUrl =
      atom.url || atom.size?.resized?.url || atom.size?.original?.url || atom.size?.lightbox?.url;

    if (!imageUrl) {
      Logger.debug('NextJsExtractor._createBlockFromImageAtom: 無法找到圖片 URL', {
        atomKeys: Object.keys(atom),
        // eslint-disable-next-line
        hasSize: Boolean(atom.size && Object.keys(atom.size).length > 0),
      });
      return null;
    }

    return {
      object: 'block',
      type: 'image',
      image: {
        type: 'external',
        external: {
          url: imageUrl,
        },
        caption: this._createRichTextChunks(atom.caption),
      },
    };
  },
};
