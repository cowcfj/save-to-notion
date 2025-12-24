/**
 * Popup 入口文件
 *
 * 職責：
 * - 獲取 DOM 元素
 * - 綁定事件監聯器
 * - 調用 UI 和 Actions 模組
 */

/* global chrome */

import {
  getElements,
  setStatus,
  setButtonState,
  updateUIForSavedPage,
  updateUIForUnsavedPage,
  showModal,
  hideModal,
  formatSaveSuccessMessage,
} from './popupUI.js';
import {
  checkSettings,
  checkPageStatus,
  savePage,
  startHighlight,
  openNotionPage,
  getActiveTab,
  clearHighlights,
} from './popupActions.js';
import Logger from '../scripts/utils/Logger.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 獲取所有 DOM 元素
  const elements = getElements();

  // 檢查設置
  const settings = await checkSettings();
  if (!settings.valid) {
    setStatus(elements, 'Please set API Key and Data Source ID in settings.');
    setButtonState(elements.saveButton, true);
    setButtonState(elements.highlightButton, true);
    return;
  }

  // 檢查頁面狀態並更新 UI（強制刷新以獲取最新狀態）
  try {
    if (typeof checkPageStatus !== 'function') {
      throw new Error('checkPageStatus is not a function');
    }

    const pageStatus = await checkPageStatus({ forceRefresh: true });

    if (pageStatus?.success) {
      if (pageStatus.isSaved) {
        if (typeof updateUIForSavedPage === 'function') {
          updateUIForSavedPage(elements, pageStatus);
        } else {
          Logger.error('updateUIForSavedPage is not a function');
        }
      } else if (typeof updateUIForUnsavedPage === 'function') {
        updateUIForUnsavedPage(elements, pageStatus);
      } else {
        Logger.error('updateUIForUnsavedPage is not a function');
      }
    }
  } catch (error) {
    Logger.error('Failed to initialize popup:', error);
    setStatus(elements, 'Error initializing popup. Please close and reopen.', '#d63384');
  }

  // ========== 事件監聽器 ==========

  // 保存按鈕
  elements.saveButton.addEventListener('click', async () => {
    setStatus(elements, 'Saving...');
    setButtonState(elements.saveButton, true);

    const response = await savePage();

    if (response?.success) {
      const message = formatSaveSuccessMessage(response);
      setStatus(elements, message);

      // 直接更新 UI，避免額外的 API 請求和潛在的一致性延遲
      // Mapping savePage response to pageStatus format
      const directPageStatus = {
        success: true,
        isSaved: true,
        notionUrl: response.url,
        // notionPageId 並非必須用於 updateUIForSavedPage，除非需要鏈接
        notionPageId: response.notionPageId || response.pageId,
        title: response.title || 'Untitled',
      };

      if (typeof updateUIForSavedPage === 'function') {
        updateUIForSavedPage(elements, directPageStatus);
      } else {
        Logger.error('updateUIForSavedPage is not a function');
      }

      // 🔑 保存完成後，通知 Content Script 創建並顯示 Toolbar
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { action: 'showToolbar' });
        }
      } catch (error) {
        // 如果 Content Script 尚未注入，忽略錯誤
        Logger.warn('Failed to show toolbar after save:', error);
      }
    } else {
      setStatus(elements, `Failed to save: ${response?.error || 'No response'}`);
    }

    // 延遲後重新啟用按鈕
    setTimeout(() => {
      setButtonState(elements.saveButton, false);
    }, 3000);
  });

  // 標記按鈕
  elements.highlightButton.addEventListener('click', async () => {
    // 檢查頁面是否已保存
    const statusResponse = await checkPageStatus({ forceRefresh: true });

    if (!statusResponse?.isSaved) {
      setStatus(elements, 'Please save the page first!', '#d63384');
      setTimeout(() => {
        setStatus(elements, 'Save page first to enable highlighting.');
      }, 2000);
      return;
    }

    // 啟動標記模式
    setStatus(elements, 'Starting highlight mode...');
    setButtonState(elements.highlightButton, true);

    const response = await startHighlight();

    if (response?.success) {
      setStatus(elements, 'Highlight mode activated!');
      setTimeout(() => {
        window.close();
      }, 1000);
    } else {
      setStatus(elements, 'Failed to start highlight mode.');
      console.error('Error:', response?.error);
    }

    setTimeout(() => {
      setButtonState(elements.highlightButton, false);
    }, 2000);
  });

  // 打開 Notion 按鈕
  elements.openNotionButton.addEventListener('click', async () => {
    const notionUrl = elements.openNotionButton.getAttribute('data-url');
    if (notionUrl) {
      const result = await openNotionPage(notionUrl);
      if (!result.success) {
        setStatus(elements, 'Failed to open Notion page.');
        console.error('Error:', result.error);
      }
    }
  });

  // 清除標記按鈕
  elements.clearHighlightsButton.addEventListener('click', () => {
    showModal(elements, '確定要清除頁面上的所有標記嗎？這個操作無法撤銷。');
  });

  // Modal 取消按鈕
  elements.modalCancel.addEventListener('click', () => {
    hideModal(elements);
  });

  // Modal 確認按鈕
  elements.modalConfirm.addEventListener('click', async () => {
    hideModal(elements);
    setStatus(elements, 'Clearing highlights...');
    setButtonState(elements.clearHighlightsButton, true);

    const activeTab = await getActiveTab();
    if (!activeTab?.id) {
      setStatus(elements, 'Failed to clear highlights.');
      setButtonState(elements.clearHighlightsButton, false);
      return;
    }

    const result = await clearHighlights(activeTab.id, activeTab.url);

    if (result.success) {
      setStatus(elements, `Cleared ${result.clearedCount} highlights successfully!`);
      setTimeout(() => {
        setButtonState(elements.clearHighlightsButton, false);
        setStatus(elements, 'Page saved. Ready to highlight or save again.');
      }, 2000);
    } else {
      setStatus(elements, 'Failed to clear highlights.');
      setButtonState(elements.clearHighlightsButton, false);
      console.error('Error:', result.error);
    }
  });
});
