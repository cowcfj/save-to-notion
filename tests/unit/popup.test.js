/**
 * Popup 模組單元測試
 *
 * 測試 popupUI.js 和 popupActions.js 的邏輯
 */

/* global chrome */

// 匯入被測試的模組
import {
  getElements,
  setStatus,
  setButtonState,
  updateUIForSavedPage,
  updateUIForUnsavedPage,
  formatSaveSuccessMessage,
} from '../../popup/popupUI.js';
import {
  checkSettings,
  checkPageStatus,
  savePage,
  openNotionPage,
  startHighlight,
  getActiveTab,
} from '../../popup/popupActions.js';
import { ERROR_MESSAGES } from '../../scripts/config/shared/messages.js';

describe('popupUI', () => {
  // DOM 元素 Mock
  let elements = null;

  beforeEach(() => {
    // 創建 popup.html 所需的 DOM 結構
    document.body.innerHTML = `
      <div id="status"></div>
      <button id="save-button">Save</button>
      <button id="highlight-button"><span class="btn-text">Highlight</span></button>
      <button id="manage-button">Manage</button>
      <button id="open-notion-button" style="display: none;" data-url="">Open Notion</button>
    `;

    elements = getElements();
    jest.clearAllMocks();
  });

  describe('getElements', () => {
    test('應返回所有 DOM 元素', () => {
      expect(elements.saveButton).toBeTruthy();
      expect(elements.highlightButton).toBeTruthy();
      expect(elements.manageButton).toBeTruthy();
      expect(elements.openNotionButton).toBeTruthy();
      expect(elements.status).toBeTruthy();
      expect(elements).not.toHaveProperty('clearHighlightsButton');
      expect(elements).not.toHaveProperty('modal');
      expect(elements).not.toHaveProperty('modalMessage');
      expect(elements).not.toHaveProperty('modalConfirm');
      expect(elements).not.toHaveProperty('modalCancel');
    });
  });

  describe('setStatus', () => {
    test('應設置狀態文字', () => {
      setStatus(elements, 'Test message');
      expect(elements.status.textContent).toBe('Test message');
    });

    test('應設置狀態文字和顏色', () => {
      setStatus(elements, 'Warning', '#d63384');
      expect(elements.status.textContent).toBe('Warning');
      expect(elements.status.style.color).toBe('rgb(214, 51, 132)');
    });
  });

  describe('setButtonState', () => {
    test('應禁用按鈕', () => {
      setButtonState(elements.saveButton, true);
      expect(elements.saveButton.disabled).toBe(true);
    });

    test('應啟用按鈕', () => {
      elements.saveButton.disabled = true;
      setButtonState(elements.saveButton, false);
      expect(elements.saveButton.disabled).toBe(false);
    });
  });

  describe('updateUIForSavedPage', () => {
    test('應正確更新已保存頁面的 UI', () => {
      const response = {
        success: true,
        isSaved: true,
        notionUrl: 'https://notion.so/test-page',
      };

      updateUIForSavedPage(elements, response);

      expect(elements.highlightButton.textContent).toBe('開始標註');
      expect(elements.highlightButton.disabled).toBe(false);
      expect(elements.saveButton.style.display).toBe('none');
      expect(elements.openNotionButton.style.display).toBe('block');
      expect(elements.openNotionButton.dataset.url).toBe('https://notion.so/test-page');
      expect(elements.status.textContent).toBe('頁面已儲存，可開始標註。');
    });
  });

  describe('updateUIForUnsavedPage', () => {
    test('應正確更新未保存頁面的 UI', () => {
      const response = { success: true, isSaved: false };

      updateUIForUnsavedPage(elements, response);

      // Highlight-First 模式：即使未保存也不禁用標記按鈕
      expect(elements.highlightButton.disabled).toBe(false);
      expect(elements.saveButton.style.display).toBe('block');
      expect(elements.openNotionButton.style.display).toBe('none');
      expect(elements.status.textContent).toBe('開始標註');
    });

    test('已刪除頁面應顯示警告訊息', () => {
      const response = { success: true, isSaved: false, wasDeleted: true };

      updateUIForUnsavedPage(elements, response);

      expect(elements.status.textContent).toBe('原頁面已刪除，請重新儲存。');
      expect(elements.status.style.color).toBe('rgb(214, 51, 132)');
    });
  });

  describe('formatSaveSuccessMessage', () => {
    test('應格式化創建成功訊息 (複數)', () => {
      const response = { success: true, created: true, blockCount: 5, imageCount: 2 };
      const message = formatSaveSuccessMessage(response);
      expect(message).toBe('建立成功 (5 blocks, 2 images)');
    });

    test('應格式化創建成功訊息 (單數)', () => {
      const response = { success: true, created: true, blockCount: 1, imageCount: 1 };
      const message = formatSaveSuccessMessage(response);
      expect(message).toBe('建立成功 (1 block, 1 image)');
    });

    test('應格式化更新成功訊息 (混合單複數)', () => {
      const response = { success: true, updated: true, blockCount: 1, imageCount: 2 };
      const message = formatSaveSuccessMessage(response);
      expect(message).toBe('更新成功 (1 block, 2 images)');
    });

    test('應格式化標記更新訊息', () => {
      const response = { success: true, highlightsUpdated: true, highlightCount: 10 };
      const message = formatSaveSuccessMessage(response);
      expect(message).toBe('標註已更新 (10 highlights)');
    });

    test('應格式化高亮更新訊息 (單數)', () => {
      const response = { success: true, highlightsUpdated: true, highlightCount: 1 };
      const message = formatSaveSuccessMessage(response);
      expect(message).toBe('標註已更新 (1 highlight)');
    });

    test('應包含警告訊息', () => {
      const response = {
        success: true,
        created: true,
        blockCount: 5,
        imageCount: 2,
        warning: 'Some images filtered',
      };
      const message = formatSaveSuccessMessage(response);

      // 因為包含警告時會返回陣列
      expect(Array.isArray(message)).toBe(true);
      expect(message).toContain('Some images filtered');

      // 檢查是否包含 SVG 物件
      const hasSvg = message.some(
        part => typeof part === 'object' && part.type === 'svg' && part.content.includes('<svg')
      );
      expect(hasSvg).toBe(true);
    });
  });
});

