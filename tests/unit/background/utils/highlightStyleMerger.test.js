/**
 * highlightStyleMerger 單元測試
 *
 * 覆蓋核心功能、跨片段匹配（P0）、消歧義、邊界情況與降級安全。
 */

const {
  mergeHighlightsWithStyle,
  findHighlightPosition,
  resolveStyle,
  scoreCandidate,
  VALID_HIGHLIGHT_COLORS,
  HIGHLIGHT_STYLE_OPTIONS,
} = require('../../../../scripts/background/utils/highlightStyleMerger');

// ============================================================================
// 測試輔助
// ============================================================================

/**
 * 建立一個簡單的段落 block（含 rich_text）
 */
function makeParagraphBlock(richTextArray) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richTextArray },
  };
}

/**
 * 建立一個 rich_text 片段
 */
function makeRT(content, annotations = {}) {
  return { type: 'text', text: { content }, annotations };
}

function buildFullText(richTextArray) {
  return richTextArray.map(rt => rt.text.content).join('');
}

// ============================================================================
// resolveStyle
// ============================================================================

describe('resolveStyle', () => {
  const STYLE_CASES = [
    {
      name: 'COLOR_SYNC：yellow → yellow_background',
      mode: 'COLOR_SYNC',
      hl: { color: 'yellow' },
      expected: { color: 'yellow_background' },
    },
    {
      name: 'COLOR_SYNC：green → green_background',
      mode: 'COLOR_SYNC',
      hl: { color: 'green' },
      expected: { color: 'green_background' },
    },
    {
      name: 'COLOR_SYNC：blue → blue_background',
      mode: 'COLOR_SYNC',
      hl: { color: 'blue' },
      expected: { color: 'blue_background' },
    },
    {
      name: 'COLOR_SYNC：red → red_background',
      mode: 'COLOR_SYNC',
      hl: { color: 'red' },
      expected: { color: 'red_background' },
    },
    {
      name: 'COLOR_SYNC：非法顏色（purple）→ yellow_background',
      mode: 'COLOR_SYNC',
      hl: { color: 'purple' },
      expected: { color: 'yellow_background' },
    },
    {
      name: 'COLOR_SYNC：未設定顏色 → yellow_background',
      mode: 'COLOR_SYNC',
      hl: {},
      expected: { color: 'yellow_background' },
    },
    {
      name: 'BOLD：返回 { bold: true }',
      mode: 'BOLD',
      hl: { color: 'yellow' },
      expected: { bold: true },
    },
    {
      name: 'NONE：返回 null',
      mode: 'NONE',
      hl: { color: 'yellow' },
      expected: null,
    },
    {
      name: 'COLOR_TEXT：yellow → { color: "yellow" }（文字色，無 _background）',
      mode: 'COLOR_TEXT',
      hl: { color: 'yellow' },
      expected: { color: 'yellow' },
    },
    {
      name: 'COLOR_TEXT：green → { color: "green" }',
      mode: 'COLOR_TEXT',
      hl: { color: 'green' },
      expected: { color: 'green' },
    },
    {
      name: 'COLOR_TEXT：非法顏色（purple）→ { color: "yellow" }',
      mode: 'COLOR_TEXT',
      hl: { color: 'purple' },
      expected: { color: 'yellow' },
    },
  ];

  test.each(STYLE_CASES)('$name', ({ mode, hl, expected }) => {
    expect(resolveStyle(mode, hl)).toEqual(expected);
  });

  test('COLOR_TEXT vs COLOR_SYNC：前者不含 _background 後綴', () => {
    const hl = { color: 'blue' };
    const textResult = resolveStyle('COLOR_TEXT', hl);
    const bgResult = resolveStyle('COLOR_SYNC', hl);
    expect(textResult.color).toBe('blue');
    expect(bgResult.color).toBe('blue_background');
  });
});

// ============================================================================
// scoreCandidate
// ============================================================================

