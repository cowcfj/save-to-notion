/**
 * Popup UI 狀態管理模組
 *
 * 提供純函數來更新 Popup UI 狀態，便於單元測試。
 * 這些函數不直接依賴 Chrome API，僅操作 DOM 元素。
 */

/**
 * DOM 元素集合類型定義
 * @typedef {Object} PopupElements
 * @property {HTMLButtonElement} saveButton - 保存按鈕
 * @property {HTMLButtonElement} highlightButton - 標記按鈕
 * @property {HTMLButtonElement} clearHighlightsButton - 清除標記按鈕
 * @property {HTMLButtonElement} openNotionButton - 打開 Notion 按鈕
 * @property {HTMLElement} status - 狀態顯示元素
 * @property {HTMLElement} modal - 確認對話框
 * @property {HTMLElement} modalMessage - 對話框訊息
 * @property {HTMLButtonElement} modalConfirm - 確認按鈕
 * @property {HTMLButtonElement} modalCancel - 取消按鈕
 */

/**
 * 獲取所有 Popup DOM 元素
 * @returns {PopupElements}
 */
export function getElements() {
  return {
    saveButton: document.getElementById('save-button'),
    highlightButton: document.getElementById('highlight-button'),
    clearHighlightsButton: document.getElementById('clear-highlights-button'),
    openNotionButton: document.getElementById('open-notion-button'),
    status: document.getElementById('status'),
    modal: document.getElementById('confirmation-modal'),
    modalMessage: document.getElementById('modal-message'),
    modalConfirm: document.getElementById('modal-confirm'),
    modalCancel: document.getElementById('modal-cancel'),
  };
}

/**
 * 設置狀態文字
 * @param {PopupElements} elements - DOM 元素集合
 * @param {string} text - 狀態文字
 * @param {string} [color=''] - 文字顏色（可選）
 */
export function setStatus(elements, text, color = '') {
  if (elements.status) {
    elements.status.textContent = text;
    elements.status.style.color = color;
  }
}

/**
 * 設置按鈕狀態
 * @param {HTMLButtonElement} button - 按鈕元素
 * @param {boolean} disabled - 是否禁用
 */
export function setButtonState(button, disabled) {
  if (button) {
    button.disabled = disabled;
  }
}

/**
 * 更新 UI 為「已保存」狀態
 * @param {PopupElements} elements - DOM 元素集合
 * @param {Object} response - 頁面狀態響應
 * @param {string} [response.notionUrl] - Notion 頁面 URL
 */
export function updateUIForSavedPage(elements, response) {
  // 啟用標記按鈕
  if (elements.highlightButton) {
    elements.highlightButton.textContent = '📝 Start Highlighting';
    elements.highlightButton.disabled = false;
  }

  // 顯示清除按鈕
  if (elements.clearHighlightsButton) {
    elements.clearHighlightsButton.style.display = 'block';
  }

  // 隱藏保存按鈕
  if (elements.saveButton) {
    elements.saveButton.style.display = 'none';
  }

  // 顯示打開 Notion 按鈕
  if (response.notionUrl && elements.openNotionButton) {
    elements.openNotionButton.style.display = 'block';
    elements.openNotionButton.setAttribute('data-url', response.notionUrl);
  }

  // 更新狀態
  setStatus(elements, 'Page saved. Ready to highlight or update.');
}

/**
 * 更新 UI 為「未保存」狀態
 * @param {PopupElements} elements - DOM 元素集合
 * @param {Object} response - 頁面狀態響應
 * @param {boolean} [response.wasDeleted] - 頁面是否已被刪除
 */
export function updateUIForUnsavedPage(elements, response) {
  // 禁用標記按鈕
  if (elements.highlightButton) {
    elements.highlightButton.textContent = '📝 Save First to Highlight';
    elements.highlightButton.disabled = true;
  }

  // 隱藏清除按鈕
  if (elements.clearHighlightsButton) {
    elements.clearHighlightsButton.style.display = 'none';
  }

  // 顯示保存按鈕
  if (elements.saveButton) {
    elements.saveButton.style.display = 'block';
  }

  // 隱藏打開 Notion 按鈕
  if (elements.openNotionButton) {
    elements.openNotionButton.style.display = 'none';
  }

  // 更新狀態
  if (response.wasDeleted) {
    setStatus(elements, 'Original page was deleted. Save to create new page.', '#d63384');
  } else {
    setStatus(elements, 'Save page first to enable highlighting.');
  }
}

/**
 * 顯示確認對話框
 * @param {PopupElements} elements - DOM 元素集合
 * @param {string} message - 對話框訊息
 */
export function showModal(elements, message) {
  if (elements.modalMessage) {
    elements.modalMessage.textContent = message;
  }
  if (elements.modal) {
    elements.modal.style.display = 'flex';
  }
}

/**
 * 隱藏確認對話框
 * @param {PopupElements} elements - DOM 元素集合
 */
export function hideModal(elements) {
  if (elements.modal) {
    elements.modal.style.display = 'none';
  }
}

/**
 * 格式化保存成功訊息
 * @param {Object} response - 保存響應
 * @returns {string} 格式化的訊息
 */
export function formatSaveSuccessMessage(response) {
  let action = 'Saved';
  let details = '';

  if (response.recreated) {
    action = 'Recreated (original was deleted)';
    const imageCount = response.imageCount || 0;
    const blockCount = response.blockCount || 0;
    details = `(${blockCount} blocks, ${imageCount} images)`;
  } else if (response.highlightsUpdated) {
    action = 'Highlights updated';
    const highlightCount = response.highlightCount || 0;
    details = `(${highlightCount} highlights)`;
  } else if (response.updated) {
    action = 'Updated';
    const imageCount = response.imageCount || 0;
    const blockCount = response.blockCount || 0;
    details = `(${blockCount} blocks, ${imageCount} images)`;
  } else if (response.created) {
    action = 'Created';
    const imageCount = response.imageCount || 0;
    const blockCount = response.blockCount || 0;
    details = `(${blockCount} blocks, ${imageCount} images)`;

    if (response.warning) {
      details += ` ⚠️ ${response.warning}`;
    }
  }

  return `${action} successfully! ${details}`;
}
