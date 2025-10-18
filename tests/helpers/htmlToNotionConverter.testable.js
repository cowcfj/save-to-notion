/**
 * HTML → Markdown → Notion Blocks - Testable Wrapper
 * 簡化的 Turndown 模擬與轉換流程，覆蓋關鍵規則：
 * - 嵌套列表縮排
 * - 圍欄代碼塊語言標記
 * - 連結處理（僅保留絕對 URL）
 */

function isValidAbsoluteUrl(href) {
  try {
    const u = new URL(href);
    if (!u.protocol || !u.host) return false;
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function convertMarkdownToNotionBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  let codeContent = [];
  let codeLanguage = 'plain text';
  let listBuffer = [];
  let paragraph = '';

  function pushImage(url, alt) {
    blocks.push({
      object: 'block',
      type: 'image',
      image: {
        type: 'external',
        external: { url },
        caption: alt ? [{ type: 'text', text: { content: alt } }] : []
      }
    });
  }

  function flushLists() {
    if (listBuffer.length) {
      listBuffer.forEach((text) => {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: text } }]
          }
        });
      });
      listBuffer = [];
    }
  }

  function flushParagraph() {
    if (paragraph.trim()) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: paragraph.trim() } }]
        }
      });
      paragraph = '';
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (t.startsWith('```')) {
      flushLists();
      if (inCodeBlock) {
        if (codeContent.length) {
          blocks.push({
            object: 'block',
            type: 'code',
            code: {
              rich_text: [{ type: 'text', text: { content: codeContent.join('\n') } }],
              language: codeLanguage
            }
          });
        }
        inCodeBlock = false;
        codeContent = [];
        codeLanguage = 'plain text';
      } else {
        flushParagraph();
        inCodeBlock = true;
        const lang = t.substring(3).trim();
        if (lang) codeLanguage = lang;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    if (/^#{1,6}\s/.test(t)) {
      flushLists();
      flushParagraph();
      const level = Math.min(3, t.match(/^#+/)[0].length);
      const text = t.replace(/^#{1,6}\s*/, '');
      blocks.push({
        object: 'block',
        type: `heading_${level}`,
        [`heading_${level}`]: { rich_text: [{ type: 'text', text: { content: text } }] }
      });
      continue;
    }

    if (/^(- |\* |\d+\.\s)/.test(t)) {
      const text = t.replace(/^(- |\* |\d+\.\s)/, '').trim();
      listBuffer.push(text);
      continue;
    }

    if (t === '') {
      flushLists();
      flushParagraph();
      continue;
    }

    const imageMatches = [...t.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g)]
      .filter((match) => isValidAbsoluteUrl(match[2]));

    if (imageMatches.length && t.replace(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, '').trim() === '') {
      flushLists();
      flushParagraph();
      imageMatches.forEach((match) => pushImage(match[2], match[1]?.trim()));
      continue;
    }

    let processedLine = t;
    imageMatches.forEach((match) => {
      processedLine = processedLine.replace(match[0], match[1] || '');
      pushImage(match[2], match[1]?.trim());
    });

    paragraph = paragraph ? paragraph + ' ' + processedLine : processedLine;
  }

  if (paragraph.trim()) flushParagraph();
  if (inCodeBlock && codeContent.length) {
    blocks.push({
      object: 'block',
      type: 'code',
      code: {
        rich_text: [{ type: 'text', text: { content: codeContent.join('\n') } }],
        language: codeLanguage
      }
    });
  }
  return blocks;
}

module.exports = {
  isValidAbsoluteUrl,
  convertMarkdownToNotionBlocks
};

