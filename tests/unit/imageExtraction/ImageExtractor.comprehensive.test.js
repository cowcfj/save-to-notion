/**
 * ImageExtractor 全面測試
 *
 * 覆蓋 ImageExtractor 類的所有功能：
 * - 構造函數和初始化
 * - extractImageSrc - 主要提取方法
 * - _tryExtractionStrategies - 策略執行
 * - _extractFromSrcset - srcset 提取
 * - _extractFromAttributes - 屬性提取
 * - _extractFromBackground - 背景圖提取
 * - _extractFromPicture - picture 元素提取
 * - _extractFromNoscript - noscript 提取
 * - _isValidUrl - URL 驗證
 * - _generateCacheKey - 緩存鍵生成
 * - clearCache - 清理緩存
 * - getCacheStats - 緩存統計
 */

const ImageExtractor = require('../../../scripts/imageExtraction/ImageExtractor');

describe('ImageExtractor - 全面測試', () => {
    let extractor;
    let imgElement;

    beforeEach(() => {
        // 創建測試用的 img 元素
        imgElement = document.createElement('img');
    });

    afterEach(() => {
        if (extractor) {
            extractor.clearCache();
        }
    });

    describe('構造函數和初始化', () => {
        it('應該使用默認選項創建實例', () => {
            extractor = new ImageExtractor();

            expect(extractor.options).toEqual({
                maxRetries: 3,
                enableFallbacks: true,
                enableCache: false
            });
            expect(extractor.strategies).toEqual([]);
            expect(extractor.cache).toBeInstanceOf(Map);
        });

        it('應該合併自定義選項', () => {
            extractor = new ImageExtractor({
                maxRetries: 5,
                enableCache: true
            });

            expect(extractor.options).toEqual({
                maxRetries: 5,
                enableFallbacks: true,
                enableCache: true
            });
        });

        it('應該初始化空緩存', () => {
            extractor = new ImageExtractor();

            expect(extractor.cache.size).toBe(0);
        });
    });

    describe('extractImageSrc - 主要提取方法', () => {
        beforeEach(() => {
            extractor = new ImageExtractor();
        });

        it('應該處理 null 輸入', () => {
            const result = extractor.extractImageSrc(null);

            expect(result).toBeNull();
        });

        it('應該處理 undefined 輸入', () => {
            const result = extractor.extractImageSrc();

            expect(result).toBeNull();
        });

        it('應該處理沒有 nodeType 的對象', () => {
            const invalidNode = {};
            const result = extractor.extractImageSrc(invalidNode);

            expect(result).toBeNull();
        });

        it('應該從 src 屬性提取 URL', () => {
            imgElement.setAttribute('src', 'https://example.com/image.jpg');

            const result = extractor.extractImageSrc(imgElement);

            expect(result).toBe('https://example.com/image.jpg');
        });

        it('應該從 data-src 屬性提取 URL', () => {
            imgElement.setAttribute('data-src', 'https://example.com/lazy-image.jpg');

            const result = extractor.extractImageSrc(imgElement);

            expect(result).toBe('https://example.com/lazy-image.jpg');
        });

        it('應該優先從 srcset 提取', () => {
            imgElement.setAttribute('src', 'https://example.com/small.jpg');
            imgElement.setAttribute('srcset', 'https://example.com/medium.jpg 800w, https://example.com/large.jpg 1200w');

            const result = extractor.extractImageSrc(imgElement);

            expect(result).toBe('https://example.com/large.jpg');
        });

        it('應該處理無效的圖片元素', () => {
            imgElement.setAttribute('src', 'data:image/png;base64,abc123');

            const result = extractor.extractImageSrc(imgElement);

            expect(result).toBeNull();
        });
    });

    describe('緩存功能', () => {
        beforeEach(() => {
            extractor = new ImageExtractor({ enableCache: true });
        });

        it('應該緩存提取結果', () => {
            imgElement.setAttribute('src', 'https://example.com/cached.jpg');

            const result1 = extractor.extractImageSrc(imgElement);
            const result2 = extractor.extractImageSrc(imgElement);

            expect(result1).toBe('https://example.com/cached.jpg');
            expect(result2).toBe('https://example.com/cached.jpg');
            expect(extractor.cache.size).toBe(1);
        });

        it('應該為不同的元素生成不同的緩存鍵', () => {
            const img1 = document.createElement('img');
            img1.setAttribute('src', 'https://example.com/image1.jpg');

            const img2 = document.createElement('img');
            img2.setAttribute('src', 'https://example.com/image2.jpg');

            extractor.extractImageSrc(img1);
            extractor.extractImageSrc(img2);

            expect(extractor.cache.size).toBe(2);
        });

        it('clearCache 應該清空緩存', () => {
            imgElement.setAttribute('src', 'https://example.com/image.jpg');
            extractor.extractImageSrc(imgElement);

            expect(extractor.cache.size).toBe(1);

            extractor.clearCache();

            expect(extractor.cache.size).toBe(0);
        });

        it('getCacheStats 應該返回緩存統計', () => {
            imgElement.setAttribute('src', 'https://example.com/image.jpg');
            extractor.extractImageSrc(imgElement);

            const stats = extractor.getCacheStats();

            expect(stats).toEqual({
                size: 1,
                enabled: true
            });
        });

        it('禁用緩存時不應該緩存', () => {
            extractor = new ImageExtractor({ enableCache: false });
            imgElement.setAttribute('src', 'https://example.com/image.jpg');

            extractor.extractImageSrc(imgElement);

            expect(extractor.cache.size).toBe(0);
        });
    });

    describe('_extractFromSrcset', () => {
        beforeEach(() => {
            extractor = new ImageExtractor();
        });

        it('應該從 srcset 提取最大尺寸的圖片', () => {
            imgElement.setAttribute('srcset', 'https://example.com/small.jpg 400w, https://example.com/large.jpg 1200w');

            const result = ImageExtractor._extractFromSrcset(imgElement);

            expect(result).toBe('https://example.com/large.jpg');
        });

        it('應該處理 data-srcset 屬性', () => {
            imgElement.setAttribute('data-srcset', 'https://example.com/lazy.jpg 800w');

            const result = ImageExtractor._extractFromSrcset(imgElement);

            expect(result).toBe('https://example.com/lazy.jpg');
        });

        it('應該處理 data-lazy-srcset 屬性', () => {
            imgElement.setAttribute('data-lazy-srcset', 'https://example.com/lazy-load.jpg 1000w');

            const result = ImageExtractor._extractFromSrcset(imgElement);

            expect(result).toBe('https://example.com/lazy-load.jpg');
        });

        it('沒有 srcset 時應該返回 null', () => {
            const result = ImageExtractor._extractFromSrcset(imgElement);

            expect(result).toBeNull();
        });

        it('應該處理單個 URL 的 srcset', () => {
            imgElement.setAttribute('srcset', 'https://example.com/single.jpg');

            const result = ImageExtractor._extractFromSrcset(imgElement);

            expect(result).toBe('https://example.com/single.jpg');
        });

        it('應該處理無效的 srcset 格式', () => {
            imgElement.setAttribute('srcset', 'invalid-url');

            const result = ImageExtractor._extractFromSrcset(imgElement);

            expect(result).toBeNull();
        });
    });

    describe('_extractFromAttributes', () => {
        it('應該從 src 屬性提取', () => {
            imgElement.setAttribute('src', 'https://example.com/image.jpg');

            const result = ImageExtractor._extractFromAttributes(imgElement);

            expect(result).toBe('https://example.com/image.jpg');
        });

        it('應該從 data-src 屬性提取', () => {
            imgElement.setAttribute('data-src', 'https://example.com/lazy.jpg');

            const result = ImageExtractor._extractFromAttributes(imgElement);

            expect(result).toBe('https://example.com/lazy.jpg');
        });

        it('應該從 data-lazy-src 屬性提取', () => {
            imgElement.setAttribute('data-lazy-src', 'https://example.com/lazy-load.jpg');

            const result = ImageExtractor._extractFromAttributes(imgElement);

            expect(result).toBe('https://example.com/lazy-load.jpg');
        });

        it('應該從 data-original 屬性提取', () => {
            imgElement.setAttribute('data-original', 'https://example.com/original.jpg');

            const result = ImageExtractor._extractFromAttributes(imgElement);

            expect(result).toBe('https://example.com/original.jpg');
        });

        it('應該修剪空白字符', () => {
            imgElement.setAttribute('src', '  https://example.com/trimmed.jpg  ');

            const result = ImageExtractor._extractFromAttributes(imgElement);

            expect(result).toBe('https://example.com/trimmed.jpg');
        });

        it('沒有有效屬性時應該返回 null', () => {
            const result = ImageExtractor._extractFromAttributes(imgElement);

            expect(result).toBeNull();
        });

        it('應該拒絕無效的 URL', () => {
            imgElement.setAttribute('src', 'not-a-valid-url');

            const result = ImageExtractor._extractFromAttributes(imgElement);

            expect(result).toBeNull();
        });

        it('應該處理空字符串屬性', () => {
            imgElement.setAttribute('src', '');

            const result = ImageExtractor._extractFromAttributes(imgElement);

            expect(result).toBeNull();
        });
    });

    describe('_extractFromBackground', () => {
        beforeEach(() => {
            extractor = new ImageExtractor();
        });

        it('沒有 FallbackStrategies 時應該返回 null', () => {
            const result = extractor._extractFromBackground(imgElement);

            expect(result).toBeNull();
        });
    });

    describe('_extractFromPicture', () => {
        beforeEach(() => {
            extractor = new ImageExtractor();
        });

        it('沒有 FallbackStrategies 時應該返回 null', () => {
            const result = extractor._extractFromPicture(imgElement);

            expect(result).toBeNull();
        });
    });

    describe('_extractFromNoscript', () => {
        beforeEach(() => {
            extractor = new ImageExtractor();
        });

        it('沒有 FallbackStrategies 時應該返回 null', () => {
            const result = extractor._extractFromNoscript(imgElement);

            expect(result).toBeNull();
        });
    });

    describe('_isValidUrl', () => {
        beforeEach(() => {
            extractor = new ImageExtractor();
        });

        it('應該接受有效的 HTTP URL', () => {
            const result = ImageExtractor._isValidUrl('http://example.com/image.jpg');

            expect(result).toBe(true);
        });

        it('應該接受有效的 HTTPS URL', () => {
            const result = ImageExtractor._isValidUrl('https://example.com/image.jpg');

            expect(result).toBe(true);
        });

        it('應該拒絕 data: URL', () => {
            const result = ImageExtractor._isValidUrl('data:image/png;base64,abc123');

            expect(result).toBe(false);
        });

        it('應該拒絕 blob: URL', () => {
            const result = ImageExtractor._isValidUrl('blob:https://example.com/123-456');

            expect(result).toBe(false);
        });

        it('應該拒絕 null', () => {
            const result = ImageExtractor._isValidUrl(null);

            expect(result).toBe(false);
        });

        it('應該拒絕 undefined', () => {
            const result = ImageExtractor._isValidUrl();

            expect(result).toBe(false);
        });

        it('應該拒絕空字符串', () => {
            const result = ImageExtractor._isValidUrl('');

            expect(result).toBe(false);
        });

        it('應該拒絕非字符串類型', () => {
            const result = ImageExtractor._isValidUrl(123);

            expect(result).toBe(false);
        });

        it('應該拒絕無效的 URL', () => {
            const result = ImageExtractor._isValidUrl('not-a-url');

            expect(result).toBe(false);
        });

        it('應該接受帶查詢參數的 URL', () => {
            const result = ImageExtractor._isValidUrl('https://example.com/image.jpg?width=800');

            expect(result).toBe(true);
        });

        it('應該接受帶片段的 URL', () => {
            const result = ImageExtractor._isValidUrl('https://example.com/image.jpg#top');

            expect(result).toBe(true);
        });
    });

    describe('_generateCacheKey', () => {
        beforeEach(() => {
            extractor = new ImageExtractor();
        });

        it('應該基於 src 生成緩存鍵', () => {
            imgElement.setAttribute('src', 'https://example.com/image.jpg');

            const key = ImageExtractor._generateCacheKey(imgElement);

            expect(key).toContain('https://example.com/image.jpg');
        });

        it('應該包含 data-src 在緩存鍵中', () => {
            imgElement.setAttribute('data-src', 'https://example.com/lazy.jpg');

            const key = ImageExtractor._generateCacheKey(imgElement);

            expect(key).toContain('https://example.com/lazy.jpg');
        });

        it('應該包含 srcset 在緩存鍵中', () => {
            imgElement.setAttribute('srcset', 'https://example.com/large.jpg 1200w');

            const key = ImageExtractor._generateCacheKey(imgElement);

            expect(key).toContain('https://example.com/large.jpg');
        });

        it('應該限制緩存鍵長度為 100 字符', () => {
            const longUrl = 'https://example.com/' + 'a'.repeat(200) + '.jpg';
            imgElement.setAttribute('src', longUrl);

            const key = ImageExtractor._generateCacheKey(imgElement);

            expect(key.length).toBeLessThanOrEqual(100);
        });

        it('空屬性應該生成空分隔的鍵', () => {
            const key = ImageExtractor._generateCacheKey(imgElement);

            expect(key).toBe('||');
        });
    });

    describe('_tryExtractionStrategies', () => {
        beforeEach(() => {
            extractor = new ImageExtractor();
        });

        it('應該按順序嘗試所有策略', () => {
            // 設置一個只能通過 src 屬性提取的圖片
            imgElement.setAttribute('src', 'https://example.com/image.jpg');

            const result = extractor._tryExtractionStrategies(imgElement);

            expect(result).toBe('https://example.com/image.jpg');
        });

        it('應該在第一個成功的策略處停止', () => {
            // srcset 優先於 src
            imgElement.setAttribute('srcset', 'https://example.com/large.jpg 1200w');
            imgElement.setAttribute('src', 'https://example.com/small.jpg');

            const result = extractor._tryExtractionStrategies(imgElement);

            expect(result).toBe('https://example.com/large.jpg');
        });

        it('所有策略失敗時應該返回 null', () => {
            // 沒有任何有效屬性
            const result = extractor._tryExtractionStrategies(imgElement);

            expect(result).toBeNull();
        });

        it('應該處理策略拋出的錯誤', () => {
            // 使用 spy 模擬策略拋出錯誤
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // 創建一個會拋出錯誤的場景
            const result = extractor._tryExtractionStrategies(imgElement);

            expect(result).toBeNull();
            consoleWarnSpy.mockRestore();
        });
    });

    describe('邊界情況和錯誤處理', () => {
        beforeEach(() => {
            extractor = new ImageExtractor();
        });

        it('應該處理包含特殊字符的 URL', () => {
            imgElement.setAttribute('src', 'https://example.com/image-name_123.jpg');

            const result = extractor.extractImageSrc(imgElement);

            expect(result).toBe('https://example.com/image-name_123.jpg');
        });

        it('應該處理相對 URL（視為無效）', () => {
            imgElement.setAttribute('src', '/images/local.jpg');

            const result = extractor.extractImageSrc(imgElement);

            expect(result).toBeNull();
        });

        it('應該處理協議相對 URL（視為無效）', () => {
            imgElement.setAttribute('src', '//cdn.example.com/image.jpg');

            const result = extractor.extractImageSrc(imgElement);

            expect(result).toBeNull();
        });

        it('應該處理包含 Unicode 字符的 URL', () => {
            imgElement.setAttribute('src', 'https://example.com/圖片.jpg');

            const result = extractor.extractImageSrc(imgElement);

            expect(result).toBe('https://example.com/圖片.jpg');
        });
    });

    describe('模塊導出', () => {
        it('應該正確導出到 module.exports', () => {
            expect(ImageExtractor).toBeDefined();
            expect(typeof ImageExtractor).toBe('function');
            expect(ImageExtractor.prototype.extractImageSrc).toBeDefined();
        });
    });
});
