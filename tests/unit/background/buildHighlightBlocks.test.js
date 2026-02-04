/**
 * buildHighlightBlocks 單元測試
 */

const { buildHighlightBlocks } = require('../../../scripts/background/utils/BlockBuilder.js');

describe('buildHighlightBlocks', () => {
  it('should return empty array for null input', () => {
    expect(buildHighlightBlocks(null)).toEqual([]);
  });

  it('should return empty array for undefined input', () => {
    expect(buildHighlightBlocks()).toEqual([]);
  });

  it('should return empty array for empty array', () => {
    expect(buildHighlightBlocks([])).toEqual([]);
  });

  it('should create heading and paragraph blocks for single highlight', () => {
    const highlights = [{ text: 'Test highlight', color: 'yellow_background' }];
    const result = buildHighlightBlocks(highlights);

    expect(result).toHaveLength(2); // 1 heading + 1 paragraph
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

    expect(result).toHaveLength(4); // 1 heading + 3 paragraphs
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

    expect(result[1].paragraph.rich_text[0].annotations).toBeUndefined();
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

  it('should split long highlight text into multiple blocks', () => {
    // Creating text longer than 2000 chars (Notion limit is 2000)
    const longText = 'A'.repeat(3000);
    const highlights = [{ text: longText, color: 'red_background' }];

    // We expect splitTextForHighlight to be used, splitting 3000 chars into 2000 + 1000 chunks
    // Since buildHighlightBlocks prepends a heading block, we expect:
    // 1 heading block + 2 paragraph blocks (chunks)
    const result = buildHighlightBlocks(highlights);

    expect(result).toHaveLength(3);

    // Check first chunk
    expect(result[1].type).toBe('paragraph');
    expect(result[1].paragraph.rich_text[0].text.content).toHaveLength(2000);
    expect(result[1].paragraph.rich_text[0].annotations.color).toBe('red_background');

    // Check second chunk
    expect(result[2].type).toBe('paragraph');
    expect(result[2].paragraph.rich_text[0].text.content).toHaveLength(1000);
    expect(result[2].paragraph.rich_text[0].annotations.color).toBe('red_background');
  });
});
