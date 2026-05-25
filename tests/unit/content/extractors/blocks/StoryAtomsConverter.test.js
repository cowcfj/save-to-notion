/**
 * @jest-environment jsdom
 */

import Logger from '../../../../../scripts/utils/Logger.js';
import {
  convertStoryAtoms,
  createBlockFromImageAtom,
  createBlockFromTextAtom,
} from '../../../../../scripts/content/extractors/blocks/StoryAtomsConverter.js';

jest.mock('../../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

function makeDeps() {
  return {
    richTextChunkBuilder: jest.fn(text => [{ type: 'text', text: { content: text } }]),
    stripHtml: jest.fn(html => html.replaceAll(/<[^<>]*>/g, '')),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('StoryAtomsConverter', () => {
  describe('createBlockFromTextAtom', () => {
    test.each([
      ['p', 'paragraph'],
      ['h1', 'heading_1'],
      ['h2', 'heading_2'],
      ['h3', 'heading_3'],
      ['blockquote', 'quote'],
    ])('maps tagName=%s to block type=%s', (tagName, expectedType) => {
      const deps = makeDeps();
      const block = createBlockFromTextAtom({ content: '<p>Hello</p>', tagName }, deps);

      expect(block).toEqual({
        object: 'block',
        type: expectedType,
        [expectedType]: { rich_text: [{ type: 'text', text: { content: 'Hello' } }] },
      });
      expect(deps.stripHtml).toHaveBeenCalledWith('<p>Hello</p>');
      expect(deps.richTextChunkBuilder).toHaveBeenCalledWith('Hello');
    });

    test('falls back to paragraph when tagName is missing', () => {
      const deps = makeDeps();
      const block = createBlockFromTextAtom({ content: 'plain' }, deps);

      expect(block.type).toBe('paragraph');
    });

    test('returns null when content is falsy', () => {
      const deps = makeDeps();
      expect(createBlockFromTextAtom({ content: '' }, deps)).toBeNull();
      expect(createBlockFromTextAtom({}, deps)).toBeNull();
    });

    test('returns null when stripped text is empty', () => {
      const deps = makeDeps();
      const block = createBlockFromTextAtom({ content: '   <span></span>  ', tagName: 'p' }, deps);
      expect(block).toBeNull();
      expect(deps.richTextChunkBuilder).not.toHaveBeenCalled();
    });
  });

  describe('createBlockFromImageAtom', () => {
    test('uses atom.url when present', () => {
      const deps = makeDeps();
      const block = createBlockFromImageAtom(
        { url: 'https://cdn.example.com/a.jpg', caption: 'cap' },
        deps
      );

      expect(block).toEqual({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://cdn.example.com/a.jpg' },
          caption: [{ type: 'text', text: { content: 'cap' } }],
        },
      });
    });

    test.each([['resized'], ['original'], ['lightbox']])(
      'falls back to atom.size.%s.url',
      sizeKey => {
        const deps = makeDeps();
        const block = createBlockFromImageAtom(
          { size: { [sizeKey]: { url: `https://cdn.example.com/${sizeKey}.jpg` } } },
          deps
        );
        expect(block.image.external.url).toBe(`https://cdn.example.com/${sizeKey}.jpg`);
      }
    );

    test('returns null and logs structured debug when no image URL is found', () => {
      const deps = makeDeps();
      const atom = { tagName: 'figure', size: {} };

      const block = createBlockFromImageAtom(atom, deps);

      expect(block).toBeNull();
      expect(Logger.debug).toHaveBeenCalledTimes(1);
      const [, ctx] = Logger.debug.mock.calls[0];
      expect(ctx).toEqual(
        expect.objectContaining({
          action: 'StoryAtomsConverter.createBlockFromImageAtom',
          result: 'missing_image_url',
          atomKeys: expect.arrayContaining(['tagName', 'size']),
          hasSize: false,
        })
      );
    });

    test('hasSize is true when atom.size has at least one key', () => {
      const deps = makeDeps();
      createBlockFromImageAtom({ size: { resized: {} } }, deps);
      const [, ctx] = Logger.debug.mock.calls[0];
      expect(ctx.hasSize).toBe(true);
    });
  });

  describe('convertStoryAtoms', () => {
    test('returns [] when atoms is not an array', () => {
      const deps = makeDeps();
      expect(convertStoryAtoms(null, deps)).toEqual([]);
      expect(convertStoryAtoms(undefined, deps)).toEqual([]);
      expect(convertStoryAtoms({}, deps)).toEqual([]);
    });

    test('skips unknown atom types and falsy entries', () => {
      const deps = makeDeps();
      const result = convertStoryAtoms(
        [
          null,
          'string-atom',
          { type: 'unknown', content: 'x' },
          { type: 'text', content: '<p>kept</p>', tagName: 'p' },
        ],
        deps
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('paragraph');
    });

    test('routes text and image atoms to their builders in order', () => {
      const deps = makeDeps();
      const result = convertStoryAtoms(
        [
          { type: 'text', content: '<p>hi</p>', tagName: 'h2' },
          { type: 'image', url: 'https://cdn.example.com/x.jpg', caption: 'c' },
        ],
        deps
      );
      expect(result.map(b => b.type)).toEqual(['heading_2', 'image']);
    });
  });
});
