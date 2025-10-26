// 圖片處理工具函數測試
// 測試 scripts/utils/imageUtils.js 中的函數

// 先設置 Chrome Mock,再導入源碼
require('../mocks/chrome.js');

// 導入實際的源碼函數
const {
    cleanImageUrl,
    isValidImageUrl,
    extractImageSrc,
    extractBestUrlFromSrcset,
    generateImageCacheKey,
    IMAGE_ATTRIBUTES
} = require('../../scripts/utils/imageUtils.js');

describe('ImageUtils - cleanImageUrl', () => {
    describe('基本功能', () => {
        test('應該返回有效的簡單圖片 URL', () => {
            const url = 'https://example.com/image.jpg';
            expect(cleanImageUrl(url)).toBe(url);
        });

        test('應該處理帶查詢參數的 URL', () => {
            const url = 'https://example.com/image.jpg?size=large&quality=80';
            expect(cleanImageUrl(url)).toContain('example.com/image.jpg');
            expect(cleanImageUrl(url)).toContain('size=large');
        });
    });

    describe('代理 URL 處理', () => {
        test('應該從代理 URL 提取原始圖片', () => {
            const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?u=https://example.com/real-image.jpg';
            expect(cleanImageUrl(proxyUrl)).toBe('https://example.com/real-image.jpg');
        });

        test('應該處理嵌套的代理 URL', () => {
            const url = 'https://proxy.com/photo.php?u=https://example.com/image.jpg?size=large';
            const result = cleanImageUrl(url);
            expect(result).toContain('example.com/image.jpg');
        });
    });

    describe('重複參數處理', () => {
        test('應該移除重複的查詢參數', () => {
            const url = 'https://example.com/image.jpg?id=1&id=2&name=test';
            const result = cleanImageUrl(url);
            expect(result).toContain('id=');
            // 只保留第一個 id 參數
            const matches = result.match(/id=/g);
            expect(matches?.length).toBe(1);
        });
    });

    describe('錯誤處理', () => {
        test('應該處理 null', () => {
            expect(cleanImageUrl(null)).toBeNull();
        });

        test('應該處理 undefined', () => {
            expect(cleanImageUrl()).toBeNull();
        });

        test('應該處理空字串', () => {
            expect(cleanImageUrl('')).toBeNull();
        });

        test('應該處理無效的 URL', () => {
            expect(cleanImageUrl('not-a-url')).toBeNull();
        });

        test('應該處理非字串輸入', () => {
            expect(cleanImageUrl(123)).toBeNull();
            expect(cleanImageUrl({})).toBeNull();
            expect(cleanImageUrl([])).toBeNull();
        });
    });
});

