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
  showModal,
  hideModal,
  formatSaveSuccessMessage,
} from '../../popup/popupUI.js';
import {
  checkSettings,
  checkPageStatus,
  savePage,
  openNotionPage,
  // clearHighlights is implicitly tested via popup.js flow in E2E but ensuring unit test coverage here if present
} from '../../popup/popupActions.js';

describe('popupUI', () => {
  // DOM 元素 Mock
  let elements = null;

  beforeEach(() => {
    // 創建 popup.html 所需的 DOM 結構
    document.body.innerHTML = `
      <div id="status"></div>
      <button id="save-button">Save</button>
      <button id="highlight-button">Highlight</button>
      <button id="clear-highlights-button" style="display: none;">Clear</button>
      <button id="open-notion-button" style="display: none;">Open Notion</button>
      <div id="confirmation-modal" style="display: none;">
        <p id="modal-message"></p>
        <button id="modal-confirm">確認</button>
        <button id="modal-cancel">取消</button>
      </div>
    `;

    elements = getElements();
    jest.clearAllMocks();
  });

  describe('getElements', () => {
    test('應返回所有 DOM 元素', () => {
      expect(elements.saveButton).toBeTruthy();
      expect(elements.highlightButton).toBeTruthy();
      expect(elements.clearHighlightsButton).toBeTruthy();
      expect(elements.openNotionButton).toBeTruthy();
      expect(elements.status).toBeTruthy();
      expect(elements.modal).toBeTruthy();
      expect(elements.modalMessage).toBeTruthy();
      expect(elements.modalConfirm).toBeTruthy();
      expect(elements.modalCancel).toBeTruthy();
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

      expect(elements.highlightButton.textContent).toBe('📝 Start Highlighting');
      expect(elements.highlightButton.disabled).toBe(false);
      expect(elements.clearHighlightsButton.style.display).toBe('block');
      expect(elements.saveButton.style.display).toBe('none');
      expect(elements.openNotionButton.style.display).toBe('block');
      expect(elements.openNotionButton.getAttribute('data-url')).toBe(
        'https://notion.so/test-page'
      );
      expect(elements.status.textContent).toBe('Page saved. Ready to highlight or update.');
    });
  });

  describe('updateUIForUnsavedPage', () => {
    test('應正確更新未保存頁面的 UI', () => {
      const response = { success: true, isSaved: false };

      updateUIForUnsavedPage(elements, response);

      expect(elements.highlightButton.textContent).toBe('📝 Save First to Highlight');
      expect(elements.highlightButton.disabled).toBe(true);
      expect(elements.clearHighlightsButton.style.display).toBe('none');
      expect(elements.saveButton.style.display).toBe('block');
      expect(elements.openNotionButton.style.display).toBe('none');
      expect(elements.status.textContent).toBe('Save page first to enable highlighting.');
    });

    test('已刪除頁面應顯示警告訊息', () => {
      const response = { success: true, isSaved: false, wasDeleted: true };

      updateUIForUnsavedPage(elements, response);

      expect(elements.status.textContent).toBe(
        'Original page was deleted. Save to create new page.'
      );
      expect(elements.status.style.color).toBe('rgb(214, 51, 132)');
    });
  });

  describe('showModal / hideModal', () => {
    test('showModal 應顯示對話框並設置訊息', () => {
      showModal(elements, '確定要清除嗎？');

      expect(elements.modal.style.display).toBe('flex');
      expect(elements.modalMessage.textContent).toBe('確定要清除嗎？');
    });

    test('hideModal 應隱藏對話框', () => {
      elements.modal.style.display = 'flex';

      hideModal(elements);

      expect(elements.modal.style.display).toBe('none');
    });
  });

  describe('formatSaveSuccessMessage', () => {
    test('應格式化創建成功訊息 (複數)', () => {
      const response = { success: true, created: true, blockCount: 5, imageCount: 2 };
      const message = formatSaveSuccessMessage(response);
      expect(message).toBe('Created successfully! (5 blocks, 2 images)');
    });

    test('應格式化創建成功訊息 (單數)', () => {
      const response = { success: true, created: true, blockCount: 1, imageCount: 1 };
      const message = formatSaveSuccessMessage(response);
      expect(message).toBe('Created successfully! (1 block, 1 image)');
    });

    test('應格式化更新成功訊息 (混合單複數)', () => {
      const response = { success: true, updated: true, blockCount: 1, imageCount: 2 };
      const message = formatSaveSuccessMessage(response);
      expect(message).toBe('Updated successfully! (1 block, 2 images)');
    });

    test('應格式化標記更新訊息', () => {
      const response = { success: true, highlightsUpdated: true, highlightCount: 10 };
      const message = formatSaveSuccessMessage(response);
      expect(message).toBe('Highlights updated successfully! (10 highlights)');
    });

    test('應格式化高亮更新訊息 (單數)', () => {
      const response = { success: true, highlightsUpdated: true, highlightCount: 1 };
      const message = formatSaveSuccessMessage(response);
      expect(message).toBe('Highlights updated successfully! (1 highlight)');
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
      expect(message).toContain('⚠️ Some images filtered');
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
      const mockData = {
        notionApiKey: 'test-key',
        notionDataSourceId: 'test-datasource',
      };
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        if (callback) {
          callback(mockData);
        }
        return Promise.resolve(mockData);
      });

      const result = await checkSettings();

      expect(result.valid).toBe(true);
      expect(result.apiKey).toBe('test-key');
      expect(result.dataSourceId).toBe('test-datasource');
    });

    test('缺少設置時應返回 valid: false', async () => {
      const mockData = {};
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        if (callback) {
          callback(mockData);
        }
        return Promise.resolve(mockData);
      });

      const result = await checkSettings();

      expect(result.valid).toBe(false);
    });
  });

  describe('checkPageStatus', () => {
    test('應返回頁面狀態', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ success: true, isSaved: true, notionUrl: 'https://notion.so/test' });
      });

      const result = await checkPageStatus();

      expect(result.success).toBe(true);
      expect(result.isSaved).toBe(true);
      expect(result.notionUrl).toBe('https://notion.so/test');
    });
  });

  describe('savePage', () => {
    test('保存成功應返回結果', async () => {
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ success: true, created: true, blockCount: 5 });
      });

      const result = await savePage();

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'savePage' },
        expect.any(Function)
      );
    });
  });

  describe('openNotionPage', () => {
    test('應打開新標籤頁', async () => {
      chrome.tabs.create.mockImplementation((props, callback) => {
        callback({ id: 123, ...props });
      });

      const result = await openNotionPage('https://notion.so/test');

      expect(result.success).toBe(true);
      expect(chrome.tabs.create).toHaveBeenCalledWith(
        { url: 'https://notion.so/test' },
        expect.any(Function)
      );
    });
  });
});