describe('scoreCandidate', () => {
  const fullText = '這篇文章探討一些重要概念和應用場景，重要概念是核心';

  test('prefix 完全匹配得 2 分', () => {
    const idx = fullText.indexOf('重要概念');
    const score = scoreCandidate(fullText, idx, '重要概念', '探討一些', '');
    expect(score).toBe(2);
  });

  test('suffix 完全匹配得 2 分', () => {
    const idx = fullText.indexOf('重要概念');
    const score = scoreCandidate(fullText, idx, '重要概念', '', '和應用場景');
    expect(score).toBe(2);
  });

  test('prefix + suffix 都完全匹配得 4 分', () => {
    const idx = fullText.indexOf('重要概念');
    const score = scoreCandidate(fullText, idx, '重要概念', '探討一些', '和應用場景');
    expect(score).toBe(4);
  });

  test('無 prefix 且無 suffix 時得 0 分', () => {
    const idx = fullText.indexOf('重要概念');
    const score = scoreCandidate(fullText, idx, '重要概念', '', '');
    expect(score).toBe(0);
  });
});

// ============================================================================
// findHighlightPosition
// ============================================================================

describe('findHighlightPosition', () => {
  test('單個匹配：直接返回正確位置', () => {
    const richTextArray = [makeRT('這篇文章介紹重要概念和場景')];
    const hl = { text: '重要概念', rangeInfo: {} };
    const fullText = buildFullText(richTextArray);
    expect(findHighlightPosition(richTextArray, hl, fullText)).toBe(6);
  });

  test('文字不存在時返回 -1', () => {
    const richTextArray = [makeRT('這篇文章沒有標註')];
    const hl = { text: '重要概念', rangeInfo: {} };
    const fullText = buildFullText(richTextArray);
    expect(findHighlightPosition(richTextArray, hl, fullText)).toBe(-1);
  });

  test('多個匹配：用 prefix/suffix 精確定位第二個', () => {
    const richTextArray = [makeRT('重要概念的使用，以及另一個重要概念的解釋')];
    const hl = {
      text: '重要概念',
      rangeInfo: { prefix: '一個', suffix: '的解釋' },
    };
    // 第一個 '重要概念' 在 index 0，第二個在 index 13
    const fullText = buildFullText(richTextArray);
    const pos = findHighlightPosition(richTextArray, hl, fullText);
    // 因第二個有 prefix '一個' 匹配，分數更高
    expect(pos).toBe(13);
  });

  test('多個匹配且無 prefix/suffix：回退到第一個匹配', () => {
    const richTextArray = [makeRT('概念是概念')];
    const hl = { text: '概念', rangeInfo: {} };
    // 無 prefix/suffix →所有候選分數相同 → 拿第一個
    const fullText = buildFullText(richTextArray);
    expect(findHighlightPosition(richTextArray, hl, fullText)).toBe(0);
  });

  test('跨多個 rich_text 片段的拼接搜索', () => {
    const richTextArray = [makeRT('這篇文章'), makeRT('探討'), makeRT('重要概念')];
    const hl = { text: '重要概念', rangeInfo: {} };
    // 拼接後：'這篇文章探討重要概念'，位置 = 6
    const fullText = buildFullText(richTextArray);
    expect(findHighlightPosition(richTextArray, hl, fullText)).toBe(6);
  });

  test('空文字返回 -1', () => {
    const richTextArray = [makeRT('這篇文章')];
    const hl = { text: '', rangeInfo: {} };
    const fullText = buildFullText(richTextArray);
    expect(findHighlightPosition(richTextArray, hl, fullText)).toBe(-1);
  });

  test('空 rich_text 陣列返回 -1', () => {
    const hl = { text: '概念', rangeInfo: {} };
    expect(findHighlightPosition([], hl, '')).toBe(-1);
  });
});

// ============================================================================
// mergeHighlightsWithStyle — 核心功能
// ============================================================================

