/**
 * DomConverter - DOM 轉 Notion Block 轉換器
 *
 * 職責:
 * - 將 HTML/DOM 結構轉換為 Notion Block 格式
 * - 支援遞歸處理嵌套結構 (如嵌套列表)
 * - 處理各種 HTML 標籤 (H1-H3, P, UL/OL/LI, IMG, BLOCKQUOTE, PRE, HR)
 * - 解析 Rich Text (B, I, A, CODE, S)
 */

// ImageUtils 由 Rollup intro 從 window.ImageUtils 注入
// 使用 getter 函數以支持測試時的 mock 覆蓋
const getImageUtils = () =>
  (globalThis.window !== undefined && globalThis.ImageUtils) ||
  (globalThis.global !== undefined && globalThis.ImageUtils) ||
  {};

import Logger from '../../utils/Logger.js';

import {
  BLOCKS_SUPPORTING_CHILDREN,
  UNSAFE_LIST_CHILDREN_FOR_FLATTENING,
  CODE_LANGUAGE_MAP,
  IMAGE_LIMITS,
} from '../../config/constants.js';
import { sanitizeUrlForLogging } from '../../utils/securityUtils.js';

/**
 * Notion API 文本長度限制
 *
 * @constant {number}
 */
const MAX_TEXT_LENGTH = 2000;

/**
 * DomConverter 類
 * 負責將 HTML DOM 節點轉換為 Notion Blocks
 */
class DomConverter {
  constructor() {
    this.strategies = this.initStrategies();
    this.imageCount = 0; // Initialize image counter
  }

  /**
   * 初始化轉換策略
   *
   * @returns {object} 標籤到轉換函數的映射表
   */
  initStrategies() {
    return {
      // 標題
      H1: node => this.createHeadingBlock('heading_1', node),
      H2: node => this.createHeadingBlock('heading_2', node),
      H3: node => this.createHeadingBlock('heading_3', node),
      H4: node => this.createBoldParagraphBlock(node),
      H5: node => this.createBoldParagraphBlock(node),
      H6: node => this.createBoldParagraphBlock(node),

      // 段落
      P: node => this.createParagraphBlock(node),
      DIV: node => this.processDiv(node),

      // 列表
      UL: node => this.processList(node, 'bulleted_list_item'),
      OL: node => this.processList(node, 'numbered_list_item'),
      LI: node => this.processListItem(node), // 通常由 processList 內部處理，但保留以防萬一

      // 引用
      BLOCKQUOTE: node => this.createQuoteBlock(node),

      // 代碼塊
      PRE: node => DomConverter.createCodeBlock(node),

      // 圖片
      IMG: node => this.createImageBlock(node),
      FIGURE: node => this.processFigure(node),

      // 分隔線
      HR: () => ({ object: 'block', type: 'divider', divider: {} }),

      // 其他容器，直接處理子節點
      ARTICLE: node => this.processChildren(node),
      SECTION: node => this.processChildren(node),
      MAIN: node => this.processChildren(node),
    };
  }

