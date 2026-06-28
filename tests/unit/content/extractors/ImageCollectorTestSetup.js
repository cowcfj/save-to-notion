const isESM = typeof jest.unstable_mockModule === 'function' && typeof require === 'undefined';

if (!isESM) {
  require('./ImageCollectorCjsMocks.js');
}

// --- Active ESM/CommonJS Loader ---
let isInitialized = false;
export const imageCollectorTestModules = {};

export async function importImageCollectorTestModules() {
  if (isInitialized) {
    return imageCollectorTestModules;
  }

  if (isESM) {
    // Register ESM mocks asynchronously
    // Under Native ESM, since there is no local package.json with "type": "module" in this folder,
    // Jest falls back to 'tests/native-esm/native-runner.setup.mjs' as the module resolution origin.
    // Hence we use "../../" to step back from tests/native-esm/ to project root.
    jest.unstable_mockModule('../../scripts/content/extractors/ReadabilityAdapter.js', () => ({
      cachedQuery: jest.fn(),
    }));

    jest.unstable_mockModule('../../scripts/performance/PerformanceOptimizer.js', () => ({
      batchProcess: jest.fn(),
      batchProcessWithRetry: jest.fn(),
    }));

    jest.unstable_mockModule('../../scripts/utils/ErrorHandler.js', () => ({
      ErrorHandler: {
        logError: jest.fn(),
      },
    }));

    jest.unstable_mockModule('../../scripts/content/extractors/NextJsExtractor.js', () => ({
      NextJsExtractor: {
        detect: jest.fn(),
        extract: jest.fn(),
      },
    }));

    jest.unstable_mockModule('../../scripts/utils/Logger.js', () => ({
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

    jest.unstable_mockModule('../../scripts/config/shared/content.js', () => ({
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

    jest.unstable_mockModule('../../scripts/config/shared/messages.js', () => ({
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

    jest.unstable_mockModule('../../scripts/utils/imageUtils.js', () => ({
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

    jest.unstable_mockModule('../../scripts/utils/temporaryImageUrl.js', () => ({
      __esModule: true,
      isTemporaryImageUrl: jest.fn(() => false),
    }));

    jest.unstable_mockModule(
      '../../scripts/content/extractors/temporaryImagePlaceholder.js',
      () => ({
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
      })
    );
  }

  let ImageCollectorMod;
  let ReadabilityAdapterMod;
  let PerformanceOptimizerMod;
  let NextJsExtractorMod;
  let LoggerMod;
  let ImageUtilsMod;
  let TemporaryImageUrlMod;
  let TemporaryImagePlaceholderMod;
  let ErrorHandlerMod;

  if (isESM) {
    [
      ImageCollectorMod,
      ReadabilityAdapterMod,
      PerformanceOptimizerMod,
      NextJsExtractorMod,
      LoggerMod,
      ImageUtilsMod,
      TemporaryImageUrlMod,
      TemporaryImagePlaceholderMod,
      ErrorHandlerMod,
    ] = await Promise.all([
      import('../../../../scripts/content/extractors/ImageCollector.js'),
      import('../../../../scripts/content/extractors/ReadabilityAdapter.js'),
      import('../../../../scripts/performance/PerformanceOptimizer.js'),
      import('../../../../scripts/content/extractors/NextJsExtractor.js'),
      import('../../../../scripts/utils/Logger.js'),
      import('../../../../scripts/utils/imageUtils.js'),
      import('../../../../scripts/utils/temporaryImageUrl.js'),
      import('../../../../scripts/content/extractors/temporaryImagePlaceholder.js'),
      import('../../../../scripts/utils/ErrorHandler.js'),
    ]);
  } else {
    [
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
    LoggerMod = { default: globalThis.Logger };

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

  // Populate dynamic object reference
  const populated = {
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

  Object.assign(imageCollectorTestModules, populated);

  // Set up global mocks for dual-run compatibility
  globalThis.Logger = imageCollectorTestModules.Logger;
  globalThis.ImageUtils = {
    extractImageSrc: imageCollectorTestModules.extractImageSrc,
    cleanImageUrl: imageCollectorTestModules.cleanImageUrl,
    isValidImageUrl: imageCollectorTestModules.isValidImageUrl,
    isValidCleanedImageUrl: imageCollectorTestModules.isValidCleanedImageUrl,
  };
  globalThis.ErrorHandler = imageCollectorTestModules.ErrorHandler;

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
