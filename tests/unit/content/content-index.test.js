/**
 * @jest-environment jsdom
 */

import { extractPageContent } from '../../../scripts/content/index.js';
import { ContentExtractor } from '../../../scripts/content/extractors/ContentExtractor.js';
import { ConverterFactory } from '../../../scripts/content/converters/ConverterFactory.js';
import { ImageCollector } from '../../../scripts/content/extractors/ImageCollector.js';
import { mergeUniqueImages } from '../../../scripts/utils/imageUtils.js';
import Logger from '../../../scripts/utils/Logger.js';

// Mock dependencies
jest.mock('../../../scripts/content/extractors/ContentExtractor.js');
jest.mock('../../../scripts/content/converters/ConverterFactory.js');
jest.mock('../../../scripts/content/extractors/ImageCollector.js');
jest.mock('../../../scripts/utils/imageUtils.js');
jest.mock('../../../scripts/utils/Logger.js', () => ({
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
}));

describe('Content Script Entry (index.js)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock chrome (which might be used by index.js on load)
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn(),
        },
        sendMessage: jest.fn(),
        lastError: null,
        getManifest: () => ({ version_name: 'dev' }),
      },
    };

    // Mock document.querySelector
    jest.spyOn(document, 'querySelector').mockImplementation(() => null);

    // Mock DOMParser
    globalThis.DOMParser = jest.fn().mockImplementation(() => ({
      parseFromString: jest.fn().mockImplementation(() => ({
        body: 'mock-body',
      })),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Message Handlers & Side Effects', () => {
    let messageHandler;
    let sendMessageMock;
    let preloaderHandler;

    beforeEach(() => {
      // Capture the message handler by isolating the module
      sendMessageMock = jest.fn();
      globalThis.chrome.runtime.onMessage.addListener = jest.fn(handler => {
        messageHandler = handler;
      });
      globalThis.chrome.runtime.sendMessage = sendMessageMock;

      // Setup event responder to simulate preloader cache
      preloaderHandler = () => {
        document.dispatchEvent(
          new CustomEvent('notion-preloader-response', {
            detail: {
              shortlink: 'https://wp.me/p1',
              nextRouteInfo: { page: '/p1' },
            },
          })
        );
      };
      document.addEventListener('notion-preloader-request', preloaderHandler);

      jest.isolateModules(() => {
        require('../../../scripts/content/index.js');
      });
    });

    afterEach(() => {
      document.removeEventListener('notion-preloader-request', preloaderHandler);
    });

    test('PING 應該返回正確的元數據', () => {
      const sendResponse = jest.fn();
      messageHandler({ action: 'PING' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'bundle_ready',
          shortlink: 'https://wp.me/p1',
          nextRouteInfo: expect.objectContaining({ page: '/p1' }),
        })
      );
    });

    test('showHighlighter 應該調用全局 highlighter', () => {
      const mockHighlighter = { show: jest.fn() };
      globalThis.notionHighlighter = mockHighlighter;

      const sendResponse = jest.fn();
      messageHandler({ action: 'showHighlighter' }, {}, sendResponse);

      expect(mockHighlighter.show).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      delete globalThis.notionHighlighter;
    });

    test('REMOVE_HIGHLIGHT_DOM 應呼叫 manager.removeHighlight', () => {
      const removeHighlight = jest.fn().mockReturnValue(true);
      globalThis.HighlighterV2 = {
        manager: {
          removeHighlight,
        },
      };

      const sendResponse = jest.fn();
      const result = messageHandler(
        { action: 'REMOVE_HIGHLIGHT_DOM', highlightId: 'hl-123' },
        {},
        sendResponse
      );

      expect(result).toBe(true);
      expect(removeHighlight).toHaveBeenCalledWith('hl-123');
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      delete globalThis.HighlighterV2;
    });

    test('應該在載入時發送 REPLAY_BUFFERED_EVENTS 訊息', () => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        { action: 'REPLAY_BUFFERED_EVENTS' },
        expect.any(Function)
      );
    });

    test('應該處理重放事件', () => {
      const mockHighlighter = { show: jest.fn() };
      globalThis.notionHighlighter = mockHighlighter;

      // Simulate response to REPLAY_BUFFERED_EVENTS
      const replayCall = sendMessageMock.mock.calls.find(
        call => call[0].action === 'REPLAY_BUFFERED_EVENTS'
      );
      expect(replayCall).toBeDefined();
      const replayCallback = replayCall[1];

      replayCallback({ events: [{ type: 'shortcut' }] });

      expect(mockHighlighter.show).toHaveBeenCalled();

      delete globalThis.notionHighlighter;
    });

    describe('SET_STABLE_URL', () => {
      beforeEach(() => {
        globalThis.__NOTION_STABLE_URL__ = undefined;
      });

      afterEach(() => {
        delete globalThis.__NOTION_STABLE_URL__;
      });

      test('應該接受帶有 query 參數的 URL', () => {
        const sendResponse = jest.fn();
        const result = messageHandler(
          { action: 'SET_STABLE_URL', stableUrl: 'https://example.com/?p=123' },
          {},
          sendResponse
        );

        expect(result).toBe(false); // Handler finishes synchronously
        expect(globalThis.__NOTION_STABLE_URL__).toBe('https://example.com/?p=123');
      });

      test('應該接受帶有具體路徑的 URL', () => {
        const sendResponse = jest.fn();
        const result = messageHandler(
          { action: 'SET_STABLE_URL', stableUrl: 'https://example.com/posts/123/' },
          {},
          sendResponse
        );

        expect(result).toBe(false); // Handler finishes synchronously
        expect(globalThis.__NOTION_STABLE_URL__).toBe('https://example.com/posts/123/');
      });

      test('應該拒絕純首頁（無路徑無 query）', () => {
        globalThis.__NOTION_STABLE_URL__ = 'old-url';
        const sendResponse = jest.fn();
        const result = messageHandler(
          { action: 'SET_STABLE_URL', stableUrl: 'https://example.com/' },
          {},
          sendResponse
        );

        expect(result).toBe(false); // Rejected
        expect(globalThis.__NOTION_STABLE_URL__).toBe('old-url'); // Unchanged
        expect(Logger.debug).toHaveBeenCalledWith(
          '拒絕設置首頁 URL 為穩定 URL',
          expect.any(Object)
        );
      });

      test('應該處理無效的 URL 字串', () => {
        globalThis.__NOTION_STABLE_URL__ = 'old-url';
        const sendResponse = jest.fn();
        const result = messageHandler(
          { action: 'SET_STABLE_URL', stableUrl: 'not-a-valid-url' },
          {},
          sendResponse
        );

        expect(result).toBe(false); // Rejected
        expect(globalThis.__NOTION_STABLE_URL__).toBe('old-url'); // Unchanged
        expect(Logger.debug).toHaveBeenCalledWith(
          '拒絕設置無效 URL 為穩定 URL',
          expect.any(Object)
        );
      });
    });
  });

  describe('extractPageContent', () => {
    test('應該成功提取並轉換內容', async () => {
      ContentExtractor.extractAsync.mockResolvedValue({
        content: '<div>Test content</div>',
        type: 'readability',
        metadata: { title: 'Test Title' },
        blocks: [],
      });

      const mockConverter = {
        convert: jest.fn().mockReturnValue([{ object: 'block', type: 'paragraph' }]),
        imageCount: 0,
      };
      ConverterFactory.getConverter.mockReturnValue(mockConverter);

      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [{ type: 'image', image: { external: { url: 'img1' } } }],
        coverImage: 'https://example.com/cover.jpg',
      });

      mergeUniqueImages.mockReturnValue([{ type: 'image', image: { external: { url: 'img1' } } }]);

      const result = await extractPageContent();

      expect(result.title).toBe('Test Title');
      expect(result.coverImage).toBe('https://example.com/cover.jpg');
      expect(result.extractionStatus).toBe('success');
    });

    test('應該在正文無圖片時將首張額外圖片插入到開頭', async () => {
      ContentExtractor.extractAsync.mockResolvedValue({
        content: '<div>No image</div>',
        type: 'readability',
        metadata: { title: 'No Image' },
        blocks: [],
      });

      const mockConverter = {
        convert: jest.fn().mockReturnValue([{ object: 'block', type: 'paragraph' }]),
        imageCount: 0,
      };
      ConverterFactory.getConverter.mockReturnValue(mockConverter);

      const leadImg = { type: 'image', image: { external: { url: 'lead-img' } } };
      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [leadImg],
        coverImage: null,
      });

      mergeUniqueImages.mockReturnValue([leadImg]);

      const result = await extractPageContent();

      expect(result.blocks[0]).toEqual(leadImg);
    });

    test('應該在提取不到內容時返回後備區塊', async () => {
      ContentExtractor.extractAsync.mockResolvedValue({
        content: '',
        blocks: [],
      });

      const result = await extractPageContent();

      expect(result.blocks[0].paragraph.rich_text[0].text.content).toMatch(/failed/i);
      expect(result.extractionStatus).toBe('failed');
    });

    test('應該處理提取過程中的異常', async () => {
      ContentExtractor.extractAsync.mockRejectedValue(new Error('Unexpected crash'));

      const result = await extractPageContent();

      expect(result.error).toBe('Unexpected crash');
      expect(result.extractionStatus).toBe('failed');
    });
  });
});
