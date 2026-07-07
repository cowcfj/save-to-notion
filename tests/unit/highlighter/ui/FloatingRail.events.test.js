/**
 * @jest-environment jsdom
 *
 * FloatingRail events unit tests.
 */

import {
  FloatingRail,
  RailStates,
  TEST_RAIL_POSITION_KEY,
  createInitializedRail,
  createPointerMouseEvent,
  dispatchTriggerPointerDown,
  setupFloatingRailTestEnvironment,
  teardownFloatingRailTestEnvironment,
} from './FloatingRail.shared.js';

describe('FloatingRail events', () => {
  let manager;

  beforeEach(() => {
    manager = setupFloatingRailTestEnvironment();
  });

  afterEach(() => {
    teardownFloatingRailTestEnvironment();
  });

  describe('event binding', () => {
    test.each([
      {
        name: 'trigger click 應切換 expand/collapse',
        selector: '.rail-trigger',
        prepare: () => {},
        expectedStates: [RailStates.EXPANDED, RailStates.COLLAPSED],
      },
      {
        name: 'highlight button click 應切換 highlighting',
        selector: '.rail-highlight-toggle',
        prepare: rail => rail.expand(),
        expectedStates: [RailStates.HIGHLIGHTING, RailStates.EXPANDED],
      },
    ])('$name', async ({ selector, prepare, expectedStates }) => {
      const rail = await createInitializedRail(manager);
      prepare(rail);

      const button = rail.container.querySelector(selector);
      for (const expectedState of expectedStates) {
        button.click();
        expect(rail.stateManager.currentState).toBe(expectedState);
      }
    });

    test('save button click 應透過事件綁定呼叫 _handleSaveSync', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      const handleSaveSyncSpy = jest.spyOn(rail, '_handleSaveSync').mockResolvedValue();

      const saveBtn = rail.container.querySelector('[data-action="save"]');
      saveBtn.click();

      expect(handleSaveSyncSpy).toHaveBeenCalledTimes(1);
    });

    test('manage button click 應透過事件綁定呼叫 _handleManage', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      const handleManageSpy = jest.spyOn(rail, '_handleManage').mockResolvedValue();

      const manageBtn = rail.container.querySelector('[data-action="manage"]');
      manageBtn.click();

      expect(handleManageSpy).toHaveBeenCalledTimes(1);
    });

    test('color swatch click 應更新顏色', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();

      const greenSwatch = rail.container.querySelector('[data-color="green"]');
      greenSwatch.click();

      expect(rail.stateManager.selectedColor).toBe('green');
    });

    test('highlight button hover 與 focusin 應顯示 color palette', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();

      const highlightBtn = rail.container.querySelector('[data-action="highlight"]');
      const colorPalette = rail.container.querySelector('.color-palette');

      highlightBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(colorPalette.classList.contains('visible')).toBe(true);

      colorPalette.classList.remove('visible');
      highlightBtn.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(colorPalette.classList.contains('visible')).toBe(true);
    });

    test('[REGRESSION] rail 模式應綁定 Ctrl/Cmd click delete shortcut', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();

      const event = new MouseEvent('click', { bubbles: true, ctrlKey: true });
      document.dispatchEvent(event);

      expect(manager.handleDocumentClick).toHaveBeenCalledWith(event);
    });

    test('focusin 應展開 COLLAPSED 狀態的工具列', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.collapse();

      rail.container.dispatchEvent(new FocusEvent('focusin'));

      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
    });

    test('close button click 應 dismiss rail', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.expand();

      const closeBtn = rail.container.querySelector('.rail-close-btn');
      closeBtn.click();

      expect(rail.host.style.display).toBe('none');
      expect(rail.stateManager.isDismissed).toBe(true);
    });

    test.each([
      {
        name: 'focusout 應收起 EXPANDED 狀態的工具列（焦點離開 container）',
        activateState: rail => rail.expand(),
        resolveRelatedTarget: () => {
          const externalEl = document.createElement('button');
          document.body.append(externalEl);
          return externalEl;
        },
        expectedState: RailStates.COLLAPSED,
      },
      {
        name: 'focusout 不應收起工具列（焦點仍在 container 內）',
        activateState: rail => rail.expand(),
        resolveRelatedTarget: rail => rail.container.querySelector('.rail-trigger'),
        expectedState: RailStates.EXPANDED,
      },
      {
        name: 'focusout 不應收起 HIGHLIGHTING 狀態的工具列',
        activateState: rail => rail.activateHighlighting(),
        resolveRelatedTarget: () => {
          const externalEl = document.createElement('button');
          document.body.append(externalEl);
          return externalEl;
        },
        expectedState: RailStates.HIGHLIGHTING,
      },
    ])('$name', async ({ activateState, resolveRelatedTarget, expectedState }) => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      activateState(rail);

      const relatedTarget = resolveRelatedTarget(rail);
      rail.container.dispatchEvent(new FocusEvent('focusout', { relatedTarget }));

      expect(rail.stateManager.currentState).toBe(expectedState);
      if (relatedTarget.parentNode === document.body) {
        relatedTarget.remove();
      }
    });

    test('mouseenter 應展開 COLLAPSED 狀態的工具列', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.collapse();

      rail.container.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
    });

    test('mouseleave 在拖曳中不應收起工具列', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.expand();
      rail._dragState = { active: true };

      rail.container.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
    });

    test('mouseleave 應收起 EXPANDED 狀態的工具列', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.expand();

      rail.container.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

      expect(rail.stateManager.currentState).toBe(RailStates.COLLAPSED);
    });

    test.each([
      {
        name: '[REGRESSION] trigger 拖曳應更新 rail host 位置並保存到 sessionStorage',
        holdMs: 300,
        expectedTop: '180px',
        expectedStoredPosition: expect.stringContaining('"top":180'),
      },
      {
        name: '[REGRESSION] trigger 未長按達門檻前不應開始拖曳',
        holdMs: 120,
        expectedTop: expect.not.stringMatching(/^180px$/),
        expectedStoredPosition: null,
      },
    ])('$name', async ({ holdMs, expectedTop, expectedStoredPosition }) => {
      jest.useFakeTimers();
      const rail = await createInitializedRail(manager);

      try {
        dispatchTriggerPointerDown(rail);
        jest.advanceTimersByTime(holdMs);
        document.dispatchEvent(new MouseEvent('pointermove', { clientX: 700, clientY: 180 }));
        document.dispatchEvent(new MouseEvent('pointerup', { clientX: 700, clientY: 180 }));

        expect(rail.host.style.top).toEqual(expectedTop);
        expect(sessionStorage.getItem(TEST_RAIL_POSITION_KEY)).toEqual(expectedStoredPosition);
        if (expectedStoredPosition !== null) {
          expect(rail.host.style.right).not.toBe('0px');
        }
      } finally {
        jest.useRealTimers();
      }
    });

    test('[REGRESSION] trigger 拖曳結束後的下一次 click 應被抑制', async () => {
      jest.useFakeTimers();
      const rail = new FloatingRail(manager);
      await rail.initialize();

      try {
        const trigger = dispatchTriggerPointerDown(rail);
        jest.advanceTimersByTime(300);
        document.dispatchEvent(new MouseEvent('pointerup', { clientX: 790, clientY: 300 }));

        trigger.click();

        expect(rail.stateManager.currentState).toBe(RailStates.COLLAPSED);
      } finally {
        jest.useRealTimers();
      }
    });

    test('[REGRESSION] trigger 拖曳應 capture pointer 並在結束時釋放', async () => {
      jest.useFakeTimers();
      const rail = new FloatingRail(manager);
      await rail.initialize();

      try {
        const trigger = rail.container.querySelector('.rail-trigger');
        trigger.setPointerCapture = jest.fn();
        trigger.hasPointerCapture = jest.fn(() => true);
        trigger.releasePointerCapture = jest.fn();

        dispatchTriggerPointerDown(rail, { pointerId: 42 });
        jest.advanceTimersByTime(300);
        document.dispatchEvent(
          createPointerMouseEvent('pointerup', { clientX: 790, clientY: 300, pointerId: 42 })
        );

        expect(trigger.setPointerCapture).toHaveBeenCalledWith(42);
        expect(trigger.hasPointerCapture).toHaveBeenCalledWith(42);
        expect(trigger.releasePointerCapture).toHaveBeenCalledWith(42);
      } finally {
        jest.useRealTimers();
      }
    });

    test.each([
      {
        name: 'trigger pointerdown 非主按鍵時不應進入拖曳準備',
        startDrag: rail => dispatchTriggerPointerDown(rail, { button: 1 }),
      },
      {
        name: '[REGRESSION] drag activation timer 在拖曳被提前清除後不應重新標記 dragging',
        startDrag: rail => {
          dispatchTriggerPointerDown(rail);
          rail._clearDragArtifacts();
        },
      },
    ])('$name', async ({ startDrag }) => {
      jest.useFakeTimers();
      const rail = await createInitializedRail(manager);

      try {
        startDrag(rail);
        jest.advanceTimersByTime(300);

        expect(rail._dragState).toBeNull();
        expect(rail.host.dataset.dragging).toBeUndefined();
      } finally {
        jest.useRealTimers();
      }
    });

    test('setPointerCapture 失敗時不應保留 pointer capture 狀態', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();

      const trigger = rail.container.querySelector('.rail-trigger');
      trigger.setPointerCapture = jest.fn(() => {
        throw new Error('capture failed');
      });

      dispatchTriggerPointerDown(rail, { pointerId: 9 });

      expect(rail._dragPointerCapture).toBeNull();
    });

    test('releasePointerCapture 前若已無 capture 應直接返回', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();

      const trigger = rail.container.querySelector('.rail-trigger');
      trigger.hasPointerCapture = jest.fn(() => false);
      trigger.releasePointerCapture = jest.fn();
      rail._dragPointerCapture = { trigger, pointerId: 5 };

      rail._releaseDragPointerCapture();

      expect(trigger.hasPointerCapture).toHaveBeenCalledWith(5);
      expect(trigger.releasePointerCapture).not.toHaveBeenCalled();
    });

    test('[REGRESSION] 新 rail instance 應恢復先前拖曳位置', async () => {
      sessionStorage.setItem(TEST_RAIL_POSITION_KEY, JSON.stringify({ top: 144, right: 24 }));

      const rail = new FloatingRail(manager);
      await rail.initialize();

      expect(rail.host.style.top).toBe('144px');
      expect(rail.host.style.right).toBe('24px');
    });

    test('從 host style 讀取位置時應直接使用已保存的 top/right', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.host.style.top = '140px';
      rail.host.style.right = '36px';

      const position = rail._readCurrentPosition({ clientX: 20, clientY: 30 });

      expect(position).toEqual({ top: 140, right: 36 });
    });

    test('從 bounding rect 讀取位置時應使用 viewport 與 rect 計算 right', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.host.getBoundingClientRect = jest.fn(() => ({
        top: 120,
        right: 984,
        width: 48,
        height: 48,
      }));

      const position = rail._readCurrentPosition({ clientX: 20, clientY: 30 });

      expect(position).toEqual({ top: 120, right: 40 });
    });
  });
});
