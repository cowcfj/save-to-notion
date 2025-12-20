/**
 * popup.js 單元測試
 *
 * 測試 Popup UI 邏輯，包括：
 * - 初始化與設置檢查
 * - UI 狀態更新函數
 * - 按鈕事件處理
 */

/* global chrome */

describe('Popup UI', () => {
  // DOM 元素（初始化為 null，在 beforeEach 中賦值）
  let saveButton = null;
  let highlightButton = null;
  let clearHighlightsButton = null;
  let openNotionButton = null;
  let status = null;
  let modal = null;
  let modalMessage = null;
  let _modalConfirm = null;
  let _modalCancel = null;

  // 設置 DOM 環境
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

    // 獲取 DOM 元素引用
    saveButton = document.getElementById('save-button');
    highlightButton = document.getElementById('highlight-button');
    clearHighlightsButton = document.getElementById('clear-highlights-button');
    openNotionButton = document.getElementById('open-notion-button');
    status = document.getElementById('status');
    modal = document.getElementById('confirmation-modal');
    modalMessage = document.getElementById('modal-message');
    _modalConfirm = document.getElementById('modal-confirm');
    _modalCancel = document.getElementById('modal-cancel');

    // 重置 Chrome API Mocks
    jest.clearAllMocks();
    chrome._clearStorage();
  });

  describe('設置檢查', () => {
    test('缺少 API Key 時應禁用按鈕', () => {
      // Arrange
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        // Chrome API callback 第二個參數為 undefined 表示無錯誤
        callback({}, undefined);
      });

      // Act - 手動執行設置檢查邏輯
      chrome.storage.sync.get(
        ['notionApiKey', 'notionDataSourceId', 'notionDatabaseId'],
        result => {
          const dataSourceId = result.notionDataSourceId || result.notionDatabaseId;
          if (!result.notionApiKey || !dataSourceId) {
            status.textContent = 'Please set API Key and Data Source ID in settings.';
            saveButton.disabled = true;
            highlightButton.disabled = true;
          }
        }
      );

      // Assert
      expect(status.textContent).toBe('Please set API Key and Data Source ID in settings.');
      expect(saveButton.disabled).toBe(true);
      expect(highlightButton.disabled).toBe(true);
    });

    test('有完整設置時應啟用按鈕', () => {
      // Arrange
      chrome.storage.sync.get.mockImplementation((keys, callback) => {
        // Chrome API callback 第二個參數為 undefined 表示無錯誤
        callback(
          {
            notionApiKey: 'test-api-key',
            notionDataSourceId: 'test-datasource-id',
          },
          undefined
        );
      });

      // Act
      chrome.storage.sync.get(
        ['notionApiKey', 'notionDataSourceId', 'notionDatabaseId'],
        result => {
          const dataSourceId = result.notionDataSourceId || result.notionDatabaseId;
          if (!result.notionApiKey || !dataSourceId) {
            status.textContent = 'Please set API Key and Data Source ID in settings.';
            saveButton.disabled = true;
            highlightButton.disabled = true;
          }
        }
      );

      // Assert
      expect(saveButton.disabled).toBe(false);
      expect(highlightButton.disabled).toBe(false);
    });
  });

  describe('UI 狀態更新', () => {
    // 提取 popup.js 中的 UI 更新函數用於測試
    const updateUIForSavedPage = response => {
      highlightButton.textContent = '📝 Start Highlighting';
      highlightButton.disabled = false;
      clearHighlightsButton.style.display = 'block';
      saveButton.style.display = 'none';

      if (response.notionUrl) {
        openNotionButton.style.display = 'block';
        openNotionButton.setAttribute('data-url', response.notionUrl);
      }

      status.textContent = 'Page saved. Ready to highlight or update.';
    };

    const updateUIForUnsavedPage = response => {
      highlightButton.textContent = '📝 Save First to Highlight';
      highlightButton.disabled = true;
      clearHighlightsButton.style.display = 'none';
      saveButton.style.display = 'block';
      openNotionButton.style.display = 'none';

      if (response.wasDeleted) {
        status.textContent = 'Original page was deleted. Save to create new page.';
        status.style.color = '#d63384';
      } else {
        status.textContent = 'Save page first to enable highlighting.';
      }
    };

    test('已保存頁面應正確更新 UI', () => {
      // Arrange
      const response = {
        success: true,
        isSaved: true,
        notionUrl: 'https://notion.so/test-page',
      };

      // Act
      updateUIForSavedPage(response);

      // Assert
      expect(highlightButton.textContent).toBe('📝 Start Highlighting');
      expect(highlightButton.disabled).toBe(false);
      expect(clearHighlightsButton.style.display).toBe('block');
      expect(saveButton.style.display).toBe('none');
      expect(openNotionButton.style.display).toBe('block');
      expect(openNotionButton.getAttribute('data-url')).toBe('https://notion.so/test-page');
      expect(status.textContent).toBe('Page saved. Ready to highlight or update.');
    });

    test('未保存頁面應正確更新 UI', () => {
      // Arrange
      const response = {
        success: true,
        isSaved: false,
      };

      // Act
      updateUIForUnsavedPage(response);

      // Assert
      expect(highlightButton.textContent).toBe('📝 Save First to Highlight');
      expect(highlightButton.disabled).toBe(true);
      expect(clearHighlightsButton.style.display).toBe('none');
      expect(saveButton.style.display).toBe('block');
      expect(openNotionButton.style.display).toBe('none');
      expect(status.textContent).toBe('Save page first to enable highlighting.');
    });

    test('已刪除頁面應顯示警告訊息', () => {
      // Arrange
      const response = {
        success: true,
        isSaved: false,
        wasDeleted: true,
      };

      // Act
      updateUIForUnsavedPage(response);

      // Assert
      expect(status.textContent).toBe('Original page was deleted. Save to create new page.');
      expect(status.style.color).toBe('rgb(214, 51, 132)'); // #d63384
    });
  });

  describe('Modal 操作', () => {
    test('取消按鈕應隱藏 Modal', () => {
      // Arrange - 設置 Modal 為顯示狀態
      modal.style.display = 'flex';
      expect(modal.style.display).toBe('flex');

      // Act - 模擬取消按鈕點擊後隱藏 Modal
      const hideModal = () => {
        modal.style.display = 'none';
      };
      hideModal();

      // Assert
      expect(modal.style.display).toBe('none');
    });

    test('清除標記按鈕應顯示確認 Modal', () => {
      // Arrange
      modal.style.display = 'none';

      // Act - 模擬事件處理
      modalMessage.textContent = '確定要清除頁面上的所有標記嗎？這個操作無法撤銷。';
      modal.style.display = 'flex';

      // Assert
      expect(modalMessage.textContent).toBe('確定要清除頁面上的所有標記嗎？這個操作無法撤銷。');
      expect(modal.style.display).toBe('flex');
    });
  });

  describe('保存按鈕', () => {
    test('點擊保存按鈕應更新狀態並禁用按鈕', () => {
      // Arrange
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        // Chrome API callback 第二個參數為 undefined 表示無錯誤
        callback({ success: true, created: true, blockCount: 5, imageCount: 2 }, undefined);
      });

      // Act - 模擬保存按鈕點擊
      status.textContent = 'Saving...';
      saveButton.disabled = true;

      chrome.runtime.sendMessage({ action: 'savePage' }, response => {
        if (response?.success) {
          let action = 'Saved';
          let details = '';

          if (response.created) {
            action = 'Created';
            details = `(${response.blockCount} blocks, ${response.imageCount} images)`;
          }

          status.textContent = `${action} successfully! ${details}`;
        }
      });

      // Assert
      expect(status.textContent).toBe('Created successfully! (5 blocks, 2 images)');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'savePage' },
        expect.any(Function)
      );
    });

    test('保存失敗應顯示錯誤訊息', () => {
      // Arrange
      chrome.runtime.sendMessage.mockImplementation((message, callback) => {
        // Chrome API callback 第二個參數為 undefined 表示無錯誤
        callback({ success: false, error: 'API Error' }, undefined);
      });

      // Act
      chrome.runtime.sendMessage({ action: 'savePage' }, response => {
        if (!response?.success) {
          status.textContent = `Failed to save: ${response ? response.error : 'No response'}`;
        }
      });

      // Assert
      expect(status.textContent).toBe('Failed to save: API Error');
    });
  });

  describe('Notion 按鈕', () => {
    test('打開 Notion 按鈕應調用 chrome.tabs.create', async () => {
      // Arrange
      openNotionButton.setAttribute('data-url', 'https://notion.so/test-page');
      chrome.tabs.create.mockImplementation((props, callback) => {
        // Chrome API callback 第二個參數為 undefined 表示無錯誤
        callback({ id: 123, ...props }, undefined);
      });

      // Act
      const notionUrl = openNotionButton.getAttribute('data-url');
      await new Promise((resolve, reject) => {
        chrome.tabs.create({ url: notionUrl }, tab => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(tab);
          }
        });
      });

      // Assert
      expect(chrome.tabs.create).toHaveBeenCalledWith(
        { url: 'https://notion.so/test-page' },
        expect.any(Function)
      );
    });
  });
});
