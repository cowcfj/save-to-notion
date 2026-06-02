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
const getImageUtils = () => globalThis.ImageUtils ?? {};

import Logger from '../../utils/Logger.js';

import { IMAGE_LIMITS } from '../../config/shared/content.js';
import {
  MAX_CODE_LANGUAGE_HINT_LENGTH,
  NOTION_CODE_LANGUAGE_OBJECTIVE_C,
  NOTION_CODE_LANGUAGE_PLAIN_TEXT,
  NOTION_SUPPORTED_LANGUAGES,
} from '../../config/notionCodeLanguages.js';
import { sanitizeUrlForLogging } from '../../utils/securityUtils.js';

/**
 * Notion API 文本長度限制
 *
 * @constant {number}
 */
const MAX_TEXT_LENGTH = 2000;

/**
 * CSS class name 常見縮寫與別名 → Notion API 語言值的映射表
 * 用於將 `language-xxx` / `lang-xxx` class 轉換為 Notion 接受的語言字串
 *
 * @constant {{[key: string]: string}}
 */
const CODE_LANGUAGE_MAP = {
  // 常見縮寫與別名
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  md: 'markdown',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  objc: NOTION_CODE_LANGUAGE_OBJECTIVE_C,
  objectivec: NOTION_CODE_LANGUAGE_OBJECTIVE_C,
  'obj-c': NOTION_CODE_LANGUAGE_OBJECTIVE_C,
  dockerfile: 'docker',
  tf: 'hcl',
  terraform: 'hcl',
  csharp: 'c#',
  fsharp: 'f#',
  vb: 'visual basic',
  tex: 'latex',
  asm: 'assembly',
  wasm: 'webassembly',
  cpp: 'c++',
  jsx: 'javascript',
  tsx: 'typescript',
  plaintext: NOTION_CODE_LANGUAGE_PLAIN_TEXT,
  'plain-text': NOTION_CODE_LANGUAGE_PLAIN_TEXT,
  plain_text: NOTION_CODE_LANGUAGE_PLAIN_TEXT,
  text: NOTION_CODE_LANGUAGE_PLAIN_TEXT,
  txt: NOTION_CODE_LANGUAGE_PLAIN_TEXT,
};

/**
 * 支持嵌套 Children 的 Block 類型 (Notion API 2025-09-03)
 */
const BLOCKS_SUPPORTING_CHILDREN = new Set([
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'toggle',
  'callout',
  'column_list',
  'column',
]);

/**
 * 在列表項 (List Item) 中不安全、需要被扁平化 (Flatten) 的子 Blocks 類型
 * Notion API 對於列表內嵌套複雜 Block (如圖片、Code、Header) 往往校驗失敗。
 */
const UNSAFE_LIST_CHILDREN_FOR_FLATTENING = new Set([
  'code',
  'image',
  'bookmark',
  'embed',
  'video',
  'pdf',
  'file',
  'audio',
  'equation',
  'divider',
  'table',
  'callout',
  'quote',
  'heading_1',
  'heading_2',
  'heading_3',
]);

/**
 * HTML 標籤到 Notion Rich Text Annotations 屬性名稱的映射表
 */
const INLINE_ANNOTATION_BY_TAG = {
  B: 'bold',
  STRONG: 'bold',
  I: 'italic',
  EM: 'italic',
  U: 'underline',
  INS: 'underline',
  S: 'strikethrough',
  DEL: 'strikethrough',
  STRIKE: 'strikethrough',
  CODE: 'code',
  KBD: 'code',
  SAMP: 'code',
  TT: 'code',
};

/**
 * 用於搜尋代碼語言提示的 HTML 屬性清單
 */
const CODE_LANGUAGE_HINT_ATTRIBUTES = ['data-language', 'data-lang', 'language', 'lang'];

/**
 * 用於搜尋代碼語言提示的 class 名稱前綴清單
 */
