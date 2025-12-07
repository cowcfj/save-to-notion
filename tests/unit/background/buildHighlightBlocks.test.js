/**
 * buildHighlightBlocks 單元測試
 */

const { buildHighlightBlocks } = require('../../../scripts/background');

describe('buildHighlightBlocks', () => {
  it('should return empty array for null input', () => {
    expect(buildHighlightBlocks(null)).toEqual([]);
  });

  it('should return empty array for undefined input', () => {
    // skipcq: JS-0356 - Intentionally testing undefined input handling
    expect(buildHighlightBlocks(undefined)).toEqual([]);
  });

  it('should return empty array for empty array', () => {
    expect(buildHighlightBlocks([])).toEqual([]);
  });

  it('should create heading and paragraph blocks for single highlight', () => {
    const highlights = [{ text: 'Test highlight', color: 'yellow_background' }];
    const result = buildHighlightBlocks(highlights);

    expect(result.length).toBe(2); // 1 heading + 1 paragraph
    expect(result[0].type).toBe('heading_3');
    expect(result[0].heading_3.rich_text[0].text.content).toBe('📝 頁面標記');
    expect(result[1].type).toBe('paragraph');
    expect(result[1].paragraph.rich_text[0].text.content).toBe('Test highlight');
    expect(result[1].paragraph.rich_text[0].annotations.color).toBe('yellow_background');
  });

  it('should create multiple paragraph blocks for multiple highlights', () => {
    const highlights = [
      { text: 'First highlight', color: 'yellow_background' },
      { text: 'Second highlight', color: 'blue_background' },
      { text: 'Third highlight', color: 'green_background' },
    ];
    const result = buildHighlightBlocks(highlights);

    expect(result.length).toBe(4); // 1 heading + 3 paragraphs
    expect(result[0].type).toBe('heading_3');
    expect(result[1].paragraph.rich_text[0].text.content).toBe('First highlight');
    expect(result[2].paragraph.rich_text[0].text.content).toBe('Second highlight');
    expect(result[3].paragraph.rich_text[0].text.content).toBe('Third highlight');
  });

  it('should handle missing text with empty string', () => {
    const highlights = [{ color: 'yellow_background' }];
    const result = buildHighlightBlocks(highlights);

    expect(result[1].paragraph.rich_text[0].text.content).toBe('');
  });

  it('should handle missing color with default', () => {
    const highlights = [{ text: 'No color highlight' }];
    const result = buildHighlightBlocks(highlights);

    expect(result[1].paragraph.rich_text[0].annotations.color).toBe('default');
  });

  it('should create valid Notion block structure', () => {
    const highlights = [{ text: 'Test', color: 'yellow_background' }];
    const result = buildHighlightBlocks(highlights);

    // Verify heading block structure
    expect(result[0]).toEqual({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [
          {
            type: 'text',
            text: { content: '📝 頁面標記' },
          },
        ],
      },
    });

    // Verify paragraph block structure
    expect(result[1]).toEqual({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: 'Test' },
            annotations: { color: 'yellow_background' },
          },
        ],
      },
    });
  });
});