  /**
   * 將 HTML 轉換為 Notion 區塊陣列
   *
   * @param {string|Node} htmlOrNode - HTML 字串或 DOM 節點
   * @returns {Array} Notion 區塊陣列
   */
  convert(htmlOrNode) {
    this.imageCount = 0; // Reset counter for new conversion
    let rootNode = null;
    if (typeof htmlOrNode === 'string') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlOrNode, 'text/html');
      rootNode = doc.body;
    } else {
      rootNode = htmlOrNode;
    }

    const blocks = this.processChildren(rootNode);
    return DomConverter.cleanBlocks(blocks);
  }

  /**
   * 處理子節點
   *
   * @param {Node} parentNode
   * @returns {Array} Blocks
   */
  processChildren(parentNode) {
    const blocks = [];
    parentNode.childNodes.forEach(child => {
      const result = this.processNode(child);
      if (result) {
        if (Array.isArray(result)) {
          // 只 push 有效的 blocks（必須有 type）
          result.forEach(item => {
            if (item && typeof item === 'object' && item.type) {
              blocks.push(item);
            }
          });
        } else if (typeof result === 'object' && result.type) {
          blocks.push(result);
        }
      }
    });
    return blocks;
  }

  /**
   * 處理單個節點
   *
   * @param {Node} node
   * @returns {object | Array | null} Block or Array of Blocks
   */
  processNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    // 忽略隱藏元素
    if (node.style?.display === 'none' || node.style?.visibility === 'hidden') {
      return null;
    }

    const strategy = this.strategies[node.tagName];
    if (strategy) {
      return strategy(node);
    }

    // 對於未定義策略的元素（如 span, b, i 等在 block 層級出現時），
    // 或者其他容器（header, footer 等），默認處理其子節點（穿透）
    // 但如果是 inline 元素被當作 block，可能需要包裝成 paragraph？
    // 這裡我們簡單地採用穿透策略，嘗試提取有用的子 Block
    return this.processChildren(node);
  }

  processListItem(node) {
    // 默認 LI 處理器 (針對未被 processList 捕獲的孤立 LI)
    return this.createListItemBlock(node, 'bulleted_list_item');
  }

  // --- Block Creation Helpers ---

  createHeadingBlock(type, node) {
    const richText = this.parseRichText(node);
    if (richText.length === 0) {
      return null;
    }
    return {
      object: 'block',
      type,
      [type]: { rich_text: richText },
    };
  }

  createBoldParagraphBlock(node) {
    const richText = this.parseRichText(node);
    if (richText.length === 0) {
      return null;
    }

    // 加粗整個段落
    const boldRichText = richText.map(rt => {
      if (rt.type === 'text') {
        return {
          ...rt,
          annotations: { ...rt.annotations, bold: true },
        };
      }
      return rt;
    });

    return {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: boldRichText },
    };
  }

  createParagraphBlock(node) {
    // 檢查是否包含圖片（Image inside P）
    const img = node.querySelector('img');
    // 如果段落只包含圖片，直接返回圖片 Block
    if (img && node.textContent.trim().length === 0) {
      return this.createImageBlock(img);
    }

    // 檢查是否是 "偽裝列表" (List-like paragraph)
    // 簡單判斷：如果包含 <br> 且有多行，暫時先當作普通段落處理，
    // 未來可以加入類似原有 DomConverter 的智能檢測邏輯。
    // 為了保持 2.1 版本重構的純粹性，我們先專注於標準 P 標籤

    const richText = this.parseRichText(node);
    if (richText.length === 0) {
      return null;
    }

    return {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: richText },
    };
  }

  processDiv(node) {
    // Div 是一個通用容器。
    // 策略：直接處理子節點 (Unwrap)
    return this.processChildren(node);
  }

  processList(node, type) {
    const blocks = [];

    // 遍歷子節點，只處理 LI
    node.childNodes.forEach(child => {
      if (child.nodeName === 'LI') {
        // 處理 LI
        const liBlock = this.createListItemBlock(child, type);
        if (liBlock) {
          blocks.push(liBlock);
        }
      } else {
        // 處理非 LI 直接子節點 (可能是嵌套錯誤的 HTML，嘗試穿透)
        const result = this.processNode(child);
        if (result) {
          if (Array.isArray(result)) {
            blocks.push(...result);
          } else {
            blocks.push(result);
          }
        }
      }
    });

    return blocks;
  }

  createListItemBlock(node, type) {
    // LI 可能包含：
    // 1. 純文本/Inline 元素 -> rich_text
    // 2. Block 級元素 (P, H1) -> 這裡需要決定是合併還是作為 children
    // 3. 嵌套列表 (UL, OL) -> children

    const { richTexts, childrenBlocks } = this._processListItemNodes(node, type);

    // 合併相鄰的 Text 節點 (優化)
    const mergedRichText = DomConverter.mergeRichText(richTexts);

    const block = {
      object: 'block',
      type,
      [type]: {
        rich_text: mergedRichText,
      },
    };

    if (childrenBlocks.length > 0) {
      block[type].children = childrenBlocks;
    }

    return block;
  }

  _processListItemNodes(node) {
    const richTexts = [];
    const childrenBlocks = [];

    node.childNodes.forEach(child => {
      this._processListItemChild(child, richTexts, childrenBlocks);
    });

    return { richTexts, childrenBlocks };
  }

  _processListItemChild(child, richTexts, childrenBlocks) {
    if (['UL', 'OL'].includes(child.nodeName)) {
      this._processListInsideItem(child, childrenBlocks);
    } else if (child.nodeName === 'P') {
      const pRichText = this.parseRichText(child);
      richTexts.push(...pRichText);
    } else if (child.nodeType !== Node.ELEMENT_NODE || DomConverter.isInlineNode(child)) {
      this._processTextInsideItem(child, richTexts);
    } else {
      this._processBlockInsideItem(child, childrenBlocks);
    }
  }

  _processListInsideItem(child, childrenBlocks) {
    const nestedBlocks = this.processList(
      child,
      child.nodeName === 'OL' ? 'numbered_list_item' : 'bulleted_list_item'
    );
    childrenBlocks.push(...nestedBlocks);
  }

  _processTextInsideItem(child, richTexts) {
    const rt = this.processInlineNode(child);
    if (rt && rt.length > 0) {
      richTexts.push(...rt);
    }
  }

  _processBlockInsideItem(child, childrenBlocks) {
    const result = this.processNode(child);
    if (result) {
      if (Array.isArray(result)) {
        childrenBlocks.push(...result);
      } else {
        childrenBlocks.push(result);
      }
    }
  }

  createQuoteBlock(node) {
    // 引用可以包含複雜內容，但 Notion Quote 主要由 rich_text 構成。
    // 如果引用包含多個段落，通常第一個段落是 quote text，後續作為 children。
    const richText = this.parseRichText(node); // 這會提取所有文本
    if (richText.length === 0) {
      return null;
    }

    return {
      object: 'block',
      type: 'quote',
      quote: { rich_text: richText },
    };
  }

  static createCodeBlock(node) {
    // PRE 通常包含 CODE
    const codeNode = node.querySelector('code') || node;
    const text = codeNode.textContent || '';

    // 嘗試獲取語言
    let language = 'plain text';
    const className = codeNode.className || node.className || '';
    const langMatch = className.match(/language-(\w+)|lang-(\w+)/);
    if (langMatch) {
      language = DomConverter.mapLanguage(langMatch[1] || langMatch[2]);
    }

    return {
      object: 'block',
      type: 'code',
      code: {
        rich_text: [
          { type: 'text', text: { content: text.slice(0, Math.max(0, MAX_TEXT_LENGTH)) } },
        ],
        language,
      },
    };
  }

  createImageBlock(node) {
    // Check image limit
    if (this.imageCount >= IMAGE_LIMITS.MAX_MAIN_CONTENT_IMAGES) {
      Logger.info('已達主要內容圖片數量上限，跳過圖片', {
        action: 'createImageBlock',
        currentCount: this.imageCount,
        max: IMAGE_LIMITS.MAX_MAIN_CONTENT_IMAGES,
      });
      return null;
    }

    const { extractImageSrc, cleanImageUrl, isValidCleanedImageUrl } = getImageUtils();
    const src = extractImageSrc?.(node);
    if (!src) {
      return null;
    }

    let finalUrl = src;
    try {
      finalUrl = new URL(src, document.baseURI).href;
      finalUrl = cleanImageUrl?.(finalUrl) ?? finalUrl;
    } catch {
      // ignore invalid url
    }

    // 使用已清理的 URL 進行驗證，避免重複標準化
    if (isValidCleanedImageUrl && !isValidCleanedImageUrl(finalUrl)) {
      Logger.warn('[Content] Dropping invalid image to ensure page save', {
        action: 'createImageBlock',
        url: sanitizeUrlForLogging(finalUrl),
      });
      return null;
    }

    const alt = node.getAttribute('alt') || '';

    const block = {
      object: 'block',
      type: 'image',
      image: {
        type: 'external',
        external: { url: finalUrl },
        caption: alt ? [{ type: 'text', text: { content: alt } }] : [],
      },
    };

    this.imageCount++; // Increment counter
    return block;
  }

  processFigure(node) {
    // 處理 Figure，通常包含 Img 和 Figcaption
    const img = node.querySelector('img');
    if (img) {
      const block = this.createImageBlock(img);
      const caption = node.querySelector('figcaption');
      if (block && caption) {
        const captionText = caption.textContent.trim();
        if (captionText) {
          block.image.caption = [{ type: 'text', text: { content: captionText } }];
        }
      }
      return block;
    }
    return null;
  }

  // --- Rich Text Parsing ---

  parseRichText(node) {
    const richTexts = [];
    node.childNodes.forEach(child => {
      const rt = this.processInlineNode(child);
      if (rt && rt.length > 0) {
        richTexts.push(...rt);
      }
    });
    return DomConverter.mergeRichText(richTexts);
  }

  processInlineNode(node, annotations = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      return this._processTextNode(node, annotations);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return [];
    }

    // 合併樣式
    const newAnnotations = this._mergeAnnotations(node, annotations);

    // 連結處理
    const link = this._extractLink(node);

    // 遞歸處理子節點
    const childrenRichTexts = [];
    node.childNodes.forEach(child => {
      const rt = this.processInlineNode(child, newAnnotations);
      if (rt && rt.length > 0) {
        if (link) {
          this._applyLinkToRichTexts(rt, link);
        }
        childrenRichTexts.push(...rt);
      }
    });

    return childrenRichTexts;
  }

  _processTextNode(node, annotations) {
    const text = node.textContent;
    if (!text) {
      return [];
    }
    return [
      {
        type: 'text',
        text: { content: text },
        annotations: { ...annotations },
      },
    ];
  }

  _mergeAnnotations(node, annotations) {
    const newAnnotations = { ...annotations };
    const tagName = node.tagName;

    if (['B', 'STRONG'].includes(tagName)) {
      newAnnotations.bold = true;
    } else if (['I', 'EM'].includes(tagName)) {
      newAnnotations.italic = true;
    } else if (['U', 'INS'].includes(tagName)) {
      newAnnotations.underline = true;
    } else if (['S', 'DEL', 'STRIKE'].includes(tagName)) {
      newAnnotations.strikethrough = true;
    } else if (['CODE', 'KBD', 'SAMP', 'TT'].includes(tagName)) {
      newAnnotations.code = true;
    }

    return newAnnotations;
  }

  _extractLink(node) {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href');
      if (href) {
        try {
          const url = new URL(href, document.baseURI);
          if (['http:', 'https:'].includes(url.protocol)) {
            return { url: url.href };
          }
        } catch {
          /* ignore */
        }
      }
    }
    return null;
  }

  _applyLinkToRichTexts(richTexts, link) {
    if (!link) {
      return;
    }
    richTexts.forEach(item => {
      if (item.text) {
        item.text.link = link;
      }
    });
  }

  static isInlineNode(node) {
    const inlineTags = ['#text', 'A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'CODE', 'SPAN', 'BR'];
    return inlineTags.includes(node.nodeName);
  }

  static mergeRichText(richTextArray) {
    if (richTextArray.length === 0) {
      return [];
    }

    const merged = [];
    let current = richTextArray[0];

    for (let i = 1; i < richTextArray.length; i++) {
      const next = richTextArray[i];
      // 如果樣式和連結完全相同，則合併文本
      if (
        DomConverter.areAnnotationsEqual(current.annotations, next.annotations) &&
        DomConverter.areLinksEqual(current.text?.link, next.text?.link)
      ) {
        current.text.content += next.text.content;
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
    return merged;
  }

  static areAnnotationsEqual(a1 = {}, a2 = {}) {
    const keys = ['bold', 'italic', 'strikethrough', 'underline', 'code', 'color'];
    return keys.every(k => Boolean(a1[k]) === Boolean(a2[k]));
  }

  static areLinksEqual(l1, l2) {
    return l1?.url === l2?.url;
  }

  // --- Utils ---

  static mapLanguage(lang) {
    if (!lang) {
      return 'plain text';
    }
    return CODE_LANGUAGE_MAP[lang.toLowerCase()] || lang;
  }

  /**
   * 遞歸清洗 Block 結構，確保符合 Notion API 規範 (2025-09-03)
   * 1. 移除不支持 children 的 block 的 children 屬性
   * 2. 截斷過長的 rich_text
   *
   * @param {Array} blocks - 要清洗的 Notion 區塊陣列
   * @param {number} [depth=0] - 遞歸深度
   * @returns {Array} 清洗後的區塊陣列
   */
  static cleanBlocks(blocks, depth = 0) {
    if (!blocks || !Array.isArray(blocks)) {
      return [];
    }

    return blocks.flatMap(block => {
      // 1. Basic Validation
      if (!block || typeof block !== 'object' || !block.type || !block[block.type]) {
        return [];
      }

      // 2. Process Rich Text
      DomConverter._cleanRichText(block);

      // 3. Process Children (Recursion / Flattening)
      return DomConverter._cleanBlockChildren(block, depth);
    });
  }

  static _cleanRichText(block) {
    const type = block.type;
    const blockData = block[type];

    if (!blockData.rich_text || blockData.rich_text.length === 0) {
      // Ensure rich_text exists if property is present?
      // Note: Some blocks might imply rich_text.
      // Original code checked block[type].rich_text existence.
      if (blockData.rich_text) {
        blockData.rich_text = [{ type: 'text', text: { content: ' ' } }];
      }
      return;
    }

    let totalLength = 0;
    const processedRichText = [];

    for (const rt of blockData.rich_text) {
      let content = rt.text?.content || '';
      content = content.trim();

      if (!content && blockData.rich_text.length === 1) {
        content = ' ';
      }

      if (totalLength + content.length > 2000) {
        const remaining = 2000 - totalLength;
        if (remaining > 0) {
          rt.text.content = content.slice(0, Math.max(0, remaining));
          processedRichText.push(rt);
        }
        break; // Max reached
      } else if (content) {
        rt.text.content = content;
        totalLength += content.length;
        processedRichText.push(rt);
      }
    }

    blockData.rich_text = processedRichText;
    if (blockData.rich_text.length === 0) {
      blockData.rich_text = [{ type: 'text', text: { content: ' ' } }];
    }
  }

  static _cleanBlockChildren(block, depth) {
    const type = block.type;
    const blockTypeData = block[type];
    const hasChildren = blockTypeData?.children && blockTypeData.children.length > 0;

    if (!hasChildren) {
      return [block];
    }

    const MAX_DEPTH = 1;
    const isSupportedType = BLOCKS_SUPPORTING_CHILDREN.includes(type);

    const hasUnsafeChild = blockTypeData.children.some(
      child => child && UNSAFE_LIST_CHILDREN_FOR_FLATTENING.includes(child.type)
    );

    const shouldFlatten =
      !isSupportedType || depth > MAX_DEPTH || (block.type.includes('list_item') && hasUnsafeChild);

    if (!shouldFlatten) {
      blockTypeData.children = DomConverter.cleanBlocks(blockTypeData.children, depth + 1);
      if (blockTypeData.children.length === 0) {
        delete blockTypeData.children;
      }
      return [block];
    }

    // Flatten
    const children = blockTypeData.children;
    delete blockTypeData.children;
    const cleanChildren = DomConverter.cleanBlocks(children, depth);

    return [block, ...cleanChildren];
  }
}

// 導出單例
const domConverter = new DomConverter();

export { DomConverter, domConverter };