describe('mergeHighlightsWithStyle — 核心功能', () => {
  test('NONE：直接返回原始 blocks，不做任何處理', () => {
    const blocks = [makeParagraphBlock([makeRT('原始文字')])];
    const highlights = [{ text: '文字', color: 'yellow', rangeInfo: {} }];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'NONE');
    expect(result).toBe(blocks); // 同一個引用
  });

  test('highlights 為空時直接返回原始 blocks', () => {
    const blocks = [makeParagraphBlock([makeRT('原始文字')])];
    const result = mergeHighlightsWithStyle(blocks, [], 'COLOR_SYNC');
    expect(result).toBe(blocks);
  });

  test('highlights 為 null 時直接返回原始 blocks', () => {
    const blocks = [makeParagraphBlock([makeRT('原始文字')])];
    const result = mergeHighlightsWithStyle(blocks, null, 'COLOR_SYNC');
    expect(result).toBe(blocks);
  });

  test('blocks 為空時直接返回原始 blocks', () => {
    const highlights = [{ text: '文字', color: 'yellow', rangeInfo: {} }];
    const blocks = [];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'COLOR_SYNC');
    expect(result).toBe(blocks);
  });

  test('COLOR_SYNC：正確將 yellow 標註應用為 yellow_background', () => {
    const blocks = [makeParagraphBlock([makeRT('這篇文章介紹重要概念和場景')])];
    const highlights = [{ text: '重要概念', color: 'yellow', rangeInfo: {} }];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'COLOR_SYNC');

    const richText = result[0].paragraph.rich_text;
    expect(richText.length).toBeGreaterThan(1); // 應被分割
    const highlighted = richText.find(rt => rt.annotations?.color === 'yellow_background');
    expect(highlighted).toBeDefined();
    expect(highlighted.text.content).toBe('重要概念');
  });

  test('COLOR_SYNC：正確處理多種顏色標註', () => {
    const blocks = [makeParagraphBlock([makeRT('紅色和綠色是顏色')])];
    const highlights = [
      { text: '紅色', color: 'red', rangeInfo: {} },
      { text: '綠色', color: 'green', rangeInfo: {} },
    ];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'COLOR_SYNC');

    const richText = result[0].paragraph.rich_text;
    const redPart = richText.find(rt => rt.annotations?.color === 'red_background');
    const greenPart = richText.find(rt => rt.annotations?.color === 'green_background');
    expect(redPart).toBeDefined();
    expect(greenPart).toBeDefined();
    expect(redPart.text.content).toBe('紅色');
    expect(greenPart.text.content).toBe('綠色');
  });

  test('同一標註僅套用一次（跨 block 去重）', () => {
    const block1 = makeParagraphBlock([makeRT('這裡有重要概念')]);
    const block2 = makeParagraphBlock([makeRT('這裡也有重要概念')]);
    const highlights = [{ id: 'hl-1', text: '重要概念', color: 'yellow', rangeInfo: {} }];

    const result = mergeHighlightsWithStyle([block1, block2], highlights, 'COLOR_SYNC');

    const richText1 = result[0].paragraph.rich_text;
    const richText2 = result[1].paragraph.rich_text;

    const highlighted1 = richText1.find(rt => rt.annotations?.color === 'yellow_background');
    expect(highlighted1).toBeDefined();

    expect(richText2).toHaveLength(1);
    expect(richText2[0].text.content).toBe('這裡也有重要概念');
  });

  test('BOLD：正確分割並套用粗體', () => {
    const blocks = [makeParagraphBlock([makeRT('這是重要文字需要粗體')])];
    const highlights = [{ text: '重要文字', color: 'yellow', rangeInfo: {} }];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'BOLD');

    const richText = result[0].paragraph.rich_text;
    const boldPart = richText.find(rt => rt.annotations?.bold === true);
    expect(boldPart).toBeDefined();
    expect(boldPart.text.content).toBe('重要文字');
  });

  test('標註文字未找到時跳過（不影響其他標註）', () => {
    const blocks = [makeParagraphBlock([makeRT('這篇文章介紹場景')])];
    const highlights = [
      { text: '不存在的文字', color: 'yellow', rangeInfo: {} },
      { text: '場景', color: 'green', rangeInfo: {} },
    ];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'COLOR_SYNC');

    const richText = result[0].paragraph.rich_text;
    const greenPart = richText.find(rt => rt.annotations?.color === 'green_background');
    expect(greenPart).toBeDefined();
  });

  test('保留原有 annotations（已有粗體不被覆蓋）', () => {
    const blocks = [
      makeParagraphBlock([makeRT('前文', {}), makeRT('重要', { bold: true }), makeRT('後文', {})]),
    ];
    const highlights = [{ text: '重要', color: 'yellow', rangeInfo: {} }];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'COLOR_SYNC');

    const richText = result[0].paragraph.rich_text;
    const styledPart = richText.find(rt => rt.text.content === '重要');
    expect(styledPart?.annotations?.bold).toBe(true);
    expect(styledPart?.annotations?.color).toBe('yellow_background');
  });

  test('沒有 rich_text 的 block（圖片等）維持不變', () => {
    const imageBlock = {
      object: 'block',
      type: 'image',
      image: { type: 'external', external: { url: 'https://example.com/img.png' } },
    };
    const highlights = [{ text: '文字', color: 'yellow', rangeInfo: {} }];
    const result = mergeHighlightsWithStyle([imageBlock], highlights, 'COLOR_SYNC');
    expect(result[0]).toBe(imageBlock);
  });

  test('COLOR_TEXT：yellow 標註應套用文字色（非背景色）', () => {
    const blocks = [makeParagraphBlock([makeRT('這篇文章介紹重要概念和場景')])];
    const highlights = [{ text: '重要概念', color: 'yellow', rangeInfo: {} }];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'COLOR_TEXT');

    const richText = result[0].paragraph.rich_text;
    // 應有文字色（非背景色）
    const highlighted = richText.find(rt => rt.annotations?.color === 'yellow');
    expect(highlighted).toBeDefined();
    expect(highlighted.text.content).toBe('重要概念');
    // 確認不是背景色
    const bgPart = richText.find(rt => rt.annotations?.color === 'yellow_background');
    expect(bgPart).toBeUndefined();
  });

  test('COLOR_TEXT：多顏色標註分別套用對應文字色', () => {
    const blocks = [makeParagraphBlock([makeRT('紅色天空和藍色海洋')])];
    const highlights = [
      { text: '紅色', color: 'red', rangeInfo: {} },
      { text: '藍色', color: 'blue', rangeInfo: {} },
    ];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'COLOR_TEXT');

    const richText = result[0].paragraph.rich_text;
    expect(richText.find(rt => rt.annotations?.color === 'red')?.text.content).toBe('紅色');
    expect(richText.find(rt => rt.annotations?.color === 'blue')?.text.content).toBe('藍色');
  });
});

