/**
 * @jest-environment jsdom
 */

// Mock Logger（保留 parseArgsToContext 的真實實作，因為它是純函數）
jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    addLogToBuffer: jest.fn(),
  },
  parseArgsToContext: args => {
    if (!Array.isArray(args) || args.length === 0) {
      return {};
    }
    if (typeof args[0] === 'object' && args[0] !== null) {
      const context = { ...args[0] };
      if (args.length > 1) {
        context.details = args.slice(1);
      }
      return context;
    }
    return { details: args };
  },
}));

import { createLogHandlers } from '../../../../scripts/background/handlers/logHandlers.js';
import { LogExporter } from '../../../../scripts/utils/LogExporter.js';
import Logger from '../../../../scripts/utils/Logger.js';

// Mock LogExporter
jest.mock('../../../../scripts/utils/LogExporter.js', () => ({
  LogExporter: {
    exportLogs: jest.fn(),
  },
}));

describe('logHandlers', () => {
  let handlers = null;

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = createLogHandlers();
  });

  describe('Security Checks', () => {
    test('exportDebugLogs 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      handlers.exportDebugLogs({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('devLogSink 應拒絕非法請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'other-id', url: 'https://evil.com' };
      handlers.devLogSink({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('devLogSinkBatch 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      handlers.devLogSinkBatch({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('devLogSink 應允許來自內部或 Content Script 的請求', () => {
      const sendResponse = jest.fn();
      const internalSender = {
        id: 'mock-extension-id',
        url: 'chrome-extension://mock-extension-id/popup.html',
      };
      const csSender = {
        id: 'mock-extension-id',
        tab: { id: 1 },
        url: 'https://example.com',
      };

      // Internal
      handlers.devLogSink({ level: 'log', message: 'test' }, internalSender, sendResponse);
      expect(Logger.addLogToBuffer).toHaveBeenCalled();

      // Content Script
      handlers.devLogSink({ level: 'log', message: 'test' }, csSender, sendResponse);
      expect(Logger.addLogToBuffer).toHaveBeenCalledTimes(2);
    });

    test('devLogSinkBatch 應允許來自 Content Script 的請求並處理批量日誌', () => {
      const sendResponse = jest.fn();
      const csSender = {
        id: 'mock-extension-id',
        tab: { id: 1 },
        url: 'https://example.com/page1',
      };

      const message = {
        logs: [
          { level: 'info', message: 'batch msg 1', args: [{ some: 'data' }] },
          { level: 'warn', message: 'batch msg 2', args: ['just string', 42] },
          { level: 'error', message: 'batch msg 3' }, // 無 args
        ],
      };

      handlers.devLogSinkBatch(message, csSender, sendResponse);

      expect(Logger.addLogToBuffer).toHaveBeenCalledTimes(3);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      // 檢查第一個 log 的 parseArgsToContext
      expect(Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'batch msg 1',
          context: { some: 'data' },
          source: '/page1',
        })
      );

      // 檢查第二個 log 的 parseArgsToContext (非 object fallback)
      expect(Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'batch msg 2',
          context: { details: ['just string', 42] },
        })
      );

      // 檢查第三個 log (無 args 情況)
      expect(Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'batch msg 3',
          context: {},
        })
      );
    });

    test('devLogSinkBatch 處理無效的 logs 格式應返回錯誤', () => {
      const sendResponse = jest.fn();
      const internalSender = { id: 'mock-extension-id' };

      // logs 不是 array
      handlers.devLogSinkBatch({ logs: 'not array' }, internalSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid batch format' });
    });

    test('devLogSinkBatch 發生內部錯誤時應靜默失敗', () => {
      const sendResponse = jest.fn();
      const internalSender = { id: 'mock-extension-id' };

      // 強制 addLogToBuffer 拋出異常
      Logger.addLogToBuffer.mockImplementationOnce(() => {
        throw new Error('internal error');
      });

      handlers.devLogSinkBatch(
        { logs: [{ level: 'info', message: 'x' }] },
        internalSender,
        sendResponse
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'internal error' });
    });
  });

  describe('Action Logic', () => {
    test('exportDebugLogs 應在合法請求時調用 Exporter', () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };
      LogExporter.exportLogs.mockReturnValue({ logs: [] });

      handlers.exportDebugLogs({ format: 'json' }, sender, sendResponse);

      expect(LogExporter.exportLogs).toHaveBeenCalledWith({ format: 'json' });
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('exportDebugLogs 在 Exporter 拋出錯誤時應回傳錯誤格式', () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };

      // 確保回傳一個自定義的 error.type 讓覆蓋率走 default || INTERNAL
      const mockError = new Error('export failed');
      mockError.type = 'CUSTOM_ERROR';
      LogExporter.exportLogs.mockImplementationOnce(() => {
        throw mockError;
      });

      handlers.exportDebugLogs({ format: 'json' }, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorType: 'CUSTOM_ERROR',
        })
      );
    });

    test('devLogSink 應正確解析多個參數的陣列為 context 與 details', () => {
      const sendResponse = jest.fn();
      const csSender = { id: 'mock-extension-id', tab: { id: 1 }, url: 'http://test.com' };

      handlers.devLogSink(
        {
          level: 'info',
          message: 'test multi args',
          args: [{ main: 'data' }, 'extra', 123],
        },
        csSender,
        sendResponse
      );

      expect(Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'test multi args',
          context: { main: 'data', details: ['extra', 123] },
        })
      );
    });

    test('devLogSink 在 Logger.addLogToBuffer 拋出錯誤時應靜默失敗', () => {
      const sendResponse = jest.fn();
      const csSender = { id: 'mock-extension-id', tab: { id: 1 }, url: 'http://test.com' };

      Logger.addLogToBuffer.mockImplementationOnce(() => {
        throw new Error('logger error');
      });

      handlers.devLogSink({ level: 'info', message: 'test' }, csSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'logger error' });
    });

    test('devLogSinkBatch 應截斷超過 MAX_BATCH_SIZE (20) 的批次', () => {
      const sendResponse = jest.fn();
      const internalSender = { id: 'mock-extension-id' };

      const logs = Array.from({ length: 25 }, (_, i) => ({
        level: 'info',
        message: `msg-${i}`,
        args: [],
      }));

      handlers.devLogSinkBatch({ logs }, internalSender, sendResponse);

      expect(Logger.addLogToBuffer).toHaveBeenCalledTimes(20);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('exportDebugLogs 在錯誤沒有自定義 type 時應回傳 INTERNAL 作為 errorType', () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };

      LogExporter.exportLogs.mockImplementationOnce(() => {
        throw new Error('plain error without type');
      });

      handlers.exportDebugLogs({ format: 'json' }, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorType: 'internal',
        })
      );
    });

    test('devLogSink 在 sender 沒有 url 時應使用 unknown_external 作為 source', () => {
      const sendResponse = jest.fn();
      const senderWithoutUrl = { id: 'mock-extension-id' };

      handlers.devLogSink(
        { level: 'info', message: 'no url test', args: [] },
        senderWithoutUrl,
        sendResponse
      );

      expect(Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'unknown_external' })
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('devLogSinkBatch 在 sender 沒有 url 時應使用 unknown_external 作為 source', () => {
      const sendResponse = jest.fn();
      const senderWithoutUrl = { id: 'mock-extension-id' };

      handlers.devLogSinkBatch(
        { logs: [{ level: 'info', message: 'batch no url', args: [] }] },
        senderWithoutUrl,
        sendResponse
      );

      expect(Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'unknown_external' })
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });
});
