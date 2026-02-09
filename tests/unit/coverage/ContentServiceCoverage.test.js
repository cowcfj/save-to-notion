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
    isValidCleanedImageUrl: jest.fn(() => true),
    cleanImageUrl: jest.fn(url => url),
}));

import * as imageUtils from '../../../scripts/utils/imageUtils.js';


describe('Content Service Coverage Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';

        // Default ImageUtils mocks
        imageUtils.extractImageSrc.mockReturnValue('https://example.com/image.jpg');
        imageUtils.isValidImageUrl.mockReturnValue(true);
        imageUtils.isValidCleanedImageUrl.mockReturnValue(true);
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

             // NextJsExtractor catches the error and logs error, then returns null
             // ImageCollector sees null and logs "提取結果為空"
             // Since we can't easily spy on NextJsExtractor logger calls (it uses the imported Logger),
             // and ImageCollector logs are what we are primarily testing here if possible,
             // or we accept that it logs "提取結果為空" because the extraction failed silently from ImageCollector's perspective.

             // Check for the error log from NextJsExtractor (since Logger is mocked globally)
             expect(Logger.warn).toHaveBeenCalledWith(
                 '解析 __NEXT_DATA__ 失敗',
                 expect.objectContaining({ error: expect.stringContaining('Unexpected token') })
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

             // NextJsExtractor logs warn, returns null.
             // ImageCollector logs "提取結果為空"
             expect(Logger.log).toHaveBeenCalledWith(
                 'Next.js Data 提取結果為空',
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
        // Helper to create mock injector that sets up global environment
        const createMockInjector = (setupGlobalFn) => ({
            injectWithResponse: jest.fn(async (tabId, func, scripts, args) => {
                const originalExtract = globalThis.extractPageContent;
                const originalLogger = globalThis.Logger;

                const spyLogger = {
                    log: jest.fn(),
                    warn: jest.fn(),
                    error: jest.fn(),
                    success: jest.fn(),
                    debug: jest.fn(),
                };
                globalThis.Logger = spyLogger;

                // Setup default or custom global state
                if (setupGlobalFn) {
                    await setupGlobalFn(globalThis, spyLogger);
                }

                try {
                    // Pass arguments to the function (important for defaultPageTitle)
                    return await func(...(args || []));
                } finally {
                    // Restore global state
                    if (originalExtract === undefined) {
                         delete globalThis.extractPageContent;
                    } else {
                         globalThis.extractPageContent = originalExtract;
                    }
                    if (originalLogger === undefined) {
                         delete globalThis.Logger;
                    } else {
                         globalThis.Logger = originalLogger;
                    }
                }
            })
        });

        test('extractContent runs injected script logic successfully', async () => {
            const mockInjector = createMockInjector((global) => {
                global.extractPageContent = jest.fn().mockResolvedValue({
                    title: 'Injected Title',
                    blocks: [{ type: 'paragraph' }],
                    additionalImages: [],
                    metadata: { siteIcon: 'icon.png' }
                });
            });

            const service = new PageContentService({
                injectionService: mockInjector,
                logger: Logger
            });

            const result = await service.extractContent(123);

            expect(result).toEqual({
                title: 'Injected Title',
                blocks: expect.any(Array),
                siteIcon: 'icon.png',
                coverImage: null
            });
        });

         test('extractContent handles extractPageContent unavailability', async () => {
            const mockInjector = createMockInjector((global) => {
                 delete global.extractPageContent;
            });

            const service = new PageContentService({
                injectionService: mockInjector,
                 logger: Logger
            });

            const result = await service.extractContent(123);

            // Safer assertion
            expect(result.blocks).toHaveLength(1);
            expect(result.blocks[0]?.paragraph?.rich_text?.[0]?.text?.content)
                .toContain('extractPageContent not available');
         });

         test('extractContent handles extraction failure', async () => {
            const mockInjector = createMockInjector((global) => {
                 global.extractPageContent = jest.fn().mockRejectedValue(new Error('Injected Error'));
            });

            const service = new PageContentService({
                injectionService: mockInjector,
                 logger: Logger
            });

            const result = await service.extractContent(123);

            // Safer assertion
            expect(result.blocks).toHaveLength(1);
            expect(result.blocks[0]?.paragraph?.rich_text?.[0]?.text?.content)
                .toContain('Extraction failed: Injected Error');
         });
    });
});