// ============================================================================
// mergeHighlightsWithStyle — 跨片段匹配（P0 關鍵測試）
// ============================================================================

describe('mergeHighlightsWithStyle — 跨片段匹配', () => {
  test('標註完全落在帶 bold 的片段內：保留 bold 並疊加背景色', () => {
    const richTextArray = [
      makeRT('這篇文章探討', {}),
      makeRT('重要概念', { bold: true }),
      makeRT('和應用場景', {}),
    ];
    const blocks = [makeParagraphBlock(richTextArray)];
    const highlights = [{ text: '重要概念', color: 'yellow', rangeInfo: {} }];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'COLOR_SYNC');

    const newRT = result[0].paragraph.rich_text;
    const highlighted = newRT.find(rt => rt.text.content === '重要概念');
    expect(highlighted.annotations.bold).toBe(true);
    expect(highlighted.annotations.color).toBe('yellow_background');
  });

  test('標註文字完整地跨越兩個 rich_text 片段：在邊界處正確切割', () => {
    // '重要' 在片段 1，'概念' 在片段 2
    const richTextArray = [makeRT('前文重要', {}), makeRT('概念後文', {})];
    const blocks = [makeParagraphBlock(richTextArray)];
    const highlights = [{ text: '重要概念', color: 'yellow', rangeInfo: {} }];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'COLOR_SYNC');

    const newRT = result[0].paragraph.rich_text;
    // 應有：前文 | 重要（黃色）| 概念（黃色）| 後文
    const yellowParts = newRT.filter(rt => rt.annotations?.color === 'yellow_background');
    expect(yellowParts.length).toBeGreaterThan(0);
    // 合併內容應等於 '重要概念'
    const highlightedText = yellowParts.map(rt => rt.text.content).join('');
    expect(highlightedText).toBe('重要概念');
  });

  test('標註跨越三個 rich_text 片段：中間片段整體套用樣式', () => {
    // '重' 在片段 0，'要概' 在片段 1，'念' 在片段 2
    const richTextArray = [makeRT('前文重', {}), makeRT('要概', {}), makeRT('念後文', {})];
    const blocks = [makeParagraphBlock(richTextArray)];
    const highlights = [{ text: '重要概念', color: 'blue', rangeInfo: {} }];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'COLOR_SYNC');

    const newRT = result[0].paragraph.rich_text;
    const blueParts = newRT.filter(rt => rt.annotations?.color === 'blue_background');
    const highlightedText = blueParts.map(rt => rt.text.content).join('');
    expect(highlightedText).toBe('重要概念');
  });

  test('同一 block 中多個不同標註應全部正確處理', () => {
    const richTextArray = [makeRT('紅色的花和綠色的葉')];
    const blocks = [makeParagraphBlock(richTextArray)];
    const highlights = [
      { text: '紅色', color: 'red', rangeInfo: {} },
      { text: '綠色', color: 'green', rangeInfo: {} },
    ];
    const result = mergeHighlightsWithStyle(blocks, highlights, 'COLOR_SYNC');

    const newRT = result[0].paragraph.rich_text;
    expect(newRT.find(rt => rt.annotations?.color === 'red_background')?.text.content).toBe('紅色');
    expect(newRT.find(rt => rt.annotations?.color === 'green_background')?.text.content).toBe(
      '綠色'
    );
    // 重新拼接應保留原文
    const fullText = newRT.map(rt => rt.text.content).join('');
    expect(fullText).toBe('紅色的花和綠色的葉');
  });
});

