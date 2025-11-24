/**
 * parseRichText 函數測試腳本（更新版）
 * 用於驗證星號和下劃線兩種 Markdown 格式是否正確識別
 */

// 從 htmlToNotionConverter.js 複製的更新後的 parseRichText 函數
function parseRichText(text) {
  if (!text) {
    return [{ type: 'text', text: { content: '' } }];
  }

  const starPattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

  const matches = [];
  let tempText = text.replace(starPattern, match => {
    const index = matches.length;
    matches.push(match);
    return `___STAR_${index}___`;
  });

  const underscorePattern = /((?:^|\s))(__|_)([^\s_]+?)\2(?=\s|$)/g;

  tempText = tempText.replace(underscorePattern, (match, prefix, delimiter, content) => {
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

// 測試案例
const testCases = [
  {
    name: '星號斜體',
    input: 'This is *italic* text',
    expected: 'italic with annotation',
  },
  {
    name: '下劃線斜體',
    input: 'This is _italic_ text',
    expected: 'italic with annotation',
  },
  {
    name: '雙星號粗體',
    input: 'This is **bold** text',
    expected: 'bold with annotation',
  },
  {
    name: '雙下劃線粗體',
    input: 'This is __bold__ text',
    expected: 'bold with annotation',
  },
  {
    name: '混合格式',
    input: 'Mix **bold** and *italic* and __more bold__ with _more italic_',
    expected: 'all formats recognized',
  },
  {
    name: '變數名不誤判',
    input: 'variable user_name should not be italic',
    expected: 'no formatting',
  },
  {
    name: '多個下劃線',
    input: 'path_to_file_name should remain plain',
    expected: 'no formatting',
  },
  {
    name: '中文下劃線斜體',
    input: '這是 _斜體_ 測試',
    expected: 'italic with annotation',
  },
];

console.log('🧪 開始測試 parseRichText 函數（更新版）\n');

let passedCount = 0;
let failedCount = 0;

testCases.forEach((testCase, index) => {
  console.log(`測試 ${index + 1}: ${testCase.name}`);
  console.log(`輸入: "${testCase.input}"`);

  try {
    const result = parseRichText(testCase.input);
    console.log('結果:', JSON.stringify(result, null, 2));

    // 簡單驗證
    let passed = false;

    if (testCase.expected === 'italic with annotation') {
      passed = result.some(item => item.annotations?.italic === true);
    } else if (testCase.expected === 'bold with annotation') {
      passed = result.some(item => item.annotations?.bold === true);
    } else if (testCase.expected === 'all formats recognized') {
      const hasBold = result.some(item => item.annotations?.bold === true);
      const hasItalic = result.some(item => item.annotations?.italic === true);
      passed = hasBold && hasItalic;
    } else if (testCase.expected === 'no formatting') {
      passed = result.every(
        item => !item.annotations || Object.keys(item.annotations).length === 0
      );
    }

    if (passed) {
      console.log('✅ 通過\n');
      passedCount++;
    } else {
      console.log('❌ 失敗\n');
      failedCount++;
    }
  } catch (error) {
    console.log(`❌ 錯誤: ${error.message}\n`);
    failedCount++;
  }
});

console.log('==========================================');
console.log(`測試總結: ${passedCount} 通過, ${failedCount} 失敗`);
console.log('==========================================');

if (failedCount === 0) {
  console.log('🎉 所有測試通過！');
  process.exit(0);
} else {
  console.log('⚠️  部分測試失敗，請檢查實現');
  process.exit(1);
}
