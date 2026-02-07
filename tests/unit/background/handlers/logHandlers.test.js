/**
 * @jest-environment jsdom
 */

// Mock Logger
jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    addLogToBuffer: jest.fn(),
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

// Mock chrome API
globalThis.chrome = {
  runtime: {
    id: 'test-extension-id',
  },
};

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

    test('devLogSink 應允許來自內部或 Content Script 的請求', () => {
      const sendResponse = jest.fn();
      const internalSender = {
        id: 'test-extension-id',
        url: 'chrome-extension://test-extension-id/popup.html',
      };
      const csSender = {
        id: 'test-extension-id',
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
  });

  describe('Action Logic', () => {
    test('exportDebugLogs 應在合法請求時調用 Exporter', () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-extension-id' };
      LogExporter.exportLogs.mockReturnValue({ logs: [] });

      handlers.exportDebugLogs({ format: 'json' }, sender, sendResponse);

      expect(LogExporter.exportLogs).toHaveBeenCalledWith({ format: 'json' });
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });
});
