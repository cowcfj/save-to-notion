/**
 * Floating Rail CSS 樣式
 *
 * 供 Shadow DOM 使用，以 :host 選擇器確保完整隔離。
 * 使用 UI_TOKENS 保持與 extension 其他 UI 的視覺一致性。
 */

import { UI_TOKENS, hexToRgba } from '../../../../styles/ui-token-constants.js';

const { color, spacing, radius, shadow, theme } = UI_TOKENS;

/**
 * 取得 Floating Rail 的色彩 CSS 變數定義。
 *
 * 邊界規則：色彩類 token 走 var bridge，維度 token (spacing, radius, shadow) 仍走 JS 內插。
 *
 * @returns {string} CSS 變數字串
 */
export function getRailThemeVars() {
  return `
    :host {
      --rail-color-text: ${color.text};
      --rail-color-text-muted: ${color.textMuted};
      --rail-color-white: ${color.white};
      --rail-color-brand: ${color.brand};
      --rail-color-brand-hover: ${color.brandHover};
      --rail-color-icon-on-accent: ${color.iconOnAccent};
      --rail-color-action-save: ${color.actionSave};
      --rail-color-action-save-hover: ${color.actionSaveHover};
      --rail-color-action-manage: ${color.actionManage};
      --rail-color-action-manage-hover: ${color.actionManageHover};
      --rail-color-primary: ${color.primary};
      --rail-color-danger: ${color.danger};

      --rail-glow-brand: ${hexToRgba(color.brand, 0.35)};
      --rail-glow-action-save: ${hexToRgba(color.actionSave, 0.35)};
      --rail-glow-action-manage: ${hexToRgba(color.actionManage, 0.35)};
      --rail-color-primary-a40: ${hexToRgba(color.primary, 0.4)};
      --rail-color-primary-a55: ${hexToRgba(color.primary, 0.55)};
      --rail-ring-white-strong: ${hexToRgba(color.white, 0.45)};
      --rail-ring-white-weak: ${hexToRgba(color.white, 0.25)};
      --rail-shadow-black-a18: ${hexToRgba(color.black, 0.18)};
      --rail-border-white-a60: ${hexToRgba(color.white, 0.6)};
      --rail-border-white-a88: ${hexToRgba(color.white, 0.88)};

      --rail-surface: ${theme.light.surface};
      --rail-border: ${theme.light.border};
      --rail-icon-muted: ${theme.light.iconMuted};
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --rail-surface: ${theme.dark.surface};
        --rail-border: ${theme.dark.border};
        --rail-icon-muted: ${theme.dark.iconMuted};
      }
    }
  `;
}

