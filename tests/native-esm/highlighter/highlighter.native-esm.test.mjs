/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
};

const normalizeUrlMock = jest.fn(url => String(url || '').replace(/#.*$/, ''));
const sendMessageMock = jest.fn();
const storageGetMock = jest.fn();
const storageSetMock = jest.fn();
const storageRemoveMock = jest.fn();

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => url),
}));

await jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => ({
  isSafeStableUrl: jest.fn(url => typeof url === 'string' && url.startsWith('https://')),
  normalizeUrl: normalizeUrlMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/keyOrdering.js', () => ({
  compareKeysAlphabetically: (left, right) => String(left).localeCompare(String(right)),
}));

await jest.unstable_mockModule('../../../scripts/highlighter/core/Range.js', () => ({
  restoreRangeWithRetry: jest.fn(),
  serializeRange: jest.fn(() => ({ startContainer: [], endContainer: [] })),
}));

await jest.unstable_mockModule('../../../scripts/highlighter/core/HighlightInteraction.js', () => ({
  HighlightInteraction: jest.fn(),
}));

await jest.unstable_mockModule('../../../styles/ui-token-constants.js', () => ({
  hexToRgba: (hex, alpha) => `${hex}/${alpha}`,
}));

await jest.unstable_mockModule('../../../scripts/highlighter/utils/safeIcon.js', () => ({
  createSafeIcon: svgString => {
    const wrapper = document.createElement('span');
    wrapper.className = 'icon';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const iconMatch = String(svgString || '').match(/data-rail-icon="([^"]+)"/);
    if (iconMatch) {
      svg.dataset.railIcon = iconMatch[1];
    }
    wrapper.append(svg);
    return wrapper;
  },
}));

await jest.unstable_mockModule(
  '../../../scripts/highlighter/ui/components/FloatingRailContainer.js',
  () => ({
    RAIL_ICONS: {
      NOTION: '<svg data-rail-icon="save"></svg>',
      SYNC: '<svg data-rail-icon="sync"></svg>',
    },
  })
);

const { HighlightManager } = await import('../../../scripts/highlighter/core/HighlightManager.js');
const { HIGHLIGHTS_PREFIX } = await import('../../../scripts/config/shared/storage.js');
const { HighlightStorageGateway, STORAGE_GATEWAY_RETRY } = await import(
  '../../../scripts/highlighter/core/HighlightStorageGateway.js'
);
const {
  applyHighlightActive,
  applyRailState,
  applySaveActionVisibility,
  applySelectedColor,
  getRailElements,
  hideColorPalette,
  showColorPalette,
} = await import('../../../scripts/highlighter/ui/FloatingRailUI.js');
const { waitForDOMStability } = await import('../../../scripts/highlighter/utils/domStability.js');
const { findTextFuzzy, findTextInPage, findTextWithTreeWalker } = await import(
  '../../../scripts/highlighter/utils/textSearch.js'
);

function installChromeStorage({ runtimeResponse = { success: true }, storedData = {} } = {}) {
  sendMessageMock.mockResolvedValue(runtimeResponse);
  storageGetMock.mockResolvedValue(storedData);
  storageSetMock.mockResolvedValue(undefined);
  storageRemoveMock.mockResolvedValue(undefined);
  globalThis.chrome = {
    runtime: {
      sendMessage: sendMessageMock,
    },
    storage: {
      local: {
        get: storageGetMock,
        remove: storageRemoveMock,
        set: storageSetMock,
      },
    },
  };
}

function createRailContainer() {
  const container = document.createElement('div');
  container.className = 'rail-container collapsed';
  container.innerHTML = `
    <button class="rail-trigger" aria-expanded="false"></button>
    <button class="rail-close-btn"></button>
    <button class="rail-action-btn" data-action="save" aria-label="保存網頁">
      <span class="icon"><svg data-rail-icon="save"></svg></span>
    </button>
    <button class="rail-action-btn rail-highlight-toggle" data-action="highlight" aria-label="開始標註">
      <span class="color-indicator"></span>
    </button>
    <button class="rail-action-btn" data-action="manage"></button>
    <div class="color-palette">
      <button class="color-swatch selected" data-color="yellow" aria-checked="true"></button>
      <button class="color-swatch" data-color="blue" aria-checked="false"></button>
    </div>
  `;
  document.body.append(container);
  return container;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  installChromeStorage();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  delete globalThis.chrome;
});

