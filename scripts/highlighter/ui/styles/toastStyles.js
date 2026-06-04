import { UI_TOKENS } from '../../../../styles/ui-token-constants.js';

const { status, spacing, radius, shadow } = UI_TOKENS;

/**
 * 取得 Toast 的色彩 CSS 變數定義。
 *
 * 邊界規則：色彩類 token 走 var bridge，維度 token (spacing, radius, shadow) 仍走 JS 內插。
 *
 * @returns {string} CSS 變數字串
 */
export function getToastThemeVars() {
  return `
    :host {
      --toast-color-success-bg: ${status.successBg};
      --toast-color-success-text: ${status.successText};
      --toast-color-success-border: ${status.successBorder};

      --toast-color-warning-bg: ${status.warningBg};
      --toast-color-warning-text: ${status.warningText};
      --toast-color-warning-border: ${status.warningBorder};

      --toast-color-error-bg: ${status.errorBg};
      --toast-color-error-text: ${status.errorText};
      --toast-color-error-border: ${status.errorBorder};
    }
  `;
}

function getToastBaseCSS() {
  return `
        :host {
            all: initial;
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 2147483647;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
        }

        :host *,
        :host *::before,
        :host *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        .toast-container {
            pointer-events: auto;
            display: inline-flex;
            align-items: center;
            gap: ${spacing.sm};
            min-width: 240px;
            max-width: 360px;
            padding: ${spacing.sm} ${spacing.md};
            border-radius: ${radius.md};
            border: 1px solid transparent;
            box-shadow: ${shadow.md};
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 0.2s ease-out, transform 0.2s ease-out;
        }

        .toast-container.toast--visible {
            opacity: 1;
            transform: translateY(0);
        }

        .toast-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 20px;
            height: 20px;
        }

        .toast-icon svg {
            width: 100%;
            height: 100%;
        }

        .toast-message {
            flex: 1;
            word-break: break-word;
        }
  `;
}

function getToastStatusModifierCSS() {
  return `
        .toast--success {
            background: var(--toast-color-success-bg, #dcfce7);
            color: var(--toast-color-success-text, #166534);
            border-color: var(--toast-color-success-border, #bbf7d0);
        }

        .toast--warning {
            background: var(--toast-color-warning-bg, #fef3c7);
            color: var(--toast-color-warning-text, #92400e);
            border-color: var(--toast-color-warning-border, #fcd34d);
        }

        .toast--error {
            background: var(--toast-color-error-bg, #fee2e2);
            color: var(--toast-color-error-text, #991b1b);
            border-color: var(--toast-color-error-border, #fecaca);
        }
  `;
}

function getToastMotionCSS() {
  return `
        @media (prefers-reduced-motion: reduce) {
            .toast-container {
                transition: none;
                transform: none;
            }
        }
  `;
}

/**
 * 取得 Toast 的完整 CSS 字串，供 Shadow DOM 使用。
 *
 * 設計重點：
 * - `:host` 用 `all: initial` 隔離宿主頁面 CSS
 * - `:host` 設 `pointer-events: none`，避免覆蓋住底層內容；container 自己再開 `pointer-events: auto`
 * - 用 `transition` + `.toast--visible` modifier 控制顯示/淡出，避免 `@keyframes` 在生命週期切換時造成的 race
 * - 三組 status modifier（success/warning/error）共用 token registry
 *
 * @returns {string} CSS 字串
 */
export function getToastCSS() {
  return `
        ${getToastThemeVars()}
        ${getToastBaseCSS()}
        ${getToastStatusModifierCSS()}
        ${getToastMotionCSS()}
    `;
}

/**
 * 將 Toast 樣式注入到 Shadow Root。
 *
 * 刻意走 `<style>` 元素路徑而非 `adoptedStyleSheets`：
 * - Toast 使用頻率低（每次顯示 ~3 秒）、host 復用，效能差距可忽略
 * - jsdom 環境對 `adoptedStyleSheets` 行為不一致，避免測試環境分支
 *
 * @param {ShadowRoot} shadowRoot - 目標 Shadow Root
 */
export function injectToastStylesIntoShadowRoot(shadowRoot) {
  const style = document.createElement('style');
  style.textContent = getToastCSS();
  shadowRoot.prepend(style);
}
