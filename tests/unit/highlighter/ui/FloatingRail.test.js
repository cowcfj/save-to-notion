/**
 * FloatingRail.js 主控制器單元測試
 */

jest.mock('../../../../scripts/highlighter/ui/FloatingRailRuntime.js', () => ({
  checkPageStatus: jest.fn(),
  savePageFromRail: jest.fn(),
  syncHighlights: jest.fn(),
  openSidePanel: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/styles/floatingRailStyles.js', () => ({
  injectRailStylesIntoShadowRoot: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/components/FloatingRailContainer.js', () => ({
  createFloatingRailContainer: jest.fn(),
}));

import { FloatingRail } from '../../../../scripts/highlighter/ui/FloatingRail.js';
import { RailStates } from '../../../../scripts/highlighter/ui/FloatingRailState.js';
import {
  checkPageStatus,
  savePageFromRail,
  syncHighlights,
  openSidePanel,
} from '../../../../scripts/highlighter/ui/FloatingRailRuntime.js';
import { createFloatingRailContainer } from '../../../../scripts/highlighter/ui/components/FloatingRailContainer.js';
import { injectRailStylesIntoShadowRoot } from '../../../../scripts/highlighter/ui/styles/floatingRailStyles.js';

function createMockContainerElement() {
  const container = document.createElement('div');
  container.className = 'rail-container collapsed';

  const trigger = document.createElement('button');
  trigger.className = 'rail-trigger';
  trigger.setAttribute('aria-expanded', 'false');
  container.append(trigger);

  const actions = document.createElement('div');
  actions.className = 'rail-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'rail-action-btn';
  saveBtn.dataset.action = 'save';
  saveBtn.setAttribute('aria-label', '保存網頁');
  actions.append(saveBtn);

  const highlightBtn = document.createElement('div');
  highlightBtn.className = 'rail-action-btn';
  highlightBtn.dataset.action = 'highlight';

  const highlightToggle = document.createElement('button');
  highlightToggle.className = 'rail-highlight-toggle';
  highlightToggle.setAttribute('aria-label', '開始標註');

  const colorIndicator = document.createElement('span');
  colorIndicator.className = 'color-indicator';
  colorIndicator.style.backgroundColor = '#fff3cd';
  highlightToggle.append(colorIndicator);
  highlightBtn.append(highlightToggle);

  const palette = document.createElement('div');
  palette.className = 'color-palette';
  palette.setAttribute('role', 'radiogroup');
  palette.setAttribute('aria-label', '標註顏色');

  const yellowSwatch = document.createElement('button');
  yellowSwatch.className = 'color-swatch selected';
  yellowSwatch.dataset.color = 'yellow';
  yellowSwatch.setAttribute('aria-checked', 'true');
  palette.append(yellowSwatch);

  const greenSwatch = document.createElement('button');
  greenSwatch.className = 'color-swatch';
  greenSwatch.dataset.color = 'green';
  greenSwatch.setAttribute('aria-checked', 'false');
  palette.append(greenSwatch);

  highlightBtn.append(palette);
  actions.append(highlightBtn);

  const manageBtn = document.createElement('button');
  manageBtn.className = 'rail-action-btn';
  manageBtn.dataset.action = 'manage';
  manageBtn.setAttribute('aria-label', '管理標註');
  actions.append(manageBtn);

  container.append(actions);
  return container;
}

function createMockManager() {
  return {
    startHighlighting: jest.fn(),
    stopHighlighting: jest.fn(),
    setHighlightColor: jest.fn(),
    collectHighlightsForNotion: jest.fn(() => []),
  };
}

