/**
 * Popup 入口文件
 *
 * 職責：
 * - 獲取 DOM 元素
 * - 綁定事件監聽器
 * - 調用 UI 和 Actions 模組
 */

import * as UI from './popupUI.js';
import * as Actions from './popupActions.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 獲取所有 DOM 元素
  const elements = UI.getElements();

  // 檢查設置
  const settings = await Actions.checkSettings();
  if (!settings.valid) {
    UI.setStatus(elements, 'Please set API Key and Data Source ID in settings.');
    UI.setButtonState(elements.saveButton, true);
    UI.setButtonState(elements.highlightButton, true);
    return;
  }

  // 檢查頁面狀態並更新 UI
  const pageStatus = await Actions.checkPageStatus();
  if (pageStatus?.success) {
    if (pageStatus.isSaved) {
      UI.updateUIForSavedPage(elements, pageStatus);
    } else {
      UI.updateUIForUnsavedPage(elements, pageStatus);
    }
  }

  // ========== 事件監聽器 ==========

  // 保存按鈕
  elements.saveButton.addEventListener('click', async () => {
    UI.setStatus(elements, 'Saving...');
    UI.setButtonState(elements.saveButton, true);

    const response = await Actions.savePage();

    if (response?.success) {
      const message = UI.formatSaveSuccessMessage(response);
      UI.setStatus(elements, message);

      // 更新圖標徽章
      await Actions.checkPageStatus();
    } else {
      UI.setStatus(elements, `Failed to save: ${response?.error || 'No response'}`);
    }

    // 延遲後重新啟用按鈕
    setTimeout(() => {
      UI.setButtonState(elements.saveButton, false);
    }, 3000);
  });

  // 標記按鈕
  elements.highlightButton.addEventListener('click', async () => {
    // 檢查頁面是否已保存
    const statusResponse = await Actions.checkPageStatus();

    if (!statusResponse?.isSaved) {
      UI.setStatus(elements, 'Please save the page first!', '#d63384');
      setTimeout(() => {
        UI.setStatus(elements, 'Save page first to enable highlighting.');
      }, 2000);
      return;
    }

    // 啟動標記模式
    UI.setStatus(elements, 'Starting highlight mode...');
    UI.setButtonState(elements.highlightButton, true);

    const response = await Actions.startHighlight();

    if (response?.success) {
      UI.setStatus(elements, 'Highlight mode activated!');
      setTimeout(() => {
        window.close();
      }, 1000);
    } else {
      UI.setStatus(elements, 'Failed to start highlight mode.');
      console.error('Error:', response?.error);
    }

    setTimeout(() => {
      UI.setButtonState(elements.highlightButton, false);
    }, 2000);
  });

  // 打開 Notion 按鈕
  elements.openNotionButton.addEventListener('click', async () => {
    const notionUrl = elements.openNotionButton.getAttribute('data-url');
    if (notionUrl) {
      const result = await Actions.openNotionPage(notionUrl);
      if (!result.success) {
        UI.setStatus(elements, 'Failed to open Notion page.');
        console.error('Error:', result.error);
      }
    }
  });

  // 清除標記按鈕
  elements.clearHighlightsButton.addEventListener('click', () => {
    UI.showModal(elements, '確定要清除頁面上的所有標記嗎？這個操作無法撤銷。');
  });

  // Modal 取消按鈕
  elements.modalCancel.addEventListener('click', () => {
    UI.hideModal(elements);
  });

  // Modal 確認按鈕
  elements.modalConfirm.addEventListener('click', async () => {
    UI.hideModal(elements);
    UI.setStatus(elements, 'Clearing highlights...');
    UI.setButtonState(elements.clearHighlightsButton, true);

    const activeTab = await Actions.getActiveTab();
    if (!activeTab?.id) {
      UI.setStatus(elements, 'Failed to clear highlights.');
      UI.setButtonState(elements.clearHighlightsButton, false);
      return;
    }

    const result = await Actions.clearHighlights(activeTab.id);

    if (result.success) {
      UI.setStatus(elements, `Cleared ${result.clearedCount} highlights successfully!`);
      setTimeout(() => {
        UI.setButtonState(elements.clearHighlightsButton, false);
        UI.setStatus(elements, 'Page saved. Ready to highlight or save again.');
      }, 2000);
    } else {
      UI.setStatus(elements, 'Failed to clear highlights.');
      UI.setButtonState(elements.clearHighlightsButton, false);
      console.error('Error:', result.error);
    }
  });
});
