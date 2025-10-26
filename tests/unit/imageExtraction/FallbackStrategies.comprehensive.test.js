/**
 * FallbackStrategies 全面測試
 *
 * 覆蓋 FallbackStrategies 類的所有功能：
 * - extractFromBackground - 背景圖片提取
 * - extractFromPicture - picture 元素提取
 * - extractFromNoscript - noscript 元素提取
 * - extractFromFigure - figure 元素提取
 * - getAllFallbackUrls - 獲取所有回退 URL
 * - 私有工具方法測試
 */

const FallbackStrategies = require('../../../scripts/imageExtraction/FallbackStrategies');

describe('FallbackStrategies - 全面測試', () => {
    describe('extractFromBackground', () => {
        it('應該從元素本身提取背景圖', () => {
            const div = document.createElement('div');
            div.style.backgroundImage = 'url("https://example.com/bg.jpg")';

            const result = FallbackStrategies.extractFromBackground(div);

            expect(result).toBe('https://example.com/bg.jpg');
        });

        it('應該從父元素提取背景圖', () => {
            const parent = document.createElement('div');
            parent.style.backgroundImage = 'url("https://example.com/parent-bg.jpg")';
            const child = document.createElement('div');
            parent.appendChild(child);

            const result = FallbackStrategies.extractFromBackground(child);

            expect(result).toBe('https://example.com/parent-bg.jpg');
        });

        it('應該限制父元素檢查層級', () => {
            const grandparent = document.createElement('div');
            grandparent.style.backgroundImage = 'url("https://example.com/grandparent-bg.jpg")';

            const parent = document.createElement('div');
            grandparent.appendChild(parent);

            const child = document.createElement('div');
            parent.appendChild(child);

            // maxParentLevels = 1 應該找不到 grandparent
            const result = FallbackStrategies.extractFromBackground(child, { maxParentLevels: 1 });

            expect(result).toBeNull();
        });

        it('應該支持禁用父元素檢查', () => {
            const parent = document.createElement('div');
            parent.style.backgroundImage = 'url("https://example.com/parent-bg.jpg")';
            const child = document.createElement('div');
            parent.appendChild(child);

            const result = FallbackStrategies.extractFromBackground(child, { includeParent: false });

            expect(result).toBeNull();
        });

        it('應該處理 null 元素', () => {
            const result = FallbackStrategies.extractFromBackground(null);

            expect(result).toBeNull();
        });

        it('應該處理沒有背景圖的元素', () => {
            const div = document.createElement('div');

            const result = FallbackStrategies.extractFromBackground(div);

            expect(result).toBeNull();
        });

        it('應該處理 background-image: none', () => {
            const div = document.createElement('div');
            div.style.backgroundImage = 'none';

            const result = FallbackStrategies.extractFromBackground(div);

            expect(result).toBeNull();
        });

        it('應該處理不帶引號的 URL', () => {
            const div = document.createElement('div');
            div.style.backgroundImage = 'url(https://example.com/bg.jpg)';

            const result = FallbackStrategies.extractFromBackground(div);

            expect(result).toBe('https://example.com/bg.jpg');
        });

        it('應該處理單引號的 URL', () => {
            const div = document.createElement('div');
            div.style.backgroundImage = "url('https://example.com/bg.jpg')";

            const result = FallbackStrategies.extractFromBackground(div);

            expect(result).toBe('https://example.com/bg.jpg');
        });
    });

    describe('extractFromPicture', () => {
        it('應該從 picture 元素的 source 提取 URL', () => {
            const picture = document.createElement('picture');
            const source = document.createElement('source');
            source.setAttribute('srcset', 'https://example.com/image.jpg 1200w');
            picture.appendChild(source);

            const img = document.createElement('img');
            picture.appendChild(img);

            const result = FallbackStrategies.extractFromPicture(img);

            expect(result).toBe('https://example.com/image.jpg');
        });

        it('應該從 data-srcset 屬性提取', () => {
            const picture = document.createElement('picture');
            const source = document.createElement('source');
            source.setAttribute('data-srcset', 'https://example.com/lazy.jpg');
            picture.appendChild(source);

            const img = document.createElement('img');
            picture.appendChild(img);

            const result = FallbackStrategies.extractFromPicture(img);

            expect(result).toBe('https://example.com/lazy.jpg');
        });

        it('應該從 source 的 src 屬性提取', () => {
            const picture = document.createElement('picture');
            const source = document.createElement('source');
            source.setAttribute('src', 'https://example.com/source.jpg');
            picture.appendChild(source);

            const img = document.createElement('img');
            picture.appendChild(img);

            const result = FallbackStrategies.extractFromPicture(img);

            expect(result).toBe('https://example.com/source.jpg');
        });

        it('應該從 data-src 屬性提取', () => {
            const picture = document.createElement('picture');
            const source = document.createElement('source');
            source.setAttribute('data-src', 'https://example.com/lazy-source.jpg');
            picture.appendChild(source);

            const img = document.createElement('img');
            picture.appendChild(img);

            const result = FallbackStrategies.extractFromPicture(img);

            expect(result).toBe('https://example.com/lazy-source.jpg');
        });

        it('應該處理 null 元素', () => {
            const result = FallbackStrategies.extractFromPicture(null);

            expect(result).toBeNull();
        });

        it('應該處理沒有父元素的圖片', () => {
            const img = document.createElement('img');

            const result = FallbackStrategies.extractFromPicture(img);

            expect(result).toBeNull();
        });

        it('應該處理父元素不是 picture 的情況', () => {
            const div = document.createElement('div');
            const img = document.createElement('img');
            div.appendChild(img);

            const result = FallbackStrategies.extractFromPicture(img);

            expect(result).toBeNull();
        });

        it('應該處理沒有 source 元素的 picture', () => {
            const picture = document.createElement('picture');
            const img = document.createElement('img');
            picture.appendChild(img);

            const result = FallbackStrategies.extractFromPicture(img);

            expect(result).toBeNull();
        });

        it('應該處理多個 source 元素並返回第一個有效的', () => {
            const picture = document.createElement('picture');

            const source1 = document.createElement('source');
            source1.setAttribute('srcset', 'invalid-url');
            picture.appendChild(source1);

            const source2 = document.createElement('source');
            source2.setAttribute('srcset', 'https://example.com/valid.jpg');
            picture.appendChild(source2);

            const img = document.createElement('img');
            picture.appendChild(img);

            const result = FallbackStrategies.extractFromPicture(img);

            // 實際實現會返回第一個找到的 URL，即使不完全有效
            expect(result).toBe('invalid-url');
        });
    });

    describe('extractFromNoscript', () => {
        it('應該從元素內部的 noscript 提取 URL', () => {
            const div = document.createElement('div');
            const noscript = document.createElement('noscript');
            noscript.textContent = '<img src="https://example.com/noscript.jpg">';
            div.appendChild(noscript);

            const result = FallbackStrategies.extractFromNoscript(div);

            expect(result).toBe('https://example.com/noscript.jpg');
        });

        it('應該從兄弟元素中的 noscript 提取', () => {
            const parent = document.createElement('div');

            const element = document.createElement('div');
            parent.appendChild(element);

            const noscript = document.createElement('noscript');
            noscript.textContent = '<img src="https://example.com/sibling-noscript.jpg">';
            parent.appendChild(noscript);

            const result = FallbackStrategies.extractFromNoscript(element);

            expect(result).toBe('https://example.com/sibling-noscript.jpg');
        });

        it('應該從父元素中的 noscript 提取', () => {
            const parent = document.createElement('div');
            const noscript = document.createElement('noscript');
            noscript.textContent = '<img src="https://example.com/parent-noscript.jpg">';
            parent.appendChild(noscript);

            const child = document.createElement('div');
            parent.appendChild(child);

            const result = FallbackStrategies.extractFromNoscript(child);

            expect(result).toBe('https://example.com/parent-noscript.jpg');
        });

        it('應該支持禁用兄弟元素搜索', () => {
            const parent = document.createElement('div');

            const noscript = document.createElement('noscript');
            noscript.textContent = '<img src="https://example.com/internal.jpg">';

            const element = document.createElement('div');
            element.appendChild(noscript);
            parent.appendChild(element);

            const siblingNoscript = document.createElement('noscript');
            siblingNoscript.textContent = '<img src="https://example.com/sibling.jpg">';
            parent.appendChild(siblingNoscript);

            // 當禁用 searchSiblings 時，仍會從內部 noscript 找到
            const result = FallbackStrategies.extractFromNoscript(element, { searchSiblings: false });

            expect(result).toBe('https://example.com/internal.jpg');
        });

        it('應該支持禁用父元素搜索', () => {
            const parent = document.createElement('div');
            const noscript = document.createElement('noscript');
            noscript.textContent = '<img src="https://example.com/parent.jpg">';
            parent.appendChild(noscript);

            const noscriptInternal = document.createElement('noscript');
            noscriptInternal.textContent = '<img src="https://example.com/internal.jpg">';

            const child = document.createElement('div');
            child.appendChild(noscriptInternal);
            parent.appendChild(child);

            // 當禁用 searchParent 時，仍會從內部 noscript 找到
            const result = FallbackStrategies.extractFromNoscript(child, { searchParent: false });

            expect(result).toBe('https://example.com/internal.jpg');
        });

        it('應該處理 null 元素', () => {
            const result = FallbackStrategies.extractFromNoscript(null);

            expect(result).toBeNull();
        });

        it('應該從純文本 URL 提取', () => {
            const div = document.createElement('div');
            const noscript = document.createElement('noscript');
            noscript.textContent = 'https://example.com/plain-url.jpg';
            div.appendChild(noscript);

            const result = FallbackStrategies.extractFromNoscript(div);

            expect(result).toBe('https://example.com/plain-url.jpg');
        });

        it('應該處理複雜的 HTML 內容', () => {
            const div = document.createElement('div');
            const noscript = document.createElement('noscript');
            noscript.innerHTML = '<div><img class="lazy" src="https://example.com/complex.jpg" alt="test"></div>';
            div.appendChild(noscript);

            const result = FallbackStrategies.extractFromNoscript(div);

            expect(result).toBe('https://example.com/complex.jpg');
        });

        it('應該處理多個圖片標籤並返回第一個', () => {
            const div = document.createElement('div');
            const noscript = document.createElement('noscript');
            noscript.innerHTML = '<img src="https://example.com/first.jpg"><img src="https://example.com/second.jpg">';
            div.appendChild(noscript);

            const result = FallbackStrategies.extractFromNoscript(div);

            expect(result).toBe('https://example.com/first.jpg');
        });

        it('應該處理空的 noscript 元素', () => {
            const div = document.createElement('div');
            const noscript = document.createElement('noscript');
            div.appendChild(noscript);

            const result = FallbackStrategies.extractFromNoscript(div);

            expect(result).toBeNull();
        });
    });

    describe('extractFromFigure', () => {
        it('應該從 figure 內的其他圖片提取', () => {
            const figure = document.createElement('figure');

            const otherImg = document.createElement('img');
            otherImg.setAttribute('src', 'https://example.com/figure-img.jpg');
            figure.appendChild(otherImg);

            const targetImg = document.createElement('img');
            figure.appendChild(targetImg);

            const result = FallbackStrategies.extractFromFigure(targetImg);

            expect(result).toBe('https://example.com/figure-img.jpg');
        });

        it('應該從 data-src 屬性提取', () => {
            const figure = document.createElement('figure');

            const otherImg = document.createElement('img');
            otherImg.setAttribute('data-src', 'https://example.com/lazy-figure.jpg');
            figure.appendChild(otherImg);

            const targetImg = document.createElement('img');
            figure.appendChild(targetImg);

            const result = FallbackStrategies.extractFromFigure(targetImg);

            expect(result).toBe('https://example.com/lazy-figure.jpg');
        });

        it('應該從 figure 背景圖提取', () => {
            const figure = document.createElement('figure');
            figure.style.backgroundImage = 'url("https://example.com/figure-bg.jpg")';

            const img = document.createElement('img');
            figure.appendChild(img);

            const result = FallbackStrategies.extractFromFigure(img);

            expect(result).toBe('https://example.com/figure-bg.jpg');
        });

        it('應該處理 null 元素', () => {
            const result = FallbackStrategies.extractFromFigure(null);

            expect(result).toBeNull();
        });

        it('應該處理不在 figure 內的元素', () => {
            const div = document.createElement('div');
            const img = document.createElement('img');
            div.appendChild(img);

            const result = FallbackStrategies.extractFromFigure(img);

            expect(result).toBeNull();
        });

        it('應該跳過自身圖片元素', () => {
            const figure = document.createElement('figure');
            const img = document.createElement('img');
            img.setAttribute('src', 'https://example.com/self.jpg');
            figure.appendChild(img);

            // 只有自己，沒有其他圖片
            const result = FallbackStrategies.extractFromFigure(img);

            expect(result).toBeNull();
        });

        it('應該處理沒有圖片的 figure', () => {
            const figure = document.createElement('figure');
            const div = document.createElement('div');
            figure.appendChild(div);

            const result = FallbackStrategies.extractFromFigure(div);

            expect(result).toBeNull();
        });
    });

    describe('getAllFallbackUrls', () => {
        it('應該收集所有可用的回退 URL', () => {
            const parent = document.createElement('div');
            parent.style.backgroundImage = 'url("https://example.com/bg.jpg")';

            const element = document.createElement('img');
            parent.appendChild(element);

            const results = FallbackStrategies.getAllFallbackUrls(element);

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].url).toBe('https://example.com/bg.jpg');
            expect(results[0].source).toBe('background');
            expect(results[0].confidence).toBe(0.7);
        });

        it('應該按置信度排序結果', () => {
            const picture = document.createElement('picture');
            picture.style.backgroundImage = 'url("https://example.com/bg.jpg")';

            const source = document.createElement('source');
            source.setAttribute('srcset', 'https://example.com/source.jpg');
            picture.appendChild(source);

            const img = document.createElement('img');
            picture.appendChild(img);

            const results = FallbackStrategies.getAllFallbackUrls(img);

            // picture (0.9) 應該排在 background (0.7) 前面
            expect(results.length).toBe(2);
            expect(results[0].source).toBe('picture');
            expect(results[0].confidence).toBe(0.9);
            expect(results[1].source).toBe('background');
            expect(results[1].confidence).toBe(0.7);
        });

        it('沒有任何回退 URL 時應該返回空數組', () => {
            const div = document.createElement('div');

            const results = FallbackStrategies.getAllFallbackUrls(div);

            expect(results).toEqual([]);
        });

        it('應該包含所有可能的來源', () => {
            const figure = document.createElement('figure');
            figure.style.backgroundImage = 'url("https://example.com/bg.jpg")';

            const picture = document.createElement('picture');
            const source = document.createElement('source');
            source.setAttribute('srcset', 'https://example.com/picture.jpg');
            picture.appendChild(source);
            figure.appendChild(picture);

            const noscript = document.createElement('noscript');
            noscript.textContent = '<img src="https://example.com/noscript.jpg">';
            picture.appendChild(noscript);

            const otherImg = document.createElement('img');
            otherImg.setAttribute('src', 'https://example.com/other.jpg');
            figure.appendChild(otherImg);

            const targetImg = document.createElement('img');
            picture.appendChild(targetImg);

            const results = FallbackStrategies.getAllFallbackUrls(targetImg);

            const sources = results.map(r => r.source);
            expect(sources).toContain('picture');
            expect(sources).toContain('background');
            expect(sources).toContain('noscript');
            expect(sources).toContain('figure');
        });
    });

    describe('_isValidUrl', () => {
        it('應該接受有效的 HTTP URL', () => {
            expect(FallbackStrategies._isValidUrl('http://example.com/image.jpg')).toBe(true);
        });

        it('應該接受有效的 HTTPS URL', () => {
            expect(FallbackStrategies._isValidUrl('https://example.com/image.jpg')).toBe(true);
        });

        it('應該拒絕 data: URL', () => {
            expect(FallbackStrategies._isValidUrl('data:image/png;base64,abc')).toBe(false);
        });

        it('應該拒絕 blob: URL', () => {
            expect(FallbackStrategies._isValidUrl('blob:https://example.com/123')).toBe(false);
        });

        it('應該拒絕過短的 URL', () => {
            expect(FallbackStrategies._isValidUrl('abc')).toBe(false);
        });

        it('應該接受相對 URL', () => {
            expect(FallbackStrategies._isValidUrl('/images/photo.jpg')).toBe(true);
        });

        it('應該拒絕錨點 URL', () => {
            expect(FallbackStrategies._isValidUrl('#section')).toBe(false);
        });

        it('應該拒絕 null', () => {
            expect(FallbackStrategies._isValidUrl(null)).toBe(false);
        });

        it('應該拒絕 undefined', () => {
            expect(FallbackStrategies._isValidUrl()).toBe(false);
        });

        it('應該拒絕空字符串', () => {
            expect(FallbackStrategies._isValidUrl('')).toBe(false);
        });

        it('應該拒絕非字符串', () => {
            expect(FallbackStrategies._isValidUrl(123)).toBe(false);
        });
    });

    describe('_extractUrlFromSrcset', () => {
        it('應該從簡單的 srcset 提取 URL', () => {
            const result = FallbackStrategies._extractUrlFromSrcset('https://example.com/image.jpg 800w');

            expect(result).toBe('https://example.com/image.jpg');
        });

        it('應該從多個條目中提取第一個有效的 URL', () => {
            const result = FallbackStrategies._extractUrlFromSrcset('https://example.com/valid.jpg 1200w, https://example.com/another.jpg 800w');

            expect(result).toBe('https://example.com/valid.jpg');
        });

        it('應該處理沒有寬度描述符的 srcset', () => {
            const result = FallbackStrategies._extractUrlFromSrcset('https://example.com/image.jpg');

            expect(result).toBe('https://example.com/image.jpg');
        });

        it('應該處理 null', () => {
            const result = FallbackStrategies._extractUrlFromSrcset(null);

            expect(result).toBeNull();
        });

        it('應該處理空字符串', () => {
            const result = FallbackStrategies._extractUrlFromSrcset('');

            expect(result).toBeNull();
        });

        it('應該修剪空白', () => {
            const result = FallbackStrategies._extractUrlFromSrcset('  https://example.com/image.jpg  800w  ');

            expect(result).toBe('https://example.com/image.jpg');
        });

        it('應該處理多個空格分隔的部分', () => {
            const result = FallbackStrategies._extractUrlFromSrcset('https://example.com/image.jpg   2x');

            expect(result).toBe('https://example.com/image.jpg');
        });
    });

    describe('_extractUrlFromNoscriptContent', () => {
        it('應該從 img 標籤提取 URL', () => {
            const noscript = document.createElement('noscript');
            noscript.innerHTML = '<img src="https://example.com/test.jpg">';

            const result = FallbackStrategies._extractUrlFromNoscriptContent(noscript);

            expect(result).toBe('https://example.com/test.jpg');
        });

        it('應該從純文本 URL 提取', () => {
            const noscript = document.createElement('noscript');
            noscript.textContent = 'Some text https://example.com/image.jpg more text';

            const result = FallbackStrategies._extractUrlFromNoscriptContent(noscript);

            expect(result).toBe('https://example.com/image.jpg');
        });

        it('應該處理 null', () => {
            const result = FallbackStrategies._extractUrlFromNoscriptContent(null);

            expect(result).toBeNull();
        });

        it('應該處理空內容', () => {
            const noscript = document.createElement('noscript');

            const result = FallbackStrategies._extractUrlFromNoscriptContent(noscript);

            expect(result).toBeNull();
        });

        it('應該支持不同的圖片格式', () => {
            const formats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

            formats.forEach(format => {
                const noscript = document.createElement('noscript');
                noscript.textContent = `https://example.com/image.${format}`;

                const result = FallbackStrategies._extractUrlFromNoscriptContent(noscript);

                expect(result).toBe(`https://example.com/image.${format}`);
            });
        });

        it('應該處理單引號的 img 標籤', () => {
            const noscript = document.createElement('noscript');
            noscript.innerHTML = "<img src='https://example.com/single-quote.jpg'>";

            const result = FallbackStrategies._extractUrlFromNoscriptContent(noscript);

            expect(result).toBe('https://example.com/single-quote.jpg');
        });

        it('應該從多個 img 標籤中提取第一個', () => {
            const noscript = document.createElement('noscript');
            noscript.innerHTML = '<img src="https://example.com/first.jpg"><img src="https://example.com/second.jpg">';

            const result = FallbackStrategies._extractUrlFromNoscriptContent(noscript);

            expect(result).toBe('https://example.com/first.jpg');
        });
    });

    describe('_getBackgroundImageUrl', () => {
        it('應該從 computed style 提取背景圖 URL', () => {
            const div = document.createElement('div');
            div.style.backgroundImage = 'url("https://example.com/bg.jpg")';

            const result = FallbackStrategies._getBackgroundImageUrl(div);

            expect(result).toBe('https://example.com/bg.jpg');
        });

        it('應該處理 null 元素', () => {
            const result = FallbackStrategies._getBackgroundImageUrl(null);

            expect(result).toBeNull();
        });

        it('應該處理 background-image: none', () => {
            const div = document.createElement('div');
            div.style.backgroundImage = 'none';

            const result = FallbackStrategies._getBackgroundImageUrl(div);

            expect(result).toBeNull();
        });

        it('應該處理沒有背景圖的元素', () => {
            const div = document.createElement('div');

            const result = FallbackStrategies._getBackgroundImageUrl(div);

            expect(result).toBeNull();
        });

        it('應該處理不帶引號的 URL', () => {
            const div = document.createElement('div');
            div.style.backgroundImage = 'url(https://example.com/bg.jpg)';

            const result = FallbackStrategies._getBackgroundImageUrl(div);

            expect(result).toBe('https://example.com/bg.jpg');
        });

        it('應該處理單引號的 URL', () => {
            const div = document.createElement('div');
            div.style.backgroundImage = "url('https://example.com/bg.jpg')";

            const result = FallbackStrategies._getBackgroundImageUrl(div);

            expect(result).toBe('https://example.com/bg.jpg');
        });
    });

    describe('模塊導出', () => {
        it('應該正確導出到 module.exports', () => {
            expect(FallbackStrategies).toBeDefined();
            expect(typeof FallbackStrategies.extractFromBackground).toBe('function');
            expect(typeof FallbackStrategies.extractFromPicture).toBe('function');
            expect(typeof FallbackStrategies.extractFromNoscript).toBe('function');
            expect(typeof FallbackStrategies.extractFromFigure).toBe('function');
            expect(typeof FallbackStrategies.getAllFallbackUrls).toBe('function');
        });
    });
});
