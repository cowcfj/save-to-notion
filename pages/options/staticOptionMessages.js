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

const STATIC_MESSAGE_BINDINGS = [
  {
    selector: '[data-ui-message]',
    datasetKey: 'uiMessage',
    apply: (element, message) => {
      element.textContent = message;
    },
  },
  {
    selector: '[data-ui-placeholder]',
    datasetKey: 'uiPlaceholder',
    apply: (element, message) => {
      element.setAttribute('placeholder', message);
    },
  },
  {
    selector: '[data-ui-title]',
    datasetKey: 'uiTitle',
    apply: (element, message) => {
      element.setAttribute('title', message);
    },
  },
  {
    selector: '[data-ui-aria-label]',
    datasetKey: 'uiAriaLabel',
    apply: (element, message) => {
      element.setAttribute('aria-label', message);
    },
  },
];

function applyStaticMessageBinding(root, binding) {
  for (const element of root.querySelectorAll(binding.selector)) {
    const message = resolveUiMessage(element.dataset[binding.datasetKey]);
    if (!message) {
      continue;
    }
    binding.apply(element, message);
  }
}

/**
 * 掃描並注入靜態 UI 訊息到包含 data-ui-* 屬性的 DOM 元素中
 *
 * @param {Document|HTMLElement} root 掃描的根節點，預設為 document
 */
export function applyStaticOptionMessages(root = document) {
  for (const binding of STATIC_MESSAGE_BINDINGS) {
    applyStaticMessageBinding(root, binding);
  }

  for (const element of root.querySelectorAll('[data-ui-composite]')) {
    COMPOSITE_HANDLERS[element.dataset.uiComposite]?.(element);
  }
}
