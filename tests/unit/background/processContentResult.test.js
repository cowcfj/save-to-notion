/**
 * processContentResult 單元測試
 */

const { processContentResult } = require('../../../scripts/background/handlers/saveHandlers.js');
const {
  HIGHLIGHT_STYLE_OPTIONS,
} = require('../../../scripts/background/utils/highlightStyleMerger.js');

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
    expect(result.blocks).toHaveLength(1);
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
    expect(result.blocks).toHaveLength(3);
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

    expect(result.blocks).toHaveLength(1);
  });

  it('should handle null highlights', () => {
    const rawResult = {
      title: 'Test Page',
      blocks: [],
      siteIcon: null,
    };

    const result = processContentResult(rawResult, null);

    expect(result.blocks).toHaveLength(0);
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

  // ---- 新增：highlightContentStyle 參數測試 ----

  it('highlightContentStyle 應有預設值 COLOR_SYNC（向後相容）', () => {
    const rawResult = {
      title: 'Test',
      blocks: [{ type: 'paragraph', paragraph: {} }],
      siteIcon: null,
    };
    const result = processContentResult(rawResult, []);
    expect(result.highlightContentStyle).toBe(HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC);
    expect(result.title).toBe(rawResult.title);
    expect(result.blocks).toEqual(rawResult.blocks);
    expect(result.siteIcon).toBe(rawResult.siteIcon);
  });

  it('highlightContentStyle 為 NONE 時不影響 blocks 結構', () => {
    const rawResult = {
      title: 'Test Page',
      blocks: [{ type: 'paragraph', paragraph: { rich_text: [] } }],
      siteIcon: null,
    };
    const highlights = [{ text: 'some text', color: 'yellow' }];

    const result = processContentResult(rawResult, highlights, 'NONE');

    // NONE 模式：原始內容 block 仍在，加上 highlight section = 3 blocks
    // (paragraph + heading + highlight paragraph)
    expect(result.blocks).toHaveLength(3);
    expect(result.blocks[0]).toEqual(rawResult.blocks[0]); // 原始 block 未被修改
  });
});
