/**
 * @jest-environment jsdom
 */

const {
    isContentGood,
    findContentCmsFallback,
    MIN_CONTENT_LENGTH,
    MAX_LINK_DENSITY
} = require('../../helpers/content-extraction.testable');

describe('Content Extraction - isContentGood', () => {
    describe('內容質量檢查', () => {
        it('應該接受高質量內容', () => {
            const article = {
                content: '<p>' + 'a'.repeat(300) + '</p>',
                length: 300
            };
            expect(isContentGood(article)).toBe(true);
        });

        it('應該拒絕內容過短', () => {
            const article = {
                content: '<p>短內容</p>',
                length: 10
            };
            expect(isContentGood(article)).toBe(false);
        });

        it('應該拒絕 null 文章', () => {
            expect(isContentGood(null)).toBe(false);
        });

        it('應該拒絕沒有 content 的文章', () => {
            const article = { length: 300 };
            expect(isContentGood(article)).toBe(false);
        });

        it('應該拒絕高連結密度內容', () => {
            // 創建一個連結密度超過 30% 的內容
            const linkText = 'a'.repeat(200);
            const normalText = 'b'.repeat(100);
            const article = {
                content: `<a href="#">${linkText}</a><p>${normalText}</p>`,
                length: 300
            };
            expect(isContentGood(article)).toBe(false);
        });

        it('應該接受低連結密度內容', () => {
            // 創建一個連結密度低於 30% 的內容
            const linkText = 'a'.repeat(50);
            const normalText = 'b'.repeat(250);
            const article = {
                content: `<a href="#">${linkText}</a><p>${normalText}</p>`,
                length: 300
            };
            expect(isContentGood(article)).toBe(true);
        });
    });
});