describe('popupActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome._clearStorage();
  });

  describe('checkSettings', () => {
    test('設置完整時應返回 valid: true', async () => {
      const mockSyncData = {
        notionApiKey: 'test-key',
      };
      const mockLocalData = {
        notionDataSourceId: 'test-datasource',
      };
      chrome.storage.sync.get.mockImplementation((keys, respond) => {
        if (respond) {
          respond(mockSyncData);
        }
        return Promise.resolve(mockSyncData);
      });
      chrome.storage.local.get.mockImplementation((keys, respond) => {
        if (respond) {
          respond(mockLocalData);
        }
        return Promise.resolve(mockLocalData);
      });

      const result = await checkSettings();

      expect(result.valid).toBe(true);
      expect(result.apiKey).toBe('test-key');
      expect(result.dataSourceId).toBe('test-datasource');
    });

    test('缺少設置時應返回 valid: false', async () => {
      const mockData = {};
      chrome.storage.sync.get.mockImplementation((keys, respond) => {
        if (respond) {
          respond(mockData);
        }
        return Promise.resolve(mockData);
      });
      chrome.storage.local.get.mockImplementation((keys, respond) => {
        if (respond) {
          respond(mockData);
        }
        return Promise.resolve(mockData);
      });

      const result = await checkSettings();

      expect(result.valid).toBe(false);
    });
  });

  describe('checkPageStatus', () => {
    test('應返回頁面狀態', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        isSaved: true,
        notionUrl: 'https://notion.so/test',
      });

      const result = await checkPageStatus();

      expect(result.success).toBe(true);
      expect(result.isSaved).toBe(true);
      expect(result.notionUrl).toBe('https://notion.so/test');
    });
  });

  describe('savePage', () => {
    test('保存成功應返回結果', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, created: true, blockCount: 5 });

      const result = await savePage();

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'savePage' });
    });
  });
});

describe('startHighlight', () => {
  test('啟動標記模式應返回成功', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({ success: true });

    const result = await startHighlight();

    expect(result.success).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'startHighlight' });
  });

  test('發生錯誤時應返回錯誤訊息', async () => {
    // 使用無響應模擬網絡錯誤，讓實際實現的 catch 块處理
    chrome.runtime.sendMessage.mockResolvedValue();

    const result = await startHighlight();

    expect(result.success).toBe(false);
    expect(result.error).toBe(ERROR_MESSAGES.TECHNICAL.BACKGROUND_NO_RESPONSE);
  });
});

