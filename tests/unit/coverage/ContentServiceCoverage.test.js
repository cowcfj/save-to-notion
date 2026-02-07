/**
 * @jest-environment jsdom
 */

// Mock modules *before* imports
jest.mock('../../../scripts/content/extractors/ReadabilityAdapter', () => ({
  cachedQuery: jest.fn(),
}));

jest.mock('../../../scripts/performance/PerformanceOptimizer', () => ({
  batchProcess: jest.fn(),
  batchProcessWithRetry: jest.fn(),
}));

jest.mock('../../../scripts/utils/Logger.js', () => ({
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
    }
}));

// Mock ErrorHandler
jest.mock('../../../scripts/utils/ErrorHandler.js', () => ({
    ErrorHandler: {
        logError: jest.fn(),
    }
}));

import Logger from '../../../scripts/utils/Logger.js';
import { ErrorHandler } from '../../../scripts/utils/ErrorHandler.js';
import { cachedQuery } from '../../../scripts/content/extractors/ReadabilityAdapter.js';
import { ImageCollector } from '../../../scripts/content/extractors/ImageCollector.js';
import { PageContentService } from '../../../scripts/background/services/PageContentService.js';

// Setup ImageUtils mock as these are used by ImageCollector
jest.mock('../../../scripts/utils/imageUtils.js', () => ({
    extractImageSrc: jest.fn(),
    isValidImageUrl: jest.fn(() => true),
    cleanImageUrl: jest.fn(url => url),
}));


