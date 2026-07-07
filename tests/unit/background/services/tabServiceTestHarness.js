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

const applyLoggerMockDefaults = logger => {
  for (const mockFn of Object.values(logger)) {
    mockFn.mockReset();
  }
};

const applyUrlUtilsMockDefaults = () => {
  mockUrlUtils.resolveStorageUrl.mockReset();
  mockUrlUtils.resolveStorageUrl.mockImplementation(url => url);
  mockUrlUtils.buildStableUrlFromNextData.mockReset();
  mockUrlUtils.hasSameOrigin.mockReset();
  mockUrlUtils.normalizeUrl.mockReset();
  mockUrlUtils.normalizeUrl.mockImplementation(url => url);
  mockUrlUtils.isSafeStableUrl.mockReset();
  mockUrlUtils.isSafeStableUrl.mockImplementation(url => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  });
  mockUrlUtils.isRootUrl.mockReset();
  mockUrlUtils.isRootUrl.mockReturnValue(false);
};

export const loadedTabServiceModules = {
  TabService: null,
  _migrationScript: null,
  URL_ALIAS_PREFIX: null,
  PAGE_PREFIX: null,
  HIGHLIGHTS_PREFIX: null,
  sanitizeUrlForLogging: null,
  Logger: null,
  urlUtils: null,
};

beforeAll(async () => {
  const tabServiceModule = await import('../../../../scripts/background/services/TabService.js');
  const storageModule = await import('../../../../scripts/config/shared/storage.js');
  const logSanitizerModule = await import('../../../../scripts/utils/LogSanitizer.js');
  const loggerModule = await import('../../../../scripts/utils/Logger.js');

  loadedTabServiceModules.TabService = tabServiceModule.TabService;
  loadedTabServiceModules._migrationScript = tabServiceModule._migrationScript;
  loadedTabServiceModules.URL_ALIAS_PREFIX = storageModule.URL_ALIAS_PREFIX;
  loadedTabServiceModules.PAGE_PREFIX = storageModule.PAGE_PREFIX;
  loadedTabServiceModules.HIGHLIGHTS_PREFIX = storageModule.HIGHLIGHTS_PREFIX;
  loadedTabServiceModules.sanitizeUrlForLogging = logSanitizerModule.sanitizeUrlForLogging;
  loadedTabServiceModules.Logger = loggerModule.default;
  loadedTabServiceModules.urlUtils = await import('../../../../scripts/utils/urlUtils.js');
});

const buildChromeMock = () => ({
  action: {
    setBadgeText: jest.fn().mockResolvedValue(undefined),
    setBadgeBackgroundColor: jest.fn().mockResolvedValue(undefined),
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
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
    remove: jest.fn().mockResolvedValue(undefined),
  },
});

globalThis.chrome = buildChromeMock();

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

const applyInjectionServiceDefaults = () => {
  mockInjectionService.ensureBundleInjected.mockReset();
  mockInjectionService.ensureBundleInjected.mockResolvedValue(true);
  mockInjectionService.injectWithResponse.mockReset();
  mockInjectionService.injectWithResponse.mockResolvedValue({ migrated: false });
  mockInjectionService.injectHighlightRestore.mockReset();
  mockInjectionService.injectHighlightRestore.mockResolvedValue(undefined);
};

export const createTabService = (overrides = {}) =>
  new loadedTabServiceModules.TabService({
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
  jest.restoreAllMocks();
  globalThis.chrome = buildChromeMock();
  chrome.runtime = { lastError: null };
  applyLoggerMockDefaults(mockLoggerModule);
  applyLoggerMockDefaults(mockLogger);
  applyInjectionServiceDefaults();
  applyUrlUtilsMockDefaults();
};
