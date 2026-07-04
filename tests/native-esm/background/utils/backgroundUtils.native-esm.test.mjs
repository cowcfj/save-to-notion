import { describe, expect, test } from '@jest/globals';
import {
  hasNotionData,
  isSameNotionPage,
} from '../../../../scripts/background/utils/migrationMetadataUtils.js';
import {
  HIGHLIGHT_STYLE_OPTIONS,
  mergeHighlightsWithStyle,
  resolveStyle,
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
