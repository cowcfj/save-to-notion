/**
 * Toast 元件專用的 SVG icons。
 *
 * 為避免污染 `TOOLBAR_ICONS`（無 WARNING）或拉進非 content-safe 的 `UI_ICONS`，
 * 在元件內就地宣告，讓 toast 自包含、bundle 範圍精準。
 */
const TOAST_ICONS = Object.freeze({
  success:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  warning:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  error:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
});

/**
 * 建立 Toast container DOM 元素。
 *
 * ARIA 行為：
 * - `error` level → `role="alert"` + `aria-live="assertive"`（即時打斷螢幕閱讀器）
 * - `success` / `warning` level → `role="status"` + `aria-live="polite"`（不打斷使用者目前任務）
 *
 * 安全性：
 * - 訊息一律走 `textContent` 注入，不透過 `innerHTML`，避免來自 caller 的 XSS。
 *
 * @param {{ level: 'success'|'warning'|'error', message: string }} options
 * @returns {HTMLElement} container DOM 元素
 */
export function createToastContainer({ level, message }) {
  const container = document.createElement('div');
  container.classList.add('toast-container', `toast--${level}`);

  if (level === 'error') {
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'assertive');
  } else {
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
  }
  container.setAttribute('aria-atomic', 'true');

  const iconEl = document.createElement('span');
  iconEl.classList.add('toast-icon');
  iconEl.setAttribute('aria-hidden', 'true');
  // SVG 字串為內建常數（非 user input），透過 innerHTML 安全注入
  iconEl.innerHTML = TOAST_ICONS[level] || TOAST_ICONS.success;

  const messageEl = document.createElement('span');
  messageEl.classList.add('toast-message');
  // 訊息一律 textContent，避免外部呼叫者注入 HTML
  messageEl.textContent = message;

  container.append(iconEl, messageEl);
  return container;
}
