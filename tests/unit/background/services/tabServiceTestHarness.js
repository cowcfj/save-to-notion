import { jest } from '@jest/globals';

export { buildHighlight, buildPageRecord } from './serviceTestSupport.js';

export const mockLoggerModule = {
  log: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
};

const mockCoreConfig = {
  TAB_SERVICE: {
    LOADING_TIMEOUT_MS: 1000,
    STATUS_UPDATE_DELAY_MS: 100,
    PRELOADER_PING_TIMEOUT_MS: 500,
  },
  HANDLER_CONSTANTS: {
    PAGE_STATUS_CACHE_TTL: 60_000,
  },
  RESTRICTED_PROTOCOLS: [
    'chrome:',
    'edge:',
    'about:',
    'data:',
    'chrome-extension:',
    'view-source:',
    'file:',
  ],
};

const mockContentConfig = {
  URL_NORMALIZATION: {
    TRACKING_PARAMS: ['utm_source'],
  },
};

export const mockUrlUtils = {
  resolveStorageUrl: jest.fn(url => url),
  buildStableUrlFromNextData: jest.fn(),
  hasSameOrigin: jest.fn(),
  normalizeUrl: jest.fn(url => url),
  isSafeStableUrl: jest.fn(url => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }),
  isRootUrl: jest.fn(() => false),
};

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: mockLoggerModule,
  ...mockLoggerModule,
}));

jest.mock('../../../../scripts/config/shared/core.js', () => mockCoreConfig);

jest.mock('../../../../scripts/config/shared/content.js', () => mockContentConfig);

jest.mock('../../../../scripts/utils/urlUtils.js', () => mockUrlUtils);

if (typeof jest.unstable_mockModule === 'function') {
  jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
    default: mockLoggerModule,
    ...mockLoggerModule,
  }));
  jest.unstable_mockModule('../../../../scripts/config/shared/core.js', () => mockCoreConfig);
  jest.unstable_mockModule('../../../../scripts/config/shared/content.js', () => mockContentConfig);
  jest.unstable_mockModule('../../../../scripts/utils/urlUtils.js', () => mockUrlUtils);
}

export let TabService;
export let _migrationScript;
export let URL_ALIAS_PREFIX;
export let PAGE_PREFIX;
export let HIGHLIGHTS_PREFIX;
export let sanitizeUrlForLogging;
export let Logger;
export let urlUtils;

beforeAll(async () => {
  ({ TabService, _migrationScript } =
    await import('../../../../scripts/background/services/TabService.js'));
  ({ URL_ALIAS_PREFIX, PAGE_PREFIX, HIGHLIGHTS_PREFIX } =
    await import('../../../../scripts/config/shared/storage.js'));
  ({ sanitizeUrlForLogging } = await import('../../../../scripts/utils/LogSanitizer.js'));
  ({ default: Logger } = await import('../../../../scripts/utils/Logger.js'));
  urlUtils = await import('../../../../scripts/utils/urlUtils.js');
});

globalThis.chrome = {
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
    sync: {
      get: jest.fn(),
    },
  },
  tabs: {
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onActivated: {
      addListener: jest.fn(),
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    get: jest.fn(),
    sendMessage: jest.fn().mockReturnValue(Promise.resolve()),
    query: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue(),
  },
};

export const mockLogger = {
  log: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
};

export const mockInjectionService = {
  ensureBundleInjected: jest.fn().mockResolvedValue(true),
  injectWithResponse: jest.fn().mockResolvedValue({ migrated: false }),
  injectHighlightRestore: jest.fn().mockResolvedValue(),
};

export const createTabService = (overrides = {}) =>
  new TabService({
    logger: mockLogger,
    injectionService: mockInjectionService,
    normalizeUrl: url => url,
    getSavedPageData: jest.fn().mockResolvedValue(null),
    isRestrictedUrl: url => url.includes('chrome://'),
    isRecoverableError: err => {
      const msg = typeof err === 'string' ? err : err?.message || '';
      return msg.includes('Cannot access');
    },
    checkPageExists: jest.fn().mockResolvedValue(true),
    getApiKey: jest.fn().mockResolvedValue('test-api-key'),
    clearPageState: jest.fn().mockResolvedValue(),
    clearNotionState: jest.fn().mockResolvedValue(),
    clearNotionStateWithRetry: jest.fn().mockResolvedValue({ cleared: true, attempts: 1 }),
    setSavedPageData: jest.fn().mockResolvedValue(),
    ...overrides,
  });

export const resetTabServiceTestState = () => {
  chrome.runtime = { lastError: null };
  jest.clearAllMocks();
};
