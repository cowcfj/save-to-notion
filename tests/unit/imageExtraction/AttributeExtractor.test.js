/**
 * @jest-environment jsdom
 */

const AttributeExtractor = require('../../../scripts/imageExtraction/AttributeExtractor');

describe('AttributeExtractor', () => {
    beforeEach(() => {
        // 清理 DOM
        document.body.innerHTML = '';
    });

    describe('extract', () => {
        test('應該從圖片元素提取標準 src 屬性', () => {
            const img = document.createElement('img');
            img.src = 'https://example.com/image.jpg';

            const result = AttributeExtractor.extract(img);
            expect(result).toBe('https://example.com/image.jpg');
        });

        test('應該從圖片元素提取 data-src 屬性', () => {
            const img = document.createElement('img');
            img.setAttribute('data-src', 'https://example.com/lazy-image.jpg');

            const result = AttributeExtractor.extract(img);
            expect(result).toBe('https://example.com/lazy-image.jpg');
        });

        test('應該優先提取高優先級屬性', () => {
            const img = document.createElement('img');
            img.src = 'https://example.com/image.jpg';
            img.setAttribute('data-src', 'https://example.com/lazy-image.jpg');

            const result = AttributeExtractor.extract(img);
            expect(result).toBe('https://example.com/image.jpg');
        });

        test('應該清理屬性值中的引號', () => {
            const img = document.createElement('img');
            img.setAttribute('data-src', '"https://example.com/image.jpg"');

            const result = AttributeExtractor.extract(img);
            expect(result).toBe('https://example.com/image.jpg');
        });

        test('應該驗證圖片 URL 的有效性', () => {
            const img = document.createElement('img');
            img.setAttribute('data-src', 'placeholder.jpg');

            const result = AttributeExtractor.extract(img);
            expect(result).toBeNull();
        });

        test('應該處理無效的圖片元素', () => {
            const result = AttributeExtractor.extract(null);
            expect(result).toBeNull();
        });

        test('應該處理沒有屬性的圖片元素', () => {
            const img = document.createElement('img');
            const result = AttributeExtractor.extract(img);
            expect(result).toBeNull();
        });
    });

    describe('extractAll', () => {
        test('應該提取所有可用的圖片 URL', () => {
            const img = document.createElement('img');
            img.src = 'https://example.com/image.jpg';
            img.setAttribute('data-src', 'https://example.com/lazy-image.jpg');
            img.setAttribute('data-original', 'https://example.com/original-image.jpg');

            const results = AttributeExtractor.extractAll(img);
            expect(results).toHaveLength(3);
            expect(results[0]).toEqual({
                url: 'https://example.com/image.jpg',
                attribute: 'src',
                priority: 0
            });
            expect(results[1]).toEqual({
                url: 'https://example.com/lazy-image.jpg',
                attribute: 'data-src',
                priority: 1
            });
        });

        test('應該按優先級排序', () => {
            const img = document.createElement('img');
            img.setAttribute('data-original', 'https://example.com/original-image.jpg');
            img.setAttribute('data-src', 'https://example.com/lazy-image.jpg');

            const results = AttributeExtractor.extractAll(img);
            expect(results[0].attribute).toBe('data-src');
            expect(results[1].attribute).toBe('data-original');
        });

        test('應該去重相同的 URL', () => {
            const img = document.createElement('img');
            img.src = 'https://example.com/image.jpg';
            img.setAttribute('data-src', 'https://example.com/image.jpg');

            const results = AttributeExtractor.extractAll(img);
            expect(results).toHaveLength(1);
        });

        test('應該處理無效的圖片元素', () => {
            const results = AttributeExtractor.extractAll(null);
            expect(results).toEqual([]);
        });
    });

    describe('hasImageAttributes', () => {
        test('應該檢測圖片元素是否有圖片屬性', () => {
            const img = document.createElement('img');
            img.src = 'https://example.com/image.jpg';

            const result = AttributeExtractor.hasImageAttributes(img);
            expect(result).toBe(true);
        });

        test('應該返回 false 當圖片元素沒有圖片屬性時', () => {
            const img = document.createElement('img');
            img.alt = 'test image';

            const result = AttributeExtractor.hasImageAttributes(img);
            expect(result).toBe(false);
        });

        test('應該處理無效的圖片元素', () => {
            const result = AttributeExtractor.hasImageAttributes(null);
            expect(result).toBe(false);
        });
    });

    describe('getAttributeStats', () => {
        test('應該獲取屬性統計信息', () => {
            const img = document.createElement('img');
            img.src = 'https://example.com/image.jpg';
            img.setAttribute('data-src', 'https://example.com/lazy-image.jpg');
            img.alt = 'test image';

            const stats = AttributeExtractor.getAttributeStats(img);
            expect(stats.totalAttributes).toBe(2);
            expect(stats.validUrls).toBe(2);
            expect(stats.attributes).toHaveLength(2);
        });

        test('應該處理無效的圖片元素', () => {
            const stats = AttributeExtractor.getAttributeStats(null);
            expect(stats.totalAttributes).toBe(0);
            expect(stats.validUrls).toBe(0);
            expect(stats.attributes).toHaveLength(0);
        });
    });

    describe('_cleanAttributeValue', () => {
        test('應該清理屬性值中的引號', () => {
            const result = AttributeExtractor._cleanAttributeValue('"https://example.com/image.jpg"');
            expect(result).toBe('https://example.com/image.jpg');
        });

        test('應該移除首尾空白', () => {
            const result = AttributeExtractor._cleanAttributeValue('  https://example.com/image.jpg  ');
            expect(result).toBe('https://example.com/image.jpg');
        });

        test('應該處理無效值', () => {
            expect(AttributeExtractor._cleanAttributeValue(null)).toBeNull();
            expect(AttributeExtractor._cleanAttributeValue('')).toBeNull();
            expect(AttributeExtractor._cleanAttributeValue('   ')).toBeNull();
        });
    });

    describe('_isValidImageUrl', () => {
        test('應該驗證有效的圖片 URL', () => {
            expect(AttributeExtractor._isValidImageUrl('https://example.com/image.jpg')).toBe(true);
            expect(AttributeExtractor._isValidImageUrl('/image.jpg')).toBe(true);
        });

        test('應該拒絕無效的圖片 URL', () => {
            expect(AttributeExtractor._isValidImageUrl('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')).toBe(false);
            expect(AttributeExtractor._isValidImageUrl('placeholder.jpg')).toBe(false);
            expect(AttributeExtractor._isValidImageUrl('')).toBe(false);
            expect(AttributeExtractor._isValidImageUrl(null)).toBe(false);
        });
    });

    describe('getAttributePriority', () => {
        test('應該返回屬性的優先級', () => {
            expect(AttributeExtractor.getAttributePriority('src')).toBe(0);
            expect(AttributeExtractor.getAttributePriority('data-src')).toBe(1);
            expect(AttributeExtractor.getAttributePriority('unknown-attr')).toBe(999);
        });
    });

    describe('isLazyLoadAttribute', () => {
        test('應該識別懶加載屬性', () => {
            expect(AttributeExtractor.isLazyLoadAttribute('data-src')).toBe(true);
            expect(AttributeExtractor.isLazyLoadAttribute('data-lazy-src')).toBe(true);
            expect(AttributeExtractor.isLazyLoadAttribute('data-original')).toBe(true);
        });

        test('應該識別非懶加載屬性', () => {
            expect(AttributeExtractor.isLazyLoadAttribute('src')).toBe(false);
            expect(AttributeExtractor.isLazyLoadAttribute('alt')).toBe(false);
            // 這些不應該被識別為懶加載屬性
            expect(AttributeExtractor.isLazyLoadAttribute('data-testid')).toBe(false);
            expect(AttributeExtractor.isLazyLoadAttribute('data-id')).toBe(false);
            expect(AttributeExtractor.isLazyLoadAttribute('data-class')).toBe(false);
        });
    });

    describe('isResponsiveAttribute', () => {
        test('應該識別響應式圖片屬性', () => {
            expect(AttributeExtractor.isResponsiveAttribute('data-srcset')).toBe(true);
            expect(AttributeExtractor.isResponsiveAttribute('sizes')).toBe(true);
        });

        test('應該識別非響應式圖片屬性', () => {
            expect(AttributeExtractor.isResponsiveAttribute('src')).toBe(false);
            expect(AttributeExtractor.isResponsiveAttribute('alt')).toBe(false);
        });
    });
});