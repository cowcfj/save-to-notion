import Logger from '../../utils/Logger.js';
import { HIGHLIGHTER_MESSAGES } from '../../config/messages/highlighterMessages.js';
import { createToastContainer } from './components/ToastContainer.js';
import { injectToastStylesIntoShadowRoot } from './styles/toastStyles.js';

const HOST_ID = 'notion-toast-host';
const DEFAULT_DURATION_MS = 3000;
const VISIBLE_CLASS = 'toast--visible';

/**
 * Toast 管理器。
 *
 * 行為合約：
 * - 單例 host：第一次 `show()` lazy 建立 `<div id="notion-toast-host">` 並標記 `data-toast-owner="true"`，
 *   第二次起復用同一 host（避免 DOM 累積）。
 * - Override 模式：連續 `show()` 不排隊，後者直接取代前者並重置倒數計時。
 * - `messageKey` 解析：先從 `HIGHLIGHTER_MESSAGES.TOAST[key]` 查；找不到 → `Logger.warn` + 中文預設 fallback。
 * - `customMessage` 優先於 `messageKey`。
 * - `cleanup()` / `hide()` 在未顯示時皆為 no-op，不應拋例外。
 *
 * 為什麼用獨立 Shadow Host 而非沿用 toolbar / floating rail 的 host：
 * - lifecycle 解耦：toast 在 toolbar 隱藏時也要能顯示
 * - z-index 控制：toast 永遠在最前
 * - 測試/移除最容易：cleanup 只需移除一個 host
 */
export class Toast {
  /** @type {HTMLElement|null} */
  host = null;
  /** @type {ShadowRoot|null} */
  shadowRoot = null;
  /** @type {HTMLElement|null} */
  container = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  hideTimer = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  showTimer = null;

  /**
   * 顯示 Toast。連續呼叫採 override 模式：取消舊 timer、取代舊 container。
   *
   * @param {string} messageKey - `HIGHLIGHTER_MESSAGES.TOAST` 的 key（如 `'HIGHLIGHT_DELETED'`）
   * @param {object} [options]
   * @param {'success'|'warning'|'error'} [options.level='success']
   * @param {string} [options.customMessage] - 若提供，覆蓋 messageKey 解析結果
   * @param {number} [options.durationMs=3000]
   */
  show(messageKey, options = {}) {
    const { level = 'success', customMessage, durationMs = DEFAULT_DURATION_MS } = options;

    this._ensureHost();
    this._cancelTimers();

    const message = customMessage || this._resolveMessage(messageKey);

    // 取代舊 container（override 模式）
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    const container = createToastContainer({ level, message });
    this.shadowRoot.append(container);
    this.container = container;

    // 用 setTimeout(.., 0) 而非 rAF，因為 jest fake timers 對 rAF 支援較不穩定，
    // 且 toast 顯示時機差幾毫秒對使用者無感。
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      if (this.container === container) {
        container.classList.add(VISIBLE_CLASS);
      }
    }, 0);

    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (this.container === container) {
        container.classList.remove(VISIBLE_CLASS);
      }
    }, durationMs);
  }

  /**
   * 立即隱藏 Toast。未顯示時為 no-op。
   */
  hide() {
    this._cancelTimers();
    if (this.container) {
      this.container.classList.remove(VISIBLE_CLASS);
    }
  }

  /**
   * 拆除 Toast：移除 host、清除 timer。未呼叫過 show() 時為 no-op。
   */
  cleanup() {
    this._cancelTimers();
    this.host?.remove();
    this.host = null;
    this.shadowRoot = null;
    this.container = null;
  }

  // ---------- 內部方法 ----------

  _ensureHost() {
    if (this.host?.isConnected) {
      return;
    }

    // 復用既有的 toast host（content script 重複注入或 hot-reload 時可能殘留），
    // 避免 document.body 累積重複 host 節點。
    const existingHost = document.querySelector(`#${HOST_ID}`);
    if (existingHost?.isConnected) {
      const shadowRoot = existingHost.shadowRoot || existingHost.attachShadow({ mode: 'open' });
      if (!existingHost.shadowRoot) {
        injectToastStylesIntoShadowRoot(shadowRoot);
      }
      existingHost.dataset.toastOwner = 'true';
      this.host = existingHost;
      this.shadowRoot = shadowRoot;
      this.container = null;
      return;
    }

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.dataset.toastOwner = 'true';
    document.body.append(host);

    const shadowRoot = host.attachShadow({ mode: 'open' });
    injectToastStylesIntoShadowRoot(shadowRoot);

    this.host = host;
    this.shadowRoot = shadowRoot;
    this.container = null;
  }

  _resolveMessage(messageKey) {
    const message = HIGHLIGHTER_MESSAGES?.TOAST?.[messageKey];
    if (typeof message === 'string') {
      return message;
    }
    Logger.warn('[Toast] Unknown messageKey', {
      action: 'show',
      result: 'unknown_message_key',
      messageKey,
    });
    return HIGHLIGHTER_MESSAGES?.TOAST?.DEFAULT || '發生錯誤，請稍後再試';
  }

  _cancelTimers() {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
