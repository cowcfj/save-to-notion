/**
 * @jest-environment jsdom
 */

// Mock modules *before* imports

// We need to intercept the Logger import
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

// Import Logger to spy on it
import Logger from '../../../scripts/utils/Logger.js';

// Also set globalThis.Logger for modules that use global Logger
globalThis.Logger = Logger;

// Import DomConverter after mocks
import { domConverter } from '../../../scripts/content/converters/DomConverter.js';
// Import ImageUtils for testing its internals via public API
import * as ImageUtils from '../../../scripts/utils/imageUtils.js';

describe('ImageUtils and DomConverter Missing Coverage Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset spies if any
    });

    describe('DomConverter Coverage', () => {
        test('should drop invalid image and warn when isValidCleanedImageUrl returns false', () => {
            const src = 'https://example.com/invalid.jpg';
            const html = `<img src="${src}" alt="test" />`;

            // Mock isValidCleanedImageUrl to return false
            globalThis.ImageUtils = {
                ...ImageUtils,
                extractImageSrc: jest.fn().mockReturnValue(src),
                cleanImageUrl: jest.fn(url => url),
                isValidCleanedImageUrl: jest.fn().mockReturnValue(false),
            };

            const blocks = domConverter.convert(html);

            expect(blocks).toHaveLength(0);
            expect(Logger.warn).toHaveBeenCalledWith(
                '[Content] Dropping invalid image to ensure page save',
                expect.objectContaining({ url: src })
            );

            // Clean up
            delete globalThis.ImageUtils;
        });
    });

    describe('ImageUtils Coverage', () => {
        test('extractBestUrlFromSrcset handles SrcsetParser error', () => {
            // Mock SrcsetParser
            globalThis.SrcsetParser = {
                parse: jest.fn(() => { throw new Error('Parser Error'); })
            };

            const srcset = 'image.jpg 100w';
            const result = ImageUtils.extractBestUrlFromSrcset(srcset);

            // Should fall back to manual parsing
            expect(result).toBe('image.jpg');
            expect(Logger.error).toHaveBeenCalledWith(
                'SrcsetParser 失敗',
                expect.objectContaining({ error: 'Parser Error' })
            );

            delete globalThis.SrcsetParser;
        });

        test('extractBestUrlFromSrcset uses SrcsetParser successfully', () => {
             const expectedUrl = 'best-image.jpg';
             globalThis.SrcsetParser = {
                 parse: jest.fn(() => expectedUrl)
             };

             const srcset = 'image.jpg 100w';
             const result = ImageUtils.extractBestUrlFromSrcset(srcset);

             expect(result).toBe(expectedUrl);

             delete globalThis.SrcsetParser;
        });

         test('_resolveUrl handles URL construction error (catastrophic failure)', () => {
             // Verification for catastrophic failure where global URL constructor is broken.
             // This tests the absolute fallback path in _resolveUrl.
             const originalURL = globalThis.URL;
             globalThis.URL = jest.fn(() => { throw new Error('URL Error'); });

             const result = ImageUtils.cleanImageUrl('https://example.com');

             expect(result).toBeNull();
             expect(Logger.error).toHaveBeenCalledWith(
                'URL 轉換失敗',
                 expect.any(Object)
             );

             globalThis.URL = originalURL;
        });

        test('cleanImageUrl hits recursion limit', () => {
             const url = 'https://example.com/image.jpg';
             const result = ImageUtils.cleanImageUrl(url, 10); // LIMIT is 5

             expect(result).toBe(url);
             expect(Logger.warn).toHaveBeenCalledWith(
                 '達到最大遞迴深度',
                 expect.objectContaining({ depth: 10 })
             );
        });

        test('isValidImageUrl handles error in _checkUrlPatterns', () => {
            const originalURL = globalThis.URL;
            let callCount = 0;

            globalThis.URL = jest.fn((_url, _base) => {
                callCount++;
                // First call is likely in cleanImageUrl (or _resolveUrl)
                if (callCount <= 1) {
                    return {
                        protocol: 'https:',
                        hostname: 'example.com',
                        pathname: '/image.jpg',
                        searchParams: new URLSearchParams(),
                        href: 'https://example.com/image.jpg',
                        search: '',
                        hash: ''
                    };
                }
                // Second call (in _checkUrlPatterns) throws
                throw new Error('Pattern check failed');
            });

            // We use a valid-looking URL so it passes initial regex checks
            const result = ImageUtils.isValidImageUrl('https://example.com/image.jpg');

            expect(result).toBe(false);

            globalThis.URL = originalURL;
        });

         test('_normalizeUrlInternal handles decodeURI error', () => {
              // Passing a malformed URI component that fails decodeURI
              const malformedUrl = 'https://example.com/%';

              // Implicitly verifies no crash if decodeURI throws inside _normalizeUrlInternal
              expect(() => ImageUtils.cleanImageUrl(malformedUrl)).not.toThrow();
         });
    });
});
