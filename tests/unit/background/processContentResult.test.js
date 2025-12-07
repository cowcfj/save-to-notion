/**
 * processContentResult 單元測試
 */

const { processContentResult } = require('../../../scripts/background');

describe('processContentResult', () => {
  it('should return default content for null input', () => {
    const result = processContentResult(null, []);

    expect(result.title).toBe('Untitled');
    expect(result.blocks).toEqual([]);
    expect(result.siteIcon).toBeNull();
  });

  it('should return default content for undefined input', () => {
    const result = processContentResult(undefined, []);

    expect(result.title).toBe('Untitled');
    expect(result.blocks).toEqual([]);
  });

  it('should pass through raw result without modification when no highlights', () => {
    const rawResult = {
      title: 'Test Page',
      blocks: [{ type: 'paragraph', paragraph: {} }],
      siteIcon: 'https://example.com/icon.png',
    };

    const result = processContentResult(rawResult, []);

    expect(result.title).toBe('Test Page');
    expect(result.blocks.length).toBe(1);
    expect(result.siteIcon).toBe('https://example.com/icon.png');
  });

  it('should add highlight blocks when highlights are provided', () => {
    const rawResult = {
      title: 'Test Page',
      blocks: [{ type: 'paragraph', paragraph: {} }],
      siteIcon: null,
    };
    const highlights = [{ text: 'Test highlight', color: 'yellow_background' }];

    const result = processContentResult(rawResult, highlights);

    // Original block + heading block + 1 highlight paragraph
    expect(result.blocks.length).toBe(3);
    expect(result.blocks[1].type).toBe('heading_3');
    expect(result.blocks[2].type).toBe('paragraph');
  });

  it('should handle empty highlights array', () => {
    const rawResult = {
      title: 'Test Page',
      blocks: [{ type: 'paragraph', paragraph: {} }],
      siteIcon: null,
    };

    const result = processContentResult(rawResult, []);

    expect(result.blocks.length).toBe(1);
  });

  it('should handle null highlights', () => {
    const rawResult = {
      title: 'Test Page',
      blocks: [],
      siteIcon: null,
    };

    const result = processContentResult(rawResult, null);

    expect(result.blocks.length).toBe(0);
  });

  it('should preserve original blocks when adding highlights', () => {
    const originalBlock = { type: 'image', image: { url: 'test.jpg' } };
    const rawResult = {
      title: 'Test',
      blocks: [originalBlock],
      siteIcon: null,
    };
    const highlights = [{ text: 'Highlight', color: 'blue_background' }];

    const result = processContentResult(rawResult, highlights);

    expect(result.blocks[0]).toEqual(originalBlock);
  });
});
