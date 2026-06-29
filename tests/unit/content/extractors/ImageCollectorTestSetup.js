import path from 'node:path';
import { pathToFileURL } from 'node:url';

const isESM = typeof jest.unstable_mockModule === 'function' && typeof require === 'undefined';
const setupDirectory = path.resolve(process.cwd(), 'tests/unit/content/extractors');

if (!isESM) {
  require('./ImageCollectorCjsMocks.js');
}

// --- Active ESM/CommonJS Loader ---
let isInitialized = false;
export const imageCollectorTestModules = {};

const resolveModuleFileUrl = relativePath =>
  pathToFileURL(path.resolve(setupDirectory, relativePath)).href;

const imageCollectorModuleUrls = {
  ImageCollector: resolveModuleFileUrl('../../../../scripts/content/extractors/ImageCollector.js'),
  ReadabilityAdapter: resolveModuleFileUrl(
    '../../../../scripts/content/extractors/ReadabilityAdapter.js'
  ),
  PerformanceOptimizer: resolveModuleFileUrl(
    '../../../../scripts/performance/PerformanceOptimizer.js'
  ),
  ErrorHandler: resolveModuleFileUrl('../../../../scripts/utils/ErrorHandler.js'),
  NextJsExtractor: resolveModuleFileUrl(
    '../../../../scripts/content/extractors/NextJsExtractor.js'
  ),
  Logger: resolveModuleFileUrl('../../../../scripts/utils/Logger.js'),
  ContentConfig: resolveModuleFileUrl('../../../../scripts/config/shared/content.js'),
  MessagesConfig: resolveModuleFileUrl('../../../../scripts/config/shared/messages.js'),
  ImageUtils: resolveModuleFileUrl('../../../../scripts/utils/imageUtils.js'),
  TemporaryImageUrl: resolveModuleFileUrl('../../../../scripts/utils/temporaryImageUrl.js'),
  TemporaryImagePlaceholder: resolveModuleFileUrl(
    '../../../../scripts/content/extractors/temporaryImagePlaceholder.js'
  ),
};

function registerReadabilityAdapterMock() {
  jest.unstable_mockModule(imageCollectorModuleUrls.ReadabilityAdapter, () => ({
    cachedQuery: jest.fn(),
  }));
}

function registerPerformanceOptimizerMock() {
  jest.unstable_mockModule(imageCollectorModuleUrls.PerformanceOptimizer, () => ({
    batchProcess: jest.fn(),
    batchProcessWithRetry: jest.fn(),
  }));
}

function registerErrorHandlerMock() {
  jest.unstable_mockModule(imageCollectorModuleUrls.ErrorHandler, () => ({
    ErrorHandler: {
      logError: jest.fn(),
    },
  }));
}

function registerNextJsExtractorMock() {
  jest.unstable_mockModule(imageCollectorModuleUrls.NextJsExtractor, () => ({
    NextJsExtractor: {
      detect: jest.fn(),
      extract: jest.fn(),
    },
  }));
}

