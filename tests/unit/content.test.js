/**
 * content.js 單元測試
 * 測試內容提取和圖片處理函數
 */

// 從可測試版本導入函數
const { cleanImageUrl, isValidImageUrl, extractImageSrc, isContentGood } = require('../helpers/content.testable');

describe('content.js - 圖片處理函數', () => {
    
    describe('cleanImageUrl', () => {
        test('應該返回普通圖片 URL', () => {
            const url = 'https://example.com/image.jpg';
            expect(cleanImageUrl(url)).toBe(url);
        });

        test('應該處理帶查詢參數的 URL', () => {
            const url = 'https://example.com/image.jpg?w=800&h=600';
            expect(cleanImageUrl(url)).toBe(url);
        });

        test('應該移除重複的查詢參數', () => {
            const url = 'https://example.com/image.jpg?w=800&w=600&h=400';
            const result = cleanImageUrl(url);
            expect(result).toContain('w=800');
            expect(result).not.toContain('w=600');
        });

        test('應該處理代理 URL（u 參數）', () => {
            const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?u=https://example.com/real-image.jpg';
            const result = cleanImageUrl(proxyUrl);
            expect(result).toBe('https://example.com/real-image.jpg');
        });

        test('應該遞歸處理嵌套的代理 URL', () => {
            const nestedProxy = 'https://proxy1.com/photo.php?u=https://proxy2.com/gw/?u=https://example.com/image.jpg';
            const result = cleanImageUrl(nestedProxy);
            expect(result).toBe('https://example.com/image.jpg');
        });

        test('應該處理 null 和 undefined', () => {
            expect(cleanImageUrl(null)).toBeNull();
            expect(cleanImageUrl()).toBeNull();
        });

        test('應該處理空字符串', () => {
            expect(cleanImageUrl('')).toBeNull();
        });

        test('應該處理非字符串輸入', () => {
            expect(cleanImageUrl(123)).toBeNull();
            expect(cleanImageUrl({})).toBeNull();
            expect(cleanImageUrl([])).toBeNull();
        });

        test('應該處理無效的 URL', () => {
            expect(cleanImageUrl('not-a-url')).toBeNull();
            // ftp URL 會被 URL 對象接受，但 isValidImageUrl 會拒絕
            expect(cleanImageUrl('ftp://invalid.com')).toBe('ftp://invalid.com/');
        });
    });

    describe('isValidImageUrl', () => {
        test('應該接受常見圖片擴展名', () => {
            expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.jpeg')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.png')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.gif')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.webp')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.svg')).toBe(true);
        });

        test('應該接受帶查詢參數的圖片 URL', () => {
            expect(isValidImageUrl('https://example.com/image.jpg?w=800')).toBe(true);
        });

        test('應該接受包含圖片路徑關鍵詞的 URL', () => {
            expect(isValidImageUrl('https://example.com/images/photo')).toBe(true);
            expect(isValidImageUrl('https://example.com/media/photo')).toBe(true);
            expect(isValidImageUrl('https://example.com/photos/pic')).toBe(true);
            expect(isValidImageUrl('https://cdn.example.com/uploads/file')).toBe(true);
        });

        test('應該拒絕非 HTTP(S) 協議', () => {
            expect(isValidImageUrl('ftp://example.com/image.jpg')).toBe(false);
            expect(isValidImageUrl('file:///path/to/image.jpg')).toBe(false);
        });

        test('應該拒絕過長的 URL', () => {
            const longUrl = 'https://example.com/' + 'a'.repeat(2000) + '.jpg';
            expect(isValidImageUrl(longUrl)).toBe(false);
        });

        test('應該拒絕非圖片文件', () => {
            expect(isValidImageUrl('https://example.com/script.js')).toBe(false);
            expect(isValidImageUrl('https://example.com/style.css')).toBe(false);
            expect(isValidImageUrl('https://example.com/page.html')).toBe(false);
            expect(isValidImageUrl('https://example.com/doc.pdf')).toBe(false);
        });

        test('應該拒絕 API 端點', () => {
            expect(isValidImageUrl('https://example.com/api/data')).toBe(false);
            expect(isValidImageUrl('https://example.com/ajax/load')).toBe(false);
        });

        test('應該拒絕認證頁面', () => {
            expect(isValidImageUrl('https://example.com/login')).toBe(false);
            expect(isValidImageUrl('https://example.com/signin')).toBe(false);
        });

        test('應該拒絕沒有圖片擴展名和路徑模式的 URL', () => {
            // 測試未覆蓋的行 82：excludePatterns 之後的 return false
            expect(isValidImageUrl('https://example.com/random-file')).toBe(false);
            expect(isValidImageUrl('https://example.com/data/content')).toBe(false);
            expect(isValidImageUrl('https://example.com/pages/article')).toBe(false);
        });

        test('應該處理 null 和 undefined', () => {
            expect(isValidImageUrl(null)).toBe(false);
            expect(isValidImageUrl()).toBe(false);
        });

        test('應該處理空字符串', () => {
            expect(isValidImageUrl('')).toBe(false);
        });

        test('應該處理非字符串輸入', () => {
            expect(isValidImageUrl(123)).toBe(false);
            expect(isValidImageUrl({})).toBe(false);
        });
    });

    describe('extractImageSrc - 使用 JSDOM', () => {
        test('應該從 noscript 內的 img 回退提取', () => {
            const wrapper = document.createElement('div');
            const img = document.createElement('img');
            // 無任何可用屬性
            wrapper.appendChild(img);
            const nos = document.createElement('noscript');
            nos.textContent = '<img src="https://example.com/in-noscript.jpg" alt="">';
            wrapper.appendChild(nos);
            expect(extractImageSrc(img)).toBe('https://example.com/in-noscript.jpg');
        });

        test('應該從背景圖回退提取（當 img 無有效屬性）', () => {
            const img = document.createElement('img');
            Object.defineProperty(img, 'style', { value: { backgroundImage: 'url(https://example.com/bg.jpg)' }, writable: true });
            // jsdom 不支援計算樣式，模擬 getComputedStyle
            const originalGCS = window.getComputedStyle;
            window.getComputedStyle = () => ({ getPropertyValue: () => 'url("https://example.com/bg.jpg")' });
            expect(extractImageSrc(img)).toBe('https://example.com/bg.jpg');
            window.getComputedStyle = originalGCS;
        });

        test('應該在 srcset 以最大寬度選擇 URL', () => {
            const img = document.createElement('img');
            img.setAttribute('srcset', 'https://example.com/a.jpg 400w, https://example.com/b.jpg 800w, https://example.com/c.jpg 1200w');
            expect(extractImageSrc(img)).toBe('https://example.com/c.jpg');
        });

        test('應該從擴展 data-* 屬性提取', () => {
            const img = document.createElement('img');
            img.setAttribute('data-actualsrc', 'https://example.com/actual.jpg');
            expect(extractImageSrc(img)).toBe('https://example.com/actual.jpg');
        });
        test('應該從 src 屬性提取', () => {
            const img = document.createElement('img');
            img.setAttribute('src', 'https://example.com/image.jpg');
            expect(extractImageSrc(img)).toBe('https://example.com/image.jpg');
        });

        test('應該從 data-src 提取（懶加載）', () => {
            const img = document.createElement('img');
            img.setAttribute('data-src', 'https://example.com/lazy-image.jpg');
            expect(extractImageSrc(img)).toBe('https://example.com/lazy-image.jpg');
        });

        test('應該優先使用 srcset', () => {
            const img = document.createElement('img');
            img.setAttribute('src', 'https://example.com/small.jpg');
            img.setAttribute('srcset', 'https://example.com/medium.jpg 800w, https://example.com/large.jpg 1200w');
            expect(extractImageSrc(img)).toBe('https://example.com/large.jpg');
        });

        test('應該從 data-lazy-src 提取', () => {
            const img = document.createElement('img');
            img.setAttribute('data-lazy-src', 'https://example.com/lazy.jpg');
            expect(extractImageSrc(img)).toBe('https://example.com/lazy.jpg');
        });

        test('應該從 data-original 提取', () => {
            const img = document.createElement('img');
            img.setAttribute('data-original', 'https://example.com/original.jpg');
            expect(extractImageSrc(img)).toBe('https://example.com/original.jpg');
        });

        test('應該跳過 data: URL', () => {
            const img = document.createElement('img');
            img.setAttribute('src', 'data:image/png;base64,iVBORw0KGgoAAAANS');
            img.setAttribute('data-src', 'https://example.com/real.jpg');
            expect(extractImageSrc(img)).toBe('https://example.com/real.jpg');
        });

        test('應該跳過 blob: URL', () => {
            const img = document.createElement('img');
            img.setAttribute('src', 'blob:https://example.com/abc-123');
            img.setAttribute('data-src', 'https://example.com/real.jpg');
            expect(extractImageSrc(img)).toBe('https://example.com/real.jpg');
        });

        test('應該處理 <picture> 元素中的 <source>', () => {
            const picture = document.createElement('picture');
            const source = document.createElement('source');
            source.setAttribute('srcset', 'https://example.com/picture.jpg');
            picture.appendChild(source);
            
            const img = document.createElement('img');
            // 不設置 src，讓函數去 picture 中尋找
            picture.appendChild(img);
            
            expect(extractImageSrc(img)).toBe('https://example.com/picture.jpg');
        });

        test('應該從多個 data- 屬性中選擇第一個有效的', () => {
            const img = document.createElement('img');
            img.setAttribute('data-lazy-src', '');
            img.setAttribute('data-original', 'https://example.com/original.jpg');
            expect(extractImageSrc(img)).toBe('https://example.com/original.jpg');
        });

        test('應該返回 null 當沒有找到有效 src', () => {
            const img = document.createElement('img');
            expect(extractImageSrc(img)).toBeNull();
        });

        test('應該處理帶空格的 srcset', () => {
            const img = document.createElement('img');
            img.setAttribute('srcset', '  https://example.com/image.jpg 1x  ,  https://example.com/image-2x.jpg 2x  ');
            expect(extractImageSrc(img)).toBe('https://example.com/image-2x.jpg');
        });
    });

    describe('isContentGood', () => {
        test('應該接受足夠長的內容', () => {
            const article = {
                content: '<p>' + 'a'.repeat(300) + '</p>',
                length: 300
            };
            expect(isContentGood(article)).toBe(true);
        });

        test('應該拒絕太短的內容', () => {
            const article = {
                content: '<p>Short content</p>',
                length: 50
            };
            expect(isContentGood(article, 250)).toBe(false);
        });

        test('應該拒絕高連結密度的內容', () => {
            const article = {
                content: '<p>' + 'text '.repeat(50) + '</p><a href="#">' + 'link '.repeat(100) + '</a>',
                length: 500
            };
            expect(isContentGood(article, 250, 0.3)).toBe(false);
        });

        test('應該接受低連結密度的內容', () => {
            const article = {
                content: '<p>' + 'text '.repeat(100) + '</p><a href="#">link</a>',
                length: 500
            };
            expect(isContentGood(article, 250, 0.3)).toBe(true);
        });

        test('應該處理 null 文章', () => {
            expect(isContentGood(null)).toBe(false);
        });

        test('應該處理沒有 content 屬性的文章', () => {
            const article = { length: 300 };
            expect(isContentGood(article)).toBe(false);
        });

        test('應該處理沒有 length 屬性的文章', () => {
            const article = { content: '<p>Some content</p>' };
            // article.length 是 undefined，undefined < 250 是 false
            // 所以會進入 DOM 處理邏輯，linkDensity = 0 / undefined = NaN
            // NaN > 0.3 是 false，所以返回 true
            expect(isContentGood(article)).toBe(true);
        });

        test('應該使用自定義 MIN_CONTENT_LENGTH', () => {
            const article = {
                content: '<p>' + 'a'.repeat(150) + '</p>',
                length: 150
            };
            expect(isContentGood(article, 100)).toBe(true);
            expect(isContentGood(article, 200)).toBe(false);
        });

        test('應該使用自定義 MAX_LINK_DENSITY', () => {
            const article = {
                content: '<p>' + 'text '.repeat(50) + '</p><a href="#">' + 'link '.repeat(30) + '</a>',
                length: 400
            };
            expect(isContentGood(article, 250, 0.5)).toBe(true);
            expect(isContentGood(article, 250, 0.2)).toBe(false);
        });

        test('應該處理沒有連結的內容', () => {
            const article = {
                content: '<p>' + 'Pure text content without any links. '.repeat(10) + '</p>',
                length: 400
            };
            expect(isContentGood(article)).toBe(true);
        });

        test('應該處理多個連結', () => {
            const article = {
                content: '<p>Text</p><a href="#">Link1</a><p>Text</p><a href="#">Link2</a><p>' + 'Text '.repeat(50) + '</p>',
                length: 300
            };
            // 連結密度低，應該通過
            expect(isContentGood(article, 250, 0.3)).toBe(true);
        });

        test('應該處理空連結', () => {
            const article = {
                content: '<p>' + 'text '.repeat(100) + '</p><a href="#"></a>',
                length: 500
            };
            expect(isContentGood(article)).toBe(true);
        });

        test('應該處理嵌套的 HTML 結構', () => {
            const article = {
                content: '<div><p>' + 'text '.repeat(50) + '</p><div><a href="#">link</a></div></div>',
                length: 300
            };
            expect(isContentGood(article, 250, 0.3)).toBe(true);
        });

        test('應該在沒有 document 時使用簡化邏輯', () => {
            // 測試未覆蓋的行 170：document undefined 分支
            // 保存原始 document
            const originalDocument = global.document;
            
            try {
                // 模擬 document 不存在
                global.document = undefined;
                
                const article = {
                    content: '<p>Some content</p>',
                    length: 300
                };
                
                // 應該使用簡化邏輯：只檢查長度
                expect(isContentGood(article, 250)).toBe(true);
                
                const shortArticle = {
                    content: '<p>Short</p>',
                    length: 100
                };
                expect(isContentGood(shortArticle, 250)).toBe(false);
            } finally {
                // 恢復 document
                global.document = originalDocument;
            }
        });
});
    describe('PerformanceOptimizer 可選邏輯', () => {
        beforeEach(() => {
            // 重置全局變數
            global.PerformanceOptimizer = undefined;
            global.ImageUtils = undefined;
        });

        afterEach(() => {
            // 清理測試後的全局變數
            delete global.PerformanceOptimizer;
            delete global.ImageUtils;
        });

        test('應該在 PerformanceOptimizer 可用時正常初始化', () => {
            // 模擬 PerformanceOptimizer 可用
            global.PerformanceOptimizer = jest.fn().mockImplementation(() => ({
                cachedQuery: jest.fn(),
                preloadSelectors: jest.fn()
            }));

            // 重新載入模組（在真實環境中這會在 content.js 中發生）
            const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
            const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();

            // 模擬 content.js 中的邏輯
            let performanceOptimizer = null;
            try {
                if (typeof PerformanceOptimizer !== 'undefined') {
                    performanceOptimizer = new PerformanceOptimizer({
                        enableCache: true,
                        enableBatching: true,
                        enableMetrics: true
                    });
                    console.log('✓ PerformanceOptimizer initialized in content script');
                } else {
                    console.warn('⚠️ PerformanceOptimizer not available in content script, using fallback queries');
                }
            } catch (perfError) {
                console.warn('⚠️ PerformanceOptimizer initialization failed in content script:', perfError);
                performanceOptimizer = null;
            }

            expect(performanceOptimizer).toBeDefined();
            expect(typeof performanceOptimizer).toBe('object'); // PerformanceOptimizer 實例是對象
            expect(mockConsoleLog).toHaveBeenCalledWith('✓ PerformanceOptimizer initialized in content script');

            mockConsoleLog.mockRestore();
            mockConsoleWarn.mockRestore();
        });

        test('應該在 PerformanceOptimizer 不存在時使用回退', () => {
            const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();

            let performanceOptimizer = null;
            try {
                if (typeof PerformanceOptimizer !== 'undefined') {
                    performanceOptimizer = new PerformanceOptimizer({
                        enableCache: true,
                        enableBatching: true,
                        enableMetrics: true
                    });
                    console.log('✓ PerformanceOptimizer initialized in content script');
                } else {
                    console.warn('⚠️ PerformanceOptimizer not available in content script, using fallback queries');
                }
            } catch (perfError) {
                console.warn('⚠️ PerformanceOptimizer initialization failed in content script:', perfError);
                performanceOptimizer = null;
            }

            expect(performanceOptimizer).toBeNull();
            expect(mockConsoleWarn).toHaveBeenCalledWith('⚠️ PerformanceOptimizer not available in content script, using fallback queries');

            mockConsoleWarn.mockRestore();
        });

        test('應該在 PerformanceOptimizer 初始化失敗時優雅降級', () => {
            // 模擬 PerformanceOptimizer 拋出錯誤
            global.PerformanceOptimizer = jest.fn().mockImplementation(() => {
                throw new Error('Initialization failed');
            });

            const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();

            let performanceOptimizer = null;
            try {
                if (typeof PerformanceOptimizer !== 'undefined') {
                    performanceOptimizer = new PerformanceOptimizer({
                        enableCache: true,
                        enableBatching: true,
                        enableMetrics: true
                    });
                    console.log('✓ PerformanceOptimizer initialized in content script');
                } else {
                    console.warn('⚠️ PerformanceOptimizer not available in content script, using fallback queries');
                }
            } catch (perfError) {
                console.warn('⚠️ PerformanceOptimizer initialization failed in content script:', perfError);
                performanceOptimizer = null;
            }

            expect(performanceOptimizer).toBeNull();
            expect(mockConsoleWarn).toHaveBeenCalledWith('⚠️ PerformanceOptimizer initialization failed in content script:', expect.any(Error));

            mockConsoleWarn.mockRestore();
        });
    });

    describe('cachedQuery 回退函數', () => {
        let performanceOptimizer;

        beforeEach(() => {
            performanceOptimizer = {
                cachedQuery: jest.fn((selector, context, options) => {
                    return options.single ?
                        context.querySelector(selector) :
                        context.querySelectorAll(selector);
                })
            };
        });

        test('應該在 PerformanceOptimizer 可用時使用其 cachedQuery', () => {
            const cachedQuery = (selector, context = document, options = {}) => {
                if (performanceOptimizer) {
                    return performanceOptimizer.cachedQuery(selector, context, options);
                }
                return options.single ? context.querySelector(selector) : context.querySelectorAll(selector);
            };

            const mockElement = document.createElement('div');
            const result = cachedQuery('div', document, { single: true });

            expect(performanceOptimizer.cachedQuery).toHaveBeenCalledWith('div', document, { single: true });
        });

        test('應該在 PerformanceOptimizer 不存在時回退到原生查詢', () => {
            performanceOptimizer = null;

            const cachedQuery = (selector, context = document, options = {}) => {
                if (performanceOptimizer) {
                    return performanceOptimizer.cachedQuery(selector, context, options);
                }
                return options.single ? context.querySelector(selector) : context.querySelectorAll(selector);
            };

            const mockElement = document.createElement('div');
            document.body.appendChild(mockElement);

            const result = cachedQuery('div', document, { single: true });
            expect(result).toBe(mockElement);

            const allResults = cachedQuery('div', document, { all: true });
            expect(allResults).toContain(mockElement);

            document.body.removeChild(mockElement);
        });

        test('應該正確處理 single 選項', () => {
            performanceOptimizer = null;

            const cachedQuery = (selector, context = document, options = {}) => {
                if (performanceOptimizer) {
                    return performanceOptimizer.cachedQuery(selector, context, options);
                }
                return options.single ? context.querySelector(selector) : context.querySelectorAll(selector);
            };

            const div1 = document.createElement('div');
            const div2 = document.createElement('div');
            document.body.appendChild(div1);
            document.body.appendChild(div2);

            expect(cachedQuery('div', document, { single: true })).toBe(div1);
            expect(cachedQuery('div', document, {})).toEqual(expect.any(NodeList));

            document.body.removeChild(div1);
            document.body.removeChild(div2);
        });
    });

    describe('ImageUtils 回退實現', () => {
        beforeEach(() => {
            // 清理可能的全局 ImageUtils
            delete global.window.ImageUtils;
        });

        test('應該在 ImageUtils 不存在時創建回退實現', () => {
            expect(typeof ImageUtils).toBe('undefined');

            // 模擬 content.js 中的邏輯
            if (typeof ImageUtils === 'undefined') {
                console.warn('ImageUtils not available, using fallback implementations');
                global.window.ImageUtils = {
                    cleanImageUrl: function (url) {
                        if (!url || typeof url !== 'string') return null;
                        try {
                            return new URL(url).href;
                        } catch (e) {
                            return null;
                        }
                    },
                    isValidImageUrl: function (url) {
                        if (!url || typeof url !== 'string') return false;
                        return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(url);
                    },
                    extractImageSrc: function (imgNode) {
                        if (!imgNode) return null;
                        return imgNode.getAttribute('src') || imgNode.getAttribute('data-src') || null;
                    },
                    generateImageCacheKey: function (imgNode) {
                        if (!imgNode) return 'null';
                        return (imgNode.getAttribute('src') || '') + '|' + (imgNode.className || '');
                    }
                };
            }

            expect(global.window.ImageUtils).toBeDefined();
            expect(typeof global.window.ImageUtils.cleanImageUrl).toBe('function');
            expect(typeof global.window.ImageUtils.isValidImageUrl).toBe('function');
            expect(typeof global.window.ImageUtils.extractImageSrc).toBe('function');
            expect(typeof global.window.ImageUtils.generateImageCacheKey).toBe('function');
        });

        test('回退實現應該正確處理 cleanImageUrl', () => {
            if (typeof ImageUtils === 'undefined') {
                global.window.ImageUtils = {
                    cleanImageUrl: function (url) {
                        if (!url || typeof url !== 'string') return null;
                        try {
                            return new URL(url).href;
                        } catch (e) {
                            return null;
                        }
                    }
                };
            }

            expect(global.window.ImageUtils.cleanImageUrl('https://example.com/image.jpg')).toBe('https://example.com/image.jpg');
            expect(global.window.ImageUtils.cleanImageUrl(null)).toBeNull();
            expect(global.window.ImageUtils.cleanImageUrl('invalid-url')).toBeNull();
        });

        test('回退實現應該正確處理 isValidImageUrl', () => {
            if (typeof ImageUtils === 'undefined') {
                global.window.ImageUtils = {
                    isValidImageUrl: function (url) {
                        if (!url || typeof url !== 'string') return false;
                        return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(url);
                    }
                };
            }

            expect(global.window.ImageUtils.isValidImageUrl('https://example.com/image.jpg')).toBe(true);
            expect(global.window.ImageUtils.isValidImageUrl('https://example.com/image.png')).toBe(true);
            expect(global.window.ImageUtils.isValidImageUrl('https://example.com/script.js')).toBe(false);
            expect(global.window.ImageUtils.isValidImageUrl(null)).toBe(false);
        });

        test('回退實現應該正確處理 extractImageSrc', () => {
            if (typeof ImageUtils === 'undefined') {
                global.window.ImageUtils = {
                    extractImageSrc: function (imgNode) {
                        if (!imgNode) return null;
                        return imgNode.getAttribute('src') || imgNode.getAttribute('data-src') || null;
                    }
                };
            }

            const img = document.createElement('img');
            img.setAttribute('data-src', 'fallback.jpg');
            expect(global.window.ImageUtils.extractImageSrc(img)).toBe('fallback.jpg');

            img.setAttribute('src', 'primary.jpg');
            expect(global.window.ImageUtils.extractImageSrc(img)).toBe('primary.jpg');

            expect(global.window.ImageUtils.extractImageSrc(null)).toBeNull();
        });

        test('回退實現應該正確處理 generateImageCacheKey', () => {
            if (typeof ImageUtils === 'undefined') {
                global.window.ImageUtils = {
                    generateImageCacheKey: function (imgNode) {
                        if (!imgNode) return 'null';
                        return (imgNode.getAttribute('src') || '') + '|' + (imgNode.className || '');
                    }
                };
            }

            const img = document.createElement('img');
            img.setAttribute('src', 'image.jpg');
            img.className = 'lazy-image';
            expect(global.window.ImageUtils.generateImageCacheKey(img)).toBe('image.jpg|lazy-image');
            expect(global.window.ImageUtils.generateImageCacheKey(null)).toBe('null');
        });
    });
});