describe('getActiveTab', () => {
  test('應返回當前活動標籤頁', async () => {
    chrome.tabs.query.mockResolvedValue([{ id: 123, url: 'https://example.com' }]);

    const tab = await getActiveTab();

    expect(tab).toEqual({ id: 123, url: 'https://example.com' });
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  test('如果沒有活動標籤頁應返回 null', async () => {
    chrome.tabs.query.mockImplementation((queryInfo, respond) => {
      respond([]);
    });

    const tab = await getActiveTab();

    expect(tab).toBeNull();
  });
});

describe('openNotionPage', () => {
  test('應打開新標籤頁', async () => {
    chrome.tabs.create.mockResolvedValue({ id: 123, url: 'https://notion.so/test' });

    const result = await openNotionPage('https://notion.so/test');

    expect(result.success).toBe(true);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://notion.so/test' });
  });
});

describe('initPopup integration', () => {
  beforeEach(() => {
    // 創建 popup.html 所需的 DOM 結構
    document.body.innerHTML = `
      <div id="status"></div>
      <button id="save-button">Save</button>
      <button id="highlight-button"><span class="btn-text">Highlight</span></button>
      <button id="manage-button">Manage</button>
      <button id="open-notion-button" style="display: none;">Open Notion</button>
    `;
    jest.clearAllMocks();
    chrome._clearStorage();
  });

  test('保存成功後應發送 showToolbar 訊息給 content script', async () => {
    // 動態 import initPopup
    const { initPopup } = await import('../../popup/popup.js');

    // Mock 設置完整
    const mockSyncSettings = {
      notionApiKey: 'test-key',
    };
    const mockLocalSettings = {
      notionDataSourceId: 'test-datasource',
    };
    chrome.storage.sync.get.mockResolvedValue(mockSyncSettings);
    chrome.storage.local.get.mockResolvedValue(mockLocalSettings);

    // Mock 頁面狀態：未保存
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      isSaved: false,
    });

    // Mock tabs.query 返回活動標籤頁
    chrome.tabs.query.mockResolvedValue([{ id: 123, url: 'https://example.com' }]);

    // Mock tabs.sendMessage 成功
    chrome.tabs.sendMessage.mockResolvedValue({});

    // 初始化 popup
    await initPopup();

    // 模擬點擊保存按鈕
    const saveButton = document.querySelector('#save-button');

    // Mock savePage 成功響應
    chrome.runtime.sendMessage.mockResolvedValueOnce({
      success: true,
      created: true,
      url: 'https://notion.so/test-page',
      notionPageId: 'page-123',
      title: 'Test Page',
      blockCount: 5,
      imageCount: 2,
    });

    // 點擊保存按鈕
    saveButton.click();

    // 等待異步操作完成
    await new Promise(resolve => setTimeout(resolve, 100));

    // 驗證是否調用了 tabs.sendMessage
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, { action: 'showToolbar' });
  });

  test('Content Script 未注入時應忽略錯誤', async () => {
    // 動態 import initPopup
    const { initPopup } = await import('../../popup/popup.js');

    // Mock 設置完整
    const mockSyncSettings = {
      notionApiKey: 'test-key',
    };
    const mockLocalSettings = {
      notionDataSourceId: 'test-datasource',
    };
    chrome.storage.sync.get.mockResolvedValue(mockSyncSettings);
    chrome.storage.local.get.mockResolvedValue(mockLocalSettings);

    // Mock 頁面狀態：未保存
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      isSaved: false,
    });

    // Mock tabs.query 返回活動標籤頁
    chrome.tabs.query.mockResolvedValue([{ id: 123, url: 'https://example.com' }]);

    // Mock tabs.sendMessage 拋出錯誤（模擬 content script 未注入）
    chrome.tabs.sendMessage.mockRejectedValue(new Error('Could not establish connection'));

    // 初始化 popup
    await initPopup();

    // 模擬點擊保存按鈕
    const saveButton = document.querySelector('#save-button');

    // Mock savePage 成功響應
    chrome.runtime.sendMessage.mockResolvedValueOnce({
      success: true,
      created: true,
      url: 'https://notion.so/test-page',
      notionPageId: 'page-123',
      title: 'Test Page',
      blockCount: 5,
      imageCount: 2,
    });

    // 點擊保存按鈕（應該不會拋出錯誤）
    expect(() => saveButton.click()).not.toThrow();

    // 等待異步操作完成
    await new Promise(resolve => setTimeout(resolve, 100));

    // 驗證調用了 tabs.sendMessage，但錯誤被捕獲
    expect(chrome.tabs.sendMessage).toHaveBeenCalled();
  });
});
