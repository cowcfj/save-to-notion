/**
 * Floating Rail Container
 *
 * 建立 Rail 的 DOM 結構，包含 trigger icon、action buttons 與 color palette。
 */

import { COLORS } from '../../utils/color.js';
import { UI_MESSAGES } from '../../../config/shared/messages.js';
import { createSafeIcon } from '../../../utils/securityUtils.js';

const ARIA_LABEL = 'aria-label';
const ACTION_BTN_CLASS = 'rail-action-btn';
const ICON_SIZE_SM = '16px';

const RAIL_ICONS = {
  NOTION:
    '<svg viewBox="0 0 24 24"><path d="M4 4h10l6 6v10H4V4z"/><path d="M14 4v6h6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  HIGHLIGHT:
    '<svg viewBox="0 0 24 24"><path d="M15.2 3.8l5 5L8.5 20.5 3 21l.5-5.5L15.2 3.8z"/></svg>',
  MANAGE:
    '<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  LOGO: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function createFloatingRailContainer(options = {}) {
  const { selectedColor = 'yellow' } = options;

  const container = document.createElement('div');
  container.className = 'rail-container collapsed';
  container.setAttribute('role', 'toolbar');
  container.setAttribute(ARIA_LABEL, UI_MESSAGES.FLOATING_RAIL.CONTAINER_LABEL);

  // Trigger button (always visible)
  const trigger = document.createElement('button');
  trigger.className = 'rail-trigger';
  trigger.setAttribute(ARIA_LABEL, UI_MESSAGES.FLOATING_RAIL.TRIGGER_LABEL);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = '';
  const logoIcon = createSafeIcon(RAIL_ICONS.LOGO);
  logoIcon.style.width = '18px';
  logoIcon.style.height = '18px';
  trigger.append(logoIcon);
  container.append(trigger);

  // Actions panel
  const actions = document.createElement('div');
  actions.className = 'rail-actions';

  // Save/Sync button
  const saveBtn = document.createElement('button');
  saveBtn.className = ACTION_BTN_CLASS;
  saveBtn.setAttribute(ARIA_LABEL, UI_MESSAGES.FLOATING_RAIL.SAVE_LABEL);
  saveBtn.dataset.action = 'save';
  const saveIcon = createSafeIcon(RAIL_ICONS.NOTION);
  saveIcon.style.width = ICON_SIZE_SM;
  saveIcon.style.height = ICON_SIZE_SM;
  saveBtn.append(saveIcon);
  actions.append(saveBtn);

  // Highlight button with color indicator
  // Uses div[role=button] because it contains interactive children (color swatches)
  const highlightBtn = document.createElement('div');
  highlightBtn.className = ACTION_BTN_CLASS;
  highlightBtn.setAttribute('role', 'button');
  highlightBtn.setAttribute('tabindex', '0');
  highlightBtn.setAttribute(ARIA_LABEL, UI_MESSAGES.FLOATING_RAIL.HIGHLIGHT_LABEL);
  highlightBtn.dataset.action = 'highlight';

  const colorIndicator = document.createElement('span');
  colorIndicator.className = 'color-indicator';
  colorIndicator.style.backgroundColor = COLORS[selectedColor] || COLORS.yellow;
  highlightBtn.append(colorIndicator);

  // Color palette (hidden by default)
  const palette = document.createElement('div');
  palette.className = 'color-palette';
  palette.setAttribute('role', 'radiogroup');
  palette.setAttribute(ARIA_LABEL, UI_MESSAGES.FLOATING_RAIL.COLOR_PALETTE_LABEL);

  for (const [name, hex] of Object.entries(COLORS)) {
    const swatch = document.createElement('button');
    swatch.className = `color-swatch${name === selectedColor ? ' selected' : ''}`;
    swatch.style.backgroundColor = hex;
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-checked', name === selectedColor ? 'true' : 'false');
    swatch.setAttribute(ARIA_LABEL, name);
    swatch.dataset.color = name;
    palette.append(swatch);
  }

  highlightBtn.append(palette);
  actions.append(highlightBtn);

  // Manage button
  const manageBtn = document.createElement('button');
  manageBtn.className = ACTION_BTN_CLASS;
  manageBtn.setAttribute(ARIA_LABEL, UI_MESSAGES.FLOATING_RAIL.MANAGE_LABEL);
  manageBtn.dataset.action = 'manage';
  const manageIcon = createSafeIcon(RAIL_ICONS.MANAGE);
  manageIcon.style.width = ICON_SIZE_SM;
  manageIcon.style.height = ICON_SIZE_SM;
  manageBtn.append(manageIcon);
  actions.append(manageBtn);

  container.append(actions);

  return container;
}
