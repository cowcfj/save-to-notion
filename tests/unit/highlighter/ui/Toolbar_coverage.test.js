/**
 * Toolbar.js 覆蓋率補強測試
 * 針對未覆蓋的分支和邊界情況
 */

import { Toolbar } from '../../../../scripts/highlighter/ui/Toolbar.js';
import { createToolbarContainer } from '../../../../scripts/highlighter/ui/components/ToolbarContainer.js';

// Mock dependencies
jest.mock('../../../../scripts/highlighter/ui/components/ToolbarContainer.js', () => ({
  createToolbarContainer: jest.fn(),
}));

import {
  createMiniIcon,
  bindMiniIconEvents,
} from '../../../../scripts/highlighter/ui/components/MiniIcon.js';

jest.mock('../../../../scripts/highlighter/ui/components/MiniIcon.js', () => ({
  createMiniIcon: jest.fn(),
  bindMiniIconEvents: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/components/ColorPicker.js', () => ({
  renderColorPicker: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/components/HighlightList.js', () => ({
  renderHighlightList: jest.fn(),
}));

describe('Toolbar 覆蓋率補強', () => {
  let managerMock = null;
  let toolbar = null;
  let container = null;

  /**
   * 創建完整的模擬容器，包含所有必要元素
   */
  const createMockContainer = () => {
    const div = document.createElement('div');
    div.id = 'notion-highlighter-v2';

    // 計數 span
    const countSpan = document.createElement('span');
    countSpan.id = 'highlight-count-v2';
    countSpan.textContent = '0';
    div.appendChild(countSpan);

    // 狀態 div
    const statusDiv = document.createElement('div');
    statusDiv.id = 'highlight-status-v2';
    div.appendChild(statusDiv);

    // 控制按鈕
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggle-highlight-v2';
    toggleBtn.textContent = '開始標註';
    div.appendChild(toggleBtn);

    const minimizeBtn = document.createElement('button');
    minimizeBtn.id = 'minimize-highlight-v2';
    div.appendChild(minimizeBtn);

    const closeBtn = document.createElement('button');
    closeBtn.id = 'close-highlight-v2';
    div.appendChild(closeBtn);

    // 操作按鈕
    const syncBtn = document.createElement('button');
    syncBtn.id = 'sync-to-notion-v2';
    div.appendChild(syncBtn);

    const openBtn = document.createElement('button');
    openBtn.id = 'open-notion-v2';
    div.appendChild(openBtn);

    const manageBtn = document.createElement('button');
    manageBtn.id = 'manage-highlights-v2';
    div.appendChild(manageBtn);

    // 顏色選擇器容器
    const colorPicker = document.createElement('div');
    colorPicker.id = 'color-picker-v2';
    div.appendChild(colorPicker);

    // 標註列表容器
    const listContainer = document.createElement('div');
    listContainer.id = 'highlight-list-v2';
    listContainer.style.display = 'none';
    div.appendChild(listContainer);

    return div;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';

    // Mock chrome API
    global.window.chrome = {
      runtime: {
        sendMessage: jest.fn(),
      },
    };

    // Mock Logger
    window.Logger = {
      error: jest.fn(),
      log: jest.fn(),
    };

    container = createMockContainer();
    createToolbarContainer.mockReturnValue(container);
    createMiniIcon.mockReturnValue(document.createElement('div'));

    // Mock Manager
    managerMock = {
      highlights: new Map(),
      colors: { yellow: '#ff0', green: '#0f0' },
      currentColor: 'yellow',
      getCount: jest.fn().mockReturnValue(0),
      setColor: jest.fn(),
      addHighlight: jest.fn().mockReturnValue('new-id'),
      removeHighlight: jest.fn(),
      handleDocumentClick: jest.fn().mockReturnValue(false),
      collectHighlightsForNotion: jest.fn().mockReturnValue([]),
    };

    toolbar = new Toolbar(managerMock);
  });

  afterEach(() => {
    toolbar?.cleanup();
  });

  describe('constructor', () => {
    test('應該在缺少 highlightManager 時拋出錯誤', () => {
      expect(() => new Toolbar(null)).toThrow('HighlightManager is required');
      expect(() => new Toolbar(undefined)).toThrow('HighlightManager is required');
    });

    test('應該正確初始化所有屬性', () => {
      expect(toolbar.manager).toBe(managerMock);
      expect(toolbar.isHighlightModeActive).toBe(false);
      expect(toolbar.container).toBeTruthy();
      expect(toolbar.miniIcon).toBeTruthy();
    });
  });

  describe('handleStateChange', () => {
    test('應該在 EXPANDED 狀態時顯示工具欄', () => {
      const showSpy = jest.spyOn(toolbar, 'show');
      toolbar.handleStateChange('expanded');
      expect(showSpy).toHaveBeenCalled();
    });

    test('應該在 MINIMIZED 狀態時最小化工具欄', () => {
      const minimizeSpy = jest.spyOn(toolbar, 'minimize');
      toolbar.handleStateChange('minimized');
      expect(minimizeSpy).toHaveBeenCalled();
    });

    test('應該在 HIDDEN 狀態時隱藏工具欄', () => {
      const hideSpy = jest.spyOn(toolbar, 'hide');
      toolbar.handleStateChange('hidden');
      expect(hideSpy).toHaveBeenCalled();
    });

    test('應該在未知狀態時發出警告並隱藏工具欄', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const hideSpy = jest.spyOn(toolbar, 'hide');

      toolbar.handleStateChange('unknown_state');

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('未知狀態'));
      expect(hideSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('show / hide / minimize / expand', () => {
    test('show 應該正確設置顯示狀態', () => {
      toolbar.show();
      expect(container.style.display).toBe('block');
      expect(toolbar.miniIcon.style.display).toBe('none');
    });

    test('hide 應該正確設置隱藏狀態', () => {
      toolbar.show();
      toolbar.hide();
      expect(container.style.display).toBe('none');
      expect(toolbar.miniIcon.style.display).toBe('none');
    });

    test('hide 應該在標註模式開啟時關閉標註模式', () => {
      toolbar.isHighlightModeActive = true;
      const toggleSpy = jest.spyOn(toolbar, 'toggleHighlightMode');

      toolbar.hide();

      expect(toggleSpy).toHaveBeenCalled();
    });

    test('minimize 應該正確設置最小化狀態', () => {
      toolbar.show();
      toolbar.minimize();
      expect(container.style.display).toBe('none');
      expect(toolbar.miniIcon.style.display).toBe('flex');
    });

    test('expand 應該調用 show', () => {
      const showSpy = jest.spyOn(toolbar, 'show');
      toolbar.expand();
      expect(showSpy).toHaveBeenCalled();
    });
  });

  describe('toggleHighlightMode', () => {
    test('應該正確切換標註模式狀態', () => {
      expect(toolbar.isHighlightModeActive).toBe(false);

      toolbar.toggleHighlightMode();
      expect(toolbar.isHighlightModeActive).toBe(true);

      toolbar.toggleHighlightMode();
      expect(toolbar.isHighlightModeActive).toBe(false);
    });

    test('應該在開啟時更新按鈕樣式為活動狀態', () => {
      const btn = container.querySelector('#toggle-highlight-v2');

      toolbar.toggleHighlightMode();

      expect(btn.textContent).toBe('停止標註');
      expect(btn.style.background).toBe('rgb(72, 187, 120)');
      expect(btn.style.color).toBe('white');
    });

    test('應該在關閉時更新按鈕樣式為正常狀態', () => {
      const btn = container.querySelector('#toggle-highlight-v2');

      toolbar.toggleHighlightMode(); // 開啟
      toolbar.toggleHighlightMode(); // 關閉

      expect(btn.textContent).toBe('開始標註');
      expect(btn.style.background).toBe('white');
      expect(btn.style.color).toBe('rgb(72, 187, 120)');
    });

    test('應該在按鈕不存在時安全返回', () => {
      // 移除按鈕
      const btn = container.querySelector('#toggle-highlight-v2');
      btn.remove();

      expect(() => toolbar.toggleHighlightMode()).not.toThrow();
    });
  });

  describe('updateHighlightCount', () => {
    test('應該更新計數顯示', () => {
      managerMock.getCount.mockReturnValue(5);
      toolbar.updateHighlightCount();

      const countSpan = container.querySelector('#highlight-count-v2');
      expect(countSpan.textContent).toBe('5');
    });

    test('應該在計數元素不存在時安全返回', () => {
      const countSpan = container.querySelector('#highlight-count-v2');
      countSpan.remove();

      expect(() => toolbar.updateHighlightCount()).not.toThrow();
    });
  });

  describe('bindControlButtons', () => {
    test('應該綁定最小化按鈕點擊事件', () => {
      const minimizeBtn = container.querySelector('#minimize-highlight-v2');
      const minimizeSpy = jest.spyOn(toolbar, 'minimize');

      minimizeBtn.click();

      expect(minimizeSpy).toHaveBeenCalled();
    });

    test('應該綁定關閉按鈕點擊事件', () => {
      const closeBtn = container.querySelector('#close-highlight-v2');
      const hideSpy = jest.spyOn(toolbar, 'hide');

      closeBtn.click();

      expect(hideSpy).toHaveBeenCalled();
    });

    test('應該綁定切換標註按鈕點擊事件', () => {
      const toggleBtn = container.querySelector('#toggle-highlight-v2');
      const toggleSpy = jest.spyOn(toolbar, 'toggleHighlightMode');

      toggleBtn.click();

      expect(toggleSpy).toHaveBeenCalled();
    });
  });

  describe('bindActionButtons', () => {
    test('應該綁定同步按鈕點擊事件', () => {
      const syncBtn = container.querySelector('#sync-to-notion-v2');
      const syncSpy = jest.spyOn(toolbar, 'syncToNotion').mockImplementation();

      syncBtn.click();

      expect(syncSpy).toHaveBeenCalled();
    });

    test('應該綁定管理按鈕點擊事件', () => {
      const manageBtn = container.querySelector('#manage-highlights-v2');
      const toggleListSpy = jest.spyOn(toolbar, 'toggleHighlightList');

      manageBtn.click();

      expect(toggleListSpy).toHaveBeenCalled();
    });
  });

  describe('bindMiniIconEvents 整合', () => {
    test('應該正確綁定最小化圖標展開事件', () => {
      // 驗證 bindMiniIconEvents 被調用
      expect(bindMiniIconEvents).toHaveBeenCalledWith(toolbar.miniIcon, expect.any(Function));

      // 獲取傳遞給 bindMiniIconEvents 的回調
      const expandCallback = bindMiniIconEvents.mock.calls[0][1];
      const showSpy = jest.spyOn(toolbar, 'show');

      // 調用回調
      expandCallback();

      expect(showSpy).toHaveBeenCalled();
    });
  });

  describe('toggleHighlightList 邊界情況', () => {
    test('應該在列表容器不存在時安全返回', () => {
      const listContainer = container.querySelector('#highlight-list-v2');
      listContainer.remove();

      expect(() => toolbar.toggleHighlightList()).not.toThrow();
    });
  });

  describe('refreshHighlightList 邊界情況', () => {
    test('應該在列表容器不存在時安全返回', () => {
      const listContainer = container.querySelector('#highlight-list-v2');
      listContainer.remove();

      expect(() => toolbar.refreshHighlightList()).not.toThrow();
    });
  });

  describe('_sendMessageAsync', () => {
    test('應該在 window 不可用時拒絕 Promise', async () => {
      // 儲存原始 chrome
      const originalChrome = global.window.chrome;
      global.window.chrome = undefined;

      await expect(Toolbar._sendMessageAsync({ action: 'test' })).rejects.toThrow('無法連接擴展');

      // 恢復
      global.window.chrome = originalChrome;
    });

    test('應該正確處理成功回應', async () => {
      global.window.chrome.runtime.sendMessage = jest.fn((message, callback) => {
        const response = { success: true };
        callback(response);
      });

      const result = await Toolbar._sendMessageAsync({ action: 'test' });
      expect(result).toEqual({ success: true });
    });

    test('應該在 lastError 時拒絕 Promise', async () => {
      global.window.chrome.runtime.sendMessage = jest.fn((message, callback) => {
        global.window.chrome.runtime.lastError = { message: '連接失敗' };
        callback();
        delete global.window.chrome.runtime.lastError;
      });

      await expect(Toolbar._sendMessageAsync({ action: 'test' })).rejects.toThrow('連接失敗');
    });
  });

  describe('syncToNotion 邊界情況', () => {
    test('應該在狀態元素不存在時安全返回', async () => {
      const statusDiv = container.querySelector('#highlight-status-v2');
      statusDiv.remove();

      await expect(toolbar.syncToNotion()).resolves.toBeUndefined();
    });
  });

  describe('openInNotion 邊界情況', () => {
    test('應該在 chrome.runtime 不可用時安全返回', () => {
      global.window.chrome = undefined;

      expect(() => Toolbar.openInNotion()).not.toThrow();
    });
  });

  describe('cleanup', () => {
    test('應該移除所有事件監聽器', () => {
      const removeSelectionSpy = jest.spyOn(document, 'removeEventListener');

      toolbar.cleanup();

      expect(removeSelectionSpy).toHaveBeenCalledWith('mouseup', toolbar.selectionHandler);
      expect(removeSelectionSpy).toHaveBeenCalledWith('click', toolbar.clickDeleteHandler);
    });

    test('應該移除 DOM 元素', () => {
      document.body.appendChild(toolbar.container);
      document.body.appendChild(toolbar.miniIcon);

      toolbar.cleanup();

      expect(document.body.contains(toolbar.container)).toBe(false);
      expect(document.body.contains(toolbar.miniIcon)).toBe(false);
    });

    test('應該在元素不存在時安全返回', () => {
      toolbar.container = null;
      toolbar.miniIcon = null;

      expect(() => toolbar.cleanup()).not.toThrow();
    });
  });

  describe('bindSelectionEvents 分支覆蓋', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('應該在非標註模式時忽略選擇事件', () => {
      toolbar.isHighlightModeActive = false;

      const mouseupEvent = new MouseEvent('mouseup');
      document.dispatchEvent(mouseupEvent);
      jest.runAllTimers();

      expect(managerMock.addHighlight).not.toHaveBeenCalled();
    });

    test('應該在點擊工具欄內元素時忽略事件', () => {
      toolbar.isHighlightModeActive = true;

      // 模擬點擊工具欄內元素
      const mouseupEvent = new MouseEvent('mouseup', {
        bubbles: true,
      });
      Object.defineProperty(mouseupEvent, 'target', {
        value: container,
        writable: false,
      });

      document.dispatchEvent(mouseupEvent);
      jest.runAllTimers();

      expect(managerMock.addHighlight).not.toHaveBeenCalled();
    });

    test('應該在選擇為空時不創建標註', () => {
      toolbar.isHighlightModeActive = true;

      // Mock window.getSelection 返回空選擇
      const mockSelection = {
        isCollapsed: true,
        toString: () => '',
        getRangeAt: jest.fn(),
        removeAllRanges: jest.fn(),
      };
      jest.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

      // 創建一個真實的 DOM 元素作為事件目標
      const targetElement = document.createElement('p');
      document.body.appendChild(targetElement);

      const mouseupEvent = new MouseEvent('mouseup', { bubbles: true });
      targetElement.dispatchEvent(mouseupEvent);
      jest.runAllTimers();

      expect(managerMock.addHighlight).not.toHaveBeenCalled();
    });

    test('應該在選擇文字為空白時不創建標註', () => {
      toolbar.isHighlightModeActive = true;

      const mockSelection = {
        isCollapsed: false,
        toString: () => '   ',
        getRangeAt: jest.fn(),
        removeAllRanges: jest.fn(),
      };
      jest.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

      // 創建一個真實的 DOM 元素作為事件目標
      const targetElement = document.createElement('p');
      document.body.appendChild(targetElement);

      const mouseupEvent = new MouseEvent('mouseup', { bubbles: true });
      targetElement.dispatchEvent(mouseupEvent);
      jest.runAllTimers();

      expect(managerMock.addHighlight).not.toHaveBeenCalled();
    });

    test('應該在有效選擇時創建標註', () => {
      toolbar.isHighlightModeActive = true;

      const mockRange = document.createRange();
      const mockSelection = {
        isCollapsed: false,
        toString: () => 'Selected text',
        getRangeAt: jest.fn().mockReturnValue(mockRange),
        removeAllRanges: jest.fn(),
      };
      jest.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

      // 創建一個真實的 DOM 元素作為事件目標
      const targetElement = document.createElement('p');
      document.body.appendChild(targetElement);

      const mouseupEvent = new MouseEvent('mouseup', { bubbles: true });
      targetElement.dispatchEvent(mouseupEvent);
      jest.runAllTimers();

      expect(managerMock.addHighlight).toHaveBeenCalledWith(mockRange, 'yellow');
    });

    test('應該在 addHighlight 返回 null 時不清除選擇', () => {
      toolbar.isHighlightModeActive = true;
      managerMock.addHighlight.mockReturnValue(null);

      const mockRange = document.createRange();
      const mockSelection = {
        isCollapsed: false,
        toString: () => 'Selected text',
        getRangeAt: jest.fn().mockReturnValue(mockRange),
        removeAllRanges: jest.fn(),
      };
      jest.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

      // 創建一個真實的 DOM 元素作為事件目標
      const targetElement = document.createElement('p');
      document.body.appendChild(targetElement);

      const mouseupEvent = new MouseEvent('mouseup', { bubbles: true });
      targetElement.dispatchEvent(mouseupEvent);
      jest.runAllTimers();

      expect(mockSelection.removeAllRanges).not.toHaveBeenCalled();
    });

    test('應該在 addHighlight 拋出錯誤時記錄錯誤', () => {
      toolbar.isHighlightModeActive = true;
      managerMock.addHighlight.mockImplementation(() => {
        throw new Error('添加失敗');
      });

      const mockRange = document.createRange();
      const mockSelection = {
        isCollapsed: false,
        toString: () => 'Selected text',
        getRangeAt: jest.fn().mockReturnValue(mockRange),
        removeAllRanges: jest.fn(),
      };
      jest.spyOn(window, 'getSelection').mockReturnValue(mockSelection);

      // 創建一個真實的 DOM 元素作為事件目標
      const targetElement = document.createElement('p');
      document.body.appendChild(targetElement);

      const mouseupEvent = new MouseEvent('mouseup', { bubbles: true });
      targetElement.dispatchEvent(mouseupEvent);
      jest.runAllTimers();

      expect(window.Logger.error).toHaveBeenCalledWith('添加標註失敗:', expect.any(Error));
    });

    test('應該在 window.getSelection 返回 null 時安全處理', () => {
      toolbar.isHighlightModeActive = true;

      jest.spyOn(window, 'getSelection').mockReturnValue(null);

      // 創建一個真實的 DOM 元素作為事件目標
      const targetElement = document.createElement('p');
      document.body.appendChild(targetElement);

      const mouseupEvent = new MouseEvent('mouseup', { bubbles: true });
      targetElement.dispatchEvent(mouseupEvent);

      expect(() => jest.runAllTimers()).not.toThrow();
      expect(managerMock.addHighlight).not.toHaveBeenCalled();
    });
  });

  describe('bindClickDeleteEvents 分支覆蓋', () => {
    test('應該在刪除成功時更新計數和刷新列表', () => {
      managerMock.handleDocumentClick.mockReturnValue(true);

      // 顯示列表
      const listContainer = container.querySelector('#highlight-list-v2');
      listContainer.style.display = 'block';

      const refreshSpy = jest.spyOn(toolbar, 'refreshHighlightList');

      const clickEvent = new MouseEvent('click');
      document.dispatchEvent(clickEvent);

      expect(managerMock.getCount).toHaveBeenCalled();
      expect(refreshSpy).toHaveBeenCalled();
    });

    test('應該在刪除失敗時不更新', () => {
      managerMock.handleDocumentClick.mockReturnValue(false);

      const refreshSpy = jest.spyOn(toolbar, 'refreshHighlightList');

      const clickEvent = new MouseEvent('click');
      document.dispatchEvent(clickEvent);

      // getCount 只在初始化時被呼叫
      expect(refreshSpy).not.toHaveBeenCalled();
    });

    test('應該在列表隱藏時不刷新列表', () => {
      managerMock.handleDocumentClick.mockReturnValue(true);

      const listContainer = container.querySelector('#highlight-list-v2');
      listContainer.style.display = 'none';

      const {
        renderHighlightList,
      } = require('../../../../scripts/highlighter/ui/components/HighlightList.js');

      // 重置 mock 計數
      renderHighlightList.mockClear();

      const clickEvent = new MouseEvent('click');
      document.dispatchEvent(clickEvent);

      expect(renderHighlightList).not.toHaveBeenCalled();
    });
  });

  describe('bindColorPicker 分支覆蓋', () => {
    test('應該在顏色選擇器容器不存在時安全返回', () => {
      // 創建一個新的沒有 color-picker 的容器
      const newContainer = document.createElement('div');
      newContainer.innerHTML = '<span id="highlight-count-v2">0</span>';
      createToolbarContainer.mockReturnValue(newContainer);

      // 這個測試驗證構造函數不會拋出錯誤
      expect(() => new Toolbar(managerMock)).not.toThrow();
    });
  });
});