describe('Content Extraction - findContentCmsFallback', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('Drupal CMS 結構識別', () => {
        it('應該識別 Drupal 結構並組合欄位', () => {
            document.body.innerHTML = `
                <div class="node__content">
                    <div class="field--name-field-image">
                        <img src="test.jpg" alt="Test">
                    </div>
                    <div class="field--name-field-body">
                        <p>${'內容'.repeat(100)}</p>
                    </div>
                </div>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('test.jpg');
            expect(result).toContain('內容');
        });

        it('應該處理沒有圖片的 Drupal 結構', () => {
            document.body.innerHTML = `
                <div class="node__content">
                    <div class="field--name-field-body">
                        <p>${'內容'.repeat(100)}</p>
                    </div>
                </div>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('內容');
            expect(result).not.toContain('<img');
        });

        it('應該在沒有 body 欄位時跳過 Drupal 結構', () => {
            document.body.innerHTML = `
                <div class="node__content">
                    <div class="field--name-field-image">
                        <img src="test.jpg" alt="Test">
                    </div>
                </div>
                <article class="post">
                    <p>${'備用內容'.repeat(100)}</p>
                </article>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('備用內容');
        });
    });

    describe('WordPress CMS 結構識別', () => {
        const wordpressSelectors = [
            '.entry-content',
            '.post-content',
            '.article-content',
            '.content-area',
            '.single-content'
        ];

        wordpressSelectors.forEach(selector => {
            it(`應該識別 ${selector} 選擇器`, () => {
                const className = selector.substring(1); // 移除 '.'
                document.body.innerHTML = `
                    <div class="${className}">
                        <p>${'WordPress 內容'.repeat(100)}</p>
                    </div>
                `;

                const result = findContentCmsFallback();
                expect(result).toContain('WordPress 內容');
            });
        });

        it('應該拒絕內容過短的 WordPress 元素', () => {
            document.body.innerHTML = `
                <div class="entry-content">
                    <p>短</p>
                </div>
                <article class="post">
                    <p>${'長內容'.repeat(100)}</p>
                </article>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('長內容');
            expect(result).not.toContain('短');
        });
    });

    describe('通用文章結構識別', () => {
        const articleSelectors = [
            'article[role="main"]',
            'article.post',
            'article.article',
            '.post-body',
            '.article-body',
            '.entry-body'
        ];

        it('應該識別 article[role="main"]', () => {
            document.body.innerHTML = `
                <article role="main">
                    <p>${'主要內容'.repeat(100)}</p>
                </article>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('主要內容');
        });

        it('應該識別 article.post', () => {
            document.body.innerHTML = `
                <article class="post">
                    <p>${'文章內容'.repeat(100)}</p>
                </article>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('文章內容');
        });

        it('應該識別 .post-body', () => {
            document.body.innerHTML = `
                <div class="post-body">
                    <p>${'正文內容'.repeat(100)}</p>
                </div>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('正文內容');
        });
    });

    describe('通用內容選擇器回退', () => {
        it('應該選擇最大的內容區塊', () => {
            document.body.innerHTML = `
                <div id="small">
                    <p>${'小內容'.repeat(50)}</p>
                </div>
                <div id="large">
                    <p>${'大內容'.repeat(200)}</p>
                </div>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('大內容');
            expect(result).not.toContain('小內容');
        });

        it('應該給段落加分', () => {
            document.body.innerHTML = `
                <div id="no-paragraphs">
                    ${'文字'.repeat(200)}
                </div>
                <div id="with-paragraphs">
                    <p>${'段落'.repeat(50)}</p>
                    <p>${'段落'.repeat(50)}</p>
                    <p>${'段落'.repeat(50)}</p>
                </div>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('段落');
        });

        it('應該給圖片加分', () => {
            document.body.innerHTML = `
                <div id="no-images">
                    <p>${'純文字'.repeat(100)}</p>
                </div>
                <div id="with-images">
                    <img src="1.jpg">
                    <img src="2.jpg">
                    <img src="3.jpg">
                    <p>${'有圖片'.repeat(100)}</p>
                </div>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('有圖片');
            expect(result).toContain('1.jpg');
        });

        it('應該給連結扣分', () => {
            document.body.innerHTML = `
                <div id="many-links">
                    <a href="#">${'連結'.repeat(50)}</a>
                    <a href="#">${'連結'.repeat(50)}</a>
                    <a href="#">${'連結'.repeat(50)}</a>
                    <a href="#">${'連結'.repeat(50)}</a>
                    <a href="#">${'連結'.repeat(50)}</a>
                    <p>${'內容'.repeat(100)}</p>
                </div>
                <div id="few-links">
                    <a href="#">連結</a>
                    <p>${'內容'.repeat(100)}</p>
                </div>
            `;

            const result = findContentCmsFallback();
            // 應該選擇連結較少的元素
            expect(result).not.toContain('many-links');
        });

        it('應該忽略內容過短的元素', () => {
            document.body.innerHTML = `
                <div id="too-short">
                    <p>短</p>
                </div>
                <div id="long-enough">
                    <p>${'足夠長'.repeat(100)}</p>
                </div>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('足夠長');
            expect(result).not.toContain('短');
        });

        it('應該避免選擇嵌套的父元素', () => {
            document.body.innerHTML = `
                <div id="parent">
                    <div id="child">
                        <p>${'子元素內容'.repeat(100)}</p>
                    </div>
                    <p>父元素額外內容</p>
                </div>
            `;

            const result = findContentCmsFallback();
            // 應該選擇子元素而不是父元素
            expect(result).toContain('子元素內容');
        });

        it('應該在找不到任何內容時返回 null', () => {
            document.body.innerHTML = `
                <div><p>短</p></div>
            `;

            const result = findContentCmsFallback();
            expect(result).toBeNull();
        });
    });

    describe('選擇器優先級', () => {
        it('Drupal 結構應該優先於 WordPress', () => {
            document.body.innerHTML = `
                <div class="node__content">
                    <div class="field--name-field-body">
                        <p>${'Drupal 內容'.repeat(100)}</p>
                    </div>
                </div>
                <div class="entry-content">
                    <p>${'WordPress 內容'.repeat(100)}</p>
                </div>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('Drupal 內容');
            expect(result).not.toContain('WordPress 內容');
        });

        it('WordPress 結構應該優先於通用文章', () => {
            document.body.innerHTML = `
                <div class="entry-content">
                    <p>${'WordPress 內容'.repeat(100)}</p>
                </div>
                <article class="post">
                    <p>${'通用文章'.repeat(100)}</p>
                </article>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('WordPress 內容');
            expect(result).not.toContain('通用文章');
        });

        it('通用文章應該優先於通用選擇器', () => {
            document.body.innerHTML = `
                <article class="post">
                    <p>${'文章內容'.repeat(100)}</p>
                </article>
                <div>
                    <p>${'通用內容'.repeat(200)}</p>
                </div>
            `;

            const result = findContentCmsFallback();
            expect(result).toContain('文章內容');
            expect(result).not.toContain('通用內容');
        });
    });
});
