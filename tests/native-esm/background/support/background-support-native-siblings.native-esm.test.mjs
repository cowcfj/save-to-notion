import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  createMockLogBuffer,
  installBackgroundSupportChrome,
  makeParagraphBlock,
} from './backgroundSupportHarness.mjs';
import { snapshotGlobals } from '../../utils/rootUtilsHarness.mjs';

let restoreGlobals;

describe('background support native ESM siblings', () => {
  beforeEach(() => {
    restoreGlobals = snapshotGlobals(['chrome']);
    installBackgroundSupportChrome();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreGlobals();
  });

  test('BlockBuilder splits long highlight text and builds valid highlight blocks', async () => {
    const { buildHighlightBlocks, splitTextForHighlight } =
      await import('../../../../scripts/background/utils/BlockBuilder.js');

    const sourceText = 'abcdefghij'.repeat(5);
    const chunks = splitTextForHighlight(sourceText, 20);
    const blocks = buildHighlightBlocks([
      {
        text: 'Important native highlight',
        color: 'blue',
        url: 'https://example.com/source',
      },
    ]);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(sourceText);
    expect(chunks.every(chunk => chunk.length <= 20)).toBe(true);
    expect(blocks[0].type).toBe('heading_3');
    expect(blocks[1].paragraph.rich_text[0].text.content).toContain('Important native highlight');
  });

  test('processContentResult appends highlight blocks while preserving original content', async () => {
    const { processContentResult } =
      await import('../../../../scripts/background/handlers/saveHandlers.js');
    const originalBlock = makeParagraphBlock('Original content');

    const result = processContentResult(
      {
        title: 'Native Background Page',
        blocks: [originalBlock],
        siteIcon: 'https://example.com/icon.png',
      },
      [{ text: 'Native highlight', color: 'yellow' }],
      'NONE'
    );

    expect(result).toEqual(
      expect.objectContaining({
        title: 'Native Background Page',
        siteIcon: 'https://example.com/icon.png',
        highlightContentStyle: 'NONE',
      })
    );
    expect(result.blocks[0]).toEqual(originalBlock);
    expect(result.blocks).toHaveLength(3);
  });

  test('logHandlers exports debug logs and caps dev log sink batches', async () => {
    const { default: Logger } = await import('../../../../scripts/utils/Logger.js');
    const { createLogHandlers, exportDebugLogs, handleDevLogSinkBatch } =
      await import('../../../../scripts/background/handlers/logHandlers.js');
    const buffer = createMockLogBuffer([
      {
        timestamp: '2026-06-28T10:00:00.000Z',
        level: 'info',
        message: 'background native log',
      },
    ]);
    const sendResponse = jest.fn();

    jest.spyOn(Logger, 'getBuffer').mockReturnValue(buffer);
    jest.spyOn(Logger, 'addLogToBuffer').mockImplementation(entry => buffer.push(entry));

    exportDebugLogs(
      { format: 'json' },
      { id: 'trusted-extension-id', url: 'chrome-extension://trusted-extension-id/options.html' },
      sendResponse
    );

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          filename: 'notion-debug.json',
          count: 1,
        }),
      })
    );

    const batchResponse = jest.fn();
    handleDevLogSinkBatch(
      {
        logs: Array.from({ length: 25 }, (_, index) => ({
          level: 'info',
          message: `entry-${index}`,
          args: [{ index }],
        })),
      },
      { id: 'trusted-extension-id', url: 'https://example.com/page' },
      batchResponse
    );

    expect(batchResponse).toHaveBeenCalledWith({ success: true });
    expect(Logger.addLogToBuffer).toHaveBeenCalledTimes(20);
    expect(createLogHandlers()).toEqual(
      expect.objectContaining({
        exportDebugLogs,
      })
    );
  });

  test('background metadata and highlight style utilities keep native behavior coverage', async () => {
    const { HIGHLIGHT_STYLE_OPTIONS, mergeHighlightsWithStyle, resolveStyle } =
      await import('../../../../scripts/background/utils/highlightStyleMerger.js');
    const { hasNotionData, isSameNotionPage } =
      await import('../../../../scripts/background/utils/migrationMetadataUtils.js');
    const blocks = [makeParagraphBlock('Native highlighted text')];
    const merged = mergeHighlightsWithStyle(
      blocks,
      [{ text: 'highlighted', color: 'blue' }],
      HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC
    );

    expect(
      merged[0].paragraph.rich_text.some(part => part.annotations?.color === 'blue_background')
    ).toBe(true);
    expect(resolveStyle(HIGHLIGHT_STYLE_OPTIONS.COLOR_TEXT, { color: 'blue' })).toEqual({
      color: 'blue',
    });
    expect(hasNotionData({ notion: { pageId: ' page-id ' } })).toBe(true);
    expect(
      isSameNotionPage(
        { notionPageId: 'same-page', notionUrl: 'https://notion.so/a' },
        { notion: { pageId: 'same-page', url: 'https://notion.so/b' } }
      )
    ).toBe(true);
  });
});
