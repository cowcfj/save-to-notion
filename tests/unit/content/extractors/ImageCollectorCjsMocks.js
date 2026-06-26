// This file contains CommonJS-specific static mocks for ImageCollector.
// It is required only in CJS mode to allow Babel's jest-hoist to work properly
// without execution path errors under Native ESM.

jest.mock('../../../../scripts/content/extractors/ReadabilityAdapter.js', () => ({
  cachedQuery: jest.fn(),
}));

jest.mock('../../../../scripts/performance/PerformanceOptimizer.js', () => ({
  batchProcess: jest.fn(),
  batchProcessWithRetry: jest.fn(),
}));

jest.mock('../../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: {
    logError: jest.fn(),
  },
}));

jest.mock('../../../../scripts/content/extractors/NextJsExtractor.js', () => ({
  NextJsExtractor: {
    detect: jest.fn(),
    extract: jest.fn(),
  },
}));

jest.mock('../../../../scripts/utils/Logger.js', () => ({
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

jest.mock('../../../../scripts/config/shared/content.js', () => ({
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

jest.mock('../../../../scripts/config/shared/messages.js', () => ({
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

jest.mock('../../../../scripts/utils/imageUtils.js', () => ({
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

jest.mock('../../../../scripts/utils/temporaryImageUrl.js', () => ({
  __esModule: true,
  isTemporaryImageUrl: jest.fn(() => false),
}));

jest.mock('../../../../scripts/content/extractors/temporaryImagePlaceholder.js', () => ({
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
