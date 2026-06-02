import { UI_MESSAGES } from '../../scripts/config/shared/messages.js';

/**
 * 解析 UI 訊息路徑，取得 messages.js 中對應的文字
 *
 * @param {string} path 點分路徑 (e.g. 'OPTIONS.TITLE')
 * @returns {string} 對應的文字
 */
function resolveUiMessage(path) {
  if (typeof path !== 'string' || !path) {
    return '';
  }

  let value = UI_MESSAGES;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') {
      return '';
    }
    value = value[key];
  }

  return typeof value === 'string' ? value : '';
}

/**
 * 複合型 UI 訊息處理器，用於處理包含 HTML 元素（如 a, code 等）的複雜文字注入
 */
const COMPOSITE_HANDLERS = {
  'destination-target-help': element => {
    const link = element.querySelector('a');
    if (!link) {
      return;
    }
    element.replaceChildren(
      document.createTextNode(UI_MESSAGES.OPTIONS.DESTINATION.HELP_PREFIX),
      link,
      document.createTextNode(UI_MESSAGES.OPTIONS.DESTINATION.HELP_SUFFIX)
    );
    link.textContent = UI_MESSAGES.OPTIONS.DESTINATION.HELP_LINK_TEXT;
  },

  'guide-shortcut-desc': element => {
    const codes = element.querySelectorAll('code.kbd');
    if (codes.length !== 2) {
      return;
    }
    const [ctrlCode, cmdCode] = codes;
    ctrlCode.textContent = UI_MESSAGES.OPTIONS.GUIDE.FEATURES_SHORTCUT_CTRL_KEY;
    cmdCode.textContent = UI_MESSAGES.OPTIONS.GUIDE.FEATURES_SHORTCUT_CMD_KEY;
    element.replaceChildren(
      document.createTextNode(UI_MESSAGES.OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_PREFIX),
      ctrlCode,
      document.createTextNode(UI_MESSAGES.OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_MIDDLE),
      cmdCode,
      document.createTextNode(UI_MESSAGES.OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_SUFFIX)
    );
  },

  'guide-faq-token-answer': element => {
    const code = element.querySelector('code.inline-code');
    if (!code) {
      return;
    }
    code.textContent = UI_MESSAGES.OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_CODE;
    element.replaceChildren(
      document.createTextNode(UI_MESSAGES.OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_PREFIX),
      code,
      document.createTextNode(UI_MESSAGES.OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_SUFFIX)
    );
  },
};

/**
 * 掃描並注入靜態 UI 訊息到包含 data-ui-* 屬性的 DOM 元素中
 *
 * @param {Document|HTMLElement} root 掃描的根節點，預設為 document
 */
export function applyStaticOptionMessages(root = document) {
  for (const element of root.querySelectorAll('[data-ui-message]')) {
    element.textContent = resolveUiMessage(element.dataset.uiMessage);
  }

  for (const element of root.querySelectorAll('[data-ui-placeholder]')) {
    element.setAttribute('placeholder', resolveUiMessage(element.dataset.uiPlaceholder));
  }

  for (const element of root.querySelectorAll('[data-ui-title]')) {
    element.setAttribute('title', resolveUiMessage(element.dataset.uiTitle));
  }

  for (const element of root.querySelectorAll('[data-ui-aria-label]')) {
    element.setAttribute('aria-label', resolveUiMessage(element.dataset.uiAriaLabel));
  }

  for (const element of root.querySelectorAll('[data-ui-composite]')) {
    const handler = COMPOSITE_HANDLERS[element.dataset.uiComposite];
    if (handler) {
      handler(element);
    }
  }
}
