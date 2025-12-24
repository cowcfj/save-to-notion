/**
 * ToolbarState.js 單元測試
 */

import {
  ToolbarStates,
  ToolbarStateManager,
} from '../../../../scripts/highlighter/ui/ToolbarState.js';

describe('ToolbarStates', () => {
  test('應該定義三種狀態', () => {
    expect(ToolbarStates.EXPANDED).toBe('expanded');
    expect(ToolbarStates.MINIMIZED).toBe('minimized');
    expect(ToolbarStates.HIDDEN).toBe('hidden');
  });
});

describe('ToolbarStateManager', () => {
  let stateManager = null;

  beforeEach(() => {
    localStorage.clear();
    stateManager = new ToolbarStateManager();
  });

  describe('初始化', () => {
    test('應該以 HIDDEN 狀態初始化', () => {
      expect(stateManager.currentState).toBe(ToolbarStates.HIDDEN);
    });

    test('應該有空的監聽器集合', () => {
      expect(stateManager.listeners.size).toBe(0);
    });
  });

  describe('setState', () => {
    test('應該正確設置新狀態', () => {
      stateManager.currentState = ToolbarStates.EXPANDED;
      expect(stateManager.currentState).toBe(ToolbarStates.EXPANDED);
    });

    test('應該在狀態變更時通知監聽器', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);

      // 第一次調用是立即通知當前狀態
      expect(listener).toHaveBeenCalledWith(ToolbarStates.HIDDEN);
      listener.mockClear();

      stateManager.currentState = ToolbarStates.EXPANDED;

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(ToolbarStates.EXPANDED);
    });

    test('應該在狀態未變更時不通知監聽器', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);
      listener.mockClear(); // 清除初始調用

      // 設置為當前狀態
      stateManager.currentState = ToolbarStates.HIDDEN;

      expect(listener).not.toHaveBeenCalled();
    });

    test('應該拒絕無效狀態', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      stateManager.currentState = 'invalid_state';
      // Logger 格式化後，第二個參數包含實際訊息
      expect(consoleSpy).toHaveBeenCalled();
      const callArgs = consoleSpy.mock.calls[0];
      expect(callArgs.some(arg => String(arg).includes('無效的狀態'))).toBe(true);
      consoleSpy.mockRestore();
    });

    test('應該支持連續狀態變更', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);
      listener.mockClear();

      stateManager.currentState = ToolbarStates.EXPANDED;
      expect(listener).toHaveBeenLastCalledWith(ToolbarStates.EXPANDED);

      stateManager.currentState = ToolbarStates.MINIMIZED;
      expect(listener).toHaveBeenLastCalledWith(ToolbarStates.MINIMIZED);

      stateManager.currentState = ToolbarStates.HIDDEN;
      expect(listener).toHaveBeenLastCalledWith(ToolbarStates.HIDDEN);

      expect(listener).toHaveBeenCalledTimes(3);
    });
  });

  describe('currentState', () => {
    test('應該返回當前狀態', () => {
      expect(stateManager.currentState).toBe(ToolbarStates.HIDDEN);

      stateManager.currentState = ToolbarStates.EXPANDED;
      expect(stateManager.currentState).toBe(ToolbarStates.EXPANDED);
    });
  });

  describe('addListener', () => {
    test('應該添加監聽器並立即調用', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);

      expect(stateManager.listeners.size).toBe(1);
      expect(stateManager.listeners.has(listener)).toBe(true);
      expect(listener).toHaveBeenCalledWith(ToolbarStates.HIDDEN);
    });

    test('應該支持多個監聽器', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      stateManager.addListener(listener1);
      stateManager.addListener(listener2);
      stateManager.addListener(listener3);

      listener1.mockClear();
      listener2.mockClear();
      listener3.mockClear();

      stateManager.currentState = ToolbarStates.EXPANDED;

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });
  });

  describe('錯誤隔離', () => {
    test('應該在一個監聽器拋出錯誤時繼續通知其他監聽器', () => {
      const listener1 = jest.fn(() => {
        throw new Error('Test error');
      });
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      // 模擬 console.error 以避免測試輸出干擾
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
        // 故意為空:抑制錯誤輸出以保持測試輸出清潔
      });

      stateManager.addListener(listener1);
      stateManager.addListener(listener2);
      stateManager.addListener(listener3);

      // 清除初始調用
      listener1.mockClear();
      listener2.mockClear();
      listener3.mockClear();

      stateManager.currentState = ToolbarStates.EXPANDED;

      // 所有監聽器都應該被調用
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);

      // 錯誤應該被記錄
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('removeListener', () => {
    test('應該正確移除監聽器', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);
      listener.mockClear();

      stateManager.currentState = ToolbarStates.EXPANDED;
      expect(listener).toHaveBeenCalledTimes(1);

      stateManager.removeListener(listener);

      stateManager.currentState = ToolbarStates.MINIMIZED;
      // 不應該再被調用
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
