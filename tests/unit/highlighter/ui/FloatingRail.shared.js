/**
 * Shared FloatingRail test harness.
 */

jest.mock('../../../../scripts/highlighter/ui/FloatingRailRuntime.js', () => ({
  checkPageStatus: jest.fn(),
  savePageFromRail: jest.fn(),
  syncHighlights: jest.fn(),
  openSidePanel: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/styles/floatingRailStyles.js', () => ({
  injectRailStylesIntoShadowRoot: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/components/FloatingRailContainer.js', () => ({
  createFloatingRailContainer: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/FloatingRailAnimations.js', () => ({
  playLaunchAnimation: jest.fn(() => ({ cancel: jest.fn(), playState: 'running' })),
  playFireworkAnimation: jest.fn(() => Promise.resolve()),
  playFailAnimation: jest.fn(() => Promise.resolve()),
}));

export { FloatingRail } from '../../../../scripts/highlighter/ui/FloatingRail.js';
export { RailStates } from '../../../../scripts/highlighter/ui/FloatingRailState.js';
export {
  checkPageStatus,
  savePageFromRail,
  syncHighlights,
  openSidePanel,
} from '../../../../scripts/highlighter/ui/FloatingRailRuntime.js';
export { createFloatingRailContainer } from '../../../../scripts/highlighter/ui/components/FloatingRailContainer.js';
export { injectRailStylesIntoShadowRoot } from '../../../../scripts/highlighter/ui/styles/floatingRailStyles.js';
export {
  playLaunchAnimation,
  playFireworkAnimation,
  playFailAnimation,
} from '../../../../scripts/highlighter/ui/FloatingRailAnimations.js';
export { UI_MESSAGES } from '../../../../scripts/config/shared/messages.js';
export { ErrorHandler } from '../../../../scripts/utils/ErrorHandler.js';
export { sanitizeApiError } from '../../../../scripts/utils/ApiErrorSanitizer.js';
export { default as Logger } from '../../../../scripts/utils/Logger.js';

import { RAIL_INSTANCE_ID } from '../../../../scripts/highlighter/ui/floatingRailInstance.js';
import { checkPageStatus } from '../../../../scripts/highlighter/ui/FloatingRailRuntime.js';
import { createFloatingRailContainer } from '../../../../scripts/highlighter/ui/components/FloatingRailContainer.js';
import { injectRailStylesIntoShadowRoot } from '../../../../scripts/highlighter/ui/styles/floatingRailStyles.js';

export const TEST_RAIL_HOST_ID = `notion-floating-rail-host-${RAIL_INSTANCE_ID}`;
export const TEST_RAIL_POSITION_KEY = `notion-floating-rail-position-${RAIL_INSTANCE_ID}`;
export const TEST_RAIL_STATE_KEY = `notion-floating-rail-state-${RAIL_INSTANCE_ID}`;
export const TEST_RAIL_DISMISSED_KEY = `notion-floating-rail-dismissed-${RAIL_INSTANCE_ID}`;

export function createMockContainerElement() {
  const container = document.createElement('div');
  container.className = 'rail-container collapsed';

  const trigger = document.createElement('button');
  trigger.className = 'rail-trigger';
  trigger.setAttribute('aria-expanded', 'false');
  container.append(trigger);

  const actions = document.createElement('div');
  actions.className = 'rail-actions';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'rail-close-btn';
  closeBtn.setAttribute('aria-label', '關閉工具列');
  actions.append(closeBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'rail-action-btn';
  saveBtn.dataset.action = 'save';
  saveBtn.setAttribute('aria-label', '保存網頁');
  actions.append(saveBtn);

  const errorTooltip = document.createElement('span');
  errorTooltip.className = 'rail-error-tooltip';
  actions.append(errorTooltip);

  const highlightGroup = document.createElement('div');
  highlightGroup.className = 'rail-highlight-group';

  const highlightToggle = document.createElement('button');
  highlightToggle.className = 'rail-action-btn rail-highlight-toggle';
  highlightToggle.dataset.action = 'highlight';
  highlightToggle.setAttribute('aria-label', '開始標註');

  const colorIndicator = document.createElement('span');
  colorIndicator.className = 'color-indicator';
  colorIndicator.style.backgroundColor = '#fff3cd';
  highlightToggle.append(colorIndicator);
  highlightGroup.append(highlightToggle);

  const palette = document.createElement('div');
  palette.className = 'color-palette';
  palette.setAttribute('role', 'radiogroup');
  palette.setAttribute('aria-label', '標註顏色');

  const yellowSwatch = document.createElement('button');
  yellowSwatch.className = 'color-swatch selected';
  yellowSwatch.dataset.color = 'yellow';
  yellowSwatch.setAttribute('aria-checked', 'true');
  palette.append(yellowSwatch);

  const greenSwatch = document.createElement('button');
  greenSwatch.className = 'color-swatch';
  greenSwatch.dataset.color = 'green';
  greenSwatch.setAttribute('aria-checked', 'false');
  palette.append(greenSwatch);

  highlightGroup.append(palette);
  actions.append(highlightGroup);

  const manageBtn = document.createElement('button');
  manageBtn.className = 'rail-action-btn';
  manageBtn.dataset.action = 'manage';
  manageBtn.setAttribute('aria-label', '管理標註');
  actions.append(manageBtn);

  container.append(actions);
  return container;
}

export function createMockManager() {
  return {
    startHighlighting: jest.fn(),
    stopHighlighting: jest.fn(),
    setHighlightColor: jest.fn(),
    handleDocumentClick: jest.fn().mockReturnValue(false),
    collectHighlightsForNotion: jest.fn(() => []),
  };
}

export function createPointerMouseEvent(type, options = {}) {
  const event = new MouseEvent(type, options);
  if (options.pointerId !== undefined) {
    Object.defineProperty(event, 'pointerId', {
      configurable: true,
      value: options.pointerId,
    });
  }
  return event;
}

export function dispatchTriggerPointerDown(rail, options = {}) {
  const trigger = rail.container.querySelector('.rail-trigger');
  const eventOptions = { clientX: 790, clientY: 300, ...options };
  const event =
    eventOptions.pointerId === undefined
      ? new MouseEvent('pointerdown', eventOptions)
      : createPointerMouseEvent('pointerdown', eventOptions);

  trigger.dispatchEvent(event);
  return trigger;
}

export function setupFloatingRailTestEnvironment() {
  document.body.innerHTML = '';
  sessionStorage.clear();
  const manager = createMockManager();
  createFloatingRailContainer.mockReturnValue(createMockContainerElement());
  checkPageStatus.mockResolvedValue({ isSaved: false, canSave: true });
  injectRailStylesIntoShadowRoot.mockImplementation(() => {});
  return manager;
}

export function teardownFloatingRailTestEnvironment() {
  jest.restoreAllMocks();
  jest.clearAllMocks();
}