describe('highlighter native ESM diagnostics', () => {
  test('HighlightManager manages injected dependencies, color, count, and clearAll', () => {
    const manager = new HighlightManager({ defaultColor: 'green' });
    const styleManager = {
      cleanup: jest.fn(),
      clearAllHighlights: jest.fn(),
    };
    const storage = {
      save: jest.fn(),
    };

    manager.setDependencies({
      interaction: { getHighlightAtPoint: jest.fn(), handleClick: jest.fn() },
      migration: { checkAndMigrate: jest.fn() },
      storage,
      styleManager,
      toast: null,
    });
    manager.highlights.set('h1', { color: 'green', text: 'Native' });

    manager.setColor('blue');
    manager.setColor('not-a-color');
    expect(manager.currentColor).toBe('blue');
    expect(manager.getCount()).toBe(1);

    manager.clearAll();

    expect(styleManager.clearAllHighlights).toHaveBeenCalled();
    expect(storage.save).toHaveBeenCalled();
    expect(manager.getCount()).toBe(0);
    expect(loggerMock.success).toHaveBeenCalledWith('已清除所有標註', { action: 'clearAll' });
  });

  test('HighlightStorageGateway saves through background and loads legacy fallback data', async () => {
    const highlights = [{ color: 'yellow', id: 'h1', text: 'Native ESM' }];

    await HighlightStorageGateway.saveHighlights('https://example.com/article#section', highlights);

    expect(sendMessageMock).toHaveBeenCalledWith({
      action: 'UPDATE_HIGHLIGHTS',
      highlights,
      url: 'https://example.com/article#section',
    });
    expect(storageSetMock).not.toHaveBeenCalled();
    expect(STORAGE_GATEWAY_RETRY.maxAttempts).toBeGreaterThan(0);

    localStorage.setItem(
      `${HIGHLIGHTS_PREFIX}https://example.com/article`,
      JSON.stringify({ highlights })
    );
    const loaded = await HighlightStorageGateway.loadHighlights('https://example.com/article');

    expect(storageGetMock).toHaveBeenCalled();
    expect(loaded).toEqual(highlights);
  });

  test('FloatingRailUI applies rail state, save action, selected color, and palette state', () => {
    const container = createRailContainer();
    const elements = getRailElements(container);

    applyRailState(container, 'expanded');
    expect(container.classList.contains('expanded')).toBe(true);
    expect(elements.trigger.getAttribute('aria-expanded')).toBe('true');

    applySaveActionVisibility(elements.saveBtn, { canSave: false, isSaved: true });
    expect(elements.saveBtn.dataset.action).toBe('sync');
    expect(elements.saveBtn.querySelector('svg').dataset.railIcon).toBe('sync');

    applySelectedColor(container, 'blue');
    expect(elements.colorIndicator.style.backgroundColor).not.toBe('');
    expect(container.querySelector('[data-color="blue"]').getAttribute('aria-checked')).toBe(
      'true'
    );

    applyHighlightActive(elements.highlightBtn, true);
    expect(elements.highlightBtn.dataset.highlightState).toBe('active');
    expect(elements.highlightBtn.getAttribute('aria-pressed')).toBe('true');

    showColorPalette(elements.colorPalette);
    expect(elements.colorPalette.classList.contains('visible')).toBe(true);
    hideColorPalette(elements.colorPalette);
    expect(elements.colorPalette.classList.contains('visible')).toBe(false);
  });

  test('domStability and textSearch utilities run under native ESM jsdom', async () => {
    jest.useFakeTimers();
    document.body.innerHTML = '<main id="article">Native    ESM text search</main>';

    const stabilityPromise = waitForDOMStability({
      containerSelector: '#article',
      initialGracePeriodMs: 0,
      maxWaitMs: 500,
      stabilityThresholdMs: 50,
    });
    jest.advanceTimersByTime(0);
    await expect(stabilityPromise).resolves.toBe(true);

    const treeWalkerRange = findTextWithTreeWalker('Native');
    expect(treeWalkerRange.toString()).toBe('Native');
    expect(findTextInPage('   ')).toBeNull();
    expect(findTextFuzzy('Native ESM').toString()).toContain('Native');
  });
});
