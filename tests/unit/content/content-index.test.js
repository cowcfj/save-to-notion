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

function createDeferred() {
  let resolveDeferred;
  let rejectDeferred;
  const promise = new Promise((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });

  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Content Script Entry (index.js)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete globalThis.HighlighterV2;
    delete globalThis.__NOTION_RAIL_READY__;
    delete globalThis.notionHighlighter;

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
      sendMessageMock = jest.fn();
      globalThis.chrome.runtime.onMessage.addListener = jest.fn();
      globalThis.chrome.runtime.onMessage.removeListener = jest.fn();
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

      // content/index.js 的 handler 是能回應 PING 的那個
      const allHandlers = globalThis.chrome.runtime.onMessage.addListener.mock.calls.map(c => c[0]);
      messageHandler = allHandlers.find(h => {
        const mockSend = jest.fn();
        const result = h({ action: 'PING' }, {}, mockSend);
        return result === true && mockSend.mock.calls.length > 0;
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

    test('showHighlighter 應優先調用 rail.show', () => {
      const showMock = jest.fn();
      globalThis.HighlighterV2 = { rail: { show: showMock } };
      const sendResponse = jest.fn();

      messageHandler({ action: 'showHighlighter' }, {}, sendResponse);

      expect(showMock).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
      delete globalThis.HighlighterV2;
    });

    test('showHighlighter 在 rail.show 拋錯時應返回錯誤', () => {
      globalThis.HighlighterV2 = {
        rail: {
          show: jest.fn(() => {
            throw new Error('showHighlighter failed');
          }),
        },
      };
      const sendResponse = jest.fn();

      messageHandler({ action: 'showHighlighter' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'showHighlighter failed',
      });
    });

    test('[REGRESSION] showHighlighter 不應在無 rail 時 fallback 到 notionHighlighter toolbar', async () => {
      delete globalThis.HighlighterV2;
      const showMock = jest.fn();
      globalThis.notionHighlighter = { show: showMock };
      const sendResponse = jest.fn();

      messageHandler({ action: 'showHighlighter' }, {}, sendResponse);
      await Promise.resolve();
      await Promise.resolve();

      expect(showMock).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄尚未初始化',
      });
      delete globalThis.notionHighlighter;
    });

    test('[REGRESSION] content bridge SHOW_FLOATING_RAIL 應等待 rail-ready 完成後才回應', async () => {
      const railReady = createDeferred();
      const showMock = jest.fn();
      globalThis.__NOTION_RAIL_READY__ = railReady.promise;
      const sendResponse = jest.fn();

      const result = messageHandler(
        { action: 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL' },
        {},
        sendResponse
      );

      expect(result).toBe(true);
      expect(showMock).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();

      railReady.resolve({
        success: true,
        rail: { show: showMock },
      });
      await flushPromises();

      expect(showMock).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      delete globalThis.__NOTION_RAIL_READY__;
    });

    test('SHOW_FLOATING_RAIL 應優先使用 undismiss 喚回 dismissed rail', () => {
      const undismissMock = jest.fn();
      const showMock = jest.fn();
      globalThis.HighlighterV2 = {
        rail: {
          stateManager: { isDismissed: true },
          undismiss: undismissMock,
          show: showMock,
        },
      };
      const sendResponse = jest.fn();

      const result = messageHandler(
        { action: 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL' },
        {},
        sendResponse
      );

      expect(result).toBe(true);
      expect(undismissMock).toHaveBeenCalledWith();
      expect(showMock).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('[REGRESSION] SHOW_FLOATING_RAIL 在 ready rail 缺少 show 時應返回初始化失敗', async () => {
      const undismissMock = jest.fn();
      globalThis.__NOTION_RAIL_READY__ = Promise.resolve({
        success: true,
        rail: { undismiss: undismissMock },
      });
      const sendResponse = jest.fn();

      messageHandler({ action: 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL' }, {}, sendResponse);
      await flushPromises();

      expect(undismissMock).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄缺少 show() 方法',
      });
      expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
      delete globalThis.__NOTION_RAIL_READY__;
    });

    test('[REGRESSION] SHOW_FLOATING_RAIL 在現有 rail 顯示失敗時應返回錯誤訊息', () => {
      globalThis.HighlighterV2 = {
        rail: {
          show: jest.fn(() => {
            throw new Error('rail show failed');
          }),
        },
      };
      const sendResponse = jest.fn();

      messageHandler({ action: 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'rail show failed',
      });
    });

    test('[REGRESSION] SHOW_FLOATING_RAIL 在現有 rail 拋出無 message 的 Error 時不應回傳 [object Object]', () => {
      const railError = new Error('unused');
      delete railError.message;
      railError.reason = 'rail show failed';

      globalThis.HighlighterV2 = {
        rail: {
          show: jest.fn(() => {
            throw railError;
          }),
        },
      };
      const sendResponse = jest.fn();

      messageHandler({ action: 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '{"reason":"rail show failed"}',
      });
    });

    test('[REGRESSION] SHOW_FLOATING_RAIL 在 ready rail 缺少顯示方法時應返回明確錯誤', async () => {
      globalThis.__NOTION_RAIL_READY__ = Promise.resolve({
        success: true,
        rail: {},
      });
      const sendResponse = jest.fn();

      messageHandler({ action: 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL' }, {}, sendResponse);
      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄缺少 show() 方法',
      });
      expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
    });

    test('SHOW_FLOATING_RAIL 在 readyResult 未帶 error 時應返回通用初始化錯誤', async () => {
      globalThis.__NOTION_RAIL_READY__ = Promise.resolve({ success: false });
      const sendResponse = jest.fn();

      messageHandler({ action: 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL' }, {}, sendResponse);
      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄初始化失敗',
      });
      expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
    });

    test('SHOW_FLOATING_RAIL 在未初始化時應直接返回錯誤', () => {
      delete globalThis.HighlighterV2;
      delete globalThis.__NOTION_RAIL_READY__;
      const sendResponse = jest.fn();

      messageHandler({ action: 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄尚未初始化',
      });
    });

    test('[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 應先喚回 dismissed 的 ready rail 再啟動標註', async () => {
      const railReady = createDeferred();
      const showMock = jest.fn();
      const undismissMock = jest.fn();
      const activateHighlightingMock = jest.fn();
      globalThis.__NOTION_RAIL_READY__ = railReady.promise;
      const sendResponse = jest.fn();

      const result = messageHandler(
        { action: 'ACTIVATE_FLOATING_RAIL_HIGHLIGHT' },
        {},
        sendResponse
      );

      expect(result).toBe(true);
      expect(showMock).not.toHaveBeenCalled();
      expect(activateHighlightingMock).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();

      railReady.resolve({
        success: true,
        rail: {
          stateManager: { isDismissed: true },
          undismiss: undismissMock,
          show: showMock,
          activateHighlighting: activateHighlightingMock,
        },
      });
      await flushPromises();

      expect(undismissMock).toHaveBeenCalledWith();
      expect(showMock).not.toHaveBeenCalled();
      expect(activateHighlightingMock).toHaveBeenCalledWith();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      delete globalThis.__NOTION_RAIL_READY__;
    });

    test('ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在現有 dismissed rail 可用時應先喚回再啟動標註', () => {
      const showMock = jest.fn();
      const undismissMock = jest.fn();
      const activateHighlightingMock = jest.fn();
      globalThis.HighlighterV2 = {
        rail: {
          stateManager: { isDismissed: true },
          undismiss: undismissMock,
          show: showMock,
          activateHighlighting: activateHighlightingMock,
        },
      };
      const sendResponse = jest.fn();

      messageHandler({ action: 'ACTIVATE_FLOATING_RAIL_HIGHLIGHT' }, {}, sendResponse);

      expect(undismissMock).toHaveBeenCalledWith();
      expect(showMock).not.toHaveBeenCalled();
      expect(activateHighlightingMock).toHaveBeenCalledWith();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在現有 rail 啟動失敗時應返回錯誤訊息', () => {
      const activateHighlightingMock = jest.fn(() => {
        throw new Error('activate failed');
      });
      globalThis.HighlighterV2 = {
        rail: {
          show: jest.fn(),
          activateHighlighting: activateHighlightingMock,
        },
      };
      const sendResponse = jest.fn();

      messageHandler({ action: 'ACTIVATE_FLOATING_RAIL_HIGHLIGHT' }, {}, sendResponse);

      expect(activateHighlightingMock).toHaveBeenCalledWith();
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'activate failed',
      });
    });

    test('[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在現有 rail 缺少 activateHighlighting 時應回傳明確錯誤', () => {
      globalThis.HighlighterV2 = {
        rail: {
          show: jest.fn(),
        },
      };
      const sendResponse = jest.fn();

      messageHandler({ action: 'ACTIVATE_FLOATING_RAIL_HIGHLIGHT' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄缺少 activateHighlighting() 方法',
      });
    });

    test('[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在 ready rail 初始化失敗時應回傳 ready error', async () => {
      globalThis.__NOTION_RAIL_READY__ = Promise.resolve({
        success: false,
        error: 'ready failed',
      });
      const sendResponse = jest.fn();

      messageHandler({ action: 'ACTIVATE_FLOATING_RAIL_HIGHLIGHT' }, {}, sendResponse);
      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'ready failed',
      });
      expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
    });

    test('[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在 ready rail 缺少 activateHighlighting 時應回傳明確錯誤', async () => {
      globalThis.__NOTION_RAIL_READY__ = Promise.resolve({
        success: true,
        rail: {
          show: jest.fn(),
        },
      });
      const sendResponse = jest.fn();

      messageHandler({ action: 'ACTIVATE_FLOATING_RAIL_HIGHLIGHT' }, {}, sendResponse);
      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄缺少 activateHighlighting() 方法',
      });
      expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
    });

    test('[REGRESSION] ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在 ready promise reject 時應回傳通用錯誤', async () => {
      globalThis.__NOTION_RAIL_READY__ = Promise.reject(new Error('boom'));
      const sendResponse = jest.fn();

      messageHandler({ action: 'ACTIVATE_FLOATING_RAIL_HIGHLIGHT' }, {}, sendResponse);
      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄初始化失敗',
      });
      expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
    });

    test('ACTIVATE_FLOATING_RAIL_HIGHLIGHT 在未初始化時應直接返回錯誤', () => {
      delete globalThis.HighlighterV2;
      delete globalThis.__NOTION_RAIL_READY__;
      const sendResponse = jest.fn();

      messageHandler({ action: 'ACTIVATE_FLOATING_RAIL_HIGHLIGHT' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄尚未初始化',
      });
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

    test('REMOVE_HIGHLIGHT_DOM 在 Highlighter 尚未初始化時應回傳錯誤', () => {
      delete globalThis.HighlighterV2;
      const sendResponse = jest.fn();

      messageHandler(
        { action: 'REMOVE_HIGHLIGHT_DOM', highlightId: 'hl-undefined' },
        {},
        sendResponse
      );

      expect(Logger.warn).toHaveBeenCalledWith(
        'Highlighter 尚未初始化，略過移除標註 DOM',
        expect.objectContaining({
          action: 'REMOVE_HIGHLIGHT_DOM',
          highlightId: 'hl-undefined',
        })
      );
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Highlighter 尚未初始化',
      });
    });

    test('REMOVE_HIGHLIGHT_DOM 在 removeHighlight 拋錯時應回傳錯誤', () => {
      globalThis.HighlighterV2 = {
        manager: {
          removeHighlight: jest.fn(() => {
            throw new Error('remove failed');
          }),
        },
      };
      const sendResponse = jest.fn();

      messageHandler({ action: 'REMOVE_HIGHLIGHT_DOM', highlightId: 'hl-error' }, {}, sendResponse);

      expect(Logger.error).toHaveBeenCalledWith(
        '移除標註 DOM 失敗',
        expect.objectContaining({ action: 'REMOVE_HIGHLIGHT_DOM', error: expect.any(Error) })
      );
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'remove failed',
      });
    });

    test('應該在載入時發送 REPLAY_BUFFERED_EVENTS 訊息', () => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        { action: 'REPLAY_BUFFERED_EVENTS' },
        expect.any(Function)
      );
    });

    test('REPLAY_BUFFERED_EVENTS callback 遇到 runtime.lastError 時應靜默忽略', () => {
      const replayCall = sendMessageMock.mock.calls.find(
        call => call[0].action === 'REPLAY_BUFFERED_EVENTS'
      );
      const replayCallback = replayCall[1];
      globalThis.chrome.runtime.lastError = { message: 'preloader missing' };

      replayCallback({ events: [{ type: 'shortcut' }] });

      expect(Logger.warn).not.toHaveBeenCalledWith(
        'Highlighter 不可用，無法重放',
        expect.any(Object)
      );
      globalThis.chrome.runtime.lastError = null;
    });

    test('應該處理重放事件', () => {
      const rail = {
        show: jest.fn(),
        activateHighlighting: jest.fn(),
      };
      globalThis.HighlighterV2 = { rail };

      // Simulate response to REPLAY_BUFFERED_EVENTS
      const replayCall = sendMessageMock.mock.calls.find(
        call => call[0].action === 'REPLAY_BUFFERED_EVENTS'
      );
      expect(replayCall).toBeDefined();
      const replayCallback = replayCall[1];

      replayCallback({ events: [{ type: 'shortcut' }] });

      expect(rail.show).toHaveBeenCalled();
      expect(rail.activateHighlighting).toHaveBeenCalledWith();

      delete globalThis.HighlighterV2;
    });

    test('重放 shortcut 事件時若 Highlighter 不可用應記錄警告', () => {
      delete globalThis.HighlighterV2;
      const replayCall = sendMessageMock.mock.calls.find(
        call => call[0].action === 'REPLAY_BUFFERED_EVENTS'
      );
      const replayCallback = replayCall[1];

      replayCallback({ events: [{ type: 'shortcut' }] });

      expect(Logger.warn).toHaveBeenCalledWith(
        'Highlighter 不可用，無法重放',
        expect.objectContaining({ action: 'replayEvents' })
      );
    });

    test('重放 shortcut 事件失敗時應記錄警告並繼續', () => {
      globalThis.HighlighterV2 = {
        rail: {
          show: jest.fn(() => {
            throw new Error('shortcut failed');
          }),
          activateHighlighting: jest.fn(),
        },
      };

      const replayCall = sendMessageMock.mock.calls.find(
        call => call[0].action === 'REPLAY_BUFFERED_EVENTS'
      );
      const replayCallback = replayCall[1];

      replayCallback({ events: [{ type: 'shortcut' }] });

      expect(Logger.warn).toHaveBeenCalledWith(
        '重放快捷鍵事件失敗，繼續處理後續事件',
        expect.objectContaining({
          action: 'replayEvents',
          error: 'shortcut failed',
        })
      );
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

    test('未知 action 應返回 false', () => {
      const sendResponse = jest.fn();

      const result = messageHandler({ action: 'UNKNOWN_ACTION' }, {}, sendResponse);

      expect(result).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
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
        metrics: {
          candidateCount: 3,
          urlValidCount: 1,
          unknownSizeCount: 0,
          sizeResolveAttempted: 0,
          sizeResolveSuccess: 0,
          filteredBySize: 0,
          finalCount: 1,
          hasCoverImage: true,
          durationMs: 12,
        },
      });

      mergeUniqueImages.mockReturnValue([{ type: 'image', image: { external: { url: 'img1' } } }]);

      const result = await extractPageContent();

      expect(result.title).toBe('Test Title');
      expect(result.coverImage).toBe('https://example.com/cover.jpg');
      expect(result.extractionStatus).toBe('success');
      expect(result.debug.imageMetrics).toBeDefined();
      expect(result.debug.imageMetrics.candidateCount).toBe(3);
      expect(result.debug.imageMetrics.hasCoverImage).toBe(true);
      expect(result.debug.imageMetrics.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('應該在圖片收集失敗時仍返回成功結果且 imageMetrics 為 null', async () => {
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

      ImageCollector.collectAdditionalImages.mockRejectedValue(
        new Error('Image collection failed')
      );

      const result = await extractPageContent();

      expect(result.extractionStatus).toBe('success');
      expect(result.debug).toBeDefined();
      expect(result.debug.imageMetrics).toBeNull();
    });

    test('應該在 imageResult 無 metrics 時 imageMetrics 為 null', async () => {
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

      // 回傳舊格式（無 metrics）
      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [],
        coverImage: null,
      });

      mergeUniqueImages.mockReturnValue([]);

      const result = await extractPageContent();

      expect(result.extractionStatus).toBe('success');
      expect(result.debug.imageMetrics).toBeNull();
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

    test('應優先使用預提取 blocks，並將 nextjs blocks 傳給 ImageCollector', async () => {
      const preExtractedBlocks = [
        { object: 'block', type: 'image' },
        { object: 'block', type: 'paragraph' },
      ];
      ContentExtractor.extractAsync.mockResolvedValue({
        content: '',
        type: 'nextjs',
        metadata: { title: 'Next.js Title' },
        blocks: preExtractedBlocks,
        debug: { complexity: 'low' },
      });
      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [],
        coverImage: null,
        metrics: { candidateCount: 0, finalCount: 0 },
      });
      mergeUniqueImages.mockReturnValue([]);

      const result = await extractPageContent();

      expect(ConverterFactory.getConverter).not.toHaveBeenCalled();
      expect(ImageCollector.collectAdditionalImages).toHaveBeenCalledWith(null, {
        nextJsBlocks: preExtractedBlocks,
        mainContentImageCount: 1,
      });
      expect(result.blocks).toEqual(preExtractedBlocks);
      expect(result.debug).toEqual(
        expect.objectContaining({
          contentType: 'nextjs',
          complexity: 'low',
          imageMetrics: { candidateCount: 0, finalCount: 0 },
        })
      );
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

    test('[REGRESSION] __UNIT_TESTING__ 模式載入時應自動暴露提取結果', async () => {
      globalThis.__UNIT_TESTING__ = true;
      delete globalThis.__notion_extraction_result;

      ContentExtractor.extractAsync.mockResolvedValue({
        content: '<div>Auto extract</div>',
        type: 'readability',
        metadata: { title: 'Auto Title' },
        blocks: [],
      });
      ConverterFactory.getConverter.mockReturnValue({
        convert: jest.fn().mockReturnValue([{ object: 'block', type: 'paragraph' }]),
        imageCount: 0,
      });
      ImageCollector.collectAdditionalImages.mockResolvedValue({
        images: [],
        coverImage: null,
      });
      mergeUniqueImages.mockReturnValue([]);

      jest.isolateModules(() => {
        require('../../../scripts/content/index.js');
      });
      await flushPromises();

      expect(globalThis.__notion_extraction_result).toEqual(
        expect.objectContaining({
          extractionStatus: 'success',
          title: 'Auto Title',
        })
      );

      delete globalThis.__UNIT_TESTING__;
      delete globalThis.__notion_extraction_result;
    });
  });
});
