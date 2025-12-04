/**
 * MarkdownConverter - Markdown 轉 Notion Block 轉換器
 *
 * 職責:
 * - 將 Markdown 文本轉換為 Notion Block 格式
 * - 將 HTML 轉換為 Markdown (使用 Turndown)
 * - 處理 Markdown 語法 (標題, 列表, 代碼塊, 引用, 圖片等)
 */

/* global Logger, TurndownService, turndownPluginGfm */

class MarkdownConverter {
  constructor() {
    this.turndownService = null;
  }

  /**
   * 獲取或初始化 TurndownService
   */
  getTurndownService() {
    if (this.turndownService) {
      return this.turndownService;
    }

    if (typeof TurndownService === 'undefined') {
      Logger.warn('⚠️ TurndownService not loaded');
      return null;
    }

    const service = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '_',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full',
      blankReplacement(_content, node) {
        return node.isBlock ? '\n\n' : '';
      },
    });

    if (typeof turndownPluginGfm !== 'undefined') {
      service.use(turndownPluginGfm.gfm);
    }

    // 自定義規則：保留嵌套列表結構
    service.addRule('nestedLists', {
      filter: ['ul', 'ol'],
      replacement(content, node) {
        const parent = node.parentNode;
        if (parent?.nodeName === 'LI') {
          const lines = content.trim().split('\n');
          const indentedLines = lines.map(line => {
            if (line.trim()) {
              return `  ${line}`;
            }
            return line;
          });
          return `\n${indentedLines.join('\n')}\n`;
        }
        return content;
      },
    });

    // 自定義規則：保留代碼塊的語言標記
    service.addRule('fencedCodeBlock', {
      filter(node, options) {
        return (
          options.codeBlockStyle === 'fenced' &&
          node.nodeName === 'PRE' &&
          node.firstChild?.nodeName === 'CODE'
        );
      },
      replacement(content, node, options) {
        const className = node.firstChild.getAttribute('class') || '';
        const language =
          (className.match(/language-(\S+)/) ||
            className.match(/lang-(\S+)/) ||
            className.match(/highlight-source-(\S+)/) ||
            [])[1] || '';

        const code = node.firstChild.textContent;
        const fence = options.fence;

        return `\n\n${fence}${language}\n${code.replace(/\n$/, '')}\n${fence}\n\n`;
      },
    });

    this.turndownService = service;
    return service;
  }

  /**
   * 將 HTML 轉換為 Notion Blocks (通過 Markdown 中轉)
   * @param {string|Element} html - HTML 字串或元素
   * @returns {Array} Notion Blocks
   */
  convertHtml(html) {
    const service = this.getTurndownService();
    if (!service) {
      return [];
    }

    const markdown = service.turndown(html);
    return this.convertMarkdown(markdown);
  }

  /**
   * 將 Markdown 轉換為 Notion Blocks
   * @param {string} markdown - Markdown 文本
   * @returns {Array} Notion Blocks
   */
  convertMarkdown(markdown) {
    const blocks = [];
    const lines = markdown.split('\n');
    let i = 0;
    let inCodeBlock = false;
    let codeContent = [];
    let codeLanguage = 'plain text';

    const markdownImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      const imageMatches = [...trimmed.matchAll(markdownImageRegex)];

      // 處理代碼塊
      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          // 結束代碼塊
          if (codeContent.length > 0) {
            blocks.push({
              object: 'block',
              type: 'code',
              code: {
                rich_text: [{ type: 'text', text: { content: codeContent.join('\n') } }],
                language: codeLanguage,
              },
            });
          }
          inCodeBlock = false;
          codeContent = [];
          codeLanguage = 'plain text';
        } else {
          // 開始代碼塊
          inCodeBlock = true;
          const lang = trimmed.substring(3).trim();
          codeLanguage = this.mapLanguage(lang) || 'plain text';
        }
        i++;
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        i++;
        continue;
      }

      // 處理純圖片行
      if (imageMatches.length > 0 && trimmed.replace(markdownImageRegex, '').trim() === '') {
        imageMatches.forEach(match => {
          const url = match[2];
          const alt = match[1]?.trim();
          blocks.push({
            object: 'block',
            type: 'image',
            image: {
              type: 'external',
              external: { url },
              caption: alt ? [{ type: 'text', text: { content: alt } }] : [],
            },
          });
        });
        i++;
        continue;
      }

      // 處理標題
      const headingMatch = trimmed.match(/^(#{1,6})\s+(\S.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        if (level <= 3) {
          const blockType = `heading_${level}`;
          blocks.push({
            object: 'block',
            type: blockType,
            [blockType]: { rich_text: this.parseRichText(text) },
          });
        } else {
          // h4-h6 轉為粗體段落
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: text }, annotations: { bold: true } }],
            },
          });
        }
        i++;
        continue;
      }

      // 處理列表
      const unorderedListMatch = trimmed.match(/^[-*+]\s+(\S.*)$/);
      if (unorderedListMatch) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: this.parseRichText(unorderedListMatch[1]) },
        });
        i++;
        continue;
      }

      const orderedListMatch = trimmed.match(/^(\d+)\.\s+(\S.*)$/);
      if (orderedListMatch) {
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: { rich_text: this.parseRichText(orderedListMatch[2]) },
        });
        i++;
        continue;
      }

      // 處理引用
      if (trimmed.startsWith('>')) {
        const quoteText = trimmed.substring(1).trim();
        if (quoteText) {
          blocks.push({
            object: 'block',
            type: 'quote',
            quote: { rich_text: this.parseRichText(quoteText) },
          });
        }
        i++;
        continue;
      }

      // 處理分隔線
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        blocks.push({ object: 'block', type: 'divider', divider: {} });
        i++;
        continue;
      }

      // 處理段落
      if (trimmed) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: this.parseRichText(trimmed) },
        });
      }

      i++;
    }

    return blocks;
  }

  /**
   * 解析富文本
   */
  parseRichText(text) {
    if (!text) {
      return [{ type: 'text', text: { content: '' } }];
    }

    // 簡化版實現，完整版應包含加粗、斜體等解析
    // 這裡暫時只返回純文本，後續可從 htmlToNotionConverter.js 完整遷移 parseRichText 邏輯
    // 為了保持代碼簡潔，這裡先做基本實現
    return [{ type: 'text', text: { content: text } }];
  }

  mapLanguage(lang) {
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
    };
    return map[lang.toLowerCase()] || lang;
  }
}

const markdownConverter = new MarkdownConverter();

export { MarkdownConverter, markdownConverter };
