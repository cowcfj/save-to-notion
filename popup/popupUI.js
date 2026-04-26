/**
 * Popup UI 狀態管理模組
 *
 * 提供純函數來更新 Popup UI 狀態，便於單元測試。
 * 這些函數不直接依賴 Chrome API，僅操作 DOM 元素。
 */
import { UI_ICONS } from '../scripts/config/icons.js';
import { UI_MESSAGES } from '../scripts/config/shared/messages.js';

/**
 * DOM 元素集合類型定義
 *
 * @typedef {object} PopupElements
 * @property {HTMLButtonElement} saveButton - 保存按鈕
 * @property {HTMLButtonElement} highlightButton - 標記按鈕
 * @property {HTMLButtonElement} manageButton - 管理標註按鈕（開啟 Side Panel）
 * @property {HTMLButtonElement} openNotionButton - 打開 Notion 按鈕
 * @property {HTMLElement} accountSection - Account 角落入口容器
 * @property {HTMLElement} accountStatus - Account screen-reader 狀態訊息
 * @property {HTMLButtonElement} accountButton - Account 主操作按鈕
 * @property {HTMLElement} status - 狀態顯示元素
 */

/**
 * 獲取所有 Popup DOM 元素
 *
 * @returns {PopupElements}
 */
export function getElements() {
  return {
    saveButton: document.querySelector('#save-button'),
    highlightButton: document.querySelector('#highlight-button'),
    manageButton: document.querySelector('#manage-button'),
    openNotionButton: document.querySelector('#open-notion-button'),
    accountSection: document.querySelector('#account-section'),
    accountStatus: document.querySelector('#account-status'),
    accountButton: document.querySelector('#account-button'),
    status: document.querySelector('#status'),
  };
}

/**
 * 設置狀態訊息
 *
 * @param {PopupElements} elements - DOM 元素集合
 * @param {string|Array<string|{type: string, content: string}>} content - 狀態內容，可為純字串或結構化陣列
 * @param {string} [color=''] - 文字顏色（可選）
 */
export function setStatus(elements, content, color = '') {
  if (elements.status) {
    elements.status.innerHTML = '';
    elements.status.style.color = color;

    // Support simple string
    if (typeof content === 'string') {
      elements.status.textContent = content;
      return;
    }

    // Support structured content (array of parts)
    if (Array.isArray(content)) {
      content.forEach(part => {
        if (typeof part === 'string') {
          // Pure text part -> safe textContent
          elements.status.append(document.createTextNode(part));
        } else if (part?.type === 'svg') {
          // 結構化 SVG 部分 -> 特殊處理
          const span = document.createElement('span');

          // 使用 DOMParser 安全地解析 SVG 字串，取代 innerHTML
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(part.content, 'image/svg+xml');

          // 確保解析成功且無錯誤
          if (!svgDoc.querySelector('parsererror') && svgDoc.documentElement) {
            span.append(svgDoc.documentElement);
          }

          // 加入基本樣式以對齊
          span.classList.add('status-icon-inline');
          elements.status.append(span);
        }
      });
    }
  }
}

/**
 * 設置按鈕狀態
 *
 * @param {HTMLButtonElement} button - 按鈕元素
 * @param {boolean} disabled - 是否禁用
 */
export function setButtonState(button, disabled) {
  if (button) {
    button.disabled = disabled;
  }
}

/**
 * 設置按鈕文字的輔助函數
 * 優先使用 .btn-text 元素，若不存在則直接設置 button.textContent
 *
 * @param {HTMLButtonElement} button - 按鈕元素
 * @param {string} text - 要設置的文字
 */
export function setButtonText(button, text) {
  if (!button) {
    return;
  }
  /* 優先使用 .btn-text 元素，若不存在則直接設置 button.textContent */
  const textSpan = button.querySelector('.btn-text');
  if (textSpan) {
    textSpan.textContent = text;
  } else {
    // 備用方案：直接設置按鈕文字
    button.textContent = text;
  }
}

/**
 * 切換 popup account 區塊顯示。
 *
 * @param {PopupElements} elements
 * @param {boolean} visible
 */
export function setAccountSectionVisible(elements, visible) {
  if (elements.accountSection) {
    elements.accountSection.style.display = visible ? 'flex' : 'none';
  }
}

/**
 * 更新 account 區塊為未登入狀態。
 *
 * @param {PopupElements} elements
 */
export function updateUIForLoggedOutAccount(elements) {
  setButtonText(elements.accountButton, '');

  if (elements.accountButton) {
    elements.accountButton.setAttribute('aria-label', '使用 Google 登入');
    elements.accountButton.setAttribute('title', '使用 Google 登入');
    elements.accountButton.classList.toggle('is-signed-in', false);
  }
  if (elements.accountStatus) {
    elements.accountStatus.textContent = '';
    elements.accountStatus.style.color = '';
  }
}

