/**
 * @jest-environment jsdom
 */

import { PerformanceOptimizer } from '../../../scripts/performance/PerformanceOptimizer.js';
import { ImageCollector } from '../../../scripts/content/extractors/ImageCollector.js';
import { bridgeContentToBlocks, createTextBlocks } from '../../../scripts/content/converters/ContentBridge.js';
import { extractFromNoscript, isNotionCompatibleImageUrl } from '../../../scripts/utils/imageUtils.js';

jest.mock('../../../scripts/utils/Logger.js', () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
}));

describe('ContentParts 覆蓋率補強 (整合)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    // --- PerformanceOptimizer ---
    test('PerformanceOptimizer: 邊界情況', () => {
        const optimizer = new PerformanceOptimizer({ cacheMaxSize: 2 });
        optimizer.queryCache.set('a', { result: 1, timestamp: 1 });
        optimizer.queryCache.set('b', { result: 2, timestamp: 2 });
        optimizer._maintainCacheSizeLimit('c');
        expect(optimizer.queryCache.has('a')).toBe(false);

        // 無效選擇器 - 抑制 console.error 輸出
        const spy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
        PerformanceOptimizer._performQuery('!!!', document, { single: true });
        spy.mockRestore();
    });

    // --- ImageCollector ---
    test('ImageCollector: processImageForCollection 過濾', async () => {
        const img = document.createElement('img');
        img.src = 'https://example.com/test.jpg';

        // 需要導入整個模組來 spy
        const imageUtils = await import('../../../scripts/utils/imageUtils.js');
        jest.spyOn(imageUtils, 'extractImageSrc').mockReturnValue(null);
        expect(ImageCollector.processImageForCollection(img, 0, null)).toBeNull();
    });

    // --- ContentBridge ---
    test('ContentBridge: bridgeContentToBlocks 邊界情況', () => {
        expect(bridgeContentToBlocks(null).title).toBe('Untitled');
        expect(bridgeContentToBlocks({ content: 'h', metadata: { siteIcon: 'i' } }).siteIcon).toBe('i');
    });

    test('ContentBridge: createTextBlocks 長文本與空內容', () => {
        expect(createTextBlocks('   ')).toHaveLength(0);
        expect(createTextBlocks('a'.repeat(2500))).toHaveLength(2);
    });

    // --- imageUtils ---
    test('imageUtils: extractFromNoscript 處理', () => {
        const div = document.createElement('div');
        const noscript = document.createElement('noscript');
        noscript.textContent = '<img src="https://example.com/img.jpg">';
        div.append(noscript);

        // 模擬 DOMParser
        const result = extractFromNoscript(div);
        expect(result).toBe('https://example.com/img.jpg');
    });

    test('imageUtils: isNotionCompatibleImageUrl', () => {
        expect(isNotionCompatibleImageUrl('https://ab/img.jpg')).toBe(false);
    });
});
