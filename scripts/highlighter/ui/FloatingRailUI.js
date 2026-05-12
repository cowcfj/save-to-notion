/**
 * FloatingRailUI.js
 *
 * 純 DOM helper 函數，不碰 Chrome API。
 * 負責 Rail container 的 DOM 查詢與狀態渲染。
 */

import { UI_MESSAGES } from '../../config/shared/messages.js';
import { COLORS } from '../utils/color.js';
import { hexToRgba } from '../../../styles/ui-token-constants.js';

export function getRailElements(container) {
  const highlightBtn = container.querySelector('[data-action="highlight"]');
  return {
    trigger: container.querySelector('.rail-trigger'),
    saveBtn: container.querySelector('[data-action="save"]'),
    highlightBtn,
    highlightToggle: highlightBtn,
    manageBtn: container.querySelector('[data-action="manage"]'),
    colorIndicator: container.querySelector('.color-indicator'),
    colorPalette: container.querySelector('.color-palette'),
  };
}

export function applyRailState(container, state) {
  container.classList.remove('collapsed', 'expanded', 'highlighting');
  container.classList.add(state);

  const trigger = container.querySelector('.rail-trigger');
  if (trigger) {
    trigger.setAttribute('aria-expanded', state === 'collapsed' ? 'false' : 'true');
  }
}

export function applySaveActionVisibility(saveBtn, pageStatus) {
  if (!saveBtn) {
    return;
  }

  const isSaved =
    typeof pageStatus === 'object' && pageStatus !== null
      ? pageStatus.canSave === false
      : Boolean(pageStatus);

  saveBtn.setAttribute(
    'aria-label',
    isSaved ? UI_MESSAGES.FLOATING_RAIL.SYNC_LABEL : UI_MESSAGES.FLOATING_RAIL.SAVE_LABEL
  );
  saveBtn.dataset.action = isSaved ? 'sync' : 'save';
}

export function applySelectedColor(container, colorName) {
  const indicator = container.querySelector('.color-indicator');
  if (indicator) {
    indicator.style.backgroundColor = COLORS[colorName] || COLORS.yellow;
  }

  const highlightBtn = container.querySelector('[data-action="highlight"]');
  if (highlightBtn) {
    const highlightColor = COLORS[colorName] || COLORS.yellow;
    highlightBtn.style.setProperty('--rail-highlight-color', highlightColor);
    highlightBtn.style.setProperty('--rail-highlight-tint', hexToRgba(highlightColor, 0.4));
  }

  const swatches = container.querySelectorAll('.color-swatch');
  for (const swatch of swatches) {
    const isSelected = swatch.dataset.color === colorName;
    swatch.classList.toggle('selected', isSelected);
    swatch.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  }
}

export function applyHighlightActive(highlightBtn, isActive) {
  if (!highlightBtn) {
    return;
  }
  highlightBtn.classList.toggle('active', isActive);
  highlightBtn.dataset.highlightState = isActive ? 'active' : 'inactive';
  highlightBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  highlightBtn.setAttribute(
    'aria-label',
    isActive
      ? UI_MESSAGES.FLOATING_RAIL.STOP_HIGHLIGHT_LABEL
      : UI_MESSAGES.FLOATING_RAIL.HIGHLIGHT_LABEL
  );
}

export function showColorPalette(palette) {
  if (palette) {
    palette.classList.add('visible');
  }
}

export function hideColorPalette(palette) {
  if (palette) {
    palette.classList.remove('visible');
  }
}
