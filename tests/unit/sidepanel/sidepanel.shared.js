import { jest } from '@jest/globals';

function mockGetSidepanelUrlUtils() {
  globalThis.__sidepanelUrlUtilsMock ??= {
    normalizeUrl: jest.fn(url => url),
    computeStableUrl: jest.fn(),
    isSafeStableUrl: jest.fn(url => {
      try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
      } catch {
        return false;
      }
    }),
    isRootUrl: jest.fn(url => {
      try {
        const u = new URL(url);
        return (u.pathname === '/' || u.pathname === '') && u.search.length === 0;
      } catch {
        return false;
      }
    }),
  };
  return globalThis.__sidepanelUrlUtilsMock;
}

function mockGetSidepanelLogger() {
  globalThis.__sidepanelLoggerMock ??= {
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return globalThis.__sidepanelLoggerMock;
}

export const normalizeUrl = mockGetSidepanelUrlUtils().normalizeUrl;
export const computeStableUrl = mockGetSidepanelUrlUtils().computeStableUrl;
export const Logger = mockGetSidepanelLogger();

if (typeof jest.unstable_mockModule === 'function') {
  jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => mockGetSidepanelUrlUtils());
  jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
    __esModule: true,
    default: mockGetSidepanelLogger(),
  }));
}

jest.mock('../../../scripts/utils/urlUtils.js', () => mockGetSidepanelUrlUtils());
jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: mockGetSidepanelLogger(),
}));

export { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
export { RUNTIME_ACTIONS } from '../../../scripts/config/shared/runtimeActions.js';
export { sanitizeApiError } from '../../../scripts/utils/ApiErrorSanitizer.js';
export { sanitizeUrlForLogging } from '../../../scripts/utils/LogSanitizer.js';
export {
  SYNC_BUTTON_DEBOUNCE_MS,
  OPEN_BUTTON_DEBOUNCE_MS,
} from '../../../pages/sidepanel/sidepanelUI.js';

const IS_NATIVE_ESM = process.env.NODE_OPTIONS?.includes('--experimental-vm-modules');

export function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
}