const CODE_LANGUAGE_CLASS_PREFIXES = ['language-', 'lang-'];

/**
 * Notion block children 遞迴保留深度上限
 */
const MAX_BLOCK_CHILD_DEPTH = 1;

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
      if (!result) {
        return;
      }

      if (Array.isArray(result)) {
        result.forEach(item => DomConverter._appendValidBlock(blocks, item));
        return;
      }

      DomConverter._appendValidBlock(blocks, result);
    });
    return blocks;
  }

  static _appendValidBlock(blocks, item) {
    if (!DomConverter._isBlockLike(item)) {
      return;
    }

    blocks.push(item);
  }

  static _isBlockLike(item) {
    if (!item) {
      return false;
    }

    if (typeof item !== 'object') {
      return false;
    }

    return Boolean(item.type);
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

    if (DomConverter._isHiddenElement(node)) {
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

  static _isHiddenElement(node) {
    if (node.style?.display === 'none') {
      return true;
    }

    return node.style?.visibility === 'hidden';
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
    const imageOnlyParagraphImages = DomConverter._getImageOnlyParagraphImages(node);
    if (imageOnlyParagraphImages.length > 0) {
      return imageOnlyParagraphImages.map(img => this.createImageBlock(img)).filter(Boolean);
    }

    // 檢查是否是 "偽裝列表" (List-like paragraph)
    // 簡單判斷：如果包含 <br> 且有多行，暫時先當作普通段落處理，
    // 未來可以加入類似原有 DomConverter 的智能檢測邏輯。
    // 為了保持 2.1 版本重構的純粹性，我們先專注於標準 P 標籤

    const richText = this.parseRichText(node);
    if (richText.length === 0) {
      return [];
    }

    return [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: richText },
      },
    ];
  }

  static _getImageOnlyParagraphImages(node) {
    if (node.textContent.trim().length > 0) {
      return [];
    }

    return Array.from(node.querySelectorAll('img'));
  }

  processDiv(node) {
    // Div 是一個通用容器。
    // 策略：直接處理子節點 (Unwrap)
    return this.processChildren(node);
  }

  _appendBlocks(blocks, result) {
    if (!result) {
      return;
    }
    if (Array.isArray(result)) {
      blocks.push(...result);
    } else {
      blocks.push(result);
    }
  }

  _appendConvertedListChild(blocks, child, type) {
    if (child.nodeName === 'LI') {
      const liBlock = this.createListItemBlock(child, type);
      if (liBlock) {
        blocks.push(liBlock);
      }
    } else {
      const result = this.processNode(child);
      this._appendBlocks(blocks, result);
    }
  }

  processList(node, type) {
    const blocks = [];
    node.childNodes.forEach(child => {
      this._appendConvertedListChild(blocks, child, type);
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
    } else if (DomConverter._isListItemInlineContent(child)) {
      this._processTextInsideItem(child, richTexts);
    } else {
      this._processBlockInsideItem(child, childrenBlocks);
    }
  }

  static _isListItemInlineContent(child) {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      return true;
    }

    return DomConverter.isInlineNode(child);
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
    if (DomConverter._hasRichTextItems(rt)) {
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
    const codeNode = node.querySelector('code') ?? node;
    const text = codeNode.textContent ?? '';
    const language = DomConverter.extractCodeLanguage(node, codeNode);

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

  _resolveImageExternalUrl(src, cleanImageUrl) {
    let resolved;
    try {
      resolved = new URL(src, document.baseURI).href;
    } catch {
      return src;
    }

    if (typeof cleanImageUrl !== 'function') {
      return resolved;
    }

    try {
      return cleanImageUrl(resolved);
    } catch {
      return resolved;
    }
  }

  _buildImageBlock(finalUrl, alt) {
    return {
      object: 'block',
      type: 'image',
      image: {
        type: 'external',
        external: { url: finalUrl },
        caption: alt ? [{ type: 'text', text: { content: alt } }] : [],
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

    const finalUrl = this._resolveImageExternalUrl(src, cleanImageUrl);

    // 使用已清理的 URL 進行驗證，避免重複標準化
    if (DomConverter._isInvalidCleanedImageUrl(isValidCleanedImageUrl, finalUrl)) {
      Logger.warn('[Content] Dropping invalid image to ensure page save', {
        action: 'createImageBlock',
        url: sanitizeUrlForLogging(finalUrl),
      });
      return null;
    }

    const alt = node.getAttribute('alt') ?? '';
    const block = this._buildImageBlock(finalUrl, alt);

    this.imageCount++; // Increment counter
    return block;
  }

  static _isInvalidCleanedImageUrl(isValidCleanedImageUrl, finalUrl) {
    if (!isValidCleanedImageUrl) {
      return false;
    }

    return !isValidCleanedImageUrl(finalUrl);
  }

  processFigure(node) {
    const img = node.querySelector('img');
    if (!img) {
      return null;
    }

    const block = this.createImageBlock(img);
    if (!block) {
      return null;
    }

    const figcaption = node.querySelector('figcaption');
    const captionText = figcaption?.textContent.trim();
    if (captionText) {
      block.image.caption = [{ type: 'text', text: { content: captionText } }];
    }

    return block;
  }

  // --- Rich Text Parsing ---

  parseRichText(node) {
    const richTexts = [];
    node.childNodes.forEach(child => {
      const rt = this.processInlineNode(child);
      if (DomConverter._hasRichTextItems(rt)) {
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
      if (DomConverter._hasRichTextItems(rt)) {
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
    const prop = INLINE_ANNOTATION_BY_TAG[node.tagName];
    if (prop) {
      newAnnotations[prop] = true;
    }
    return newAnnotations;
  }

  _isSupportedLinkProtocol(url) {
    return ['http:', 'https:'].includes(url.protocol);
  }

  _extractLink(node) {
    if (node.tagName !== 'A') {
      return null;
    }

    const href = node.getAttribute('href');
    if (!href) {
      return null;
    }

    try {
      const url = new URL(href, document.baseURI);
      if (this._isSupportedLinkProtocol(url)) {
        return { url: url.href };
      }
    } catch {
      // ignore
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

  static _hasRichTextItems(richTextItems) {
    if (!richTextItems) {
      return false;
    }

    return richTextItems.length > 0;
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
      if (DomConverter._canMergeRichText(current, next)) {
        current.text.content += next.text.content;
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
    return merged;
  }

  static _canMergeRichText(current, next) {
    if (!DomConverter.areAnnotationsEqual(current.annotations, next.annotations)) {
      return false;
    }

    return DomConverter.areLinksEqual(current.text?.link, next.text?.link);
  }

  static areAnnotationsEqual(a1 = {}, a2 = {}) {
    const keys = ['bold', 'italic', 'strikethrough', 'underline', 'code', 'color'];
    return keys.every(k => Boolean(a1[k]) === Boolean(a2[k]));
  }

  static areLinksEqual(l1, l2) {
    return l1?.url === l2?.url;
  }

  // --- Utils ---

  static extractCodeLanguage(preNode, codeNode) {
    const hints = DomConverter.collectCodeLanguageHints(codeNode, preNode);
    for (const hint of hints) {
      const resolved = DomConverter.resolveLanguageHint(hint);
      if (resolved) {
        return resolved;
      }
    }
    return NOTION_CODE_LANGUAGE_PLAIN_TEXT;
  }

  static _addCodeLanguageAttributeHints(hints, node) {
    CODE_LANGUAGE_HINT_ATTRIBUTES.forEach(attr => {
      const value = node.getAttribute(attr);
      const normalizedValue = DomConverter._normalizeCodeLanguageHintValue(value);
      if (normalizedValue) {
        hints.add(normalizedValue);
      }
    });
  }

  static _normalizeCodeLanguageHintValue(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return null;
    }

    return normalizedValue;
  }

  static _addCodeLanguageClassHints(hints, node) {
    Array.from(node.classList ?? []).forEach(token => {
      const normalizedToken = token.toLowerCase();
      for (const prefix of CODE_LANGUAGE_CLASS_PREFIXES) {
        if (normalizedToken.startsWith(prefix)) {
          hints.add(normalizedToken.slice(prefix.length));
          break;
        }
      }
    });
  }

  static collectCodeLanguageHints(...nodes) {
    const hints = new Set();

    nodes.forEach(node => {
      if (node?.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      DomConverter._addCodeLanguageAttributeHints(hints, node);
      DomConverter._addCodeLanguageClassHints(hints, node);
    });

    return [...hints];
  }

  static resolveLanguageHint(lang) {
    if (typeof lang !== 'string') {
      return null;
    }

    const normalized = lang.trim().toLowerCase().slice(0, MAX_CODE_LANGUAGE_HINT_LENGTH);
    if (!normalized) {
      return null;
    }

    const mapped = CODE_LANGUAGE_MAP[normalized] ?? normalized;
    return NOTION_SUPPORTED_LANGUAGES.has(mapped) ? mapped : null;
  }

  static mapLanguage(lang) {
    return DomConverter.resolveLanguageHint(lang) ?? NOTION_CODE_LANGUAGE_PLAIN_TEXT;
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
    if (!DomConverter._isBlockArray(blocks)) {
      return [];
    }

    return blocks.flatMap(block => {
      // 1. Basic Validation
      if (!DomConverter._isCleanableBlock(block)) {
        return [];
      }

      // 2. Process Rich Text
      DomConverter._cleanRichText(block);

      // 3. Process Children (Recursion / Flattening)
      return DomConverter._cleanBlockChildren(block, depth);
    });
  }

  static _isBlockArray(blocks) {
    if (!blocks) {
      return false;
    }

    return Array.isArray(blocks);
  }

  static _isCleanableBlock(block) {
    if (!DomConverter._isBlockLike(block)) {
      return false;
    }

    return Boolean(block[block.type]);
  }

  static _cleanRichText(block) {
    const type = block.type;
    const blockData = block[type];

    if (!DomConverter._hasRichTextItems(blockData.rich_text)) {
      // Ensure rich_text exists if property is present?
      // Note: Some blocks might imply rich_text.
      // Original code checked block[type].rich_text existence.
      if (blockData.rich_text) {
        blockData.rich_text = [{ type: 'text', text: { content: ' ' } }];
      }
      return;
    }

    blockData.rich_text = DomConverter._processRichTextArray(blockData.rich_text);

    if (blockData.rich_text.length === 0) {
      blockData.rich_text = [{ type: 'text', text: { content: ' ' } }];
    }
  }

  static _findRichTextContentBounds(richTextArray) {
    let firstNonEmptyIndex = -1;
    let lastNonEmptyIndex = -1;
    for (const [i, rt] of richTextArray.entries()) {
      const content = rt.text?.content ?? '';
      if (content.trim()) {
        if (firstNonEmptyIndex === -1) {
          firstNonEmptyIndex = i;
        }
        lastNonEmptyIndex = i;
      }
    }
    return { firstNonEmptyIndex, lastNonEmptyIndex };
  }

  static _cloneRichTextWithContent(rt, content) {
    return {
      ...rt,
      text: {
        ...rt.text,
        content,
      },
    };
  }

  static _appendFormattedRichText(processed, rt, content, availableLength) {
    if (!content) {
      return { addedLength: 0, shouldContinue: true };
    }

    if (content.length > availableLength) {
      DomConverter._appendTruncatedRichText(processed, rt, content, availableLength);
      return { addedLength: Math.max(0, availableLength), shouldContinue: false };
    }

    processed.push(DomConverter._cloneRichTextWithContent(rt, content));
    return { addedLength: content.length, shouldContinue: true };
  }

  static _appendTruncatedRichText(processed, rt, content, availableLength) {
    if (availableLength <= 0) {
      return;
    }

    processed.push(DomConverter._cloneRichTextWithContent(rt, content.slice(0, availableLength)));
  }

  static _processRichTextArray(richTextArray) {
    let totalLength = 0;
    const processed = [];
    const count = richTextArray.length;
    const preserveCodeWhitespace = richTextArray.some(rt => rt.annotations?.code === true);

    const bounds = DomConverter._findRichTextContentBounds(richTextArray);

    for (const [index, rt] of richTextArray.entries()) {
      const context = {
        index,
        totalCount: count,
        firstNonEmptyIndex: bounds.firstNonEmptyIndex,
        lastNonEmptyIndex: bounds.lastNonEmptyIndex,
        preserveCodeWhitespace,
      };
      const content = DomConverter._formatRichTextContent(rt.text?.content ?? '', context);
      const appendResult = DomConverter._appendFormattedRichText(
        processed,
        rt,
        content,
        MAX_TEXT_LENGTH - totalLength
      );

      totalLength += appendResult.addedLength;
      if (!appendResult.shouldContinue) {
        break;
      }
    }

    return processed;
  }

  static _formatRichTextContent(content, context) {
    // code rich_text 的前後空白與換行是有語意的，需保留原始內容；
    // 但若整組內容都只有空白，仍維持既有 fallback 路徑，由 _cleanRichText 補單一空格。
    if (context.preserveCodeWhitespace) {
      return context.firstNonEmptyIndex === -1 ? '' : content;
    }

    // 邊界之外的純空白節點：直接返回空字串（會被過濾掉）
    if (context.index < context.firstNonEmptyIndex || context.index > context.lastNonEmptyIndex) {
      return '';
    }

    return DomConverter._formatBoundaryRichTextContent(content, context);
  }

  static _formatBoundaryRichTextContent(content, context) {
    let formatted = content;

    // 只對第一個非空白元素做 trimStart
    if (context.index === context.firstNonEmptyIndex) {
      formatted = formatted.trimStart();
    }

    // 只對最後一個非空白元素做 trimEnd
    if (context.index === context.lastNonEmptyIndex) {
      formatted = formatted.trimEnd();
    }

    if (!formatted.trim() && context.totalCount === 1) {
      return ' ';
    }

    return formatted;
  }

  static _isUnsafeListChild(child) {
    if (!child) {
      return false;
    }

    return UNSAFE_LIST_CHILDREN_FOR_FLATTENING.has(child.type);
  }

  static _hasUnsafeListChild(children) {
    return children.some(child => DomConverter._isUnsafeListChild(child));
  }

  static _isUnsafeListContainer(type, hasUnsafeChild) {
    if (!hasUnsafeChild) {
      return false;
    }

    return type.includes('list_item');
  }

  static _shouldFlattenChildren(type, depth, hasUnsafeChild) {
    if (!BLOCKS_SUPPORTING_CHILDREN.has(type)) {
      return true;
    }

    if (depth > MAX_BLOCK_CHILD_DEPTH) {
      return true;
    }

    return DomConverter._isUnsafeListContainer(type, hasUnsafeChild);
  }

  static _cleanBlockChildren(block, depth) {
    const type = block.type;
    const blockTypeData = block[type];
    const hasChildren = DomConverter._hasBlockChildren(blockTypeData);

    if (!hasChildren) {
      return [block];
    }

    const hasUnsafeChild = DomConverter._hasUnsafeListChild(blockTypeData.children);
    const shouldFlatten = DomConverter._shouldFlattenChildren(type, depth, hasUnsafeChild);

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

  static _hasBlockChildren(blockTypeData) {
    if (!blockTypeData?.children) {
      return false;
    }

    return blockTypeData.children.length > 0;
  }
}

// 導出單例
const domConverter = new DomConverter();

export { DomConverter, domConverter };
