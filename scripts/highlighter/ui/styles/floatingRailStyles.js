/**
 * Floating Rail CSS 樣式
 *
 * 供 Shadow DOM 使用，以 :host 選擇器確保完整隔離。
 * 使用 UI_TOKENS 保持與 extension 其他 UI 的視覺一致性。
 */

import { UI_TOKENS, hexToRgba } from '../../../../styles/ui-token-constants.js';

const { color, spacing, radius, shadow, theme } = UI_TOKENS;

export function getFloatingRailCSS() {
  return `
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
      color: ${color.text};
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
      background: ${theme.light.surface};
      border: 1px solid ${theme.light.border};
      border-right: none;
      border-radius: ${radius.lg} 0 0 ${radius.lg};
      box-shadow: ${shadow.md};
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      --rail-icon-muted: ${theme.light.iconMuted};
    }

    .rail-close-btn {
      position: absolute;
      top: -6px;
      left: -6px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: ${color.text};
      color: ${color.white};
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
      outline: 2px solid ${color.brand};
      outline-offset: 1px;
    }

    @media (prefers-color-scheme: dark) {
      .rail-container {
        background: ${theme.dark.surface};
        border-color: ${theme.dark.border};
        --rail-icon-muted: ${theme.dark.iconMuted};
      }
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
      background: ${color.brand};
      color: ${color.iconOnAccent};
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      transition:
        background 0.16s ease,
        transform 0.16s ease,
        box-shadow 0.16s ease;
      --rail-brand-fill: ${color.brand};
    }

    .rail-trigger:hover,
    .rail-trigger:focus-visible {
      background: ${color.brandHover};
      transform: translateY(-1px);
      box-shadow: 0 2px 6px ${hexToRgba(color.brand, 0.35)};
    }

    :host([data-dragging="true"]) .rail-trigger {
      cursor: grabbing;
      background: ${color.brandHover};
    }

    .rail-trigger:hover {
      --rail-brand-fill: ${color.brandHover};
    }

    .rail-trigger svg {
      width: var(--rail-trigger-icon-size, 22px);
      height: var(--rail-trigger-icon-size, 22px);
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
      color: ${color.iconOnAccent};
      transition:
        background 0.16s ease,
        border-color 0.16s ease,
        box-shadow 0.16s ease,
        transform 0.16s ease;
    }

    .rail-action-btn[data-action="save"],
    .rail-action-btn[data-action="sync"] {
      background: ${color.actionSave};
    }

    .rail-action-btn[data-action="save"]:hover,
    .rail-action-btn[data-action="save"]:focus-visible,
    .rail-action-btn[data-action="sync"]:hover,
    .rail-action-btn[data-action="sync"]:focus-visible {
      background: ${color.actionSaveHover};
      transform: translateY(-1px);
      box-shadow: 0 2px 6px ${hexToRgba(color.actionSave, 0.35)};
    }

    .rail-action-btn[data-action="manage"] {
      background: ${color.actionManage};
    }

    .rail-action-btn[data-action="manage"]:hover,
    .rail-action-btn[data-action="manage"]:focus-visible {
      background: ${color.actionManageHover};
      transform: translateY(-1px);
      box-shadow: 0 2px 6px ${hexToRgba(color.actionManage, 0.35)};
    }

    .rail-action-btn svg {
      width: var(--rail-action-icon-size, 18px);
      height: var(--rail-action-icon-size, 18px);
      color: currentColor;
      fill: currentColor;
      stroke: currentColor;
    }

    .rail-highlight-toggle {
      border: 1px solid transparent;
    }

    .rail-highlight-toggle[data-highlight-state="inactive"] {
      background: var(--rail-highlight-tint, ${hexToRgba(color.primary, 0.4)});
      background: color-mix(in srgb, var(--rail-highlight-color, ${color.primary}) 40%, transparent);
      color: var(--rail-icon-muted, ${theme.light.iconMuted});
      box-shadow: inset 0 0 0 1px ${hexToRgba(color.white, 0.45)};
    }

    .rail-highlight-toggle[data-highlight-state="inactive"]:hover,
    .rail-highlight-toggle[data-highlight-state="inactive"]:focus-visible {
      background: var(--rail-highlight-tint, ${hexToRgba(color.primary, 0.55)});
      background: color-mix(in srgb, var(--rail-highlight-color, ${color.primary}) 55%, transparent);
      transform: translateY(-1px);
    }

    .rail-highlight-toggle[data-highlight-state="active"] {
      background: var(--rail-highlight-color, ${color.primary});
      border-color: var(--rail-highlight-color, ${color.primary});
      color: rgba(0, 0, 0, 0.78);
      box-shadow: inset 0 0 0 1px ${hexToRgba(color.white, 0.25)};
      transform: translateY(-1px);
    }

    .rail-highlight-toggle[data-highlight-state="active"]:hover,
    .rail-highlight-toggle[data-highlight-state="active"]:focus-visible {
      background: var(--rail-highlight-color, ${color.primary});
      box-shadow:
        inset 0 0 0 1px ${hexToRgba(color.white, 0.25)},
        0 2px 6px ${hexToRgba(color.black, 0.18)};
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
      background: ${color.text};
      color: ${color.white};
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
      border: 2px solid ${hexToRgba(color.white, 0.6)};
      transition:
        background 0.16s ease,
        border-color 0.16s ease,
        transform 0.16s ease;
    }

    .rail-highlight-toggle[data-highlight-state="active"] .color-indicator {
      border-color: ${hexToRgba(color.white, 0.88)};
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
      background: ${theme.light.surface};
      border: 1px solid ${theme.light.border};
      border-radius: ${radius.md};
      box-shadow: ${shadow.sm};
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }

    @media (prefers-color-scheme: dark) {
      .color-palette {
        background: ${theme.dark.surface};
        border-color: ${theme.dark.border};
      }
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
      border-color: ${color.brand};
    }

    .color-swatch.selected {
      border-color: ${color.brand};
    }

    .rail-status {
      font-size: 11px;
      color: ${color.textMuted};
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
      background: ${color.danger};
      color: ${color.white};
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
