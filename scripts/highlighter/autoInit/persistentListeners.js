/**
 * persistentListeners.js
 *
 * 管理持久性 Chrome runtime 與 storage 監聽器的註冊、移除與訊息分發。
 */

import { CONTENT_BRIDGE_ACTIONS } from '../../config/runtimeActions/contentBridgeActions.js';
import { HIGHLIGHTER_ACTIONS } from '../../config/runtimeActions/highlighterActions.js';
import Logger from '../../utils/Logger.js';
import { VALID_STYLES } from '../utils/color.js';

function getListenerOperation(target, methodName) {
  const listenerOperation = target?.[methodName];
  return typeof listenerOperation === 'function' ? listenerOperation : null;
}

function runPersistentListenerOperation({ target, handler, methodName, failureMessage }) {
  const listenerOperation = getListenerOperation(target, methodName);
  if (!listenerOperation) {
    return false;
  }

  try {
    listenerOperation.call(target, handler);
    return true;
  } catch (error) {
    Logger.warn(failureMessage, {
      action: 'createPersistentListenerController',
      operation: methodName,
      result: 'failed',
      error: error?.message ?? String(error),
    });
    return false;
  }
}

function createPersistentListenerController(handler) {
  let registeredHandler = null;

  return {
    register(target) {
      if (registeredHandler) {
        return;
      }

      if (
        runPersistentListenerOperation({
          target,
          handler,
          methodName: 'addListener',
          failureMessage: '[Highlighter] 註冊持久監聽器失敗',
        })
      ) {
        registeredHandler = handler;
      }
    },
    unregister(target) {
      if (!registeredHandler) {
        return;
      }

      const handlerToRemove = registeredHandler;
      try {
        runPersistentListenerOperation({
          target,
          handler: handlerToRemove,
          methodName: 'removeListener',
          failureMessage: '[Highlighter] 移除持久監聽器失敗',
        });
      } finally {
        registeredHandler = null;
      }
    },
  };
}

function getRuntimeMessageListenerTarget(globalScope) {
  return globalScope.chrome?.runtime?.onMessage;
}

function getStorageChangeListenerTarget(globalScope) {
  return globalScope.chrome?.storage?.onChanged;
}

function getValidChangedStyle(changes, namespace) {
  if (namespace !== 'sync') {
    return null;
  }

  const newStyle = changes.highlightStyle?.newValue;
  if (!VALID_STYLES.includes(newStyle)) {
    return null;
  }

  return newStyle;
}

function getHighlighterManager(globalScope) {
  return globalScope.HighlighterV2?.manager;
}

function updateHighlighterStyleMode(manager, newStyle) {
  if (!newStyle) {
    return;
  }

  if (!manager) {
    return;
  }

  manager.updateStyleMode(newStyle);
}

function getPersistentMessageAction(request) {
  if (!request || typeof request !== 'object') {
    return null;
  }

  const { action } = request;
  return typeof action === 'string' ? action : null;
}

function getPersistentMessageHandler(handlers, action) {
  if (!action) {
    return undefined;
  }

  if (!Object.hasOwn(handlers, action)) {
    return undefined;
  }

  const handler = handlers[action];
  return typeof handler === 'function' ? handler : undefined;
}

/**
 * 建立持久性監聽器控制器
 *
 * @param {object} options
 * @param {object} options.globalScope - 全域作用域（預設為 globalThis）
 * @param {Function} options.getStableUrl - 獲取當前穩定 URL 的 callback
 * @param {Function} options.onSetStableUrl - 當收到 SET_STABLE_URL 訊息時的 callback (request, sendResponse) => boolean
 * @param {Function} options.onShowToolbar - 當收到 SHOW_TOOLBAR 訊息時的 callback (sendResponse) => void
 * @returns {object} { register, unregister }
 */
export function createPersistentListeners({
  globalScope = globalThis,
  getStableUrl,
  onSetStableUrl,
  onShowToolbar,
}) {
  /**
   * 處理樣式設定變更
   *
   * @param {object} changes
   * @param {string} namespace
   */
  function handleStorageStyleChange(changes, namespace) {
    const newStyle = getValidChangedStyle(changes, namespace);
    const manager = getHighlighterManager(globalScope);
    updateHighlighterStyleMode(manager, newStyle);
  }

  const PERSISTENT_MESSAGE_HANDLERS = {
    [CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL]: (request, sendResponse) => {
      if (!request.stableUrl) {
        return undefined;
      }
      return onSetStableUrl(request, sendResponse);
    },
    [HIGHLIGHTER_ACTIONS.SHOW_TOOLBAR]: (_request, sendResponse) => {
      onShowToolbar(sendResponse);
      return true;
    },
    [CONTENT_BRIDGE_ACTIONS.GET_STABLE_URL]: (_request, sendResponse) => {
      const stableUrl = getStableUrl();
      sendResponse({ stableUrl });
      return true;
    },
  };

  /**
   * 處理 runtime 訊息
   *
   * @param {object} request
   * @param {object} _sender
   * @param {Function} sendResponse
   * @returns {boolean|undefined}
   */
  function handlePersistentMessage(request, _sender, sendResponse) {
    const action = getPersistentMessageAction(request);
    const handler = getPersistentMessageHandler(PERSISTENT_MESSAGE_HANDLERS, action);
    if (!handler) {
      return undefined;
    }
    return handler(request, sendResponse);
  }

  const persistentMessageListener = createPersistentListenerController(handlePersistentMessage);
  const persistentStorageListener = createPersistentListenerController(handleStorageStyleChange);

  /**
   * 註冊持久性監聽器
   */
  function register() {
    persistentMessageListener.register(getRuntimeMessageListenerTarget(globalScope));
    persistentStorageListener.register(getStorageChangeListenerTarget(globalScope));
  }

  /**
   * 移除持久性監聽器並清理變數參照
   */
  function unregister() {
    persistentMessageListener.unregister(getRuntimeMessageListenerTarget(globalScope));
    persistentStorageListener.unregister(getStorageChangeListenerTarget(globalScope));
  }

  return {
    register,
    unregister,
  };
}
