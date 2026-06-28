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
