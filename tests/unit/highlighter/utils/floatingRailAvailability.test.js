/**
 * @jest-environment jsdom
 */

const {
  formatRuntimeErrorMessage,
  withAvailableFloatingRail,
} = require('../../../../scripts/highlighter/utils/floatingRailAvailability.js');
const {
  RUNTIME_ERROR_MESSAGES,
} = require('../../../../scripts/config/runtimeActions/errorMessages.js');

let mockFloatingRailInstance;
const mockInitialize = jest.fn();

jest.mock('../../../../scripts/highlighter/ui/FloatingRail.js', () => {
  return {
    FloatingRail: jest.fn().mockImplementation(manager => {
      mockFloatingRailInstance = {
        manager,
        initialize: mockInitialize,
        show: jest.fn().mockResolvedValue(true),
      };
      return mockFloatingRailInstance;
    }),
  };
});

describe('floatingRailAvailability', () => {
  describe('formatRuntimeErrorMessage', () => {
    test('應允許白名單內的 runtime error 字串', () => {
      expect(
        formatRuntimeErrorMessage(
          RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_SHOW_METHOD_MISSING,
          RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED
        )
      ).toBe(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_SHOW_METHOD_MISSING);
    });

    test('應允許白名單內的 runtime error.message', () => {
      expect(
        formatRuntimeErrorMessage(
          new TypeError(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTIVATE_METHOD_MISSING),
          RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED
        )
      ).toBe(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTIVATE_METHOD_MISSING);
    });

    test('任意字串應回退到 fallbackMessage', () => {
      expect(
        formatRuntimeErrorMessage(
          'internal failure details',
          RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED
        )
      ).toBe(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_ACTION_FAILED);
    });

    test('任意 error.message 應回退到 fallbackMessage', () => {
      expect(
        formatRuntimeErrorMessage(
          new Error('unexpected rail crash'),
          RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED
        )
      ).toBe(RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED);
    });
  });

  describe('withAvailableFloatingRail', () => {
    let originalHighlighterV2;
    let originalNotionRailReady;

    beforeEach(() => {
      originalHighlighterV2 = globalThis.HighlighterV2;
      originalNotionRailReady = globalThis.__NOTION_RAIL_READY__;
      globalThis.HighlighterV2 = undefined;
      globalThis.__NOTION_RAIL_READY__ = undefined;
      mockInitialize.mockReset();
      mockFloatingRailInstance = null;
    });

    afterEach(() => {
      globalThis.HighlighterV2 = originalHighlighterV2;
      globalThis.__NOTION_RAIL_READY__ = originalNotionRailReady;
    });

    test('當 HighlighterV2.manager 存在，但 active rail 與 ready promise 都不存在時，應動態建立 FloatingRail，執行 callback，並掛回 HighlighterV2.rail', async () => {
      const sendResponse = jest.fn();
      const onRailReady = jest.fn().mockResolvedValue();

      // 設定環境：只有 manager 存在，沒有 rail 與 ready promise
      const mockManager = { some: 'manager_state' };
      globalThis.HighlighterV2 = {
        manager: mockManager,
        rail: undefined,
      };

      // 模擬 initialize 回傳成功
      mockInitialize.mockResolvedValue({ success: true });

      await withAvailableFloatingRail(sendResponse, onRailReady);

      // 驗證是否動態載入了 FloatingRail 且調用 initialize
      expect(mockInitialize).toHaveBeenCalled();
      expect(globalThis.HighlighterV2.rail).toBe(mockFloatingRailInstance);

      // 驗證 callback 有被執行，且 sendResponse 回傳 success: true
      expect(onRailReady).toHaveBeenCalledWith(mockFloatingRailInstance);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('當建立 FloatingRail 失敗時，應清除 ready promise 且回傳 FLOATING_RAIL_INIT_FAILED 錯誤', async () => {
      const sendResponse = jest.fn();
      const onRailReady = jest.fn();

      const mockManager = { some: 'manager_state' };
      globalThis.HighlighterV2 = {
        manager: mockManager,
        rail: undefined,
      };

      // 模擬 initialize 失敗
      mockInitialize.mockResolvedValue({ success: false, error: 'Init failed' });

      await withAvailableFloatingRail(sendResponse, onRailReady);

      expect(mockInitialize).toHaveBeenCalled();
      expect(globalThis.HighlighterV2.rail).toBeUndefined();
      expect(onRailReady).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: RUNTIME_ERROR_MESSAGES.FLOATING_RAIL_INIT_FAILED,
      });
      // 確保 ready promise 被清除了
      expect(globalThis.__NOTION_RAIL_READY__).toBeUndefined();
    });
  });
});
