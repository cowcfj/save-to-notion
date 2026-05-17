/**
 * FloatingRailState.js 單元測試
 */

import {
  RailStates,
  FloatingRailStateManager,
} from '../../../../scripts/highlighter/ui/FloatingRailState.js';

const TEST_RAIL_STATE_KEY = `notion-floating-rail-state-${chrome.runtime.id}`;

describe('RailStates', () => {
  test('應該定義三種狀態', () => {
    expect(RailStates.COLLAPSED).toBe('collapsed');
    expect(RailStates.EXPANDED).toBe('expanded');
    expect(RailStates.HIGHLIGHTING).toBe('highlighting');
  });

  test('應該是 frozen object', () => {
    expect(Object.isFrozen(RailStates)).toBe(true);
  });
});

describe('FloatingRailStateManager', () => {
  let stateManager = null;

  beforeEach(() => {
    sessionStorage.clear();
    stateManager = new FloatingRailStateManager();
  });

  describe('初始化', () => {
    test('應該以 COLLAPSED 狀態初始化', () => {
      expect(stateManager.currentState).toBe(RailStates.COLLAPSED);
    });

    test('應該以 yellow 為預設顏色', () => {
      expect(stateManager.selectedColor).toBe('yellow');
    });

    test('initialize() 應從 sessionStorage 讀取狀態', () => {
      sessionStorage.setItem(
        TEST_RAIL_STATE_KEY,
        JSON.stringify({ state: 'expanded', color: 'blue' })
      );

      const manager = new FloatingRailStateManager();
      manager.initialize();

      expect(manager.currentState).toBe(RailStates.EXPANDED);
      expect(manager.selectedColor).toBe('blue');
    });

    test('initialize() 應忽略無效的 sessionStorage 狀態', () => {
      sessionStorage.setItem(
        TEST_RAIL_STATE_KEY,
        JSON.stringify({ state: 'invalid_state', color: 'blue' })
      );

      const manager = new FloatingRailStateManager();
      manager.initialize();

      expect(manager.currentState).toBe(RailStates.COLLAPSED);
      expect(manager.selectedColor).toBe('blue');
    });

    test('[REGRESSION] initialize() 應忽略無效的 persisted color', () => {
      sessionStorage.setItem(
        TEST_RAIL_STATE_KEY,
        JSON.stringify({ state: 'expanded', color: 'injected-invalid-color' })
      );

      const manager = new FloatingRailStateManager();
      manager.initialize();

      expect(manager.currentState).toBe(RailStates.EXPANDED);
      expect(manager.selectedColor).toBe('yellow');
    });

    test('initialize() 只執行一次', () => {
      stateManager.initialize();
      stateManager.currentState = RailStates.EXPANDED;

      sessionStorage.setItem(
        TEST_RAIL_STATE_KEY,
        JSON.stringify({ state: 'collapsed', color: 'red' })
      );

      stateManager.initialize();
      expect(stateManager.currentState).toBe(RailStates.EXPANDED);
    });
  });

  describe('currentState setter', () => {
    test('應該正確設置新狀態', () => {
      stateManager.currentState = RailStates.EXPANDED;
      expect(stateManager.currentState).toBe(RailStates.EXPANDED);
    });

    test('應該在狀態變更時通知監聽器', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);

      stateManager.currentState = RailStates.EXPANDED;

      expect(listener).toHaveBeenCalledWith({
        state: RailStates.EXPANDED,
        color: 'yellow',
      });
    });

    test('相同狀態不應觸發通知', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);

      stateManager.currentState = RailStates.COLLAPSED;
      expect(listener).not.toHaveBeenCalled();
    });

    test('無效狀態不應改變 currentState', () => {
      stateManager.currentState = 'bogus';
      expect(stateManager.currentState).toBe(RailStates.COLLAPSED);
    });

    test('應該持久化到 sessionStorage', () => {
      stateManager.currentState = RailStates.HIGHLIGHTING;

      const stored = JSON.parse(sessionStorage.getItem(TEST_RAIL_STATE_KEY));
      expect(stored.state).toBe('highlighting');
    });
  });

  describe('selectedColor', () => {
    test('應該正確設置顏色', () => {
      stateManager.selectedColor = 'green';
      expect(stateManager.selectedColor).toBe('green');
    });

    test('應該在顏色變更時通知監聽器', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);

      stateManager.selectedColor = 'red';

      expect(listener).toHaveBeenCalledWith({
        state: RailStates.COLLAPSED,
        color: 'red',
      });
    });

    test('相同顏色不應觸發通知', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);

      stateManager.selectedColor = 'yellow';
      expect(listener).not.toHaveBeenCalled();
    });

    test('應該持久化到 sessionStorage', () => {
      stateManager.selectedColor = 'blue';

      const stored = JSON.parse(sessionStorage.getItem(TEST_RAIL_STATE_KEY));
      expect(stored.color).toBe('blue');
    });
  });

  describe('isHighlighting', () => {
    test('HIGHLIGHTING 狀態應回傳 true', () => {
      stateManager.currentState = RailStates.HIGHLIGHTING;
      expect(stateManager.isHighlighting).toBe(true);
    });

    test('非 HIGHLIGHTING 狀態應回傳 false', () => {
      stateManager.currentState = RailStates.EXPANDED;
      expect(stateManager.isHighlighting).toBe(false);
    });
  });

  describe('listeners', () => {
    test('removeListener 應移除監聽器', () => {
      const listener = jest.fn();
      stateManager.addListener(listener);
      stateManager.removeListener(listener);

      stateManager.currentState = RailStates.EXPANDED;
      expect(listener).not.toHaveBeenCalled();
    });

    test('監聽器拋錯不應影響其他監聽器', () => {
      const badListener = jest.fn(() => {
        throw new Error('test error');
      });
      const goodListener = jest.fn();

      stateManager.addListener(badListener);
      stateManager.addListener(goodListener);

      stateManager.currentState = RailStates.EXPANDED;

      expect(badListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });
});