describe('ImageUtils - isValidImageUrl', () => {
    describe('基本驗證', () => {
        test('應該接受標準圖片 URL', () => {
            expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
            expect(isValidImageUrl('https://example.com/photo.png')).toBe(true);
            expect(isValidImageUrl('https://example.com/pic.gif')).toBe(true);
        });

        test('應該接受帶查詢參數的圖片 URL', () => {
            expect(isValidImageUrl('https://example.com/image.jpg?size=large')).toBe(true);
        });

        test('應該接受 HTTP 和 HTTPS', () => {
            expect(isValidImageUrl('http://example.com/image.jpg')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
        });
    });

    describe('圖片格式支持', () => {
        const formats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif', 'avif', 'heic', 'heif'];

        formats.forEach(format => {
            test(`應該支持 .${format} 格式`, () => {
                expect(isValidImageUrl(`https://example.com/image.${format}`)).toBe(true);
            });
        });
    });

    describe('路徑模式識別', () => {
        const validPaths = [
            '/images/photo.png',
            '/img/banner.jpg',
            '/photos/gallery.jpg',
            '/pictures/avatar.png',
            '/media/cover.jpg',
            '/uploads/file.jpg',
            '/assets/logo.png',
            '/files/image.jpg'
        ];

        validPaths.forEach(path => {
            test(`應該識別路徑: ${path}`, () => {
                expect(isValidImageUrl(`https://example.com${path}`)).toBe(true);
            });
        });
    });

    describe('無擴展名 CDN 圖片', () => {
        test('應該接受包含 /images/ 路徑的 URL', () => {
            expect(isValidImageUrl('https://cdn.example.com/images/abc123')).toBe(true);
        });

        test('應該接受包含 /media/ 路徑的 URL', () => {
            expect(isValidImageUrl('https://cdn.example.com/media/xyz789')).toBe(true);
        });
    });

    describe('排除非圖片 URL', () => {
        test('應該拒絕腳本文件', () => {
            expect(isValidImageUrl('https://example.com/script.js')).toBe(false);
        });

        test('應該拒絕樣式文件', () => {
            expect(isValidImageUrl('https://example.com/style.css')).toBe(false);
        });

        test('應該拒絕 HTML 頁面', () => {
            expect(isValidImageUrl('https://example.com/page.html')).toBe(false);
        });

        test('應該拒絕 API 端點', () => {
            expect(isValidImageUrl('https://example.com/api/data')).toBe(false);
        });

        test('應該拒絕 AJAX 請求', () => {
            expect(isValidImageUrl('https://example.com/ajax/load')).toBe(false);
        });
    });

    describe('URL 長度限制', () => {
        test('應該拒絕過長的 URL (>2000 字符)', () => {
            const longUrl = 'https://example.com/image.jpg?' + 'a'.repeat(2000);
            expect(isValidImageUrl(longUrl)).toBe(false);
        });

        test('應該接受正常長度的 URL', () => {
            const normalUrl = 'https://example.com/image.jpg?param=value';
            expect(isValidImageUrl(normalUrl)).toBe(true);
        });
    });

    describe('錯誤處理', () => {
        test('應該拒絕 null', () => {
            expect(isValidImageUrl(null)).toBe(false);
        });

        test('應該拒絕 undefined', () => {
            expect(isValidImageUrl()).toBe(false);
        });

        test('應該拒絕空字串', () => {
            expect(isValidImageUrl('')).toBe(false);
        });

        test('應該拒絕無效的 URL', () => {
            expect(isValidImageUrl('not-a-url')).toBe(false);
        });

        test('應該拒絕非 HTTP(S) 協議', () => {
            expect(isValidImageUrl('ftp://example.com/image.jpg')).toBe(false);
            expect(isValidImageUrl('file:///path/to/image.jpg')).toBe(false);
        });
    });

    describe('真實世界案例', () => {
        test('應該處理 CDN URL', () => {
            expect(isValidImageUrl('https://cdn.jsdelivr.net/gh/user/repo/image.png')).toBe(true);
        });

        test('應該處理圖床 URL', () => {
            expect(isValidImageUrl('https://i.imgur.com/abc123.jpg')).toBe(true);
        });

        test('應該處理 WordPress 媒體庫', () => {
            expect(isValidImageUrl('https://example.com/wp-content/uploads/2024/10/image.jpg')).toBe(true);
        });

        test('應該處理日期路徑', () => {
            expect(isValidImageUrl('https://example.com/2024/10/image.jpg')).toBe(true);
        });
    });
});

describe('ImageUtils - extractBestUrlFromSrcset', () => {
    test('應該從單個 URL 提取', () => {
        expect(extractBestUrlFromSrcset('image.jpg')).toBe('image.jpg');
    });

    test('應該從簡單 srcset 提取最高分辨率', () => {
        const srcset = 'image.jpg 1x, image2x.jpg 2x';
        expect(extractBestUrlFromSrcset(srcset)).toBe('image2x.jpg');
    });

    test('應該從寬度描述符中提取最大寬度', () => {
        const srcset = 'small.jpg 320w, medium.jpg 640w, large.jpg 1280w';
        expect(extractBestUrlFromSrcset(srcset)).toBe('large.jpg');
    });

    test('應該忽略 data URL', () => {
        const srcset = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw== 1x, real.jpg 2x';
        expect(extractBestUrlFromSrcset(srcset)).toBe('real.jpg');
    });

    test('應該處理沒有描述符的條目', () => {
        const srcset = 'first.jpg, second.jpg 2x';
        expect(extractBestUrlFromSrcset(srcset)).toBe('second.jpg');
    });

    test('應該處理空或無效輸入', () => {
        expect(extractBestUrlFromSrcset(null)).toBeNull();
        expect(extractBestUrlFromSrcset('')).toBeNull();
        expect(extractBestUrlFromSrcset()).toBeNull();
    });
});

describe('ImageUtils - extractImageSrc', () => {
    // Mock DOM 元素
    function createMockImg(attributes = {}) {
        const img = {
            getAttribute: jest.fn((name) => attributes[name] || null),
            closest: jest.fn(() => null)
        };
        return img;
    }

    test('應該提取標準 src 屬性', () => {
        const img = createMockImg({ src: 'image.jpg' });
        expect(extractImageSrc(img)).toBe('image.jpg');
    });

    test('應該優先使用 srcset 中的最佳 URL', () => {
        const img = createMockImg({
            srcset: 'small.jpg 320w, large.jpg 640w',
            src: 'fallback.jpg'
        });
        expect(extractImageSrc(img)).toBe('large.jpg');
    });

    test('應該優先使用 src 屬性', () => {
        const img = createMockImg({
            src: 'primary.jpg',
            'data-src': 'lazy-image.jpg'
        });
        expect(extractImageSrc(img)).toBe('primary.jpg');
    });

    test('應該處理 picture 元素中的 source', () => {
        const mockSource = {
            getAttribute: jest.fn((name) => name === 'srcset' ? 'source1.jpg 1x, source2.jpg 2x' : null)
        };
        const mockPicture = {
            querySelectorAll: jest.fn(() => [mockSource])
        };
        const img = createMockImg();
        img.closest.mockReturnValue(mockPicture);

        expect(extractImageSrc(img)).toBe('source2.jpg');
    });

    test('應該處理 null 或無效輸入', () => {
        expect(extractImageSrc(null)).toBeNull();
        expect(extractImageSrc()).toBeNull();
    });

    test('應該跳過 data: 和 blob: URL', () => {
        const img = createMockImg({
            src: 'data:image/gif;base64,test',
            'data-src': 'blob:http://example.com/test'
        });
        expect(extractImageSrc(img)).toBeNull();
    });
});

describe('ImageUtils - generateImageCacheKey', () => {
    function createMockImg(attributes = {}) {
        return {
            getAttribute: jest.fn((name) => attributes[name] || ''),
            className: attributes.className || '',
            id: attributes.id || ''
        };
    }

    test('應該生成基於屬性的緩存鍵', () => {
        const img = createMockImg({
            src: 'image.jpg',
            'data-src': 'data-image.jpg',
            className: 'lazy-image',
            id: 'img-1'
        });
        const key = generateImageCacheKey(img);
        expect(key).toBe('image.jpg|data-image.jpg|lazy-image|img-1');
    });

    test('應該處理缺少屬性的情況', () => {
        const img = createMockImg({ src: 'image.jpg' });
        const key = generateImageCacheKey(img);
        expect(key).toBe('image.jpg|||');
    });

    test('應該處理 null 輸入', () => {
        expect(generateImageCacheKey(null)).toBe('');
        expect(generateImageCacheKey()).toBe('');
    });
});

describe('ImageUtils - IMAGE_ATTRIBUTES', () => {
    test('應該包含所有必要的圖片屬性', () => {
        expect(IMAGE_ATTRIBUTES).toContain('src');
        expect(IMAGE_ATTRIBUTES).toContain('data-src');
        expect(IMAGE_ATTRIBUTES).toContain('data-lazy-src');
        expect(IMAGE_ATTRIBUTES).toContain('data-original');
        expect(IMAGE_ATTRIBUTES).toContain('data-srcset');
        expect(IMAGE_ATTRIBUTES.length).toBeGreaterThan(20);
    });

    test('應該包含所有懶加載屬性變體', () => {
        // 檢查是否包含常見的懶加載屬性
        const lazyAttributes = IMAGE_ATTRIBUTES.filter(attr => attr.includes('lazy') || attr.includes('src'));
        expect(lazyAttributes.length).toBeGreaterThan(10);
    });
});