function registerLoggerMock() {
  jest.unstable_mockModule(imageCollectorModuleUrls.Logger, () => ({
    __esModule: true,
    default: {
      debug: jest.fn(),
      success: jest.fn(),
      start: jest.fn(),
      ready: jest.fn(),
      info: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }));
}

function registerContentConfigMock() {
  jest.unstable_mockModule(imageCollectorModuleUrls.ContentConfig, () => ({
    IMAGE_VALIDATION_CONSTANTS: {
      MAX_URL_LENGTH: 2000,
      MIN_IMAGE_WIDTH: 550,
      MIN_IMAGE_HEIGHT: 300,
    },
    IMAGE_LIMITS: {
      MAX_MAIN_CONTENT_IMAGES: 6,
      MAX_ADDITIONAL_IMAGES: 2,
      MAIN_CONTENT_SUFFICIENT_THRESHOLD: 2,
      MAX_GALLERY_IMAGES: 6,
      MIN_IMAGES_FOR_ARTICLE_SEARCH: 3,
      MAX_IMAGES_FROM_ARTICLE_SEARCH: 5,
      MAX_IMAGES_FROM_EXPANSION: 3,
      BATCH_PROCESS_THRESHOLD: 5,
    },
    IMAGE_SIZE_RESOLVE: {
      PER_IMAGE_TIMEOUT_MS: 3000,
      TOTAL_BUDGET_MS: 5000,
    },
    PERFORMANCE_OPTIMIZER: {
      MAX_NEXT_DATA_SIZE: 5_000_000,
    },
    FEATURED_IMAGE_SELECTORS: ['meta[property="og:image"]', '.featured-image img'],
    IMAGE_SELECTORS: ['img'],
    GALLERY_SELECTORS: ['.gallery img'],
    EXCLUSION_SELECTORS: ['.ad img'],
  }));
}

function registerMessagesConfigMock() {
  jest.unstable_mockModule(imageCollectorModuleUrls.MessagesConfig, () => ({
    ERROR_TYPES: {
      EXTRACTION_FAILED: 'extraction_failed',
      INVALID_URL: 'invalid_url',
      NETWORK_ERROR: 'network_error',
      PARSING_ERROR: 'parsing_error',
      PERFORMANCE_WARNING: 'performance_warning',
      DOM_ERROR: 'dom_error',
      VALIDATION_ERROR: 'validation_error',
      TIMEOUT_ERROR: 'timeout_error',
      STORAGE: 'storage',
      NOTION_API: 'notion_api',
      INJECTION: 'injection',
      PERMISSION: 'permission',
      INTERNAL: 'internal',
    },
  }));
}

function registerImageUtilsMock() {
  jest.unstable_mockModule(imageCollectorModuleUrls.ImageUtils, () => ({
    __esModule: true,
    extractImageSrc: jest.fn(),
    cleanImageUrl: jest.fn(url => url),
    isValidImageUrl: jest.fn(() => true),
    isValidCleanedImageUrl: jest.fn(() => true),
    default: {
      extractImageSrc: jest.fn(),
      cleanImageUrl: jest.fn(url => url),
      isValidImageUrl: jest.fn(() => true),
      isValidCleanedImageUrl: jest.fn(() => true),
    },
  }));
}

function registerTemporaryImageUrlMock() {
  jest.unstable_mockModule(imageCollectorModuleUrls.TemporaryImageUrl, () => ({
    __esModule: true,
    isTemporaryImageUrl: jest.fn(() => false),
  }));
}

function registerTemporaryImagePlaceholderMock() {
  jest.unstable_mockModule(imageCollectorModuleUrls.TemporaryImagePlaceholder, () => ({
    __esModule: true,
    buildTemporaryImagePlaceholderBlock: jest.fn((url, opts = {}) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: 'Patreon temp:' } },
          { type: 'text', text: { content: 'link', link: { url } } },
        ],
      },
      _meta: {
        placeholder: true,
        placeholderReason: 'temporary_image_url',
        originalSrc: url,
        alt: opts.alt || '',
      },
    })),
  }));
}

function registerEsmMocks() {
  registerReadabilityAdapterMock();
  registerPerformanceOptimizerMock();
  registerErrorHandlerMock();
  registerNextJsExtractorMock();
  registerLoggerMock();
  registerContentConfigMock();
  registerMessagesConfigMock();
  registerImageUtilsMock();
  registerTemporaryImageUrlMock();
  registerTemporaryImagePlaceholderMock();
}

async function importEsmModules() {
  return Promise.all([
    import(imageCollectorModuleUrls.ImageCollector),
    import(imageCollectorModuleUrls.ReadabilityAdapter),
    import(imageCollectorModuleUrls.PerformanceOptimizer),
    import(imageCollectorModuleUrls.NextJsExtractor),
    import(imageCollectorModuleUrls.Logger),
    import(imageCollectorModuleUrls.ImageUtils),
    import(imageCollectorModuleUrls.TemporaryImageUrl),
    import(imageCollectorModuleUrls.TemporaryImagePlaceholder),
    import(imageCollectorModuleUrls.ErrorHandler),
  ]);
}

function patchCjsLoggerMock() {
  try {
    const realLogger = require('../../../../scripts/utils/Logger.js');
    const actualLogger = realLogger.default || realLogger;
    if (actualLogger && actualLogger !== globalThis.Logger) {
      Object.keys(globalThis.Logger).forEach(key => {
        if (typeof globalThis.Logger[key] === 'function') {
          actualLogger[key] = globalThis.Logger[key];
        }
      });
    }
  } catch {
    // Best-effort CJS logger patch; tests fail later if the logger mock is unusable.
  }
}

async function importCjsModules() {
  const [
    ImageCollectorMod,
    ReadabilityAdapterMod,
    PerformanceOptimizerMod,
    NextJsExtractorMod,
    ImageUtilsMod,
    TemporaryImageUrlMod,
    TemporaryImagePlaceholderMod,
    ErrorHandlerMod,
  ] = await Promise.all([
    import('../../../../scripts/content/extractors/ImageCollector.js'),
    import('../../../../scripts/content/extractors/ReadabilityAdapter.js'),
    import('../../../../scripts/performance/PerformanceOptimizer.js'),
    import('../../../../scripts/content/extractors/NextJsExtractor.js'),
    import('../../../../scripts/utils/imageUtils.js'),
    import('../../../../scripts/utils/temporaryImageUrl.js'),
    import('../../../../scripts/content/extractors/temporaryImagePlaceholder.js'),
    import('../../../../scripts/utils/ErrorHandler.js'),
  ]);

  patchCjsLoggerMock();

  return [
    ImageCollectorMod,
    ReadabilityAdapterMod,
    PerformanceOptimizerMod,
    NextJsExtractorMod,
    { default: globalThis.Logger },
    ImageUtilsMod,
    TemporaryImageUrlMod,
    TemporaryImagePlaceholderMod,
    ErrorHandlerMod,
  ];
}

