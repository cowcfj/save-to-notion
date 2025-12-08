/**
 * DomConverter - DOM 轉 Notion Block 轉換器
 *
 * 職責:
 * - 將 HTML/DOM 結構轉換為 Notion Block 格式
 * - 支援遞歸處理嵌套結構 (如嵌套列表)
 * - 處理各種 HTML 標籤 (H1-H3, P, UL/OL/LI, IMG, BLOCKQUOTE, PRE, HR)
 * - 解析 Rich Text (B, I, A, CODE, S)
 */

/* global ImageUtils */

/**
 * Notion API 文本長度限制
 * @constant {number}
 */
const MAX_TEXT_LENGTH = 2000;
import {
  BLOCKS_SUPPORTING_CHILDREN,
  UNSAFE_LIST_CHILDREN_FOR_FLATTENING,
} from '../../config/constants.js';

/**
 * DomConverter 類
 * 負責將 HTML DOM 節點轉換為 Notion Blocks
 */
class DomConverter {
  constructor() {
    this.strategies = this.initStrategies();
  }

  /**
   * 初始化轉換策略
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
      IMG: node => DomConverter.createImageBlock(node),
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
   * @param {string|Node} htmlOrNode - HTML 字串或 DOM 節點
   * @returns {Array} Notion 區塊陣列
   */
  convert(htmlOrNode) {
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
   * @param {Node} parentNode
   * @returns {Array} Blocks
   */
  processChildren(parentNode) {
    const blocks = [];
    parentNode.childNodes.forEach(child => {
      const result = this.processNode(child);
      if (result) {
        if (Array.isArray(result)) {
          blocks.push(...result);
        } else {
          blocks.push(result);
        }
      }
    });
    return blocks;
  }

  /**
   * 處理單個節點
   * @param {Node} node
   * @returns {Object|Array|null} Block or Array of Blocks
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
    if (!richText.length) {
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
    if (!richText.length) {
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
      return DomConverter.createImageBlock(img);
    }

    // 檢查是否是 "偽裝列表" (List-like paragraph)
    // 簡單判斷：如果包含 <br> 且有多行，暫時先當作普通段落處理，
    // 未來可以加入類似原有 DomConverter 的智能檢測邏輯。
    // 為了保持 2.1 版本重構的純粹性，我們先專注於標準 P 標籤

    const richText = this.parseRichText(node);
    if (!richText.length) {
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

    // 簡化策略：
    // 1. 提取 LI 的 "直接" 文本內容作為 item title
    // 2. 提取 LI 內的 "嵌套列表" 作為 children

    // 為了準確提取 Text，我們需要遍歷 childNodes
    const richTexts = [];
    const childrenBlocks = [];

    node.childNodes.forEach(child => {
      if (['UL', 'OL'].includes(child.nodeName)) {
        // 嵌套列表 -> Children
        const nestedBlocks = this.processList(
          child,
          child.nodeName === 'OL' ? 'numbered_list_item' : 'bulleted_list_item'
        );
        childrenBlocks.push(...nestedBlocks);
      } else if (child.nodeName === 'P') {
        // 如果 LI 內部有 P，通常 P 的內容就是列表文本
        // 但如果有多個 P，第一個是文本，後面的是 children??
        // Notion 列表項本身就有文本，所以我們把第一個 P 的內容合併進來
        const pRichText = this.parseRichText(child);
        richTexts.push(...pRichText);
        // P 之後如果還有其他 Block 級元素，怎麼辦？
        // 暫時將其忽略或作為文本附加
      } else if (child.nodeType !== Node.ELEMENT_NODE || DomConverter.isInlineNode(child)) {
        // Inline 内容 -> Rich Text
        const rt = this.processInlineNode(child);
        if (rt) {
          if (Array.isArray(rt)) {
            richTexts.push(...rt);
          } else {
            richTexts.push(rt);
          }
        }
      } else {
        // 其他 Block 級元素 (如 Div, Quote) -> Children
        const result = this.processNode(child);
        if (result) {
          if (Array.isArray(result)) {
            childrenBlocks.push(...result);
          } else {
            childrenBlocks.push(result);
          }
        }
      }
    });

    // 如果沒有文本，給個預設空字符，否則 Notion 可能會報錯
    // 實際上 Notion 允許空 list item

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
      block.children = childrenBlocks;
    }

    return block;
  }

  createQuoteBlock(node) {
    // 引用可以包含複雜內容，但 Notion Quote 主要由 rich_text 構成。
    // 如果引用包含多個段落，通常第一個段落是 quote text，後續作為 children。
    const richText = this.parseRichText(node); // 這會提取所有文本
    if (!richText.length) {
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
        rich_text: [{ type: 'text', text: { content: text.substring(0, MAX_TEXT_LENGTH) } }],
        language,
      },
    };
  }

  static createImageBlock(node) {
    const src = ImageUtils.extractImageSrc(node);
    if (!src) {
      return null;
    }

    let finalUrl = src;
    try {
      finalUrl = new URL(src, document.baseURI).href;
      finalUrl = ImageUtils.cleanImageUrl(finalUrl);
    } catch (_error) {
      // ignore invalid url
    }

    const alt = node.getAttribute('alt') || '';

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

  processFigure(node) {
    // 處理 Figure，通常包含 Img 和 Figcaption
    const img = node.querySelector('img');
    if (img) {
      const block = DomConverter.createImageBlock(img);
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
      if (rt) {
        if (Array.isArray(rt)) {
          richTexts.push(...rt);
        } else {
          richTexts.push(rt);
        }
      }
    });
    return DomConverter.mergeRichText(richTexts);
  }

  processInlineNode(node, annotations = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (!text) {
        return null;
      }
      // 注意：不要在這裡 trim()，否則會丟失詞與詞之間的空格
      // 只有在 block 開頭結尾才 trim，或者完全信任 DOM 的空白
      return {
        type: 'text',
        text: { content: text },
        annotations: { ...annotations },
      };
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    // 合併樣式
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

    // 連結處理
    let link = null;
    if (tagName === 'A') {
      const href = node.getAttribute('href');
      // 使用正則避免 "Script URL is a form of eval" 警告
      if (href && !/^javascript:/iu.test(href)) {
        try {
          link = { url: new URL(href, document.baseURI).href };
        } catch (_error) {
          /* ignore */
        }
      }
    }

    // 遞歸處理子節點
    const childrenRichTexts = [];
    node.childNodes.forEach(child => {
      const rt = this.processInlineNode(child, newAnnotations);
      if (rt) {
        if (Array.isArray(rt)) {
          if (link) {
            rt.forEach(item => {
              if (item.text) {
                item.text.link = link;
              }
            });
          }
          childrenRichTexts.push(...rt);
        } else {
          if (link && rt.text) {
            rt.text.link = link;
          }
          childrenRichTexts.push(rt);
        }
      }
    });

    return childrenRichTexts;
  }

  static isInlineNode(node) {
    const inlineTags = ['#text', 'A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'CODE', 'SPAN', 'BR'];
    return inlineTags.includes(node.nodeName);
  }

  static mergeRichText(richTextArray) {
    if (!richTextArray.length) {
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
    const map = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      md: 'markdown',
      html: 'html',
      css: 'css',
      json: 'json',
      sh: 'bash',
      bash: 'bash',
      c: 'c',
      cpp: 'c++',
      java: 'java',
      go: 'go',
      rust: 'rust',
    };
    return map[lang.toLowerCase()] || lang;
  }

  /**
   * 遞歸清洗 Block 結構，確保符合 Notion API 規範 (2025-09-03)
   * 1. 移除不支持 children 的 block 的 children 屬性
   * 2. 截斷過長的 rich_text
   */
  static cleanBlocks(blocks, depth = 0) {
    if (!blocks || !Array.isArray(blocks)) {
      return [];
    }

    return blocks.flatMap(block => {
      const type = block.type;

      // Safety Check: block[type] must exist
      if (!block[type]) {
        return [];
      }

      // 1. 處理 Rich Text: 截斷 & Trim & 防空
      if (block[type]?.rich_text) {
        if (block[type].rich_text.length === 0) {
          block[type].rich_text = [{ type: 'text', text: { content: ' ' } }];
        } else {
          let totalLength = 0;
          block[type].rich_text = block[type].rich_text.reduce((acc, rt) => {
            // TRIM: Remove leading/trailing newlines which can confuse Notion
            let content = rt.text?.content || '';
            // Only trim if it's the first or last item? Or always?
            // Safer to just trim. Notion blocks are block-level.
            content = content.trim();
            // If trim made it empty, but it's the only text?
            if (!content && block[type].rich_text.length === 1) {
              content = ' ';
            }

            if (totalLength + content.length > 2000) {
              const remaining = 2000 - totalLength;
              if (remaining > 0) {
                rt.text.content = content.substring(0, remaining);
                acc.push(rt);
              }
              totalLength = 2000;
            } else if (content) {
              // 如果 trim 後非空，或原本就是空(被上面的 guard 處理)
              rt.text.content = content;
              totalLength += content.length;
              acc.push(rt);
            }
            return acc;
          }, []);
          // Final check: if reduce resulted in empty array
          if (block[type].rich_text.length === 0) {
            block[type].rich_text = [{ type: 'text', text: { content: ' ' } }];
          }
        }
      }

      // 2. 處理 Children (深度限制 & Flattening)
      if (block.children && block.children.length > 0) {
        const MAX_DEPTH = 1;
        const isSupportedType = BLOCKS_SUPPORTING_CHILDREN.includes(type);

        const hasUnsafeChild = block.children.some(child =>
          UNSAFE_LIST_CHILDREN_FOR_FLATTENING.includes(child.type)
        );
        const shouldFlatten =
          !isSupportedType ||
          depth > MAX_DEPTH ||
          (block.type.includes('list_item') && hasUnsafeChild);

        if (!shouldFlatten) {
          // 遞歸清洗子節點 (Keep Nesting)
          block.children = DomConverter.cleanBlocks(block.children, depth + 1);
          if (block.children.length === 0) {
            delete block.children;
          }
          return [block];
        }

        // Flatten: 返回 [Parent, ...Children]
        // 先移除父節點的 children 屬性
        const children = block.children;
        delete block.children;

        // 遞歸清洗子節點（它們現在變成頂層/兄弟了，保持相對深度）
        const cleanChildren = DomConverter.cleanBlocks(children, depth);

        return [block, ...cleanChildren];
      }

      return [block];
    });
  }
}

// 導出單例
const domConverter = new DomConverter();

export { DomConverter, domConverter };
