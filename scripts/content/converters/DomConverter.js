/**
 * DomConverter - DOM 轉 Notion Block 轉換器
 *
 * 職責:
 * - 將 HTML/DOM 結構轉換為 Notion Block 格式
 * - 處理各種 HTML 標籤 (H1-H3, P, IMG, LI, BLOCKQUOTE)
 * - 識別並處理偽裝成段落的列表
 * - 處理圖片 URL 驗證和清理
 */

/* global Logger, ImageUtils, ErrorHandler */

import { LIST_PREFIX_PATTERNS, BULLET_PATTERNS } from '../../config/patterns.js';

/**
 * 創建富文本對象的輔助函數
 * @param {string} text - 文本內容
 * @returns {Array} Notion rich_text 數組
 */
const createRichText = text => [{ type: 'text', text: { content: text || '' } }];

/**
 * 節點轉換策略集合
 */
const strategies = {
  H1: node => {
    const text = node.textContent?.trim();
    if (!text) {
      return null;
    }
    return {
      object: 'block',
      type: 'heading_1',
      heading_1: { rich_text: createRichText(text) },
    };
  },

  H2: node => {
    const text = node.textContent?.trim();
    if (!text) {
      return null;
    }
    return {
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: createRichText(text) },
    };
  },

  H3: node => {
    const text = node.textContent?.trim();
    if (!text) {
      return null;
    }
    return {
      object: 'block',
      type: 'heading_3',
      heading_3: { rich_text: createRichText(text) },
    };
  },

  P: node => {
    const textContent = node.textContent?.trim();
    if (!textContent) {
      return null;
    }

    // 偵測是否為以換行或符號表示的清單（有些文件會用 CSS 或 <br> 呈現點列）
    const innerHtml = node.innerHTML || '';
    const hasBr = /<br\s*\/?/i.test(innerHtml);

    let lines = [];
    if (hasBr) {
      // 如果包含 <br>, 創建副本並將 <br> 替換為換行符, 以便正確分割
      const temp = node.cloneNode(true);
      const brs = temp.querySelectorAll('br');
      brs.forEach(br => br.replaceWith('\n'));
      lines = temp.textContent
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
    } else {
      lines = textContent
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    }

    // 常見的 bullet 標記與編號模式
    const bulletCharRe = BULLET_PATTERNS.bulletChar;
    const numberedRe = BULLET_PATTERNS.numbered;

    const manyLines = lines.length >= 2;

    // 判斷是否為 list-like paragraph：多行或包含 <br> 且每行看起來像項目
    let looksLikeList = false;
    if (manyLines || hasBr) {
      // 如果大部分行以 bulletChar 或 numbered 開頭，視為清單
      const matchCount = lines.reduce(
        (acc, line) =>
          acc + (bulletCharRe.test(line) || numberedRe.test(line) || /^[-••]/u.test(line) ? 1 : 0),
        0
      );
      if (matchCount >= Math.max(1, Math.floor(lines.length * 0.6))) {
        looksLikeList = true;
      }
    } else if (bulletCharRe.test(textContent) || numberedRe.test(textContent)) {
      // 單行但以 bullet 字元開始也視為 list item
      looksLikeList = true;
    }

    if (looksLikeList) {
      // 返回多個 block 的數組
      return lines
        .map(line => {
          // 步驟 1：移除已知的列表格式標記
          let cleaned = line.replace(bulletCharRe, '').replace(numberedRe, '').trim();

          // 步驟 2：移除殘留的前綴符號
          cleaned = cleaned
            .replace(LIST_PREFIX_PATTERNS.bulletPrefix, '')
            .replace(LIST_PREFIX_PATTERNS.multipleSpaces, ' ')
            .trim();

          // 步驟 3：只處理非空內容
          if (cleaned && !LIST_PREFIX_PATTERNS.emptyLine.test(cleaned)) {
            return {
              object: 'block',
              type: 'bulleted_list_item',
              bulleted_list_item: {
                rich_text: createRichText(cleaned),
              },
            };
          }
          return null;
        })
        .filter(Boolean);
    }

    return {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: createRichText(textContent),
      },
    };
  },

  IMG: (node, existingBlocks = []) => {
    const src = ImageUtils.extractImageSrc(node);
    if (!src) {
      return null;
    }

    try {
      const absoluteUrl = new URL(src, document.baseURI).href;
      const cleanedUrl = ImageUtils.cleanImageUrl(absoluteUrl);

      // 使用 ImageUtils 進行兼容性檢查
      const isCompatible = ImageUtils.isNotionCompatibleImageUrl
        ? ImageUtils.isNotionCompatibleImageUrl(cleanedUrl)
        : true; // Fallback if method missing

      // 檢查是否為有效的圖片格式和 URL，且未重複
      if (
        cleanedUrl &&
        isCompatible &&
        !existingBlocks.some(
          block => block.type === 'image' && block.image.external.url === cleanedUrl
        )
      ) {
        Logger.log(`Added image: ${cleanedUrl}`);
        return {
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: { url: cleanedUrl },
          },
        };
      } else if (cleanedUrl && !isCompatible) {
        Logger.warn(`Skipped incompatible image URL: ${cleanedUrl.substring(0, 100)}...`);
      }
    } catch (error) {
      if (typeof ErrorHandler !== 'undefined') {
        ErrorHandler.logError({
          type: 'invalid_url',
          context: `image URL processing: ${src}`,
          originalError: error,
          timestamp: Date.now(),
        });
      } else {
        Logger.warn(`Failed to process image URL: ${src}`, error);
      }
    }
    return null;
  },

  LI: node => {
    const textContent = node.textContent?.trim();
    if (!textContent) {
      return null;
    }
    return {
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: createRichText(textContent),
      },
    };
  },

  BLOCKQUOTE: node => {
    const textContent = node.textContent?.trim();
    if (!textContent) {
      return null;
    }
    return {
      object: 'block',
      type: 'quote',
      quote: {
        rich_text: createRichText(textContent),
      },
    };
  },
};

class DomConverter {
  /**
   * 將 HTML 轉換為 Notion 區塊陣列
   * @param {string} html - HTML 字串
   * @returns {Array} Notion 區塊陣列
   */
  convert(html) {
    const blocks = [];
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    tempDiv.childNodes.forEach(node => this.processNode(node, blocks));

    return blocks;
  }

  /**
   * 處理單個節點並添加到 blocks 數組
   * @param {Node} node - DOM 節點
   * @param {Array} blocks - 目標 blocks 數組
   */
  processNode(node, blocks) {
    if (node.nodeType !== 1) {
      // 僅處理元素節點
      return;
    }

    const strategy = strategies[node.nodeName];
    if (strategy) {
      const result = strategy(node, blocks); // 傳入 blocks 以供 IMG 查重
      if (result) {
        if (Array.isArray(result)) {
          blocks.push(...result);
        } else {
          blocks.push(result);
        }
      }
    } else if (node.childNodes.length > 0) {
      // 遞歸處理子節點
      node.childNodes.forEach(child => this.processNode(child, blocks));
    }
  }
}

// 導出單例
const domConverter = new DomConverter();

export { DomConverter, domConverter, strategies };
