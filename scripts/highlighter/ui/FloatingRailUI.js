/**
 * FloatingRailUI.js
 *
 * 純 DOM helper 函數，不碰 Chrome API。
 * 負責 Rail container 的 DOM 查詢與狀態渲染。
 */

import { HIGHLIGHTER_MESSAGES } from '../../config/messages/highlighterMessages.js';
import { COLORS } from '../utils/color.js';
import { hexToRgba } from '../../../styles/ui-token-constants.js';
import { createSafeIcon } from '../utils/safeIcon.js';
import { RAIL_ICONS } from './components/FloatingRailContainer.js';

export function getRailElements(container) {
  const highlightBtn = container.querySelector('[data-action="highlight"]');
  return {
    trigger: container.querySelector('.rail-trigger'),
    closeBtn: container.querySelector('.rail-close-btn'),
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
    isSaved
      ? HIGHLIGHTER_MESSAGES.FLOATING_RAIL.SYNC_LABEL
      : HIGHLIGHTER_MESSAGES.FLOATING_RAIL.SAVE_LABEL
  );
  saveBtn.dataset.action = isSaved ? 'sync' : 'save';

  swapSaveActionIcon(saveBtn, isSaved);
}

function swapSaveActionIcon(saveBtn, isSaved) {
  const targetIconKey = isSaved ? 'sync' : 'save';
  const currentWrapper = saveBtn.querySelector('.icon');
  if (currentWrapper?.querySelector('svg')?.dataset.railIcon === targetIconKey) {
    return;
  }

  const nextWrapper = createSafeIcon(isSaved ? RAIL_ICONS.SYNC : RAIL_ICONS.NOTION);
  if (!nextWrapper.querySelector('svg')) {
    return;
  }

  if (currentWrapper) {
    currentWrapper.replaceWith(nextWrapper);
  } else {
    saveBtn.prepend(nextWrapper);
  }
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
      ? HIGHLIGHTER_MESSAGES.FLOATING_RAIL.STOP_HIGHLIGHT_LABEL
      : HIGHLIGHTER_MESSAGES.FLOATING_RAIL.HIGHLIGHT_LABEL
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
