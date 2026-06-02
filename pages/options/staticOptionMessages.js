import { UI_MESSAGES } from '../../scripts/config/shared/messages.js';

/**
 * 解析 UI 訊息路徑，取得 messages.js 中對應的文字
 *
 * @param {string} path 點分路徑 (e.g. 'OPTIONS.TITLE')
 * @param {string} [fallback=''] 找不到文案時回傳的 fallback
 * @returns {string} 對應的文字
 */
export function resolveUiMessage(path, fallback = '') {
  if (typeof path !== 'string' || !path) {
    return fallback;
  }

  let value = UI_MESSAGES;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') {
      return fallback;
    }
    value = value[key];
  }

  return typeof value === 'string' ? value : fallback;
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
      document.createTextNode(resolveUiMessage('OPTIONS.DESTINATION.HELP_PREFIX')),
      link,
      document.createTextNode(resolveUiMessage('OPTIONS.DESTINATION.HELP_SUFFIX'))
    );
    link.textContent = resolveUiMessage('OPTIONS.DESTINATION.HELP_LINK_TEXT');
  },

  'guide-shortcut-desc': element => {
    const codes = element.querySelectorAll('code.kbd');
    if (codes.length !== 2) {
      return;
    }
    const [ctrlCode, cmdCode] = codes;
    ctrlCode.textContent = resolveUiMessage('OPTIONS.GUIDE.FEATURES_SHORTCUT_CTRL_KEY');
    cmdCode.textContent = resolveUiMessage('OPTIONS.GUIDE.FEATURES_SHORTCUT_CMD_KEY');
    element.replaceChildren(
      document.createTextNode(resolveUiMessage('OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_PREFIX')),
      ctrlCode,
      document.createTextNode(resolveUiMessage('OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_MIDDLE')),
      cmdCode,
      document.createTextNode(resolveUiMessage('OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_SUFFIX'))
    );
  },

  'guide-faq-token-answer': element => {
    const code = element.querySelector('code.inline-code');
    if (!code) {
      return;
    }
    code.textContent = resolveUiMessage('OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_CODE');
    element.replaceChildren(
      document.createTextNode(resolveUiMessage('OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_PREFIX')),
      code,
      document.createTextNode(resolveUiMessage('OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_SUFFIX'))
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
    const message = resolveUiMessage(element.dataset.uiMessage);
    if (message) {
      element.textContent = message;
    }
  }

  for (const element of root.querySelectorAll('[data-ui-placeholder]')) {
    const placeholder = resolveUiMessage(element.dataset.uiPlaceholder);
    if (placeholder) {
      element.setAttribute('placeholder', placeholder);
    }
  }

  for (const element of root.querySelectorAll('[data-ui-title]')) {
    const title = resolveUiMessage(element.dataset.uiTitle);
    if (title) {
      element.setAttribute('title', title);
    }
  }

  for (const element of root.querySelectorAll('[data-ui-aria-label]')) {
    const ariaLabel = resolveUiMessage(element.dataset.uiAriaLabel);
    if (ariaLabel) {
      element.setAttribute('aria-label', ariaLabel);
    }
  }

  for (const element of root.querySelectorAll('[data-ui-composite]')) {
    const handler = COMPOSITE_HANDLERS[element.dataset.uiComposite];
    if (handler) {
      handler(element);
    }
  }
}
