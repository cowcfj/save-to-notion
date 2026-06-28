/**
 * @jest-environment jsdom
 *
 * Shared FloatingRail test harness.
 */

import { jest } from '@jest/globals';
import { RAIL_INSTANCE_ID } from '../../../../scripts/highlighter/ui/floatingRailInstance.js';
import { registerUiTokenConstantsMock } from './uiTokenConstantsMock.js';

export { RailStates } from '../../../../scripts/highlighter/ui/FloatingRailState.js';
export { UI_MESSAGES } from '../../../../scripts/config/shared/messages.js';

const mockRuntime = {
  checkPageStatus: jest.fn(),
  savePageFromRail: jest.fn(),
  syncHighlights: jest.fn(),
  openSidePanel: jest.fn(),
};

const mockStyles = {
  injectRailStylesIntoShadowRoot: jest.fn(),
};

const mockContainer = {
  createFloatingRailContainer: jest.fn(),
  RAIL_ICONS: {
    NOTION:
      '<svg viewBox="0 0 24 24" fill="currentColor" data-rail-icon="save"><path d="M12 2.25v14.78"/></svg>',
    SYNC: '<svg viewBox="0 0 24 24" fill="currentColor" data-rail-icon="sync"><path d="M4.755 10.059"/></svg>',
  },
};

const mockAnimations = {
  playLaunchAnimation: jest.fn(() => ({ cancel: jest.fn(), playState: 'running' })),
  playFireworkAnimation: jest.fn(() => Promise.resolve()),
  playFailAnimation: jest.fn(() => Promise.resolve()),
};

jest.mock('../../../../scripts/highlighter/ui/FloatingRailRuntime.js', () => mockRuntime);

jest.mock('../../../../scripts/highlighter/ui/styles/floatingRailStyles.js', () => mockStyles);

jest.mock(
  '../../../../scripts/highlighter/ui/components/FloatingRailContainer.js',
  () => mockContainer
);

jest.mock('../../../../scripts/highlighter/ui/FloatingRailAnimations.js', () => mockAnimations);

if (typeof jest.unstable_mockModule === 'function') {
  jest.unstable_mockModule(
    '../../../../scripts/highlighter/ui/FloatingRailRuntime.js',
    () => mockRuntime
  );
  jest.unstable_mockModule(
    '../../../../scripts/highlighter/ui/styles/floatingRailStyles.js',
    () => mockStyles
  );
  jest.unstable_mockModule(
    '../../../../scripts/highlighter/ui/components/FloatingRailContainer.js',
    () => mockContainer
  );
  jest.unstable_mockModule(
    '../../../../scripts/highlighter/ui/FloatingRailAnimations.js',
    () => mockAnimations
  );
}

registerUiTokenConstantsMock(jest, '../../../../styles/ui-token-constants.js');

const { FloatingRail } = require('../../../../scripts/highlighter/ui/FloatingRail.js');
const { ErrorHandler } = require('../../../../scripts/utils/ErrorHandler.js');
const { sanitizeApiError } = require('../../../../scripts/utils/ApiErrorSanitizer.js');
const LoggerModule = require('../../../../scripts/utils/Logger.js');
const Logger = LoggerModule.default || LoggerModule;

export { FloatingRail, ErrorHandler, sanitizeApiError, Logger };

export const { checkPageStatus, savePageFromRail, syncHighlights, openSidePanel } = mockRuntime;
export const { createFloatingRailContainer } = mockContainer;
export const { injectRailStylesIntoShadowRoot } = mockStyles;
export const { playLaunchAnimation, playFireworkAnimation, playFailAnimation } = mockAnimations;

export const TEST_RAIL_HOST_ID = `notion-floating-rail-host-${RAIL_INSTANCE_ID}`;
export const TEST_RAIL_POSITION_KEY = `notion-floating-rail-position-${RAIL_INSTANCE_ID}`;
export const TEST_RAIL_STATE_KEY = `notion-floating-rail-state-${RAIL_INSTANCE_ID}`;
export const TEST_RAIL_DISMISSED_KEY = `notion-floating-rail-dismissed-${RAIL_INSTANCE_ID}`;

const activeRails = new Set();
let originalInitialize;

beforeAll(async () => {
  originalInitialize = FloatingRail.prototype.initialize;
  FloatingRail.prototype.initialize = function trackInitializedRail(...args) {
    activeRails.add(this);
    return originalInitialize.apply(this, args);
  };
});

afterAll(() => {
  if (FloatingRail && originalInitialize) {
    FloatingRail.prototype.initialize = originalInitialize;
  }
});

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

export async function createInitializedRail(manager) {
  const rail = new FloatingRail(manager);
  await rail.initialize();
  return rail;
}

export function setupFloatingRailTestEnvironment() {
  document.body.innerHTML = '';
  sessionStorage.clear();
  activeRails.clear();
  globalThis.chrome = {
    ...globalThis.chrome,
    storage: {
      ...globalThis.chrome?.storage,
      sync: {
        ...globalThis.chrome?.storage?.sync,
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        ...globalThis.chrome?.storage?.onChanged,
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
  };
  const manager = createMockManager();
  createFloatingRailContainer.mockReturnValue(createMockContainerElement());
  checkPageStatus.mockResolvedValue({ isSaved: false, canSave: true });
  injectRailStylesIntoShadowRoot.mockImplementation(() => {});
  return manager;
}

export function teardownFloatingRailTestEnvironment() {
  for (const rail of activeRails) {
    try {
      rail.destroy();
    } catch {
      // Best-effort cleanup for partially initialized test instances.
    }
  }
  activeRails.clear();
  jest.restoreAllMocks();
  jest.clearAllMocks();
}
