/**
 * persistentListeners.js
 *
 * 管理持久性 Chrome runtime 與 storage 監聽器的註冊、移除與訊息分發。
 */

import { CONTENT_BRIDGE_ACTIONS } from '../../config/runtimeActions/contentBridgeActions.js';
import { HIGHLIGHTER_ACTIONS } from '../../config/runtimeActions/highlighterActions.js';
import { VALID_STYLES } from '../utils/color.js';

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
  let persistentMessageHandler = null;
  let persistentStorageHandler = null;

  /**
   * 處理樣式設定變更
   *
   * @param {object} changes
   * @param {string} namespace
   */
  function handleStorageStyleChange(changes, namespace) {
    if (namespace !== 'sync') {
      return;
    }

    const changedStyle = changes.highlightStyle;
    if (!changedStyle) {
      return;
    }

    const newStyle = changedStyle.newValue;
    if (!newStyle) {
      return;
    }

    if (!VALID_STYLES.includes(newStyle)) {
      return;
    }

    const manager = globalScope.HighlighterV2?.manager;
    if (!manager) {
      return;
    }

    manager.updateStyleMode(newStyle);
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
    const handler = PERSISTENT_MESSAGE_HANDLERS[request.action];
    if (!handler) {
      return undefined;
    }
    return handler(request, sendResponse);
  }

  function registerPersistentMessageListener(onMessage) {
    if (persistentMessageHandler) {
      return;
    }
    if (!onMessage?.addListener) {
      return;
    }

    persistentMessageHandler = handlePersistentMessage;
    onMessage.addListener(persistentMessageHandler);
  }

  function registerPersistentStorageChangeListener(onChanged) {
    if (persistentStorageHandler) {
      return;
    }
    if (!onChanged?.addListener) {
      return;
    }

    persistentStorageHandler = handleStorageStyleChange;
    onChanged.addListener(persistentStorageHandler);
  }

  /**
   * 註冊持久性監聽器
   */
  function register() {
    const onMessage = globalScope.chrome?.runtime?.onMessage;
    const onChanged = globalScope.chrome?.storage?.onChanged;

    registerPersistentMessageListener(onMessage);
    registerPersistentStorageChangeListener(onChanged);
  }

  /**
   * 移除持久性監聽器並清理變數參照
   */
  function unregister() {
    const listeners = [
      {
        target: globalScope.chrome?.runtime?.onMessage,
        handler: persistentMessageHandler,
        clear: () => {
          persistentMessageHandler = null;
        },
      },
      {
        target: globalScope.chrome?.storage?.onChanged,
        handler: persistentStorageHandler,
        clear: () => {
          persistentStorageHandler = null;
        },
      },
    ];

    for (const { target, handler, clear } of listeners) {
      if (handler) {
        target?.removeListener(handler);
        clear();
      }
    }
  }

  return {
    register,
    unregister,
  };
}
