/**
 * Popup UI 狀態管理模組
 *
 * 提供純函數來更新 Popup UI 狀態，便於單元測試。
 * 這些函數不直接依賴 Chrome API，僅操作 DOM 元素。
 */
import { UI_ICONS } from '../../scripts/config/shared/ui.js';
import { UI_MESSAGES } from '../../scripts/config/shared/messages.js';
import { resolveAccountDisplayProfile } from '../../scripts/utils/accountDisplayUtils.js';
import { sanitizeSvgIcon } from '../../scripts/highlighter/utils/safeIcon.js';

const ACCOUNT_STATUS_ERROR_CLASS = 'account-status-error';
const ARIA_LABEL_ATTR = 'aria-label';
const TITLE_ATTR = 'title';

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
 * @property {HTMLElement} title - Popup 標題元素
 * @property {HTMLElement} settingsLinkText - 設定頁連結文字
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
    destinationSection: document.querySelector('#destination-section'),
    destinationCurrent: document.querySelector('#destination-current'),
    destinationToggle: document.querySelector('#destination-toggle'),
    destinationMenu: document.querySelector('#destination-menu'),
    status: document.querySelector('#status'),
    title: document.querySelector('#popup-title'),
    settingsLinkText: document.querySelector('#settings-link-text'),
  };
}

function getSelectedDestinationProfile(profiles, selectedProfileId) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return null;
  }
  return profiles.find(profile => profile.id === selectedProfileId) || profiles[0];
}

function formatDestinationLabel(profile) {
  if (!profile) {
    return 'Default';
  }
  return profile.name || 'Default';
}

/**
 * 獲取有效的儲存目標 Profiles 列表
 *
 * @param {object} state - UI 狀態
 * @returns {Array<object>}
 */
function getDestinationProfiles(state) {
  return Array.isArray(state?.profiles) ? state.profiles : [];
}

/**
 * 判斷是否可渲染儲存目標選擇器
 *
 * @param {PopupElements} elements - DOM 元素集合
 * @param {Array<object>} profiles - Profiles 列表
 * @param {object|null} selectedProfile - 已選擇的 Profile
 * @returns {boolean}
 */
function canRenderDestinationSelector(elements, profiles, selectedProfile) {
  return Boolean(elements.destinationSection && profiles.length > 0 && selectedProfile);
}

/**
 * 隱藏儲存目標區域
 *
 * @param {HTMLElement} destinationSection - 儲存目標容器
 */
function hideDestinationSection(destinationSection) {
  if (destinationSection) {
    destinationSection.style.display = 'none';
  }
}

/**
 * 渲染當前儲存目標標籤
 *
 * @param {HTMLElement} destinationCurrent - 當前儲存目標元素
 * @param {object} selectedProfile - 已選擇的 Profile
 */
function renderDestinationCurrent(destinationCurrent, selectedProfile) {
  if (destinationCurrent) {
    destinationCurrent.textContent = `${
      UI_MESSAGES.POPUP.DESTINATION_LABEL_PREFIX
    }${formatDestinationLabel(selectedProfile)}`;
    destinationCurrent.dataset.profileId = selectedProfile.id;
    destinationCurrent.style.borderColor = selectedProfile.color || '';
  }
}

/**
 * 渲染儲存目標切換按鈕
 *
 * @param {HTMLButtonElement} destinationToggle - 切換按鈕元素
 * @param {object} selectedProfile - 已選擇的 Profile
 * @param {number} profileCount - Profiles 數量
 */
function renderDestinationToggle(destinationToggle, selectedProfile, profileCount) {
  if (destinationToggle) {
    destinationToggle.style.display = profileCount > 1 ? 'inline-flex' : 'none';
    destinationToggle.disabled = profileCount <= 1;
    destinationToggle.dataset.profileId = selectedProfile.id;
    destinationToggle.setAttribute?.('aria-expanded', 'false');
  }
}

/**
 * 建立儲存目標選單單一按鈕
 *
 * @param {object} profile - Profile 資料
 * @param {string} selectedProfileId - 已選擇的 Profile ID
 * @returns {HTMLButtonElement}
 */
function createDestinationMenuItem(profile, selectedProfileId) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'destination-menu-item';
  item.dataset.profileId = profile.id;
  item.textContent = formatDestinationLabel(profile);
  item.setAttribute('aria-pressed', String(profile.id === selectedProfileId));
  return item;
}

/**
 * 渲染儲存目標下拉選單
 *
 * @param {HTMLElement} destinationMenu - 選單元素
 * @param {Array<object>} profiles - Profiles 列表
 * @param {string} selectedProfileId - 已選擇的 Profile ID
 */
function renderDestinationMenu(destinationMenu, profiles, selectedProfileId) {
  if (!destinationMenu) {
    return;
  }

  destinationMenu.replaceChildren();
  destinationMenu.style.display = 'none';

  const fragment = document.createDocumentFragment();

  for (const profile of profiles) {
    fragment.append(createDestinationMenuItem(profile, selectedProfileId));
  }

  destinationMenu.append(fragment);
}