export async function flushMicrotasks(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

globalThis.chrome = {
  tabs: {
    onActivated: { addListener: jest.fn() },
    onUpdated: { addListener: jest.fn() },
    query: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    sendMessage: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
    onChanged: { addListener: jest.fn() },
  },
  runtime: {
    sendMessage: jest.fn(),
  },
};

const REQUIRED_DOM_CONTRACT_TABS_MARKUP = `
      <button class="view-tab active" data-view="current">Current</button>
      <button class="view-tab" data-view="unsynced">Pending</button>
    `;

const UNSYNCED_VIEW_TABS_MARKUP = `
      <div class="view-tabs">
        <button class="view-tab active" data-view="current">Current Page</button>
        <button class="view-tab" data-view="unsynced">Pending<span id="unsynced-badge"></span></button>
      </div>
    `;

function buildHighlightCardTemplateMarkup() {
  return `
      <template id="highlight-card-template">
        <div class="highlight-card">
          <div class="highlight-color-indicator"></div>
          <p class="highlight-text"></p>
          <button class="delete-button"></button>
        </div>
      </template>
    `;
}

function buildPageCardTemplateMarkup({ variant = 'current' } = {}) {
  if (variant === 'unsynced') {
    return `
      <template id="page-card-template">
        <div class="page-card">
          <div class="page-card-header">
            <div class="page-title-row">
              <span class="status-dot"></span>
              <p class="page-title"></p>
            </div>
            <div class="page-info"><span class="page-meta"></span></div>
            <button class="page-open-button"></button>
            <button class="page-delete-button"></button>
          </div>
          <div class="page-card-previews"></div>
          <span class="page-card-remaining"></span>
        </div>
      </template>
    `;
  }

  return `
      <template id="page-card-template">
        <div class="page-card">
          <div class="page-title"></div>
          <div class="page-meta"></div>
          <div class="page-card-previews"></div>
          <div class="page-card-remaining"></div>
          <button class="page-open-button"></button>
          <button class="page-delete-button"></button>
        </div>
      </template>
    `;
}

function buildSidepanelViewMarkup({
  emptySubtitle = 'Subtitle',
  includeLoadingSpinner = false,
  includeStartHighlightButton = true,
  includeUnsavedPageNotice = true,
  loadMoreText = '',
  openNotionButtonStyle = '',
  pageCardVariant = 'current',
  standaloneUnsyncedBadge = true,
  viewTabsMarkup = '',
} = {}) {
  return `
      <div id="loading-state" style="display:none">${includeLoadingSpinner ? '<div class="spinner"></div><p></p>' : 'Loading...'}</div>
      <div id="empty-state" style="display:none">
        <p>Empty</p>
        <div class="subtitle">${emptySubtitle}</div>
      </div>
      <div id="highlights-list" style="display:none"></div>
      ${
        includeUnsavedPageNotice
          ? '<aside id="unsaved-page-notice" class="unsaved-page-notice" role="status" hidden></aside>'
          : ''
      }
      ${includeStartHighlightButton ? '<button id="start-highlight-button"></button>' : ''}
      <div id="unsynced-view" style="display:none"></div>
      <div id="unsynced-toolbar" style="display:none">
        <span id="unsynced-count-label"></span>
        <button id="clear-all-btn"></button>
      </div>
      <button id="load-more-btn" style="display:none">${loadMoreText}</button>
      <button id="sync-button"></button>
      <button id="open-notion-button"${openNotionButtonStyle}></button>
      <div id="status-message"></div>
      ${standaloneUnsyncedBadge ? '<span id="unsynced-badge"></span>' : ''}
      ${viewTabsMarkup}
      ${buildHighlightCardTemplateMarkup()}
      ${buildPageCardTemplateMarkup({ variant: pageCardVariant })}
    `;
}

export function buildCurrentViewDOM() {
  document.body.innerHTML = buildSidepanelViewMarkup();
}

export function setupDefaultChromeMocks({ stableUrl = 'https://example.js/stable' } = {}) {
  chrome.tabs.query.mockResolvedValue([{ id: 101, url: 'https://example.com' }]);
  chrome.tabs.get.mockResolvedValue({ id: 102, url: 'https://example.org' });
  chrome.tabs.create.mockResolvedValue({ id: 103, url: 'https://opened.example' });
  chrome.tabs.sendMessage.mockResolvedValue({ stableUrl });
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue();
  chrome.storage.local.remove.mockResolvedValue();
  chrome.runtime.sendMessage.mockResolvedValue({ success: true });
}

async function loadSidepanelModule({ flushCount = 6 } = {}) {
  await importSidepanelEntrypoint();
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flushMicrotasks(flushCount);
}

export async function importSidepanelEntrypoint() {
  if (IS_NATIVE_ESM) {
    await import('../../../pages/sidepanel/sidepanel.js');
    return;
  }

  jest.isolateModules(() => {
    require('../../../pages/sidepanel/sidepanel.js');
  });
}

export async function loadSidepanelForCurrentView() {
  jest.clearAllMocks();
  jest.useFakeTimers();
  buildCurrentViewDOM();
  setupDefaultChromeMocks();

  await loadSidepanelModule();
}

export function buildUnsyncedDOM() {
  document.body.innerHTML = buildSidepanelViewMarkup({
    emptySubtitle: '',
    includeLoadingSpinner: true,
    includeUnsavedPageNotice: false,
    loadMoreText: 'Load more',
    openNotionButtonStyle: ' style="display:none"',
    pageCardVariant: 'unsynced',
    standaloneUnsyncedBadge: false,
    viewTabsMarkup: UNSYNCED_VIEW_TABS_MARKUP,
  });
}

export function setupUnsyncedTestEnvironment() {
  jest.clearAllMocks();
  jest.useFakeTimers();
  buildUnsyncedDOM();
  setupDefaultChromeMocks({ stableUrl: 'https://example.com' });
}

export async function initModule(storageMock) {
  if (typeof storageMock === 'function') {
    chrome.storage.local.get.mockImplementation(storageMock);
  } else {
    chrome.storage.local.get.mockResolvedValue(storageMock);
  }
  await loadSidepanelModule({ flushCount: 10 });
}

export async function clickUnsyncedTab() {
  const tab = document.querySelector('[data-view="unsynced"]');
  tab.click();
  await flushMicrotasks(5);
}

function buildRequiredDomContractDOM() {
  document.body.innerHTML = buildSidepanelViewMarkup({
    includeStartHighlightButton: false,
    viewTabsMarkup: REQUIRED_DOM_CONTRACT_TABS_MARKUP,
  });
}

export function setupRequiredDomContractTest() {
  jest.resetModules();
  jest.clearAllMocks();
  jest.useFakeTimers();
  buildRequiredDomContractDOM();
  setupDefaultChromeMocks();
}
