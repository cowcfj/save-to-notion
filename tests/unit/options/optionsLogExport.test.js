/**
 * @jest-environment jsdom
 */
/**
 * optionsLogExport.test.js
 *
 * Tests for debug log export functionality.
 */

import { sanitizeApiError } from '../../../scripts/utils/ApiErrorSanitizer.js';
import { flushAsyncClick, buildOptionsShellDOM, buildChromeMock } from './optionsTestHarness.js';
import { mockLogger as Logger, resetOptionsBootstrapMocks } from './optionsBootstrapTestSetup.js';

let initOptions;

beforeAll(async () => {
  const optionsModule = await import('../../../pages/options/options.js');
  initOptions = optionsModule.initOptions;
});

describe('optionsLogExport', () => {
  describe('Log Export', () => {
    let mockSendMessage = null;
    let anchorClickSpy = null;
    let originalCreateObjectURL = null;
    let originalRevokeObjectURL = null;

    beforeEach(() => {
      resetOptionsBootstrapMocks();
      jest.useFakeTimers();
      buildOptionsShellDOM(`
        <button id="export-logs-button">導出日誌</button>
        <div id="export-status"></div>
      `);

      anchorClickSpy = jest
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      mockSendMessage = jest.fn();
      originalCreateObjectURL = globalThis.URL.createObjectURL;
      originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
      globalThis.URL.createObjectURL = jest.fn(() => 'blob:url');
      globalThis.URL.revokeObjectURL = jest.fn();
      globalThis.chrome = buildChromeMock({
        runtime: {
          id: 'ext_id_123',
          onMessage: { addListener: jest.fn() },
          sendMessage: mockSendMessage,
          getManifest: jest.fn(() => ({ version: '1.0.0' })),
        },
      });
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      anchorClickSpy?.mockRestore();
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    });

    const runResolvedExportFailure = async response => {
      mockSendMessage.mockResolvedValue(response);

      initOptions();

      const exportBtn = document.querySelector('#export-logs-button');
      exportBtn.click();
      await flushAsyncClick();

      const statusEl = document.querySelector('#export-status');
      return { exportBtn, statusEl };
    };

    it('should stay disabled while exporting and restore afterwards without changing text', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        data: {
          filename: 'test.json',
          content: 'log content',
          mimeType: 'application/json',
          count: 10,
        },
      });

      initOptions();

      const exportBtn = document.querySelector('#export-logs-button');
      const originalText = exportBtn.textContent;

      exportBtn.click();

      expect(exportBtn.disabled).toBe(true);
      expect(exportBtn.textContent).toBe(originalText);

      await flushAsyncClick();

      expect(exportBtn.disabled).toBe(false);
      expect(exportBtn.textContent).toBe(originalText);

      const statusEl = document.querySelector('#export-status');
      expect(statusEl.textContent).toContain('已成功匯出 10 條日誌');
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
      expect(globalThis.URL.revokeObjectURL).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:url');

      jest.advanceTimersByTime(3000);
      expect(statusEl.textContent).toBe('');
      expect(statusEl.className).toBe('status-message');
    });

    it('should restore disabled state even on error without changing text', async () => {
      mockSendMessage.mockRejectedValue(new Error('Network error'));

      initOptions();

      const exportBtn = document.querySelector('#export-logs-button');
      const originalText = exportBtn.textContent;

      exportBtn.click();

      expect(exportBtn.disabled).toBe(true);
      expect(exportBtn.textContent).toBe(originalText);

      await flushAsyncClick();

      expect(exportBtn.disabled).toBe(false);
      expect(exportBtn.textContent).toBe(originalText);

      const statusEl = document.querySelector('#export-status');
      expect(statusEl.textContent).toContain('網路連線異常');

      jest.advanceTimersByTime(5000);
      expect(statusEl.textContent).toBe('');
      expect(statusEl.className).toBe('status-message');
    });

    it.each([
      {
        name: '當背景頁沒有回應時應顯示錯誤並恢復按鈕狀態',
        response: undefined,
      },
      {
        name: '當背景頁返回明確錯誤時應顯示錯誤訊息',
        response: { error: 'custom export error' },
      },
      {
        name: '當背景頁返回 success false 時應顯示預設失敗訊息',
        response: { success: false },
      },
    ])('$name', async ({ response }) => {
      const { exportBtn, statusEl } = await runResolvedExportFailure(response);

      expect(statusEl.textContent).toContain('匯出失敗');
      expect(exportBtn.disabled).toBe(false);
      expect(Logger.error).toHaveBeenCalledWith(
        'Log export failed',
        expect.objectContaining({
          action: 'exportLog',
          result: 'failed',
        })
      );
    });

    it('日誌導出失敗時應先 sanitize error 並只記錄安全 payload', async () => {
      const rawError = new Error('Secret token api_key=abc123');
      rawError.stack = 'Error: Secret token api_key=abc123\n    at private';
      mockSendMessage.mockRejectedValue(rawError);

      initOptions();

      document.querySelector('#export-logs-button').click();
      await flushAsyncClick();

      expect(Logger.error).toHaveBeenCalledWith('Log export failed', {
        action: 'exportLog',
        result: 'failed',
        error: sanitizeApiError(rawError, 'export_debug_logs'),
      });
      expect(Logger.error).not.toHaveBeenCalledWith(
        'Log export failed',
        expect.objectContaining({
          error: expect.stringContaining('api_key'),
        })
      );
      expect(Logger.error).not.toHaveBeenCalledWith(
        'Log export failed',
        expect.objectContaining({
          stack: expect.stringContaining('api_key'),
        })
      );
    });
  });
});
