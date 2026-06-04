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

jest.mock('../../../../scripts/highlighter/ui/FloatingRailAnimations.js', () => ({
  playLaunchAnimation: jest.fn(() => ({ cancel: jest.fn(), playState: 'running' })),
  playFireworkAnimation: jest.fn(() => Promise.resolve()),
  playFailAnimation: jest.fn(() => Promise.resolve()),
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
import {
  playLaunchAnimation,
  playFireworkAnimation,
  playFailAnimation,
} from '../../../../scripts/highlighter/ui/FloatingRailAnimations.js';
import { RAIL_INSTANCE_ID } from '../../../../scripts/highlighter/ui/floatingRailInstance.js';
import { UI_MESSAGES } from '../../../../scripts/config/shared/messages.js';
import { ErrorHandler } from '../../../../scripts/utils/ErrorHandler.js';
import { sanitizeApiError } from '../../../../scripts/utils/ApiErrorSanitizer.js';
import Logger from '../../../../scripts/utils/Logger.js';

const TEST_RAIL_HOST_ID = `notion-floating-rail-host-${RAIL_INSTANCE_ID}`;
const TEST_RAIL_POSITION_KEY = `notion-floating-rail-position-${RAIL_INSTANCE_ID}`;
const TEST_RAIL_STATE_KEY = `notion-floating-rail-state-${RAIL_INSTANCE_ID}`;
const TEST_RAIL_DISMISSED_KEY = `notion-floating-rail-dismissed-${RAIL_INSTANCE_ID}`;

function createMockContainerElement() {
  const container = document.createElement('div');
  container.className = 'rail-container collapsed';

  const trigger = document.createElement('button');
  trigger.className = 'rail-trigger';
  trigger.setAttribute('aria-expanded', 'false');
  container.append(trigger);

  const actions = document.createElement('div');
  actions.className = 'rail-actions';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'rail-close-btn';
  closeBtn.setAttribute('aria-label', '關閉工具列');
  actions.append(closeBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'rail-action-btn';
  saveBtn.dataset.action = 'save';
  saveBtn.setAttribute('aria-label', '保存網頁');
  actions.append(saveBtn);

  const errorTooltip = document.createElement('span');
  errorTooltip.className = 'rail-error-tooltip';
  actions.append(errorTooltip);

  const highlightGroup = document.createElement('div');
  highlightGroup.className = 'rail-highlight-group';

  const highlightToggle = document.createElement('button');
  highlightToggle.className = 'rail-action-btn rail-highlight-toggle';
  highlightToggle.dataset.action = 'highlight';
  highlightToggle.setAttribute('aria-label', '開始標註');

  const colorIndicator = document.createElement('span');
  colorIndicator.className = 'color-indicator';
  colorIndicator.style.backgroundColor = '#fff3cd';
  highlightToggle.append(colorIndicator);
  highlightGroup.append(highlightToggle);

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

  highlightGroup.append(palette);
  actions.append(highlightGroup);

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
    handleDocumentClick: jest.fn().mockReturnValue(false),
    collectHighlightsForNotion: jest.fn(() => []),
  };
}

function createPointerMouseEvent(type, options = {}) {
  const event = new MouseEvent(type, options);
  if (options.pointerId !== undefined) {
    Object.defineProperty(event, 'pointerId', {
      configurable: true,
      value: options.pointerId,
    });
  }
  return event;
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
    jest.restoreAllMocks();
    jest.clearAllMocks();
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

    test('從 sessionStorage 恢復 HIGHLIGHTING 狀態時應啟動標註功能', async () => {
      sessionStorage.setItem(
        TEST_RAIL_STATE_KEY,
        JSON.stringify({ state: 'highlighting', color: 'green' })
      );

      const rail = new FloatingRail(manager);
      await rail.initialize();

      expect(rail.stateManager.currentState).toBe(RailStates.HIGHLIGHTING);
      expect(manager.startHighlighting).toHaveBeenCalledWith('green');
    });

    test('從 sessionStorage 恢復非 HIGHLIGHTING 狀態時不應啟動標註', async () => {
      sessionStorage.setItem(
        TEST_RAIL_STATE_KEY,
        JSON.stringify({ state: 'expanded', color: 'yellow' })
      );

      const rail = new FloatingRail(manager);
      await rail.initialize();

      expect(rail.stateManager.currentState).toBe(RailStates.EXPANDED);
      expect(manager.startHighlighting).not.toHaveBeenCalled();
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

    test('保存成功應播放 launch → firework 動畫', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: false, canSave: true });
      savePageFromRail.mockResolvedValue({ success: true });

      const rail = new FloatingRail(manager);
      await rail.initialize();

      await rail._handleSaveSync();

      expect(playLaunchAnimation).toHaveBeenCalledWith(rail.elements.saveBtn);
      expect(playFireworkAnimation).toHaveBeenCalledWith(rail.elements.saveBtn);
      expect(playFailAnimation).not.toHaveBeenCalled();
    });

    test('保存失敗應播放 launch → fail 動畫', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: false, canSave: true });
      savePageFromRail.mockRejectedValue(new Error('network error'));

      const rail = new FloatingRail(manager);
      await rail.initialize();

      await rail._handleSaveSync();

      expect(playLaunchAnimation).toHaveBeenCalledWith(rail.elements.saveBtn);
      const errorTooltip = rail.container.querySelector('.rail-error-tooltip');
      expect(playFailAnimation).toHaveBeenCalledWith(
        rail.elements.saveBtn,
        errorTooltip,
        ErrorHandler.formatUserMessage(
          sanitizeApiError(new Error('network error'), 'rail_save_sync')
        )
      );
      expect(playFireworkAnimation).not.toHaveBeenCalled();
    });

    test('syncHighlights 拋錯時警告 log 的 operation 必須是 syncHighlights', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockRejectedValue(new Error('sync network error'));

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 保存/同步失敗',
        expect.objectContaining({
          action: '_handleSaveSync',
          operation: 'syncHighlights',
        })
      );
    });

    test('savePageFromRail 拋錯時警告 log 的 operation 必須是 savePageFromRail', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      checkPageStatus.mockResolvedValue({ isSaved: false, canSave: true });
      savePageFromRail.mockRejectedValue(new Error('save network error'));

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 保存/同步失敗',
        expect.objectContaining({
          action: '_handleSaveSync',
          operation: 'savePageFromRail',
        })
      );
    });

    test('syncHighlights 回 success:false + errorCode UNAUTHORIZED → playFailAnimation', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockResolvedValue({ success: false, errorCode: 'UNAUTHORIZED', error: 'err' });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      const errorTooltip = rail.container.querySelector('.rail-error-tooltip');
      expect(playFailAnimation).toHaveBeenCalledWith(rail.elements.saveBtn, errorTooltip);
      expect(playFireworkAnimation).not.toHaveBeenCalled();
    });

    test('syncHighlights 回 success:false + HIGHLIGHT_SECTION_DELETE_INCOMPLETE → 當成功（playFireworkAnimation）', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockResolvedValue({
        success: false,
        errorCode: 'HIGHLIGHT_SECTION_DELETE_INCOMPLETE',
        error: 'partial',
      });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      expect(playFireworkAnimation).toHaveBeenCalledWith(rail.elements.saveBtn);
      expect(playFailAnimation).not.toHaveBeenCalled();
    });

    test('syncHighlights 回 success:true → playFireworkAnimation（既有行為）', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockResolvedValue({ success: true });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      expect(playFireworkAnimation).toHaveBeenCalledWith(rail.elements.saveBtn);
      expect(playFailAnimation).not.toHaveBeenCalled();
    });

    test('PAGE_DELETED 錯誤應播放 fail 動畫並觸發 _refreshPageStatus', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockResolvedValue({ success: false, errorCode: 'PAGE_DELETED' });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      const refreshSpy = jest.spyOn(rail, '_refreshPageStatus');

      await rail._handleSaveSync();

      const errorTooltip = rail.container.querySelector('.rail-error-tooltip');
      expect(playFailAnimation).toHaveBeenCalledWith(
        rail.elements.saveBtn,
        errorTooltip,
        UI_MESSAGES.POPUP.DELETED_PAGE
      );
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(playFireworkAnimation).not.toHaveBeenCalled();
    });

    test('PAGE_DELETION_PENDING 錯誤應播放 fail 動畫且不觸發 _refreshPageStatus', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockResolvedValue({ success: false, errorCode: 'PAGE_DELETION_PENDING' });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      const refreshSpy = jest.spyOn(rail, '_refreshPageStatus');

      await rail._handleSaveSync();

      const errorTooltip = rail.container.querySelector('.rail-error-tooltip');
      expect(playFailAnimation).toHaveBeenCalledWith(
        rail.elements.saveBtn,
        errorTooltip,
        UI_MESSAGES.POPUP.DELETION_PENDING
      );
      expect(refreshSpy).not.toHaveBeenCalled();
      expect(playFireworkAnimation).not.toHaveBeenCalled();
    });

    test('一般錯誤應播放預設 fail 動畫且不觸發 _refreshPageStatus', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockResolvedValue({ success: false, errorCode: 'SOME_UNKNOWN_ERROR' });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      const refreshSpy = jest.spyOn(rail, '_refreshPageStatus');

      await rail._handleSaveSync();

      const errorTooltip = rail.container.querySelector('.rail-error-tooltip');
      expect(playFailAnimation).toHaveBeenCalledWith(rail.elements.saveBtn, errorTooltip);
      expect(refreshSpy).not.toHaveBeenCalled();
      expect(playFireworkAnimation).not.toHaveBeenCalled();
    });

    test('syncHighlights 拋出可格式化錯誤時，fail 動畫應顯示友善訊息', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockRejectedValue({
        code: 'NETWORK_ERROR',
        message: 'network error',
      });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      const errorTooltip = rail.container.querySelector('.rail-error-tooltip');
      expect(playFailAnimation).toHaveBeenCalledWith(
        rail.elements.saveBtn,
        errorTooltip,
        ErrorHandler.formatUserMessage(
          sanitizeApiError({ code: 'NETWORK_ERROR', message: 'network error' }, 'rail_save_sync')
        )
      );
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

    test('openSidePanel 失敗時應記錄警告', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      openSidePanel.mockRejectedValue(new Error('panel failed'));

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleManage();

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 開啟 Side Panel 失敗',
        expect.objectContaining({
          action: '_handleManage',
          operation: 'openSidePanel',
        })
      );
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

    test('[REGRESSION] trigger 拖曳應更新 rail host 位置並保存到 sessionStorage', async () => {
      jest.useFakeTimers();
      const rail = new FloatingRail(manager);
      await rail.initialize();

      try {
        const trigger = rail.container.querySelector('.rail-trigger');
        trigger.dispatchEvent(new MouseEvent('pointerdown', { clientX: 790, clientY: 300 }));
        jest.advanceTimersByTime(300);
        document.dispatchEvent(new MouseEvent('pointermove', { clientX: 700, clientY: 180 }));
        document.dispatchEvent(new MouseEvent('pointerup', { clientX: 700, clientY: 180 }));

        expect(rail.host.style.top).toBe('180px');
        expect(rail.host.style.right).not.toBe('0px');
        expect(sessionStorage.getItem(TEST_RAIL_POSITION_KEY)).toEqual(
          expect.stringContaining('"top":180')
        );
      } finally {
        jest.useRealTimers();
      }
    });

    test('[REGRESSION] trigger 拖曳結束後的下一次 click 應被抑制', async () => {
      jest.useFakeTimers();
      const rail = new FloatingRail(manager);
      await rail.initialize();

      try {
        const trigger = rail.container.querySelector('.rail-trigger');

        trigger.dispatchEvent(new MouseEvent('pointerdown', { clientX: 790, clientY: 300 }));
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

        trigger.dispatchEvent(
          createPointerMouseEvent('pointerdown', { clientX: 790, clientY: 300, pointerId: 42 })
        );
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

    test('trigger pointerdown 非主按鍵時不應進入拖曳準備', async () => {
      jest.useFakeTimers();
      const rail = new FloatingRail(manager);
      await rail.initialize();

      try {
        const trigger = rail.container.querySelector('.rail-trigger');
        trigger.dispatchEvent(
          new MouseEvent('pointerdown', { button: 1, clientX: 790, clientY: 300 })
        );
        jest.advanceTimersByTime(300);

        expect(rail._dragState).toBeNull();
        expect(rail.host.dataset.dragging).toBeUndefined();
      } finally {
        jest.useRealTimers();
      }
    });

    test('[REGRESSION] drag activation timer 在拖曳被提前清除後不應重新標記 dragging', async () => {
      jest.useFakeTimers();
      const rail = new FloatingRail(manager);
      await rail.initialize();

      try {
        const trigger = rail.container.querySelector('.rail-trigger');
        trigger.dispatchEvent(new MouseEvent('pointerdown', { clientX: 790, clientY: 300 }));

        rail._clearDragArtifacts();
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

      trigger.dispatchEvent(
        createPointerMouseEvent('pointerdown', { clientX: 790, clientY: 300, pointerId: 9 })
      );

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

    test('[REGRESSION] trigger 未長按達門檻前不應開始拖曳', async () => {
      jest.useFakeTimers();
      const rail = new FloatingRail(manager);
      await rail.initialize();

      try {
        const trigger = rail.container.querySelector('.rail-trigger');
        trigger.dispatchEvent(new MouseEvent('pointerdown', { clientX: 790, clientY: 300 }));
        jest.advanceTimersByTime(120);
        document.dispatchEvent(new MouseEvent('pointermove', { clientX: 700, clientY: 180 }));
        document.dispatchEvent(new MouseEvent('pointerup', { clientX: 700, clientY: 180 }));

        expect(rail.host.style.top).not.toBe('180px');
        expect(sessionStorage.getItem(TEST_RAIL_POSITION_KEY)).toBeNull();
      } finally {
        jest.useRealTimers();
      }
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
        const trigger = rail.container.querySelector('.rail-trigger');
        trigger.dispatchEvent(new MouseEvent('pointerdown', { clientX: 790, clientY: 300 }));

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

  describe('_applyDisplaySettings', () => {
    test('applies position=top size=small to host CSS variables', () => {
      const rail = new FloatingRail(manager);
      rail._applyDisplaySettings({ position: 'top', size: 'small' });
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('25%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('28px');
      expect(rail.host.style.getPropertyValue('--rail-trigger-icon-size')).toBe('18px');
      expect(rail.host.style.getPropertyValue('--rail-action-icon-size')).toBe('14px');
    });

    test('applies position=bottom size=large', () => {
      const rail = new FloatingRail(manager);
      rail._applyDisplaySettings({ position: 'bottom', size: 'large' });
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('75%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('34px');
      expect(rail.host.style.getPropertyValue('--rail-trigger-icon-size')).toBe('22px');
      expect(rail.host.style.getPropertyValue('--rail-action-icon-size')).toBe('18px');
    });

    test('unknown position falls back to middle (50%)', () => {
      const rail = new FloatingRail(manager);
      rail._applyDisplaySettings({ position: 'invalid', size: 'large' });
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('50%');
    });

    test('unknown size falls back to large (34px main button)', () => {
      const rail = new FloatingRail(manager);
      rail._applyDisplaySettings({ position: 'middle', size: 'invalid' });
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('34px');
    });

    test('undefined position/size falls back to middle/large', () => {
      const rail = new FloatingRail(manager);
      rail._applyDisplaySettings({ position: undefined, size: undefined });
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('50%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('34px');
    });
  });

  describe('initialize() reads display settings from storage', () => {
    test('reads floatingRailPosition and floatingRailSize then applies them', async () => {
      chrome.storage.sync.get = jest.fn().mockResolvedValue({
        floatingRailPosition: 'bottom',
        floatingRailSize: 'small',
      });
      const rail = new FloatingRail(manager);

      await rail.initialize();

      expect(chrome.storage.sync.get).toHaveBeenCalledWith([
        'floatingRailPosition',
        'floatingRailSize',
      ]);
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('75%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('28px');
    });

    test('initialize falls back to defaults when storage is empty', async () => {
      chrome.storage.sync.get = jest.fn().mockResolvedValue({});
      const rail = new FloatingRail(manager);

      await rail.initialize();

      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('50%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('34px');
    });

    test('storage 讀取失敗時應記錄警告並套用預設顯示設定', async () => {
      chrome.storage.sync.get = jest.fn().mockRejectedValueOnce(new Error('storage unavailable'));
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      const rail = new FloatingRail(manager);

      await rail.initialize();

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 無法讀取顯示設定',
        expect.objectContaining({
          action: 'initialize',
          operation: 'loadDisplaySettings',
        })
      );
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('50%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('34px');
    });
  });

  describe('storage onChanged listener', () => {
    let addedListener;

    beforeEach(() => {
      addedListener = null;
      chrome.storage.onChanged.addListener = jest.fn(fn => {
        addedListener = fn;
      });
      chrome.storage.onChanged.removeListener = jest.fn();
      chrome.storage.sync.get = jest.fn().mockResolvedValue({});
    });

    test('initialize() registers a chrome.storage.onChanged listener', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
      expect(typeof addedListener).toBe('function');
    });

    test('listener re-applies CSS variables when sync changes include rail keys', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      chrome.storage.sync.get = jest.fn().mockResolvedValue({
        floatingRailPosition: 'top',
        floatingRailSize: 'small',
      });
      await addedListener(
        {
          floatingRailPosition: { newValue: 'top' },
          floatingRailSize: { newValue: 'small' },
        },
        'sync'
      );
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe('25%');
      expect(rail.host.style.getPropertyValue('--rail-btn-size')).toBe('28px');
    });

    test('_isDisplaySettingChange 對空值 changes 應回傳 false', () => {
      const rail = new FloatingRail(manager);

      expect(rail._isDisplaySettingChange(null, 'sync')).toBe(false);
      expect(rail._isDisplaySettingChange(undefined, 'sync')).toBe(false);
    });

    test('listener ignores changes from non-sync areas', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      const before = rail.host.style.getPropertyValue('--rail-top');
      await addedListener({ floatingRailPosition: { newValue: 'top' } }, 'local');
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe(before);
    });

    test('listener ignores irrelevant sync key changes', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      const before = rail.host.style.getPropertyValue('--rail-top');
      await addedListener({ unrelatedKey: { newValue: 'foo' } }, 'sync');
      expect(rail.host.style.getPropertyValue('--rail-top')).toBe(before);
    });

    test('destroy() removes the onChanged listener', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      rail.destroy();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(addedListener);
    });

    test('listener storage 重新讀取失敗時應記錄警告', async () => {
      const rail = new FloatingRail(manager);
      await rail.initialize();
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      chrome.storage.sync.get = jest.fn().mockRejectedValueOnce(new Error('reload failed'));

      await addedListener({ floatingRailPosition: { newValue: 'top' } }, 'sync');

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 無法重新載入顯示設定',
        expect.objectContaining({
          action: '_listenToDisplaySettingsChanges',
          operation: 'reloadDisplaySettings',
        })
      );
    });
  });
});
