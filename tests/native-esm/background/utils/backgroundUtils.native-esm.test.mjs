import { describe, expect, test } from '@jest/globals';
import {
  hasNotionData,
  isSameNotionPage,
} from '../../../../scripts/background/utils/migrationMetadataUtils.js';
import {
  findHighlightPosition,
  HIGHLIGHT_STYLE_OPTIONS,
  mergeHighlightsWithStyle,
  resolveStyle,
  scoreCandidate,
} from '../../../../scripts/background/utils/highlightStyleMerger.js';

function makeRichText(content, annotations = {}) {
  return { type: 'text', text: { content }, annotations };
}

function makeParagraphBlock(richTextArray) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richTextArray },
  };
}

function getStyledText(block, predicate) {
  return block.paragraph.rich_text
    .filter(part => predicate(part.annotations ?? {}))
    .map(part => part.text.content)
    .join('');
}

describe('background utility native ESM diagnostics', () => {
  test('mergeHighlightsWithStyle applies color across rich_text segment boundaries', () => {
    const blocks = [
      makeParagraphBlock([makeRichText('前文重'), makeRichText('要概'), makeRichText('念後文')]),
    ];
    const highlights = [{ id: 'hl-native', text: '重要概念', color: 'blue', rangeInfo: {} }];

    const result = mergeHighlightsWithStyle(blocks, highlights, HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC);
    const highlightedText = result[0].paragraph.rich_text
      .filter(part => part.annotations?.color === 'blue_background')
      .map(part => part.text.content)
      .join('');

    expect(highlightedText).toBe('重要概念');
    expect(result[0].paragraph.rich_text.map(part => part.text.content).join('')).toBe(
      '前文重要概念後文'
    );
    expect(resolveStyle(HIGHLIGHT_STYLE_OPTIONS.COLOR_TEXT, { color: 'purple' })).toEqual({
      color: 'yellow',
    });
  });

  test('mergeHighlightsWithStyle preserves blocks for disabled or empty inputs', () => {
    const blocks = [makeParagraphBlock([makeRichText('不應修改')])];
    const highlights = [{ id: 'hl-disabled', text: '不應修改', color: 'yellow' }];

    expect(mergeHighlightsWithStyle(blocks, highlights, HIGHLIGHT_STYLE_OPTIONS.NONE)).toBe(blocks);
    expect(mergeHighlightsWithStyle(blocks, [], HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC)).toBe(blocks);
    expect(mergeHighlightsWithStyle(blocks, null, HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC)).toBe(blocks);
    expect(mergeHighlightsWithStyle([], highlights, HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC)).toEqual([]);
  });

  test('mergeHighlightsWithStyle applies text color and bold styles through public options', () => {
    const colorBlocks = [makeParagraphBlock([makeRichText('需要文字顏色')])];
    const boldBlocks = [makeParagraphBlock([makeRichText('需要粗體')])];

    const colorResult = mergeHighlightsWithStyle(
      colorBlocks,
      [{ id: 'hl-color-text', text: '文字顏色', color: 'green' }],
      HIGHLIGHT_STYLE_OPTIONS.COLOR_TEXT
    );
    const boldResult = mergeHighlightsWithStyle(
      boldBlocks,
      [{ id: 'hl-bold', text: '粗體', color: 'red' }],
      HIGHLIGHT_STYLE_OPTIONS.BOLD
    );

    expect(getStyledText(colorResult[0], annotations => annotations.color === 'green')).toBe(
      '文字顏色'
    );
    expect(getStyledText(boldResult[0], annotations => annotations.bold === true)).toBe('粗體');
  });

  test('resolveStyle returns null for unknown highlight style options', () => {
    expect(resolveStyle('UNKNOWN_STYLE', { color: 'red' })).toBeNull();
  });

  test('mergeHighlightsWithStyle consumes each highlight once across multiple blocks', () => {
    const blocks = [
      makeParagraphBlock([makeRichText('重複標註')]),
      makeParagraphBlock([makeRichText('重複標註')]),
    ];
    const highlights = [{ id: 'same-highlight', text: '重複標註', color: 'blue' }];

    const result = mergeHighlightsWithStyle(
      blocks,
      highlights,
      HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC
    );

    expect(getStyledText(result[0], annotations => annotations.color === 'blue_background')).toBe(
      '重複標註'
    );
    expect(getStyledText(result[1], annotations => annotations.color === 'blue_background')).toBe(
      ''
    );
  });

  test('mergeHighlightsWithStyle keeps unsupported or malformed blocks unchanged', () => {
    const unsupportedBlock = { object: 'block', type: 'image', image: { caption: [] } };
    const emptyRichTextBlock = makeParagraphBlock([]);
    const malformedBlock = makeParagraphBlock([{ type: 'text', annotations: {} }]);
    const highlights = [{ id: 'hl-safe', text: 'safe', color: 'yellow' }];

    const result = mergeHighlightsWithStyle(
      [unsupportedBlock, emptyRichTextBlock, malformedBlock],
      highlights,
      HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC
    );

    expect(result[0]).toBe(unsupportedBlock);
    expect(result[1]).toBe(emptyRichTextBlock);
    expect(result[2]).toBe(malformedBlock);
  });

  test('scoreCandidate scores exact and partial context matches with normalized text', () => {
    const duplicateText = '前綴重要概念後綴，以及其他重要概念';
    const exactIndex = duplicateText.indexOf('重要概念');

    expect(
      scoreCandidate(duplicateText, exactIndex, '重要概念', {
        prefix: '前綴',
        suffix: '後綴',
      })
    ).toBe(4);

    const normalizedText = 'abcdefghijUS and Chinese techklmnopqrst';
    const normalizedIndex = normalizedText.indexOf('US and Chinese tech');

    expect(
      scoreCandidate(normalizedText, normalizedIndex, 'US\nand Chinese tech', {
        prefix: 'xxxxabcdefghij',
        suffix: 'klmnopqrstxxxx',
      })
    ).toBe(2);
  });

  test('findHighlightPosition uses context to choose a matching duplicate occurrence', () => {
    const richTextArray = [makeRichText('重要概念的使用，以及另一個重要概念的解釋')];
    const fullText = richTextArray.map(part => part.text.content).join('');

    expect(
      findHighlightPosition(
        richTextArray,
        {
          text: '重要概念',
          rangeInfo: { prefix: '一個', suffix: '的解釋' },
        },
        fullText
      )
    ).toBe(13);
  });

  test('findHighlightPosition rejects contextual matches when all candidate scores are zero', () => {
    const richTextArray = [makeRichText('Markdown appears here. Markdown appears again.')];
    const fullText = richTextArray.map(part => part.text.content).join('');

    expect(
      findHighlightPosition(
        richTextArray,
        {
          text: 'Markdown',
          rangeInfo: { prefix: 'a reason ', suffix: ' is being' },
        },
        fullText
      )
    ).toBe(-1);
  });

  test('findHighlightPosition handles defensive input branches', () => {
    const richTextArray = [makeRichText('At the event, a uniquely long highlighted passage keeps matching.')];
    const fullText = richTextArray.map(part => part.text.content).join('');
    const longText = 'a uniquely long highlighted passage keeps matching';

    expect(
      findHighlightPosition(
        richTextArray,
        {
          text: longText,
          rangeInfo: { prefix: 'wrong prefix ', suffix: ' wrong suffix' },
        },
        fullText
      )
    ).toBe(14);
    expect(findHighlightPosition(null, { text: 'anything', rangeInfo: {} }, 'anything')).toBe(-1);
    expect(() => findHighlightPosition(richTextArray, { text: 'anything' }, null)).toThrow(
      TypeError
    );
  });

  test('mergeHighlightsWithStyle rolls back consumed highlights after malformed rich_text fallback', () => {
    const blockWithAnnotationError = makeParagraphBlock([
      {
        type: 'text',
        text: { content: '重要概念' },
        get annotations() {
          throw new Error('annotations unavailable');
        },
      },
    ]);
    const nextBlock = makeParagraphBlock([makeRichText('第二段重要概念')]);

    const result = mergeHighlightsWithStyle(
      [blockWithAnnotationError, nextBlock],
      [{ id: 'hl-rollback', text: '重要概念', color: 'yellow', rangeInfo: {} }],
      HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC
    );

    expect(result[0]).toBe(blockWithAnnotationError);
    expect(getStyledText(result[1], annotations => annotations.color === 'yellow_background')).toBe(
      '重要概念'
    );
  });

  test('migration metadata helpers compare ids before canonicalized Notion urls', () => {
    expect(hasNotionData({ notion: { pageId: ' nested-page ' } })).toBe(true);
    expect(hasNotionData({ notion: { pageId: ' ', url: ' ' } })).toBe(false);

    expect(
      isSameNotionPage(
        { notionPageId: 'same-id', notionUrl: 'https://notion.so/a' },
        { notion: { pageId: 'same-id', url: 'https://notion.so/b' } }
      )
    ).toBe(true);
    expect(
      isSameNotionPage(
        { notionUrl: 'https://NOTION.SO/%7Eworkspace/page?ref=abc#section' },
        { notionUrl: 'https://notion.so/~workspace/page' }
      )
    ).toBe(true);
    expect(
      isSameNotionPage(
        { notionUrl: 'https://notion.so/native-page///?ref=abc#section' },
        { notionUrl: 'https://notion.so/native-page' }
      )
    ).toBe(true);
    expect(isSameNotionPage({ title: 'a' }, { title: 'b' })).toBeNull();
  });
});