export function getFloatingRailCSS() {
  return `
    ${getRailThemeVars()}

    :host {
      all: initial;
      display: block;
      position: fixed;
      top: var(--rail-top, 50%);
      right: 0;
      transform: translateY(-50%);
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--rail-color-text);
    }

    :host *,
    :host *::before,
    :host *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :host :where(button) {
      all: unset;
      box-sizing: border-box;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1.5;
      font-family: inherit;
      font-size: inherit;
    }

    .rail-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: ${spacing.xs};
      padding: ${spacing.xs};
      background: var(--rail-surface);
      border: 1px solid var(--rail-border);
      border-right: none;
      border-radius: ${radius.lg} 0 0 ${radius.lg};
      box-shadow: ${shadow.md};
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .rail-close-btn {
      position: absolute;
      top: -6px;
      left: -6px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--rail-color-text);
      color: var(--rail-color-white);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease, transform 0.12s ease;
      z-index: 1;
    }

    .rail-container:hover .rail-close-btn {
      opacity: 0.7;
      pointer-events: auto;
    }

    .rail-close-btn:hover {
      opacity: 1 !important;
      transform: scale(1.15);
    }

    .rail-close-btn:focus-visible {
      opacity: 1 !important;
      pointer-events: auto;
      outline: 2px solid var(--rail-color-brand);
      outline-offset: 1px;
    }

    .rail-close-btn > .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--rail-close-icon-size, 12px);
      height: var(--rail-close-icon-size, 12px);
    }

    .rail-close-btn svg {
      width: 100%;
      height: 100%;
      color: currentColor;
      fill: currentColor;
      stroke: currentColor;
    }

    @media (prefers-reduced-motion: reduce) {
      .rail-container {
        transition: none;
      }
      .rail-container.collapsed .rail-actions {
        transition: none;
      }
      .color-palette {
        transition: none;
      }
      .rail-close-btn {
        transition: none;
      }
    }

    .rail-container.collapsed .rail-actions {
      max-height: 0;
      opacity: 0;
      overflow: hidden;
      padding: 0;
      transition: max-height 0.2s ease, opacity 0.15s ease;
    }

    .rail-container.expanded .rail-actions,
    .rail-container.highlighting .rail-actions {
      max-height: 300px;
      opacity: 1;
      transition: max-height 0.2s ease, opacity 0.15s ease 0.05s;
    }

    .rail-trigger {
      width: var(--rail-btn-size, 34px);
      height: var(--rail-btn-size, 34px);
      border-radius: 9px;
      background: var(--rail-color-brand);
      color: var(--rail-color-icon-on-accent);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      transition:
        background 0.16s ease,
        transform 0.16s ease,
        box-shadow 0.16s ease;
      --rail-brand-fill: var(--rail-color-brand);
    }

    .rail-trigger:hover,
    .rail-trigger:focus-visible {
      background: var(--rail-color-brand-hover);
      transform: translateY(-1px);
      box-shadow: 0 2px 6px var(--rail-glow-brand);
    }

    :host([data-dragging="true"]) .rail-trigger {
      cursor: grabbing;
      background: var(--rail-color-brand-hover);
    }

    .rail-trigger:hover {
      --rail-brand-fill: var(--rail-color-brand-hover);
    }

    .rail-trigger > .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--rail-trigger-icon-size, 22px);
      height: var(--rail-trigger-icon-size, 22px);
    }

    .rail-trigger svg {
      width: 100%;
      height: 100%;
      color: currentColor;
      fill: currentColor;
      stroke: currentColor;
    }

    .rail-actions {
      position: relative;
      overflow: visible;
      display: flex;
      flex-direction: column;
      gap: ${spacing.xs};
      padding: ${spacing.xs} 0;
    }

    .rail-highlight-group {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .rail-action-btn {
      width: var(--rail-btn-size, 34px);
      height: var(--rail-btn-size, 34px);
      border-radius: 9px;
      position: relative;
      color: var(--rail-color-icon-on-accent);
      transition:
        background 0.16s ease,
        border-color 0.16s ease,
        box-shadow 0.16s ease,
        transform 0.16s ease;
    }

    .rail-action-btn[data-action="save"],
    .rail-action-btn[data-action="sync"] {
      background: var(--rail-color-action-save);
    }

    .rail-action-btn[data-action="save"]:hover,
    .rail-action-btn[data-action="save"]:focus-visible,
    .rail-action-btn[data-action="sync"]:hover,
    .rail-action-btn[data-action="sync"]:focus-visible {
      background: var(--rail-color-action-save-hover);
      transform: translateY(-1px);
      box-shadow: 0 2px 6px var(--rail-glow-action-save);
    }

    .rail-action-btn[data-action="manage"] {
      background: var(--rail-color-action-manage);
    }

    .rail-action-btn[data-action="manage"]:hover,
    .rail-action-btn[data-action="manage"]:focus-visible {
      background: var(--rail-color-action-manage-hover);
      transform: translateY(-1px);
      box-shadow: 0 2px 6px var(--rail-glow-action-manage);
    }

    .rail-action-btn > .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--rail-action-icon-size, 18px);
      height: var(--rail-action-icon-size, 18px);
    }

    .rail-action-btn svg {
      width: 100%;
      height: 100%;
      color: currentColor;
      fill: currentColor;
      stroke: currentColor;
    }

    .rail-highlight-toggle {
      border: 1px solid transparent;
    }

    .rail-highlight-toggle[data-highlight-state="inactive"] {
      background: var(--rail-highlight-tint, var(--rail-color-primary-a40));
      background: color-mix(in srgb, var(--rail-highlight-color, var(--rail-color-primary)) 40%, transparent);
      color: var(--rail-icon-muted);
      box-shadow: inset 0 0 0 1px var(--rail-ring-white-strong);
    }

    .rail-highlight-toggle[data-highlight-state="inactive"]:hover,
    .rail-highlight-toggle[data-highlight-state="inactive"]:focus-visible {
      background: var(--rail-highlight-tint, var(--rail-color-primary-a55));
      background: color-mix(in srgb, var(--rail-highlight-color, var(--rail-color-primary)) 55%, transparent);
      transform: translateY(-1px);
    }

    .rail-highlight-toggle[data-highlight-state="active"] {
      background: var(--rail-highlight-color, var(--rail-color-primary));
      border-color: var(--rail-highlight-color, var(--rail-color-primary));
      color: rgba(0, 0, 0, 0.78);
      box-shadow: inset 0 0 0 1px var(--rail-ring-white-weak);
      transform: translateY(-1px);
    }

    .rail-highlight-toggle[data-highlight-state="active"]:hover,
    .rail-highlight-toggle[data-highlight-state="active"]:focus-visible {
      background: var(--rail-highlight-color, var(--rail-color-primary));
      box-shadow:
        inset 0 0 0 1px var(--rail-ring-white-weak),
        0 2px 6px var(--rail-shadow-black-a18);
    }

    .rail-highlight-toggle svg {
      color: currentColor;
      fill: currentColor;
      stroke: currentColor;
    }

    .rail-action-btn[aria-label]::after {
      content: attr(aria-label);
      position: absolute;
      right: calc(100% + ${spacing.sm});
      top: 50%;
      transform: translateY(-50%);
      background: var(--rail-color-text);
      color: var(--rail-color-white);
      padding: 2px ${spacing.sm};
      border-radius: ${radius.sm};
      font-size: 12px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }

    .rail-action-btn:hover[aria-label]::after,
    .rail-action-btn:focus-visible[aria-label]::after {
      opacity: 1;
    }

    .color-indicator {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid var(--rail-border-white-a60);
      transition:
        background 0.16s ease,
        border-color 0.16s ease,
        transform 0.16s ease;
    }

    .rail-highlight-toggle[data-highlight-state="active"] .color-indicator {
      border-color: var(--rail-border-white-a88);
      transform: scale(0.86);
    }

    .color-palette {
      position: absolute;
      right: calc(100% + ${spacing.xs});
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      gap: ${spacing.xs};
      padding: ${spacing.xs};
      background: var(--rail-surface);
      border: 1px solid var(--rail-border);
      border-radius: ${radius.md};
      box-shadow: ${shadow.sm};
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }

    .color-palette.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .color-swatch {
      width: 20px;
      height: 20px;
      border-radius: ${radius.md};
      border: 2px solid transparent;
      cursor: pointer;
    }

    .color-swatch:hover,
    .color-swatch:focus-visible {
      border-color: var(--rail-color-brand);
    }

    .color-swatch.selected {
      border-color: var(--rail-color-brand);
    }

    .rail-status {
      font-size: 11px;
      color: var(--rail-color-text-muted);
      text-align: center;
      max-width: 34px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 0 2px;
    }

    .rail-error-tooltip {
      position: absolute;
      right: calc(100% + ${spacing.sm});
      top: 50%;
      transform: translateY(-50%) translateX(4px);
      background: var(--rail-color-danger);
      color: var(--rail-color-white);
      padding: 4px ${spacing.sm};
      border-radius: ${radius.sm};
      font-size: 12px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .rail-error-tooltip.visible {
      opacity: 1;
      transform: translateY(-50%) translateX(0);
      pointer-events: auto;
    }

    @media (prefers-reduced-motion: reduce) {
      .rail-error-tooltip {
        transition: none;
        transform: translateY(-50%) translateX(0);
      }
    }
  `;
}

export function injectRailStylesIntoShadowRoot(shadowRoot) {
  const style = document.createElement('style');
  style.textContent = getFloatingRailCSS();
  shadowRoot.append(style);
}