function getParsedSvgElement(svgDoc) {
  if (svgDoc.querySelector('parsererror')) {
    return null;
  }
  return svgDoc.documentElement || null;
}

/**
 * 建立安全的 SVG 狀態圖標容器
 *
 * 使用 DOMPurify 消毒 SVG 內容以防止 XSS 攻擊。
 * 雖然當前僅用於 UI_ICONS 硬編碼常量，但防禦性措施確保未來擴展時的安全性。
 *
 * @param {string} content - SVG 字串（將被消毒處理）
 * @returns {HTMLSpanElement} 包含安全 SVG 的 span 元素
 */
function createStatusSvgPart(content) {
  const span = document.createElement('span');
  span.classList.add('status-icon-inline');

  // 使用現有的 DOMPurify 消毒邏輯
  const sanitized = sanitizeSvgIcon(content);
  if (!sanitized) {
    return span;
  }

  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(sanitized, 'image/svg+xml');
  const svgElement = getParsedSvgElement(svgDoc);

  if (svgElement) {
    span.append(svgElement);
  }

  return span;
}

function renderTextStatus(status, content) {
  status.textContent = content;
}

const STATUS_CONTENT_RENDERERS = [
  {
    matches: content => typeof content === 'string',
    render: renderTextStatus,
  },
  {
    matches: Array.isArray,
    render: appendStructuredStatus,
  },
];

const STATUS_PART_RENDERERS = [
  {
    matches: part => typeof part === 'string',
    createNode: part => document.createTextNode(part),
  },
  {
    matches: part => part?.type === 'svg',
    createNode: part => createStatusSvgPart(part.content),
  },
];

function createStatusPartNode(part) {
  const renderer = STATUS_PART_RENDERERS.find(({ matches }) => matches(part));
  return renderer?.createNode(part) || null;
}

function appendStatusPart(status, part) {
  const node = createStatusPartNode(part);

  if (!node) {
    return;
  }

  status.append(node);
}

function appendStructuredStatus(status, parts) {
  parts.forEach(part => appendStatusPart(status, part));
}

function renderStatusContent(status, content) {
  const renderer = STATUS_CONTENT_RENDERERS.find(({ matches }) => matches(content));
  renderer?.render(status, content);
}

/**
 * Render popup destination selector.
 *
 * @param {PopupElements} elements
 * @param {{profiles: Array<object>, selectedProfileId?: string|null}} state
 */
export function renderDestinationSelector(elements, state) {
  const profiles = getDestinationProfiles(state);
  const selectedProfile = getSelectedDestinationProfile(profiles, state?.selectedProfileId);

  if (!canRenderDestinationSelector(elements, profiles, selectedProfile)) {
    hideDestinationSection(elements.destinationSection);
    return;
  }

  elements.destinationSection.style.display = 'block';
  renderDestinationCurrent(elements.destinationCurrent, selectedProfile);
  renderDestinationToggle(elements.destinationToggle, selectedProfile, profiles.length);
  renderDestinationMenu(elements.destinationMenu, profiles, selectedProfile.id);
}

/**
 * 設置狀態訊息
 *
 * @param {PopupElements} elements - DOM 元素集合
 * @param {string|Array<string|{type: string, content: string}>} content - 狀態內容，可為純字串或結構化陣列
 * @param {string} [color=''] - 文字顏色（可選）
 */