describe('FloatingRail', () => {
  let manager;

  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    manager = createMockManager();
    createFloatingRailContainer.mockReturnValue(createMockContainerElement());
    checkPageStatus.mockResolvedValue({ isSaved: false, canSave: true });
    injectRailStylesIntoShadowRoot.mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('應該要求 HighlightManager', () => {
      expect(() => new FloatingRail(null)).toThrow('HighlightManager is required');
    });

    test('應該建立 Shadow DOM host', () => {
      const rail = new FloatingRail(manager);
      const host = document.querySelector('#notion-floating-rail-host');

      expect(host).not.toBeNull();
      expect(host.dataset.railOwner).toBe('true');
      expect(rail.shadowRoot).toBeDefined();
    });

    test('應該重用既有 host', () => {
      const existingHost = document.createElement('div');
      existingHost.id = 'notion-floating-rail-host';
      existingHost.dataset.railOwner = 'true';
      existingHost.attachShadow({ mode: 'open' });
      document.body.append(existingHost);

      const rail = new FloatingRail(manager);
      expect(rail.host).toBe(existingHost);
    });

    test('不應重用無 owner 標記的同 ID 元素', () => {
      const fakeHost = document.createElement('div');
      fakeHost.id = 'notion-floating-rail-host';
      document.body.append(fakeHost);

      const rail = new FloatingRail(manager);
      expect(rail.host).not.toBe(fakeHost);
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

    test('從 sessionStorage 恢復 HIGHLIGHTING 狀態時應啟動標註功能', async () => {
      sessionStorage.setItem(
        'notion-floating-rail-state',
        JSON.stringify({ state: 'highlighting', color: 'green' })
      );

      const rail = new FloatingRail(manager);
      await rail.initialize();

      expect(rail.stateManager.currentState).toBe(RailStates.HIGHLIGHTING);
      expect(manager.startHighlighting).toHaveBeenCalledWith('green');
    });

    test('從 sessionStorage 恢復非 HIGHLIGHTING 狀態時不應啟動標註', async () => {
      sessionStorage.setItem(
        'notion-floating-rail-state',
        JSON.stringify({ state: 'expanded', color: 'yellow' })
      );

      const rail = new FloatingRail(manager);
      await rail.initialize();

      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
      expect(manager.startHighlighting).not.toHaveBeenCalled();
    });

    test('[REGRESSION] initialize 應等待頁面狀態刷新完成後才綁定事件', async () => {
      let resolveStatus;
      const pageStatusPromise = new Promise(resolve => {
        resolveStatus = resolve;
      });
      checkPageStatus.mockReturnValue(pageStatusPromise);
      savePageFromRail.mockResolvedValue({ success: true });

      const rail = new FloatingRail(manager);
      const initPromise = rail.initialize();
      const saveBtn = rail.container.querySelector('[data-action="save"]');

      saveBtn.click();
      expect(savePageFromRail).not.toHaveBeenCalled();
      expect(rail._eventsBound).toBe(false);

      resolveStatus({ isSaved: true, canSave: false });
      await initPromise;

      expect(rail._eventsBound).toBe(true);
      expect(rail._pageStatus).toEqual({ isSaved: true, canSave: false });
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
      expect(manager.startHighlighting).toHaveBeenCalledWith('yellow', {
        sessionOverride: undefined,
      });
    });

    test('deactivateHighlighting 應回到 EXPANDED 狀態', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.activateHighlighting();
      rail.deactivateHighlighting();

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

  describe('save/sync action', () => {
    test('未保存頁面應呼叫 savePageFromRail', async () => {
      savePageFromRail.mockResolvedValue({ success: true });
      checkPageStatus.mockResolvedValue({ isSaved: false, canSave: true });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      expect(savePageFromRail).toHaveBeenCalled();
    });

    test('已保存頁面應呼叫 syncHighlights', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockResolvedValue({ success: true });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      expect(syncHighlights).toHaveBeenCalled();
    });
  });

  describe('manage action', () => {
    test('應呼叫 openSidePanel', async () => {
      openSidePanel.mockResolvedValue({ success: true });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleManage();

      expect(openSidePanel).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    test('應移除 host 並重置狀態', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.destroy();

      expect(document.querySelector('#notion-floating-rail-host')).toBeNull();
      expect(rail._initialized).toBe(false);
    });
  });

  describe('event binding', () => {
    test('trigger click 應切換 expand/collapse', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();

      const trigger = rail.container.querySelector('.rail-trigger');
      trigger.click();
      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);

      trigger.click();
      expect(rail.stateManager.currentState).toBe(RailStates.COLLAPSED);
    });

    test('highlight button click 應切換 highlighting', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.expand();

      const highlightToggle = rail.container.querySelector('.rail-highlight-toggle');
      highlightToggle.click();
      expect(rail.stateManager.currentState).toBe(RailStates.HIGHLIGHTING);

      highlightToggle.click();
      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
    });

    test('color swatch click 應更新顏色', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();

      const greenSwatch = rail.container.querySelector('[data-color="green"]');
      greenSwatch.click();

      expect(rail.stateManager.selectedColor).toBe('green');
    });

    test('focusin 應展開 COLLAPSED 狀態的工具列', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.collapse();

      rail.container.dispatchEvent(new FocusEvent('focusin'));

      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
    });

    test('focusout 應收起 EXPANDED 狀態的工具列（焦點離開 container）', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.expand();

      const externalEl = document.createElement('button');
      document.body.append(externalEl);

      rail.container.dispatchEvent(new FocusEvent('focusout', { relatedTarget: externalEl }));

      expect(rail.stateManager.currentState).toBe(RailStates.COLLAPSED);
      externalEl.remove();
    });

    test('focusout 不應收起工具列（焦點仍在 container 內）', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.expand();

      const internalBtn = rail.container.querySelector('.rail-trigger');
      rail.container.dispatchEvent(new FocusEvent('focusout', { relatedTarget: internalBtn }));

      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
    });

    test('focusout 不應收起 HIGHLIGHTING 狀態的工具列', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.activateHighlighting();

      const externalEl = document.createElement('button');
      document.body.append(externalEl);

      rail.container.dispatchEvent(new FocusEvent('focusout', { relatedTarget: externalEl }));

      expect(rail.stateManager.currentState).toBe(RailStates.HIGHLIGHTING);
      externalEl.remove();
    });

    test('[REGRESSION] trigger 拖曳應更新 rail host 位置並保存到 sessionStorage', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();

      const trigger = rail.container.querySelector('.rail-trigger');
      trigger.dispatchEvent(new MouseEvent('pointerdown', { clientX: 790, clientY: 300 }));
      document.dispatchEvent(new MouseEvent('pointermove', { clientX: 700, clientY: 180 }));
      document.dispatchEvent(new MouseEvent('pointerup', { clientX: 700, clientY: 180 }));

      expect(rail.host.style.top).toBe('180px');
      expect(rail.host.style.right).not.toBe('0px');
      expect(sessionStorage.getItem('notion-floating-rail-position')).toEqual(
        expect.stringContaining('"top":180')
      );
    });

    test('[REGRESSION] 新 rail instance 應恢復先前拖曳位置', async () => {
      sessionStorage.setItem(
        'notion-floating-rail-position',
        JSON.stringify({ top: 144, right: 24 })
      );

      const rail = new FloatingRail(manager);
      await rail.initialize();

      expect(rail.host.style.top).toBe('144px');
      expect(rail.host.style.right).toBe('24px');
    });
  });
});
