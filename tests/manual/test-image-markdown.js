// 測試 parseRichText 對圖片 Markdown 的影響

function parseRichText(text) {
  if (!text) {
    return [{ type: 'text', text: { content: '' } }];
  }

  const starPattern = /(?:\*\*[^*]+\*\*|\*[^*]+\*)/g;

  const matches = [];
  let tempText = text.replace(starPattern, match => {
    const index = matches.length;
    matches.push(match);
    return `___STAR_${index}___`;
  });

  const underscorePattern = /((?:^|\s))(__|_)([^\s_]+?)\2(?=\s|$)/g;

  tempText = tempText.replace(underscorePattern, (_fullMatch, prefix, delimiter, content) => {
    const index = matches.length;
    matches.push(`${delimiter}${content}${delimiter}`);
    return `${prefix}___UNDER_${index}___`;
  });

  const richText = [];
  const finalPattern = /___(?:STAR|UNDER)_(\d+)___/g;
  let lastIndex = 0;
  let match = null;

  while ((match = finalPattern.exec(tempText)) !== null) {
    if (match.index > lastIndex) {
      const plainText = tempText.slice(lastIndex, match.index);
      if (plainText) {
        richText.push({
          type: 'text',
          text: { content: plainText },
        });
      }
    }

    const markerIndex = Number.parseInt(match[1], 10);
    const original = matches[markerIndex];

    if (original.startsWith('**') && original.endsWith('**')) {
      richText.push({
        type: 'text',
        text: { content: original.slice(2, -2) },
        annotations: { bold: true },
      });
    } else if (original.startsWith('__') && original.endsWith('__')) {
      richText.push({
        type: 'text',
        text: { content: original.slice(2, -2) },
        annotations: { bold: true },
      });
    } else if (original.startsWith('*') && original.endsWith('*')) {
      richText.push({
        type: 'text',
        text: { content: original.slice(1, -1) },
        annotations: { italic: true },
      });
    } else if (original.startsWith('_') && original.endsWith('_')) {
      richText.push({
        type: 'text',
        text: { content: original.slice(1, -1) },
        annotations: { italic: true },
      });
    }

    lastIndex = finalPattern.lastIndex;
  }

  if (lastIndex < tempText.length) {
    const remaining = tempText.slice(lastIndex);
    if (remaining) {
      richText.push({
        type: 'text',
        text: { content: remaining },
      });
    }
  }

  return richText.length > 0 ? richText : [{ type: 'text', text: { content: text } }];
}

// 測試包含圖片的文本
const testCases = [
  {
    name: '包含圖片 Markdown',
    input: 'Text with image ![alt text](http://example.com/image.png) here',
  },
  {
    name: '多張圖片',
    input: '![Image 1](url1.jpg) some text ![Image 2](url2.jpg) more text',
  },
  {
    name: '圖片和格式混合',
    input: 'Bold **text** and ![image](url.jpg) with _italic_',
  },
];

console.log('測試 parseRichText 對圖片 Markdown 的影響\n');

testCases.forEach(testCase => {
  console.log(`\n測試: ${testCase.name}`);
  console.log(`輸入: "${testCase.input}"`);
  const result = parseRichText(testCase.input);

  // 重建文本查看是否保留了圖片語法
  const rebuilt = result.map(item => item.text.content).join('');
  console.log(`輸出: "${rebuilt}"`);
  console.log(`圖片語法是否保留: ${rebuilt.includes('![') && rebuilt.includes('](')}`);
});
