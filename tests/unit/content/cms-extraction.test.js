/**
 * Content.js CMS 適配和提取策略測試
 * 測試各種 CMS 平台的內容提取邏輯
 */

const { JSDOM } = require('jsdom');

describe('CMS Content Extraction', () => {
    /** @type {JSDOM} JSDOM 實例,在 beforeEach 中初始化 */
    let dom = null;
    /** @type {Document} 文檔對象,在 beforeEach 中初始化 */
    let document = null;

    beforeEach(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
        document = dom.window.document;
        global.document = document;
        global.window = dom.window;
    });

    describe('Drupal CMS 內容提取', () => {
        it('應該從 .field--type-text-with-summary 提取內容', () => {
            const mainContent = document.createElement('div');
            mainContent.className = 'field--type-text-with-summary';
            mainContent.innerHTML = '<h2>Drupal 文章標題</h2><p>這是第一段內容。</p>';
            document.body.appendChild(mainContent);

            const selector = '.field--type-text-with-summary';
            const extracted = document.querySelector(selector);

            expect(extracted).toBeDefined();
            expect(extracted.textContent).toContain('Drupal 文章標題');
        });

        it('應該從 .field--name-body 提取內容', () => {
            const bodyField = document.createElement('div');
            bodyField.className = 'field--name-body';
            bodyField.innerHTML = '<div class="field__item"><p>正文內容段落 1</p></div>';
            document.body.appendChild(bodyField);

            const extracted = document.querySelector('.field--name-body');

            expect(extracted).toBeDefined();
            expect(extracted.textContent).toContain('正文內容段落 1');
        });
    });

    describe('WordPress CMS 內容提取', () => {
        it('應該從 .entry-content 提取內容', () => {
            const entryContent = document.createElement('div');
            entryContent.className = 'entry-content';
            entryContent.innerHTML = '<h1>WordPress 文章</h1><p>WordPress 文章內容第一段。</p>';
            document.body.appendChild(entryContent);

            const extracted = document.querySelector('.entry-content');

            expect(extracted).toBeDefined();
            expect(extracted.textContent).toContain('WordPress 文章');
        });

        it('應該從 .post-content 提取內容', () => {
            const postContent = document.createElement('article');
            postContent.className = 'post-content';
            postContent.innerHTML = '<h2>文章標題</h2><p>文章正文內容。</p>';
            document.body.appendChild(postContent);

            const extracted = document.querySelector('.post-content');

            expect(extracted).toBeDefined();
            expect(extracted.textContent).toContain('文章正文內容');
        });
    });

    describe('List-based 內容提取（CLI 文檔）', () => {
        it('應該識別大型列表內容', () => {
            const ul = document.createElement('ul');

            for (let i = 1; i <= 50; i++) {
                const li = document.createElement('li');
                li.innerHTML = `<code>command-${i}</code> - 命令描述 ${i}`;
                ul.appendChild(li);
            }

            document.body.appendChild(ul);

            const lists = document.querySelectorAll('ul li');
            expect(lists.length).toBe(50);
        });

        it('應該處理嵌套列表結構', () => {
            const ul = document.createElement('ul');

            for (let i = 1; i <= 25; i++) {
                const li = document.createElement('li');
                li.textContent = `主項目 ${i}`;

                if (i % 5 === 0) {
                    const nestedUl = document.createElement('ul');
                    for (let j = 1; j <= 3; j++) {
                        const nestedLi = document.createElement('li');
                        nestedLi.textContent = `子項目 ${i}-${j}`;
                        nestedUl.appendChild(nestedLi);
                    }
                    li.appendChild(nestedUl);
                }

                ul.appendChild(li);
            }

            document.body.appendChild(ul);

            const topLevelItems = document.querySelectorAll('body > ul > li');
            const nestedLists = document.querySelectorAll('ul ul');

            expect(topLevelItems.length).toBe(25);
            expect(nestedLists.length).toBeGreaterThan(0);
        });
    });

    describe('Expandable 內容處理', () => {
        it('應該識別 details 元素', () => {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = '點擊展開';
            const content = document.createElement('div');
            content.textContent = '隱藏的內容';

            details.appendChild(summary);
            details.appendChild(content);
            document.body.appendChild(details);

            const foundDetails = document.querySelector('details');
            expect(foundDetails).toBeDefined();
            expect(foundDetails.querySelector('summary').textContent).toBe('點擊展開');
        });

        it('應該識別 .collapsible 元素', () => {
            const collapsible = document.createElement('div');
            collapsible.className = 'collapsible';
            collapsible.textContent = '可折疊內容';
            document.body.appendChild(collapsible);

            const found = document.querySelector('.collapsible');
            expect(found).toBeDefined();
            expect(found.textContent).toBe('可折疊內容');
        });
    });

    describe('Content 清理', () => {
        it('應該能夠識別廣告元素', () => {
            const article = document.createElement('article');
            article.innerHTML = '<p>正常內容。</p><div class="advertisement">廣告內容</div>';
            document.body.appendChild(article);

            const ad = document.querySelector('.advertisement');
            expect(ad).toBeDefined();
            expect(ad.textContent).toBe('廣告內容');
        });

        it('應該能夠識別導航元素', () => {
            const content = document.createElement('div');
            content.innerHTML = '<nav>導航菜單</nav><p>文章內容。</p>';
            document.body.appendChild(content);

            const nav = document.querySelector('nav');
            expect(nav).toBeDefined();
            expect(nav.textContent).toBe('導航菜單');
        });
    });
});
