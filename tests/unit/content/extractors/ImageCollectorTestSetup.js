// Mock ReadabilityAdapter before importing ImageCollector
jest.mock('../../../../scripts/content/extractors/ReadabilityAdapter', () => ({
  cachedQuery: jest.fn(),
}));

// Mock PerformanceOptimizer
jest.mock('../../../../scripts/performance/PerformanceOptimizer', () => ({
  batchProcess: jest.fn(),
  batchProcessWithRetry: jest.fn(),
}));

jest.mock('../../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: {
    logError: jest.fn(),
  },
}));

// Mock NextJsExtractor
jest.mock('../../../../scripts/content/extractors/NextJsExtractor.js', () => ({
  NextJsExtractor: {
    detect: jest.fn(),
    extract: jest.fn(),
  },
}));

// Mock Logger
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

// Mock constants
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

// Mock ImageUtils module
jest.mock('../../../../scripts/utils/imageUtils.js', () => ({
  __esModule: true,
  extractImageSrc: jest.fn(),
  cleanImageUrl: jest.fn(url => url),
  isValidImageUrl: jest.fn(() => true),
  isValidCleanedImageUrl: jest.fn(() => true),
  default: {
    // Keep default for potential legacy access elsewhere (if any)
    extractImageSrc: jest.fn(),
    cleanImageUrl: jest.fn(url => url),
    isValidImageUrl: jest.fn(() => true),
    isValidCleanedImageUrl: jest.fn(() => true),
  },
}));

// Mock standalone temporary image URL detector
jest.mock('../../../../scripts/utils/temporaryImageUrl.js', () => ({
  __esModule: true,
  isTemporaryImageUrl: jest.fn(() => false),
}));

// Mock content-only temporary image placeholder helper
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

import { ImageCollector as ImportedImageCollector } from '../../../../scripts/content/extractors/ImageCollector.js';
import { cachedQuery as importedCachedQuery } from '../../../../scripts/content/extractors/ReadabilityAdapter.js';
import { batchProcessWithRetry as importedBatchProcessWithRetry } from '../../../../scripts/performance/PerformanceOptimizer.js';
import { NextJsExtractor as importedNextJsExtractor } from '../../../../scripts/content/extractors/NextJsExtractor.js';
import importedLogger from '../../../../scripts/utils/Logger.js';
import {
  extractImageSrc as importedExtractImageSrc,
  cleanImageUrl as importedCleanImageUrl,
  isValidImageUrl as importedIsValidImageUrl,
  isValidCleanedImageUrl as importedIsValidCleanedImageUrl,
} from '../../../../scripts/utils/imageUtils.js';
import { isTemporaryImageUrl as importedIsTemporaryImageUrl } from '../../../../scripts/utils/temporaryImageUrl.js';
import { buildTemporaryImagePlaceholderBlock as importedBuildTemporaryImagePlaceholderBlock } from '../../../../scripts/content/extractors/temporaryImagePlaceholder.js';
import { ErrorHandler as importedErrorHandler } from '../../../../scripts/utils/ErrorHandler.js';

export const imageCollectorTestModules = {
  ImageCollector: ImportedImageCollector,
  cachedQuery: importedCachedQuery,
  batchProcessWithRetry: importedBatchProcessWithRetry,
  NextJsExtractor: importedNextJsExtractor,
  Logger: importedLogger,
  extractImageSrc: importedExtractImageSrc,
  cleanImageUrl: importedCleanImageUrl,
  isValidCleanedImageUrl: importedIsValidCleanedImageUrl,
  isTemporaryImageUrl: importedIsTemporaryImageUrl,
  ErrorHandler: importedErrorHandler,
};

const isValidImageUrl = importedIsValidImageUrl;
const buildTemporaryImagePlaceholderBlock = importedBuildTemporaryImagePlaceholderBlock;
const ErrorHandler = importedErrorHandler;

globalThis.Logger = importedLogger;
globalThis.ImageUtils = {
  extractImageSrc: importedExtractImageSrc,
  cleanImageUrl: importedCleanImageUrl,
  isValidImageUrl,
  isValidCleanedImageUrl: importedIsValidCleanedImageUrl,
};
globalThis.ErrorHandler = ErrorHandler;

const trackedSpies = [];

export const trackSpy = (...args) => {
  const spy = jest.spyOn(...args);
  trackedSpies.push(spy);
  return spy;
};

export function setupImageCollectorTestLifecycle() {
  beforeEach(() => {
    // jest.resetAllMocks() clears all mocks including their implementations.
    // We must restore default implementations below to ensure tests start with a clean state.
    jest.resetAllMocks();
    document.body.innerHTML = '';

    // Default mocks
    globalThis.Logger.log.mockImplementation(() => undefined);
    globalThis.Logger.warn.mockImplementation(() => undefined);
    globalThis.Logger.error.mockImplementation(() => undefined);

    importedExtractImageSrc.mockReturnValue(null);
    importedCleanImageUrl.mockImplementation(url => url);
    isValidImageUrl.mockReturnValue(true);
    importedIsValidCleanedImageUrl.mockReturnValue(true);
    importedIsTemporaryImageUrl.mockReturnValue(false);
    buildTemporaryImagePlaceholderBlock.mockImplementation((url, opts = {}) => ({
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
    }));

    // Default cachedQuery mock
    importedCachedQuery.mockImplementation((selector, context, options) => {
      if (options?.all) {
        return [];
      }
      return null;
    });

    // Default batchProcessWithRetry mock (success case by default to avoid breaking other tests)
    importedBatchProcessWithRetry.mockResolvedValue({
      results: [],
      meta: {},
    });

    // 短路 _resolveImageSize 避免真實等待 3 秒/張 (總共可能耗費數十秒)
    trackSpy(ImportedImageCollector, '_resolveImageSize').mockResolvedValue({
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