/**
 * 更新 account 區塊為已登入狀態。
 *
 * @param {PopupElements} elements
 * @param {{ email?: string, displayName?: string|null }} profile
 * @param {{ transientRefreshError?: boolean }} [options]
 */
export function updateUIForLoggedInAccount(elements, profile, options = {}) {
  setButtonText(elements.accountButton, '');

  const normalizedDisplayName =
    typeof profile?.displayName === 'string' ? profile.displayName.trim() : '';
  const email = profile?.email || '';
  const accountLabel = normalizedDisplayName || email;
  const buttonLabel = accountLabel ? `帳號管理：${accountLabel}` : '帳號管理';

  if (elements.accountButton) {
    elements.accountButton.setAttribute('aria-label', buttonLabel);
    elements.accountButton.setAttribute('title', buttonLabel);
    elements.accountButton.classList.toggle('is-signed-in', true);
  }
  if (elements.accountStatus) {
    if (options.transientRefreshError) {
      elements.accountStatus.textContent = UI_MESSAGES.ACCOUNT.TRANSIENT_REFRESH_ERROR;
      elements.accountStatus.style.color = '#d63384';
    } else {
      elements.accountStatus.textContent = '';
      elements.accountStatus.style.color = '';
    }
  }
}

/**
 * 更新 UI 為「已保存」狀態
 *
 * @param {PopupElements} elements - DOM 元素集合
 * @param {object} response - 頁面狀態響應
 * @param {string} [response.notionUrl] - Notion 頁面 URL
 */
export function updateUIForSavedPage(elements, response) {
  // 啟用標記按鈕
  if (elements.highlightButton) {
    setButtonText(elements.highlightButton, UI_MESSAGES.POPUP.START_HIGHLIGHT);
    elements.highlightButton.disabled = false;
  }

  // 隱藏保存按鈕
  if (elements.saveButton) {
    elements.saveButton.style.display = 'none';
  }

  if (response.notionUrl && elements.openNotionButton) {
    elements.openNotionButton.style.display = 'block';
    if (elements.openNotionButton.dataset) {
      elements.openNotionButton.dataset.url = response.notionUrl;
    }
  }

  // 更新狀態
  setStatus(elements, UI_MESSAGES.POPUP.PAGE_READY);
}

/**
 * 更新 UI 為「未保存」狀態
 *
 * @param {PopupElements} elements - DOM 元素集合
 * @param {object} response - 頁面狀態響應
 * @param {boolean} [response.wasDeleted] - 頁面是否已被刪除
 */
export function updateUIForUnsavedPage(elements, response) {
  // 啟用標記按鈕 (Highlight-First)
  if (elements.highlightButton) {
    setButtonText(elements.highlightButton, UI_MESSAGES.POPUP.START_HIGHLIGHT);
    elements.highlightButton.disabled = false;
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
    setStatus(elements, UI_MESSAGES.POPUP.DELETED_PAGE, '#d63384');
  } else {
    setStatus(elements, UI_MESSAGES.POPUP.START_HIGHLIGHT);
  }
}

/**
 * 格式化數量與名詞（自動處理單複數）
 *
 * @param {number} count - 數量
 * @param {string} singular - 單數形式
 * @param {string} plural - 複數形式
 * @returns {string} 格式化後的字串，例如 "1 image" 或 "2 images"
 */
function formatCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * 格式化保存成功訊息
 *
 * @param {object} response - 保存響應
 * @returns {string|Array<string|{type: string, content: string}>} 格式化的訊息或結構化內容（含 SVG 警告）
 */
export function formatSaveSuccessMessage(response) {
  let action = UI_MESSAGES.POPUP.SAVE_SUCCESS;
  let details = '';

  const imageCount = response.imageCount || 0;
  const blockCount = response.blockCount || 0;

  const imagesText = formatCount(imageCount, 'image', 'images');
  const blocksText = formatCount(blockCount, 'block', 'blocks');
  const countsDetails = `(${blocksText}, ${imagesText})`;

  if (response.recreated) {
    action = UI_MESSAGES.POPUP.RECREATED;
    details = countsDetails;
  } else if (response.highlightsUpdated) {
    action = UI_MESSAGES.POPUP.HIGHLIGHTS_UPDATED;
    const highlightCount = response.highlightCount || 0;
    const highlightsText = formatCount(highlightCount, 'highlight', 'highlights');
    details = `(${highlightsText})`;
  } else if (response.updated) {
    action = UI_MESSAGES.POPUP.UPDATED;
    details = countsDetails;
  } else if (response.created) {
    action = UI_MESSAGES.POPUP.CREATED;
    details = countsDetails;

    if (response.warning) {
      const warnIcon = UI_ICONS.WARNING;

      // Return structured array for safe rendering
      return [
        [action, details].filter(Boolean).join(' '),
        { type: 'svg', content: warnIcon },
        response.warning,
      ];
    }
  }

  // Default return string
  return [action, details].filter(Boolean).join(' ');
}
