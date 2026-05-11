/**
 * Floating Rail CSS 樣式
 *
 * 供 Shadow DOM 使用，以 :host 選擇器確保完整隔離。
 * 使用 UI_TOKENS 保持與 extension 其他 UI 的視覺一致性。
 */

import { UI_TOKENS, hexToRgba } from '../../../../styles/ui-token-constants.js';

const { color, spacing, radius, shadow } = UI_TOKENS;

export function getFloatingRailCSS() {
  return `
    :host {
      all: initial;
      display: block;
      position: fixed;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      z-index: 2147483646;
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
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: ${spacing.xs};
      padding: ${spacing.xs};
      background: ${color.white};
      border: 1px solid ${color.border};
      border-right: none;
      border-radius: ${radius.lg} 0 0 ${radius.lg};
      box-shadow: ${shadow.md};
      transition: opacity 0.2s ease, transform 0.2s ease;
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
      width: 32px;
      height: 32px;
      border-radius: ${radius.md};
      background: ${color.white};
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .rail-trigger:hover,
    .rail-trigger:focus-visible {
      background: ${color.bgHover};
    }

    .rail-trigger svg {
      width: 18px;
      height: 18px;
      fill: ${color.text};
    }

    .rail-actions {
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
      width: 32px;
      height: 32px;
      border-radius: ${radius.md};
      position: relative;
    }

    .rail-action-btn:hover,
    .rail-action-btn:focus-visible {
      background: ${color.bgHover};
    }

    .rail-action-btn:active {
      background: ${hexToRgba(color.primary, 0.1)};
    }

    .rail-action-btn svg {
      width: 16px;
      height: 16px;
      fill: ${color.text};
    }

    .rail-action-btn.active svg {
      fill: ${color.primary};
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
      border: 2px solid ${color.border};
    }

    .color-palette {
      position: absolute;
      right: calc(100% + ${spacing.xs});
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      gap: ${spacing.xs};
      padding: ${spacing.xs};
      background: ${color.white};
      border: 1px solid ${color.border};
      border-radius: ${radius.md};
      box-shadow: ${shadow.sm};
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
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
    }

    .color-swatch:hover,
    .color-swatch:focus-visible {
      border-color: ${color.primary};
    }

    .color-swatch.selected {
      border-color: ${color.text};
    }

    .rail-status {
      font-size: 11px;
      color: ${color.textMuted};
      text-align: center;
      max-width: 32px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 0 2px;
    }
  `;
}

export function injectRailStylesIntoShadowRoot(shadowRoot) {
  const style = document.createElement('style');
  style.textContent = getFloatingRailCSS();
  shadowRoot.append(style);
}
