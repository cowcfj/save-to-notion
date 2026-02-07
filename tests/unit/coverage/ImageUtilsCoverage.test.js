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

            try {
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
            } finally {
                // Clean up
                delete globalThis.ImageUtils;
            }
        });
    });

    describe('ImageUtils Coverage', () => {
        test('extractBestUrlFromSrcset handles SrcsetParser error', () => {
            try {
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
            } finally {
                delete globalThis.SrcsetParser;
            }
        });

        test('extractBestUrlFromSrcset uses SrcsetParser successfully', () => {
             const expectedUrl = 'best-image.jpg';
             try {
                 globalThis.SrcsetParser = {
                     parse: jest.fn(() => expectedUrl)
                 };

                 const srcset = 'image.jpg 100w';
                 const result = ImageUtils.extractBestUrlFromSrcset(srcset);

                 expect(result).toBe(expectedUrl);
             } finally {
                 delete globalThis.SrcsetParser;
             }
        });

         test('_resolveUrl handles URL construction error (catastrophic failure)', () => {
             // Verification for catastrophic failure where global URL constructor is broken.
             // This tests the absolute fallback path in _resolveUrl.
             const originalURL = globalThis.URL;

             try {
                 globalThis.URL = jest.fn(() => { throw new Error('URL Error'); });

                 const result = ImageUtils.cleanImageUrl('https://example.com');

                 expect(result).toBeNull();
                 expect(Logger.error).toHaveBeenCalledWith(
                    'URL 轉換失敗',
                     expect.any(Object)
                 );
             } finally {
                 globalThis.URL = originalURL;
             }
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

        // 此測試假設 cleanImageUrl 會先呼叫 new URL()，接著 _checkUrlPatterns 會再呼叫一次
        // 如果 isValidImageUrl 的實作順序改變，此測試可能會失敗
        test('isValidImageUrl handles error in _checkUrlPatterns', () => {
            const originalURL = globalThis.URL;
            const initialUrl = 'https://example.com/initial.jpg';
            const cleanedUrl = 'https://example.com/cleaned.jpg';

            try {
                globalThis.URL = jest.fn((url, base) => {
                    // Normalize input URL for comparison (handle potential differences)
                    const urlStr = url.toString();

                    // First call: cleanImageUrl resolves the initial URL
                    // We check if the input matches our initial URL
                    if (urlStr === initialUrl || (base && urlStr === initialUrl)) {
                         return {
                             protocol: 'https:',
                             hostname: 'example.com',
                             pathname: '/initial.jpg',
                             searchParams: new URLSearchParams(),
                             href: cleanedUrl, // This ensures cleanImageUrl returns this URL
                             search: '',
                             hash: ''
                         };
                    }

                    // Second call: _checkUrlPatterns validates the cleaned URL
                    if (urlStr === cleanedUrl || (base && urlStr === cleanedUrl)) {
                         throw new Error('Pattern check failed');
                    }

                    // Fallback for other calls (e.g. internal normalization)
                    return new originalURL(url, base);
                });

                const result = ImageUtils.isValidImageUrl(initialUrl);

                expect(result).toBe(false);
            } finally {
                globalThis.URL = originalURL;
            }
        });

         test('_normalizeUrlInternal handles decodeURI error', () => {
              // Passing a malformed URI component that fails decodeURI
              const malformedUrl = 'https://example.com/%';

              // Implicitly verifies no crash if decodeURI throws inside _normalizeUrlInternal
              expect(() => ImageUtils.cleanImageUrl(malformedUrl)).not.toThrow();
         });
    });
});
