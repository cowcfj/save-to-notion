/**
 * @jest-environment jsdom
 */

import {
  buildBbcFallbackBlock,
  buildBbcHeadingBlock,
  buildBbcImageBlock,
  buildBbcTextBlocks,
  convertBbcBlocks,
  extractBbcText,
  isBbcFormat,
  processSingleBbcBlock,
} from '../../../../../scripts/content/extractors/blocks/BbcBlockConverter.js';
import {
  BBC_DEFAULT_IMAGE_WIDTH,
  BBC_IMAGE_BASE_URL,
} from '../../../../../scripts/config/shared/content.js';

function makeDeps() {
  return {
    richTextChunkBuilder: jest.fn(text => [{ type: 'text', text: { content: text } }]),
  };
}

describe('BbcBlockConverter', () => {
  describe('isBbcFormat', () => {
    test('returns true for blocks with type+model and no blockType', () => {
      expect(
        isBbcFormat([
          { type: 'headline', model: { text: 'hi' } },
          { type: 'text', model: { blocks: [] } },
        ])
      ).toBe(true);
    });

    test('returns false when any block has blockType (non-BBC schema)', () => {
      expect(isBbcFormat([{ type: 'headline', model: {}, blockType: 'something' }])).toBe(false);
    });

    test('returns false for empty / non-array / malformed inputs', () => {
      expect(isBbcFormat([])).toBe(false);
      expect(isBbcFormat(null)).toBe(false);
      expect(isBbcFormat([null, 'string', { type: 'x' }])).toBe(false);
    });
  });

  describe('extractBbcText', () => {
    test('returns trimmed direct text', () => {
      expect(extractBbcText({ text: '  Hello  ' })).toBe('Hello');
    });

    test('falls back to concatenating child block text without separators', () => {
      const model = {
        blocks: [
          { type: 'fragment', model: { text: 'Hello' } },
          { type: 'fragment', model: { text: 'World' } },
        ],
      };
      expect(extractBbcText(model)).toBe('HelloWorld');
    });

    test('returns empty string for invalid model', () => {
      expect(extractBbcText(null)).toBe('');
      expect(extractBbcText('string')).toBe('');
      expect(extractBbcText({})).toBe('');
    });

    test('skips falsy or non-object children', () => {
      const model = {
        blocks: [null, 'noop', { type: 'fragment', model: { text: 'A' } }],
      };
      expect(extractBbcText(model)).toBe('A');
    });
  });

  describe('buildBbcHeadingBlock', () => {
    test('returns heading_1 when isSubheading=false', () => {
      const deps = makeDeps();
      const block = buildBbcHeadingBlock({ text: 'Title' }, false, deps);
      expect(block).toEqual({
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: 'Title' } }] },
      });
    });

    test('returns heading_2 when isSubheading=true', () => {
      const deps = makeDeps();
      expect(buildBbcHeadingBlock({ text: 'Sub' }, true, deps).type).toBe('heading_2');
    });

    test('returns null when text is empty', () => {
      const deps = makeDeps();
      expect(buildBbcHeadingBlock({ text: '   ' }, false, deps)).toBeNull();
      expect(deps.richTextChunkBuilder).not.toHaveBeenCalled();
    });
  });

  describe('buildBbcTextBlocks', () => {
    test('emits a paragraph block for each paragraph / introduction child', () => {
      const deps = makeDeps();
      const blocks = buildBbcTextBlocks(
        {
          blocks: [
            { type: 'paragraph', model: { text: 'P1' } },
            { type: 'introduction', model: { text: 'P2' } },
          ],
        },
        deps
      );
      expect(blocks.map(b => b.type)).toEqual(['paragraph', 'paragraph']);
      expect(blocks[0].paragraph.rich_text[0].text.content).toBe('P1');
    });

    test('skips children whose type is not paragraph / introduction', () => {
      const deps = makeDeps();
      const blocks = buildBbcTextBlocks(
        { blocks: [{ type: 'list', model: { text: 'ignored' } }] },
        deps
      );
      expect(blocks).toEqual([]);
    });

    test('skips paragraphs whose extracted text is empty', () => {
      const deps = makeDeps();
      const blocks = buildBbcTextBlocks(
        { blocks: [{ type: 'paragraph', model: { text: '   ' } }] },
        deps
      );
      expect(blocks).toEqual([]);
    });

    test('returns [] when model.blocks is missing or non-array', () => {
      const deps = makeDeps();
      expect(buildBbcTextBlocks({}, deps)).toEqual([]);
      expect(buildBbcTextBlocks({ blocks: null }, deps)).toEqual([]);
    });
  });

  describe('buildBbcImageBlock', () => {
    test('builds external image block with caption when locator + originCode + caption exist', () => {
      const deps = makeDeps();
      const block = buildBbcImageBlock(
        {
          blocks: [
            { type: 'rawImage', model: { locator: 'p0abc', originCode: 'cpsprodpb' } },
            { type: 'caption', model: { text: 'A caption' } },
          ],
        },
        deps
      );
      expect(block).toEqual({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: {
            url: `${BBC_IMAGE_BASE_URL}/${BBC_DEFAULT_IMAGE_WIDTH}/cpsprodpb/p0abc.webp`,
          },
          caption: [{ type: 'text', text: { content: 'A caption' } }],
        },
      });
    });

    test('returns image block with empty caption when caption block is absent', () => {
      const deps = makeDeps();
      const block = buildBbcImageBlock(
        {
          blocks: [{ type: 'rawImage', model: { locator: 'p0abc', originCode: 'cpsprodpb' } }],
        },
        deps
      );
      expect(block.image.caption).toEqual([]);
    });

    test('returns null when rawImage is missing locator or originCode', () => {
      const deps = makeDeps();
      expect(
        buildBbcImageBlock({ blocks: [{ type: 'rawImage', model: { locator: 'x' } }] }, deps)
      ).toBeNull();
      expect(
        buildBbcImageBlock({ blocks: [{ type: 'rawImage', model: { originCode: 'x' } }] }, deps)
      ).toBeNull();
    });

    test('returns null when no rawImage sub-block exists', () => {
      const deps = makeDeps();
      expect(buildBbcImageBlock({ blocks: [{ type: 'caption', model: {} }] }, deps)).toBeNull();
      expect(buildBbcImageBlock({}, deps)).toBeNull();
    });
  });

  describe('buildBbcFallbackBlock', () => {
    test('returns paragraph for model.text', () => {
      const deps = makeDeps();
      const block = buildBbcFallbackBlock({ text: 'Stranded' }, deps);
      expect(block).toEqual({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: 'Stranded' } }] },
      });
    });

    test('returns paragraph by recursing into model.blocks', () => {
      const deps = makeDeps();
      const block = buildBbcFallbackBlock(
        { blocks: [{ type: 'fragment', model: { text: 'X' } }] },
        deps
      );
      expect(block.paragraph.rich_text[0].text.content).toBe('X');
    });

    test('returns null when neither blocks nor text present', () => {
      const deps = makeDeps();
      expect(buildBbcFallbackBlock({}, deps)).toBeNull();
    });

    test('returns null when extracted text is empty', () => {
      const deps = makeDeps();
      expect(buildBbcFallbackBlock({ text: '   ' }, deps)).toBeNull();
    });
  });

  describe('processSingleBbcBlock', () => {
    test('routes known block types via handler map', () => {
      const deps = makeDeps();
      const result = [];
      processSingleBbcBlock({ type: 'headline', model: { text: 'Hi' } }, result, deps);
      expect(result).toEqual([
        {
          object: 'block',
          type: 'heading_1',
          heading_1: { rich_text: [{ type: 'text', text: { content: 'Hi' } }] },
        },
      ]);
    });

    test('uses fallback handler for unknown types', () => {
      const deps = makeDeps();
      const result = [];
      processSingleBbcBlock({ type: 'mystery', model: { text: 'Body' } }, result, deps);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('paragraph');
    });

    test.each([['byline'], ['relatedContent'], ['wsoj'], ['include'], ['social-embed']])(
      'skips %s blocks',
      type => {
        const deps = makeDeps();
        const result = [];
        processSingleBbcBlock({ type, model: { text: 'irrelevant' } }, result, deps);
        expect(result).toEqual([]);
      }
    );

    test('does nothing when block is malformed', () => {
      const deps = makeDeps();
      const result = [];
      processSingleBbcBlock(null, result, deps);
      processSingleBbcBlock({}, result, deps);
      processSingleBbcBlock({ type: 'headline' }, result, deps);
      expect(result).toEqual([]);
    });
  });

  describe('convertBbcBlocks', () => {
    test('returns [] for non-array input', () => {
      expect(convertBbcBlocks(null, makeDeps())).toEqual([]);
    });

    test('flattens output from each block in order', () => {
      const deps = makeDeps();
      const result = convertBbcBlocks(
        [
          { type: 'headline', model: { text: 'H' } },
          { type: 'subheadline', model: { text: 'S' } },
          {
            type: 'text',
            model: {
              blocks: [
                { type: 'paragraph', model: { text: 'A' } },
                { type: 'paragraph', model: { text: 'B' } },
              ],
            },
          },
          { type: 'byline', model: { text: 'skip' } },
        ],
        deps
      );

      expect(result.map(b => b.type)).toEqual(['heading_1', 'heading_2', 'paragraph', 'paragraph']);
    });
  });
});