export function setStatus(elements, content, color = '') {
  const status = elements.status;

  if (!status) {
    return;
  }

  status.replaceChildren();
  status.style.color = color;
  renderStatusContent(status, content);
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
 * 套用 popup 初始靜態文字。
 *
 * @param {PopupElements} elements - DOM 元素集合
 */
export function initializePopupStaticText(elements) {
  if (typeof document !== 'undefined') {
    document.title = UI_MESSAGES.POPUP.DOCUMENT_TITLE;
  }

  if (elements.title) {
    elements.title.textContent = UI_MESSAGES.POPUP.HEADING;
  }

  setStatus(elements, UI_MESSAGES.POPUP.INITIAL_STATUS);
  setButtonText(elements.highlightButton, UI_MESSAGES.POPUP.START_HIGHLIGHT);
  setButtonText(elements.saveButton, UI_MESSAGES.POPUP.SAVE_PAGE);
  setButtonText(elements.openNotionButton, UI_MESSAGES.POPUP.OPEN_NOTION);
  setButtonText(elements.manageButton, UI_MESSAGES.POPUP.MANAGE_HIGHLIGHTS);

  if (elements.accountButton) {
    elements.accountButton.setAttribute(ARIA_LABEL_ATTR, UI_MESSAGES.ACCOUNT.LOGIN_ARIA_LABEL);
    elements.accountButton.setAttribute(TITLE_ATTR, UI_MESSAGES.ACCOUNT.LOGIN_ARIA_LABEL);
  }

  if (elements.settingsLinkText) {
    elements.settingsLinkText.textContent = UI_MESSAGES.POPUP.SETTINGS_LINK;
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
 * 清除 account 狀態訊息。
 *
 * @param {PopupElements} elements
 */
export function clearAccountStatus(elements) {
  if (!elements.accountStatus) {
    return;
  }

  elements.accountStatus.replaceChildren();
  elements.accountStatus.classList?.remove(ACCOUNT_STATUS_ERROR_CLASS);
}

/**
 * 顯示 account 錯誤狀態訊息。
 *
 * @param {PopupElements} elements
 * @param {string} message
 */
export function setAccountStatusError(elements, message) {
  if (!elements.accountStatus) {
    return;
  }

  elements.accountStatus.textContent = message;
  elements.accountStatus.classList?.add(ACCOUNT_STATUS_ERROR_CLASS);
}

/**
 * 更新 account 區塊為未登入狀態。
 *
 * @param {PopupElements} elements
 */
export function updateUIForLoggedOutAccount(elements) {
  setButtonText(elements.accountButton, UI_MESSAGES.ACCOUNT.LOGIN_BUTTON);

  if (elements.accountButton) {
    elements.accountButton.setAttribute(ARIA_LABEL_ATTR, UI_MESSAGES.ACCOUNT.LOGIN_ARIA_LABEL);
    elements.accountButton.setAttribute(TITLE_ATTR, UI_MESSAGES.ACCOUNT.LOGIN_ARIA_LABEL);
    elements.accountButton.classList?.toggle('is-signed-in', false);
  }
  clearAccountStatus(elements);
}

/**
 * 更新 account 區塊為已登入狀態。
 *
 * @param {PopupElements} elements
 * @param {{ email?: string, displayName?: string|null }} profile
 * @param {{ transientRefreshError?: boolean }} [options]
 */
export function updateUIForLoggedInAccount(elements, profile, options = {}) {
  setButtonText(elements.accountButton, UI_MESSAGES.ACCOUNT.SIGNED_IN_BUTTON);

  const { displayLabel } = resolveAccountDisplayProfile(profile);
  const buttonLabel = displayLabel
    ? UI_MESSAGES.ACCOUNT.MANAGEMENT_LABEL_WITH_NAME(displayLabel)
    : UI_MESSAGES.ACCOUNT.MANAGEMENT_LABEL;

  if (elements.accountButton) {
    elements.accountButton.setAttribute(ARIA_LABEL_ATTR, buttonLabel);
    elements.accountButton.setAttribute(TITLE_ATTR, buttonLabel);
    elements.accountButton.classList?.toggle('is-signed-in', true);
  }
  if (options.transientRefreshError) {
    setAccountStatusError(elements, UI_MESSAGES.ACCOUNT.TRANSIENT_REFRESH_ERROR);
  } else {
    clearAccountStatus(elements);
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

function formatBlockImageDetails(response) {
  const imageCount = response.imageCount || 0;
  const blockCount = response.blockCount || 0;
  const imagesText = formatCount(imageCount, 'image', 'images');
  const blocksText = formatCount(blockCount, 'block', 'blocks');
  return `(${blocksText}, ${imagesText})`;
}

function formatHighlightDetails(response) {
  const highlightCount = response.highlightCount || 0;
  const highlightsText = formatCount(highlightCount, 'highlight', 'highlights');
  return `(${highlightsText})`;
}

function resolveSaveSuccessMessageParts(response) {
  const blockImageDetails = formatBlockImageDetails(response);
  const rules = [
    {
      matches: response.recreated,
      action: UI_MESSAGES.POPUP.RECREATED,
      details: blockImageDetails,
    },
    {
      matches: response.highlightsUpdated,
      action: UI_MESSAGES.POPUP.HIGHLIGHTS_UPDATED,
      details: formatHighlightDetails(response),
    },
    {
      matches: response.updated,
      action: UI_MESSAGES.POPUP.UPDATED,
      details: blockImageDetails,
    },
    {
      matches: response.created,
      action: UI_MESSAGES.POPUP.CREATED,
      details: blockImageDetails,
      warning: response.warning,
    },
  ];

  return (
    rules.find(rule => rule.matches) || {
      action: UI_MESSAGES.POPUP.SAVE_SUCCESS,
      details: '',
    }
  );
}

function buildSaveSuccessMessage({ action, details, warning }) {
  const message = [action, details].filter(Boolean).join(' ');

  if (!warning) {
    return [message];
  }

  return [message, { type: 'svg', content: UI_ICONS.WARNING }, warning];
}

/**
 * 格式化保存成功訊息
 *
 * @param {object} response - 保存響應
 * @returns {Array<string|{type: string, content: string}>} 結構化內容數組（可含 SVG 警告）
 */
export function formatSaveSuccessMessage(response) {
  return buildSaveSuccessMessage(resolveSaveSuccessMessageParts(response));
}
