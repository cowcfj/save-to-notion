import { describe, expect, test } from '@jest/globals';

import {
  MAX_TEXT_LENGTH,
  buildHighlightBlocks,
  createBulletItem,
  createCodeBlock,
  createDivider,
  createFallbackBlocks,
  createHeading,
  createImage,
  createNumberedItem,
  createParagraph,
  createQuote,
  createRichText,
  isValidBlock,
  splitTextForHighlight,
  textToParagraphs,
} from '../../../../scripts/background/utils/BlockBuilder.js';

describe('BlockBuilder native ESM depth coverage', () => {
  test('creates rich text with links, annotations, truncation, and empty input', () => {
    expect(
      createRichText('annotated', {
        link: 'https://example.com',
        color: 'yellow',
        bold: true,
        italic: true,
        strikethrough: true,
        underline: true,
        code: true,
      })
    ).toEqual({
      type: 'text',
      text: {
        content: 'annotated',
        link: { url: 'https://example.com' },
      },
      annotations: {
        color: 'yellow',
        bold: true,
        italic: true,
        strikethrough: true,
        underline: true,
        code: true,
      },
    });
    expect(createRichText(null).text.content).toBe('');
    expect(createRichText('x'.repeat(MAX_TEXT_LENGTH + 10)).text.content).toHaveLength(
      MAX_TEXT_LENGTH
    );
  });

  test('creates paragraph, heading clamp, quote, list, code, image, and divider blocks', () => {
    expect(createParagraph('body', { color: 'red' })).toEqual(
      expect.objectContaining({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [expect.objectContaining({ annotations: { color: 'red' } })] },
      })
    );
    expect(createHeading('too high', 9).type).toBe('heading_3');
    expect(createHeading('too low', -1).type).toBe('heading_1');
    expect(createQuote('quoted').quote.rich_text[0].text.content).toBe('quoted');
    expect(createBulletItem('bullet').type).toBe('bulleted_list_item');
    expect(createNumberedItem('numbered').type).toBe('numbered_list_item');
    expect(createCodeBlock('const x = 1;', 'javascript')).toEqual(
      expect.objectContaining({
        type: 'code',
        code: {
          rich_text: [expect.objectContaining({ text: { content: 'const x = 1;' } })],
          language: 'javascript',
        },
      })
    );
    expect(createImage('https://example.com/photo.jpg', 'caption')).toEqual(
      expect.objectContaining({
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://example.com/photo.jpg' },
          caption: [expect.objectContaining({ text: { content: 'caption' } })],
        },
      })
    );
    expect(createImage('https://example.com/no-caption.jpg').image.caption).toBeUndefined();
    expect(createDivider()).toEqual({ object: 'block', type: 'divider', divider: {} });
  });

  test('splits highlight text and builds highlighted paragraph blocks', () => {
    const text = `first sentence. ${'x'.repeat(60)} second sentence.`;
    expect(splitTextForHighlight(text, 30)).toEqual([
      'first sentence. xxxxxxxxxxxxxx',
      'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      'xxxxxxxxxxxxxxxx second',
      'sentence.',
    ]);
    expect(splitTextForHighlight('', 10)).toEqual(['']);
    expect(splitTextForHighlight('unchanged', 0)).toEqual(['unchanged']);

    const blocks = buildHighlightBlocks([{ text, color: 'green' }], 'Highlights');
    expect(blocks[0].type).toBe('heading_3');
    expect(blocks.slice(1).every(block => block.type === 'paragraph')).toBe(true);
    expect(blocks[1].paragraph.rich_text[0].annotations).toEqual({ color: 'green' });
    expect(buildHighlightBlocks([])).toEqual([]);
  });

  test('converts text paragraphs, fallback blocks, and validates block structure', () => {
    expect(textToParagraphs('short\n\nlong enough paragraph\n\nanother useful paragraph')).toEqual([
      expect.objectContaining({ type: 'paragraph' }),
      expect.objectContaining({ type: 'paragraph' }),
    ]);
    expect(textToParagraphs(null)).toEqual([]);
    expect(createFallbackBlocks('fallback message')).toEqual([
      expect.objectContaining({
        type: 'paragraph',
        paragraph: {
          rich_text: [expect.objectContaining({ text: { content: 'fallback message' } })],
        },
      }),
    ]);
    expect(isValidBlock(createDivider())).toBe(true);
    expect(isValidBlock({ object: 'not-block', type: 'divider' })).toBe(false);
    expect(isValidBlock(null)).toBe(false);
  });
});
