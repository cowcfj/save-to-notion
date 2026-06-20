/**
 * FloatingRail lifecycle unit tests.
 */

import {
  FloatingRail,
  RailStates,
  Logger,
  TEST_RAIL_HOST_ID,
  TEST_RAIL_POSITION_KEY,
  TEST_RAIL_STATE_KEY,
  TEST_RAIL_DISMISSED_KEY,
  createMockContainerElement,
  createPointerMouseEvent,
  dispatchTriggerPointerDown,
  createFloatingRailContainer,
  checkPageStatus,
  savePageFromRail,
  syncHighlights,
  setupFloatingRailTestEnvironment,
  teardownFloatingRailTestEnvironment,
} from './FloatingRail.shared.js';

describe('FloatingRail lifecycle', () => {
  let manager;

  beforeEach(() => {
    manager = setupFloatingRailTestEnvironment();
  });

  afterEach(() => {
    teardownFloatingRailTestEnvironment();
  });

  describe('constructor', () => {
    test('應該要求 HighlightManager', () => {
      expect(() => new FloatingRail(null)).toThrow('HighlightManager is required');
    });

    test('應該建立 Shadow DOM host', () => {
      const rail = new FloatingRail(manager);
      const host = document.querySelector(`#${TEST_RAIL_HOST_ID}`);

      expect(host).not.toBeNull();
      expect(host.dataset.railOwner).toBe('true');
      expect(rail.shadowRoot).toBeDefined();
    });

    test('應該重用既有 host', () => {
      const existingHost = document.createElement('div');
      existingHost.id = TEST_RAIL_HOST_ID;
      existingHost.dataset.railOwner = 'true';
      existingHost.attachShadow({ mode: 'open' });
      document.body.append(existingHost);

      const rail = new FloatingRail(manager);
      expect(rail.host).toBe(existingHost);
    });

    test('重用既有 host 時應建立 fresh rail container 並移除舊 container', () => {
      const existingHost = document.createElement('div');
      existingHost.id = TEST_RAIL_HOST_ID;
      existingHost.dataset.railOwner = 'true';
      const shadowRoot = existingHost.attachShadow({ mode: 'open' });
      const existingContainer = createMockContainerElement();
      shadowRoot.append(existingContainer);
      document.body.append(existingHost);

      const rail = new FloatingRail(manager);

      expect(rail.container).not.toBe(existingContainer);
      expect(existingContainer.isConnected).toBe(false);
      expect(shadowRoot.querySelectorAll('.rail-container')).toHaveLength(1);
      expect(createFloatingRailContainer).toHaveBeenCalledWith({
        selectedColor: rail.stateManager.selectedColor,
      });
    });

    test('不應重用無 owner 標記的同 ID 元素', () => {
      const fakeHost = document.createElement('div');
      fakeHost.id = TEST_RAIL_HOST_ID;
      document.body.append(fakeHost);

      const rail = new FloatingRail(manager);
      expect(rail.host).not.toBe(fakeHost);
    });

    test('[REGRESSION] destroy 後不應由 pending DOMContentLoaded callback 重新插入 host', () => {
      const originalBodyDescriptor = Object.getOwnPropertyDescriptor(document, 'body');

      try {
        Object.defineProperty(document, 'body', {
          configurable: true,
          get: () => null,
        });

        const rail = new FloatingRail(manager);
        rail.destroy();

        Object.defineProperty(document, 'body', {
          configurable: true,
          get: () => document.documentElement.querySelector('body'),
        });

        document.dispatchEvent(new Event('DOMContentLoaded'));

        expect(document.querySelector(`#${TEST_RAIL_HOST_ID}`)).toBeNull();
      } finally {
        if (originalBodyDescriptor) {
          Object.defineProperty(document, 'body', originalBodyDescriptor);
        } else {
          delete document.body;
        }
      }
    });

    test('DOMContentLoaded 時若 body 仍不可用不應插入 host', () => {
      const originalBodyDescriptor = Object.getOwnPropertyDescriptor(document, 'body');

      try {
        Object.defineProperty(document, 'body', {
          configurable: true,
          get: () => null,
        });

        new FloatingRail(manager);
        document.dispatchEvent(new Event('DOMContentLoaded'));

        expect(document.querySelector(`#${TEST_RAIL_HOST_ID}`)).toBeNull();
      } finally {
        if (originalBodyDescriptor) {
          Object.defineProperty(document, 'body', originalBodyDescriptor);
        } else {
          delete document.body;
        }
      }
    });
  });

  describe('initialize', () => {
    test('應該初始化 state manager 並綁定事件', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();

      expect(rail._initialized).toBe(true);
      expect(rail._eventsBound).toBe(true);
    });

    test('重複 initialize 不應重複綁定', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail.initialize();

      expect(rail._initialized).toBe(true);
    });

    test.each([
      {
        name: '從 sessionStorage 恢復 HIGHLIGHTING 狀態時應啟動標註功能',
        storedState: { state: 'highlighting', color: 'green' },
        expectedState: RailStates.HIGHLIGHTING,
        expectedHighlightColor: 'green',
      },
      {
        name: '從 sessionStorage 恢復非 HIGHLIGHTING 狀態時不應啟動標註',
        storedState: { state: 'expanded', color: 'yellow' },
        expectedState: RailStates.EXPANDED,
        expectedHighlightColor: null,
      },
    ])('$name', async ({ storedState, expectedState, expectedHighlightColor }) => {
      sessionStorage.setItem(TEST_RAIL_STATE_KEY, JSON.stringify(storedState));

      const rail = new FloatingRail(manager);
      await rail.initialize();

      expect(rail.stateManager.currentState).toBe(expectedState);
      if (expectedHighlightColor === null) {
        expect(manager.startHighlighting).not.toHaveBeenCalled();
      } else {
        expect(manager.startHighlighting).toHaveBeenCalledWith(expectedHighlightColor);
      }
    });

    test('[REGRESSION] initialize 不應等待頁面狀態刷新完成才綁定事件', async () => {
      let resolveStatus;
      const pageStatusPromise = new Promise(resolve => {
        resolveStatus = resolve;
      });
      checkPageStatus.mockReturnValue(pageStatusPromise);
      chrome.storage.sync.get = jest.fn().mockResolvedValue({});
      savePageFromRail.mockResolvedValue({ success: true });

      const rail = new FloatingRail(manager);
      const initPromise = rail.initialize();
      const saveBtn = rail.container.querySelector('[data-action="save"]');
      const initializeSettledPromise = initPromise.then(() => true).catch(() => false);

      try {
        await chrome.storage.sync.get.mock.results.at(-1).value;
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        await expect(
          Promise.race([initializeSettledPromise, Promise.resolve(false)])
        ).resolves.toBe(true);
        saveBtn.click();
        expect(savePageFromRail).toHaveBeenCalledTimes(1);
        expect(rail._eventsBound).toBe(true);
        expect(rail._initialized).toBe(true);
        expect(rail._pageStatus).toBeNull();
      } finally {
        resolveStatus({ isSaved: true, canSave: false });
        await initPromise.catch(() => undefined);
        await pageStatusPromise;
        await Promise.resolve();
      }

      expect(rail._pageStatus).toEqual({ isSaved: true, canSave: false });
    });

    test('[REGRESSION] destroy 後 pending initialize completion 不應重新啟用 instance', async () => {
      let resolveStatus;
      const pageStatusPromise = new Promise(resolve => {
        resolveStatus = resolve;
      });
      checkPageStatus.mockReturnValue(pageStatusPromise);

      const rail = new FloatingRail(manager);
      const initPromise = rail.initialize();

      rail.destroy();
      resolveStatus({ isSaved: false, canSave: true });
      await initPromise;

      document.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

      expect(rail._initialized).toBe(false);
      expect(rail._eventsBound).toBe(false);
      expect(manager.handleDocumentClick).not.toHaveBeenCalled();
    });

    test('chrome.storage.onChanged 不可用時 initialize 與 destroy 不應拋錯', async () => {
      const originalOnChanged = globalThis.chrome.storage.onChanged;
      delete globalThis.chrome.storage.onChanged;

      try {
        const rail = new FloatingRail(manager);
        await expect(rail.initialize()).resolves.toBeUndefined();
        expect(() => rail.destroy()).not.toThrow();
      } finally {
        globalThis.chrome.storage.onChanged = originalOnChanged;
      }
    });

    test('[REGRESSION] dismissed 狀態初始化後，undismiss 仍應保有事件綁定', async () => {
      sessionStorage.setItem(TEST_RAIL_DISMISSED_KEY, 'true');

      const rail = new FloatingRail(manager);
      await rail.initialize();

      expect(rail.host.style.display).toBe('none');

      rail.undismiss();
      expect(rail.host.style.display).toBe('block');
      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);

      const trigger = rail.container.querySelector('.rail-trigger');
      trigger.click();

      expect(rail.stateManager.currentState).toBe(RailStates.COLLAPSED);
    });
  });

  describe('show / hide', () => {
    test('show 應顯示 host 並展開', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.hide();
      rail.show();

      expect(rail.host.style.display).toBe('block');
      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
    });

    test('hide 應隱藏 host', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.hide();

      expect(rail.host.style.display).toBe('none');
    });

    test('dismissed 狀態下 show 不應重新顯示 host', async () => {
      sessionStorage.setItem(TEST_RAIL_DISMISSED_KEY, 'true');

      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.show();

      expect(rail.host.style.display).toBe('none');
    });

    test('show 在 COLLAPSED 狀態下應自動展開', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.collapse();
      rail.hide();

      rail.show();

      expect(rail.host.style.display).toBe('block');
      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
    });
  });

  describe('expand / collapse', () => {
    test('expand 應設置 EXPANDED 狀態', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.expand();

      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
    });

    test('collapse 應設置 COLLAPSED 狀態', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.expand();
      rail.collapse();

      expect(rail.stateManager.currentState).toBe(RailStates.COLLAPSED);
    });
  });

  describe('highlighting', () => {
    test('activateHighlighting 應進入 HIGHLIGHTING 狀態', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.activateHighlighting();

      expect(rail.stateManager.currentState).toBe(RailStates.HIGHLIGHTING);
      expect(manager.startHighlighting).toHaveBeenCalledWith('yellow');
    });

    test('deactivateHighlighting 應回到 EXPANDED 狀態', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.activateHighlighting();
      rail.deactivateHighlighting();

      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
      expect(manager.stopHighlighting).toHaveBeenCalled();
    });

    test('[REGRESSION] highlighting 狀態 dismiss 應同步停用標註模式', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.activateHighlighting();

      rail.dismiss();

      expect(rail.host.style.display).toBe('none');
      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
      expect(manager.stopHighlighting).toHaveBeenCalled();
    });
  });

  describe('setColor', () => {
    test('應該更新 state manager 的顏色', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.setColor('blue');

      expect(rail.stateManager.selectedColor).toBe('blue');
    });

    test('highlighting 時應通知 manager 換色', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.activateHighlighting();
      rail.setColor('green');

      expect(manager.setHighlightColor).toHaveBeenCalledWith('green');
    });
  });

  describe('destroy', () => {
    test('應移除 host 並重置狀態', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.destroy();

      expect(document.querySelector(`#${TEST_RAIL_HOST_ID}`)).toBeNull();
      expect(rail._initialized).toBe(false);
    });
  });

  describe('error and guard branches', () => {
    test('頁面狀態刷新失敗時應記錄警告並繼續初始化', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      checkPageStatus.mockRejectedValueOnce(new Error('status failed'));

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await Promise.resolve();

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 無法取得頁面狀態',
        expect.objectContaining({
          action: '_refreshPageStatus',
          operation: 'checkPageStatus',
        })
      );
      expect(rail._initialized).toBe(true);
      expect(rail._eventsBound).toBe(true);
    });

    test('initialize 背景頁面狀態刷新出現未預期 rejection 時應記錄警告', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      const rail = new FloatingRail(manager);
      jest.spyOn(rail, '_refreshPageStatus').mockRejectedValueOnce(new Error('unexpected'));

      await rail.initialize();
      await Promise.resolve();

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 背景頁面狀態刷新失敗',
        expect.objectContaining({
          action: 'initialize',
          operation: 'refreshPageStatusInBackground',
        })
      );
      expect(rail._initialized).toBe(true);
      expect(rail._eventsBound).toBe(true);
    });

    test('_bindEvents 在已綁定後不應重複註冊事件', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();

      rail._bindEvents();
      document.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

      expect(manager.handleDocumentClick).toHaveBeenCalledTimes(1);
    });

    test('restorePosition 遇到損壞的 sessionStorage 資料時應記錄警告', () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      sessionStorage.setItem(TEST_RAIL_POSITION_KEY, '{invalid-json');

      const rail = new FloatingRail(manager);

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 無法讀取位置狀態',
        expect.objectContaining({
          action: '_restorePosition',
          operation: 'parseStoredPosition',
        })
      );
      expect(rail.host.style.top).toBe('');
      expect(rail.host.style.right).toBe('');
    });

    test('persistPosition 寫入失敗時應記錄警告', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.host.style.top = '120px';
      rail.host.style.right = '40px';

      rail._persistPosition();

      expect(setItemSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 無法保存位置狀態',
        expect.objectContaining({
          action: '_persistPosition',
          operation: 'writeStoredPosition',
        })
      );
    });

    test('clampNumber 遇到無效數值時應返回 min', () => {
      expect(FloatingRail._clampNumber('not-a-number', 8, 100)).toBe(8);
    });

    test('handleSaveSync 在 saving 中應直接返回', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail._isSaving = true;

      await rail._handleSaveSync();

      expect(savePageFromRail).not.toHaveBeenCalled();
      expect(syncHighlights).not.toHaveBeenCalled();
    });

    test('drag activation timer 執行時若 dragState 已消失應直接返回', async () => {
      jest.useFakeTimers();
      const rail = new FloatingRail(manager);
      await rail.initialize();

      try {
        const trigger = dispatchTriggerPointerDown(rail);

        rail._dragState = null;
        jest.advanceTimersByTime(300);

        expect(rail.host.dataset.dragging).toBeUndefined();
        expect(trigger.getAttribute('aria-pressed')).not.toBe('true');
      } finally {
        jest.useRealTimers();
      }
    });

    test('拖曳中的 pointermove 若事件可取消應呼叫 preventDefault', async () => {
      jest.useFakeTimers();
      const rail = new FloatingRail(manager);
      await rail.initialize();

      try {
        const trigger = rail.container.querySelector('.rail-trigger');
        trigger.dispatchEvent(new MouseEvent('pointerdown', { clientX: 790, clientY: 300 }));
        jest.advanceTimersByTime(300);

        const moveEvent = createPointerMouseEvent('pointermove', {
          clientX: 700,
          clientY: 180,
          cancelable: true,
        });
        const preventDefaultSpy = jest.spyOn(moveEvent, 'preventDefault');

        document.dispatchEvent(moveEvent);

        expect(preventDefaultSpy).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