// ============================================================================
// mergeHighlightsWithStyle — 降級安全
// ============================================================================

describe('mergeHighlightsWithStyle — 降級安全', () => {
  test('單個 block 的 rich_text 為空陣列時返回原始 block', () => {
    const block = makeParagraphBlock([]);
    const highlights = [{ text: '文字', color: 'yellow', rangeInfo: {} }];
    const result = mergeHighlightsWithStyle([block], highlights, 'COLOR_SYNC');
    // 空 rich_text 直接返回，不報錯
    expect(result[0]).toBeDefined();
    expect(result[0].paragraph.rich_text).toEqual([]);
  });

  test('多個 block 只有部分包含標註文字：其他 block 保持不變', () => {
    const block1 = makeParagraphBlock([makeRT('第一段包含重要概念')]);
    const block2 = makeParagraphBlock([makeRT('第二段沒有標註')]);
    const highlights = [{ text: '重要概念', color: 'yellow', rangeInfo: {} }];
    const result = mergeHighlightsWithStyle([block1, block2], highlights, 'COLOR_SYNC');

    // block1 被修改
    expect(result[0].paragraph.rich_text.length).toBeGreaterThan(1);
    // block2 保持一個片段（未被切割）
    expect(result[1].paragraph.rich_text).toHaveLength(1);
    expect(result[1].paragraph.rich_text[0].text.content).toBe('第二段沒有標註');
  });
});

// ============================================================================
// 常量驗證
// ============================================================================

describe('VALID_HIGHLIGHT_COLORS', () => {
  test('包含四種合法顏色', () => {
    expect(VALID_HIGHLIGHT_COLORS.has('yellow')).toBe(true);
    expect(VALID_HIGHLIGHT_COLORS.has('green')).toBe(true);
    expect(VALID_HIGHLIGHT_COLORS.has('blue')).toBe(true);
    expect(VALID_HIGHLIGHT_COLORS.has('red')).toBe(true);
  });

  test('不包含非法顏色', () => {
    expect(VALID_HIGHLIGHT_COLORS.has('purple')).toBe(false);
    expect(VALID_HIGHLIGHT_COLORS.has('pink')).toBe(false);
    expect(VALID_HIGHLIGHT_COLORS.has('')).toBe(false);
  });
});

describe('HIGHLIGHT_STYLE_OPTIONS', () => {
  test('COLOR_SYNC 是字符串 "COLOR_SYNC"', () => {
    expect(HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC).toBe('COLOR_SYNC');
  });

  test('COLOR_TEXT 是字符串 "COLOR_TEXT"', () => {
    expect(HIGHLIGHT_STYLE_OPTIONS.COLOR_TEXT).toBe('COLOR_TEXT');
  });

  test('BOLD 是字符串 "BOLD"', () => {
    expect(HIGHLIGHT_STYLE_OPTIONS.BOLD).toBe('BOLD');
  });

  test('NONE 是字符串 "NONE"', () => {
    expect(HIGHLIGHT_STYLE_OPTIONS.NONE).toBe('NONE');
  });

  test('resolveStyle(BOLD) 仍回傳 { bold: true }', () => {
    expect(resolveStyle('BOLD', {})).toEqual({ bold: true });
  });

  test('resolveStyle(NONE) 仍回傳 null', () => {
    expect(resolveStyle('NONE', {})).toBeNull();
  });
});