function buildImageCollectorTestModules([
  ImageCollectorMod,
  ReadabilityAdapterMod,
  PerformanceOptimizerMod,
  NextJsExtractorMod,
  LoggerMod,
  ImageUtilsMod,
  TemporaryImageUrlMod,
  TemporaryImagePlaceholderMod,
  ErrorHandlerMod,
]) {
  return {
    ImageCollector: ImageCollectorMod.ImageCollector,
    cachedQuery: ReadabilityAdapterMod.cachedQuery,
    batchProcessWithRetry: PerformanceOptimizerMod.batchProcessWithRetry,
    NextJsExtractor: NextJsExtractorMod.NextJsExtractor,
    Logger: LoggerMod.default || LoggerMod,
    extractImageSrc: ImageUtilsMod.extractImageSrc,
    cleanImageUrl: ImageUtilsMod.cleanImageUrl,
    isValidImageUrl: ImageUtilsMod.isValidImageUrl,
    isValidCleanedImageUrl: ImageUtilsMod.isValidCleanedImageUrl,
    isTemporaryImageUrl: TemporaryImageUrlMod.isTemporaryImageUrl,
    buildTemporaryImagePlaceholderBlock:
      TemporaryImagePlaceholderMod.buildTemporaryImagePlaceholderBlock,
    ErrorHandler: ErrorHandlerMod.ErrorHandler,
  };
}

function installImageCollectorGlobals() {
  globalThis.Logger = imageCollectorTestModules.Logger;
  globalThis.ImageUtils = {
    extractImageSrc: imageCollectorTestModules.extractImageSrc,
    cleanImageUrl: imageCollectorTestModules.cleanImageUrl,
    isValidImageUrl: imageCollectorTestModules.isValidImageUrl,
    isValidCleanedImageUrl: imageCollectorTestModules.isValidCleanedImageUrl,
  };
  globalThis.ErrorHandler = imageCollectorTestModules.ErrorHandler;
}

async function loadImageCollectorModuleMocks() {
  if (isESM) {
    registerEsmMocks();
    return importEsmModules();
  }

  return importCjsModules();
}

export async function importImageCollectorTestModules() {
  if (isInitialized) {
    return imageCollectorTestModules;
  }

  const importedModules = await loadImageCollectorModuleMocks();
  const populated = buildImageCollectorTestModules(importedModules);

  Object.assign(imageCollectorTestModules, populated);
  installImageCollectorGlobals();

  isInitialized = true;
  return imageCollectorTestModules;
}

const trackedSpies = [];

export const trackSpy = (...args) => {
  const spy = jest.spyOn(...args);
  trackedSpies.push(spy);
  return spy;
};

export function setupImageCollectorTestLifecycle() {
  beforeAll(async () => {
    await importImageCollectorTestModules();
  });

  beforeEach(() => {
    // Clear mocks before each test
    jest.resetAllMocks();
    document.body.innerHTML = '';

    // Standard Logger overrides
    imageCollectorTestModules.Logger.log.mockImplementation(() => undefined);
    imageCollectorTestModules.Logger.warn.mockImplementation(() => undefined);
    imageCollectorTestModules.Logger.error.mockImplementation(() => undefined);

    // Default return values/implementations for helper functions
    imageCollectorTestModules.extractImageSrc.mockReturnValue(null);
    imageCollectorTestModules.cleanImageUrl.mockImplementation(url => url);
    imageCollectorTestModules.isValidImageUrl.mockReturnValue(true);
    imageCollectorTestModules.isValidCleanedImageUrl.mockReturnValue(true);
    imageCollectorTestModules.isTemporaryImageUrl.mockReturnValue(false);
    imageCollectorTestModules.buildTemporaryImagePlaceholderBlock.mockImplementation(
      (url, opts = {}) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { type: 'text', text: { content: 'Patreon temp:' } },
            { type: 'text', text: { content: 'link', link: { url } } },
          ],
        },
        _meta: {
          placeholder: true,
          placeholderReason: 'temporary_image_url',
          originalSrc: url,
          alt: opts.alt || '',
        },
      })
    );

    // Default cachedQuery mock
    imageCollectorTestModules.cachedQuery.mockImplementation((selector, context, options) => {
      if (options?.all) {
        return [];
      }
      return null;
    });

    // Default batchProcessWithRetry mock
    imageCollectorTestModules.batchProcessWithRetry.mockResolvedValue({
      results: [],
      meta: {},
    });

    // Spy on _resolveImageSize to bypass actual 3s timeout
    trackSpy(imageCollectorTestModules.ImageCollector, '_resolveImageSize').mockResolvedValue({
      width: 800,
      height: 600,
    });
  });

  afterEach(() => {
    while (trackedSpies.length > 0) {
      trackedSpies.pop().mockRestore();
    }
    jest.clearAllMocks();
  });
}
