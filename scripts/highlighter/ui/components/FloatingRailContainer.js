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
const ICON_SIZE_SM = '18px';
const TRIGGER_ICON_SIZE = '22px';

const RAIL_ICONS = {
  // Save action — Feather `save` (磁碟)，與 popup #save-button 同款
  NOTION:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  HIGHLIGHT:
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M15.2 3.8l5 5L8.5 20.5 3 21l.5-5.5L15.2 3.8z"/></svg>',
  // Manage action — Feather `file-text`（文件含文字行），與 popup #manage-button 同款
  MANAGE:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  LOGO: '<svg viewBox="0 0 32 32" fill="none"><path d="M9 4 L23 4 Q24 4 24 5 L24 27 Q24 28 23 27.4 L16 22.5 L9 27.4 Q8 28 8 27 L8 5 Q8 4 9 4 Z" fill="currentColor"/><circle cx="16" cy="13" r="5.2" fill="var(--rail-brand-fill)" stroke="currentColor" stroke-width="1.3"/><path d="M16 10.4 V15.6 M13.4 13 H18.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
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
  trigger.setAttribute('aria-pressed', 'false');
  trigger.innerHTML = '';
  const logoIcon = createSafeIcon(RAIL_ICONS.LOGO);
  logoIcon.style.width = TRIGGER_ICON_SIZE;
  logoIcon.style.height = TRIGGER_ICON_SIZE;
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

  // Highlight group: same button model as other actions, palette as sibling popover
  const highlightGroup = document.createElement('div');
  highlightGroup.className = 'rail-highlight-group';

  const highlightToggle = document.createElement('button');
  highlightToggle.className = `${ACTION_BTN_CLASS} rail-highlight-toggle`;
  highlightToggle.dataset.action = 'highlight';
  highlightToggle.setAttribute(ARIA_LABEL, UI_MESSAGES.FLOATING_RAIL.HIGHLIGHT_LABEL);
  highlightToggle.setAttribute('aria-pressed', 'false');
  highlightToggle.dataset.highlightState = 'inactive';
  highlightToggle.style.setProperty(
    '--rail-highlight-color',
    COLORS[selectedColor] || COLORS.yellow
  );

  const colorIndicator = document.createElement('span');
  colorIndicator.className = 'color-indicator';
  colorIndicator.style.backgroundColor = COLORS[selectedColor] || COLORS.yellow;
  highlightToggle.append(colorIndicator);
  highlightGroup.append(highlightToggle);

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

  highlightGroup.append(palette);
  actions.append(highlightGroup);

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
