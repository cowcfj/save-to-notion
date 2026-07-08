import { describe, expect, test } from '@jest/globals';
import {
  createParagraph,
  createRichText,
} from '../../../../scripts/background/utils/BlockBuilder.js';

describe('BlockBuilder native ESM coverage', () => {
  test('covers createRichText body lines under native ESM execution', () => {
    expect(createRichText('hello', { bold: true, link: 'https://example.com' })).toEqual({
      type: 'text',
      text: {
        content: 'hello',
        link: { url: 'https://example.com' },
      },
      annotations: {
        bold: true,
      },
    });
  });

  test('covers createParagraph delegation to createRichText', () => {
    expect(createParagraph('hello').paragraph.rich_text[0].text.content).toBe('hello');
  });
});
