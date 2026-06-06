/**
 * @jest-environment jsdom
 */

import { Toast } from '../../../../scripts/highlighter/ui/Toast.js';
import Logger from '../../../../scripts/utils/Logger.js';

jest.mock('../../../../scripts/utils/Logger.js', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    ...mockLogger,
  };
});

const HOST_ID = 'notion-toast-host';

function getShadow() {
  const host = document.querySelector(`#${HOST_ID}`);
  return host ? host.shadowRoot : null;
}

describe('Toast', () => {
  let toast;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.useFakeTimers();
    toast = new Toast();
  });

  afterEach(() => {
    toast.cleanup();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('show()', () => {
    test('首次呼叫應 lazy 建立 host 與 shadow root，並標記 data-toast-owner', () => {
      expect(document.querySelector(`#${HOST_ID}`)).toBeNull();

      toast.show('HIGHLIGHT_DELETED', { level: 'success' });

      const host = document.querySelector(`#${HOST_ID}`);
      expect(host).not.toBeNull();
      expect(host.dataset.toastOwner).toBe('true');
      expect(host.shadowRoot).not.toBeNull();
    });

    test('應從 UI_MESSAGES.TOAST 解析 messageKey', () => {
      toast.show('HIGHLIGHT_DELETED', { level: 'success' });

      const messageEl = getShadow().querySelector('.toast-message');
      expect(messageEl.textContent).toBe('標註已刪除');
    });

    test('customMessage 應優先於 messageKey', () => {
      toast.show('HIGHLIGHT_DELETED', { level: 'success', customMessage: '自訂訊息' });

      const messageEl = getShadow().querySelector('.toast-message');
      expect(messageEl.textContent).toBe('自訂訊息');
    });

    test('未知 messageKey 應 Logger.warn 並 fallback 為中文預設訊息', () => {
      toast.show('UNKNOWN_KEY', { level: 'success' });

      expect(Logger.warn).toHaveBeenCalled();
      const messageEl = getShadow().querySelector('.toast-message');
      expect(messageEl.textContent).toBe('發生錯誤，請稍後再試');
    });

    test('連續 show() 應覆蓋舊 toast，cancel 舊 timer', () => {
      toast.show('HIGHLIGHT_DELETED', { level: 'success' });
      toast.show('HIGHLIGHT_FAILED', { level: 'error' });

      const messageEl = getShadow().querySelector('.toast-message');
      expect(messageEl.textContent).toBe('標註失敗，請重試');

      const container = getShadow().querySelector('.toast-container');
      expect(container.classList.contains('toast--error')).toBe(true);
      expect(container.classList.contains('toast--success')).toBe(false);
    });

    test('預設 durationMs 為 3000ms 後應失去 toast--visible class', () => {
      toast.show('HIGHLIGHT_DELETED', { level: 'success' });

      // 跨過任何 fade-in microtask / rAF
      jest.advanceTimersByTime(50);
      expect(getShadow().querySelector('.toast-container.toast--visible')).not.toBeNull();

      jest.advanceTimersByTime(3000);
      expect(getShadow().querySelector('.toast-container.toast--visible')).toBeNull();
    });

    test('自訂 durationMs 應被尊重', () => {
      toast.show('HIGHLIGHT_DELETED', { level: 'success', durationMs: 1000 });

      jest.advanceTimersByTime(50);
      expect(getShadow().querySelector('.toast-container.toast--visible')).not.toBeNull();

      jest.advanceTimersByTime(1000);
      expect(getShadow().querySelector('.toast-container.toast--visible')).toBeNull();
    });

    test('重用既有 host（不在 DOM 中累積多個 host）', () => {
      toast.show('HIGHLIGHT_DELETED', { level: 'success' });
      toast.show('HIGHLIGHT_FAILED', { level: 'error' });
      toast.show('HIGHLIGHT_DUPLICATE', { level: 'warning' });

      const hosts = document.querySelectorAll(`#${HOST_ID}`);
      expect(hosts).toHaveLength(1);
    });
  });

  describe('hide()', () => {
    test('應立即觸發隱藏（toast--visible 移除）', () => {
      toast.show('HIGHLIGHT_DELETED', { level: 'success' });
      jest.advanceTimersByTime(50);
      expect(getShadow().querySelector('.toast-container.toast--visible')).not.toBeNull();

      toast.hide();
      expect(getShadow().querySelector('.toast-container.toast--visible')).toBeNull();
    });

    test('未顯示時呼叫 hide() 不應報錯', () => {
      expect(() => toast.hide()).not.toThrow();
    });
  });

  describe('cleanup()', () => {
    test('應移除 host 與清除 timer', () => {
      toast.show('HIGHLIGHT_DELETED', { level: 'success' });
      expect(document.querySelector(`#${HOST_ID}`)).not.toBeNull();

      toast.cleanup();
      expect(document.querySelector(`#${HOST_ID}`)).toBeNull();

      // 不應有 pending timer 觸發 console error
      jest.runAllTimers();
    });

    test('未呼叫 show() 時 cleanup() 不應報錯', () => {
      expect(() => toast.cleanup()).not.toThrow();
    });
  });
});