describe('Content Service Coverage Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';

        // Default ImageUtils mocks
        const imageUtils = require('../../../scripts/utils/imageUtils.js');
        imageUtils.extractImageSrc.mockReturnValue('https://example.com/image.jpg');
        imageUtils.isValidImageUrl.mockReturnValue(true);
        imageUtils.cleanImageUrl.mockImplementation(url => url);
    });

    describe('ImageCollector Coverage', () => {
        test('collectFeaturedImage handles query selector error with ErrorHandler', () => {
             // Mock cachedQuery to throw error
             cachedQuery.mockImplementation(() => {
                 throw new Error('Selector Error');
             });

             const result = ImageCollector.collectFeaturedImage();

             expect(result).toBeNull();
             expect(ErrorHandler.logError).toHaveBeenCalledWith(
                 expect.objectContaining({
                     type: 'dom_error',
                     context: expect.stringContaining('featured image selector'),
                     originalError: expect.any(Error)
                 })
             );
        });

        test('processImageForCollection handles error', () => {
             // Mock cleanImageUrl to throw error (which is inside the try block)
             const imageUtils = require('../../../scripts/utils/imageUtils.js');
             imageUtils.cleanImageUrl.mockImplementation(() => {
                 throw new Error('Process Error');
             });

             const img = document.createElement('img');
             const result = ImageCollector.processImageForCollection(img, 0);

             expect(result).toBeNull();
             expect(Logger.warn).toHaveBeenCalledWith(
                 '處理圖片失敗',
                 expect.objectContaining({ error: 'Process Error' })
             );
        });

         test('processImageForCollection filters small images', () => {
             const img = document.createElement('img');
             Object.defineProperty(img, 'naturalWidth', { value: 10 });
             Object.defineProperty(img, 'naturalHeight', { value: 10 });

             const result = ImageCollector.processImageForCollection(img, 0);

             expect(result).toBeNull();
             expect(Logger.log).toHaveBeenCalledWith(
                 '圖片尺寸太小',
                 expect.anything()
             );
        });

        test('_collectFromNextJsData handles JSON parse error', () => {
             const script = document.createElement('script');
             script.id = '__NEXT_DATA__';
             // Set type to prevent execution
             script.type = 'application/json';
             script.textContent = 'invalid json';
             document.body.append(script);

             ImageCollector._collectFromNextJsData([]);

             expect(Logger.warn).toHaveBeenCalledWith(
                 '解析 Next.js Data JSON 失敗',
                 expect.anything()
             );
        });

        test('_collectFromNextJsData warns when article missing', () => {
             const script = document.createElement('script');
             script.id = '__NEXT_DATA__';
             script.type = 'application/json';
             // valid JSON but no article
             script.textContent = JSON.stringify({ props: { pageProps: { other: {} } } });
             document.body.append(script);

             ImageCollector._collectFromNextJsData([]);

             expect(Logger.log).toHaveBeenCalledWith(
                 'Next.js Data 中未找到 article 對象，跳過提取',
                 expect.anything()
             );
        });
    });

    // We can't actually execute the injected script logic easily because it depends on `globalThis` modification
    // and isolation that injectWithResponse provides.
    // However, injectWithResponse in our test environment (Node/Jest) simply executes the callback.
    // The previous implementation tried to setup `globalThis` mocks inside the callback execution,
    // which is the correct approach to simulate the environment the script runs in.

    describe('PageContentService Injected Logic Coverage', () => {
        test('extractContent runs injected script logic successfully', async () => {
            // We need to define the mocks outside so they are available
            const mockInjector = {
                injectWithResponse: jest.fn(async (tabId, func, ..._args) => {
                    // This function is executed in the test environment directly because we mock injectWithResponse
                    // to just call `func()`.
                    // But `func` (the injected script) relies on `globalThis.Logger` or `console`.
                    // And `globalThis.extractPageContent`.

                    // We can setup the environment *before* calling func.

                    // Mock global objects for the duration of this call
                    const originalLogger = globalThis.Logger;
                    const originalExtract = globalThis.extractPageContent;

                    // The injected script does: const PageLogger = globalThis.Logger || console;
                    // So if we set globalThis.Logger, it uses it.
                    // We want to capture its calls.
                    const spyLogger = {
                        log: jest.fn(),
                        warn: jest.fn(),
                        error: jest.fn()
                    };
                    globalThis.Logger = spyLogger;

                    globalThis.extractPageContent = jest.fn().mockResolvedValue({
                        title: 'Injected Title',
                        blocks: [{ type: 'paragraph' }],
                        additionalImages: [],
                        metadata: { siteIcon: 'icon.png' }
                    });

                    try {
                        return await func();
                    } finally {
                        globalThis.Logger = originalLogger;
                        globalThis.extractPageContent = originalExtract;
                    }
                })
            };

            const service = new PageContentService({
                injectionService: mockInjector,
                logger: Logger
            });

            const result = await service.extractContent(123);

            expect(result).toEqual({
                title: 'Injected Title',
                blocks: expect.any(Array),
                siteIcon: 'icon.png'
            });
        });

         test('extractContent handles extractPageContent unavailability', async () => {
            const mockInjector = {
                injectWithResponse: jest.fn(async (tabId, func, ..._args) => {
                    const originalExtract = globalThis.extractPageContent;
                    delete globalThis.extractPageContent;

                    // We need to spy on console warnings if Logger is not present in globalThis
                    // or setup a mock Logger. The script uses globalThis.Logger || console.

                    const spyLogger = {
                         log: jest.fn(),
                        warn: jest.fn(), // We expect this to be called
                        error: jest.fn()
                    }
                    const originalLogger = globalThis.Logger;
                    globalThis.Logger = spyLogger;

                    try {
                         return await func();
                    } finally {
                        globalThis.extractPageContent = originalExtract;
                        globalThis.Logger = originalLogger;
                    }
                })
            };

            const service = new PageContentService({
                injectionService: mockInjector,
                 logger: Logger
            });

            const result = await service.extractContent(123);

            // Should return fallback
            expect(result.blocks[0].paragraph.rich_text[0].text.content).toContain('extractPageContent not available');
         });

         test('extractContent handles extraction failure', async () => {
            const mockInjector = {
                injectWithResponse: jest.fn(async (tabId, func, ..._args) => {
                     const originalExtract = globalThis.extractPageContent;
                     const originalLogger = globalThis.Logger;

                     globalThis.extractPageContent = jest.fn().mockRejectedValue(new Error('Injected Error'));

                     const spyLogger = {
                         log: jest.fn(),
                        warn: jest.fn(),
                        error: jest.fn() // Expected
                    }
                    globalThis.Logger = spyLogger;

                    try {
                        return await func();
                    } finally {
                         globalThis.extractPageContent = originalExtract;
                         globalThis.Logger = originalLogger;
                    }
                })
            };

            const service = new PageContentService({
                injectionService: mockInjector,
                 logger: Logger
            });

            const result = await service.extractContent(123);

            expect(result.blocks[0].paragraph.rich_text[0].text.content).toContain('Extraction failed: Injected Error');
         });
    });
});
