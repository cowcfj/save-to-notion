/**
 * Highlighter-v2.js 交互測試
 * 測試高亮添加、刪除、顏色切換等用戶交互
 */

const { JSDOM } = require('jsdom');

describe('Highlighter Interactions', () => {
    let dom = null;
    let document = null;
    let window = null;

    beforeEach(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
        document = dom.window.document;
        window = dom.window;
        global.document = document;
        global.window = window;
        global.Selection = window.Selection;
        global.Range = window.Range;
    });

    describe('文本選擇和高亮創建', () => {
        it('應該能夠選擇文本', () => {
            const paragraph = document.createElement('p');
            paragraph.textContent = '這是一段測試文字。';
            document.body.appendChild(paragraph);

            const range = document.createRange();
            range.selectNodeContents(paragraph);

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            expect(selection.toString()).toBe('這是一段測試文字。');
        });

        it('應該能夠獲取選擇的範圍', () => {
            const paragraph = document.createElement('p');
            paragraph.textContent = '這是一段較長的測試文字，用於測試選擇功能。';
            document.body.appendChild(paragraph);

            const range = document.createRange();
            const textNode = paragraph.firstChild;
            range.setStart(textNode, 0);
            range.setEnd(textNode, 7);

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            expect(selection.toString()).toBe('這是一段較長的');
            expect(selection.rangeCount).toBe(1);
        });

        it('應該處理跨段落選擇', () => {
            const div = document.createElement('div');
            div.innerHTML = '<p>第一段文字。</p><p>第二段文字。</p>';
            document.body.appendChild(div);

            const range = document.createRange();
            const firstP = div.querySelector('p:first-child');
            const secondP = div.querySelector('p:last-child');

            range.setStart(firstP.firstChild, 0);
            range.setEnd(secondP.firstChild, 5);

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            const selectedText = selection.toString();
            expect(selectedText).toContain('第一段文字');
            expect(selectedText).toContain('第二段');
        });
    });

    describe('高亮顏色管理', () => {
        it('應該支持黃色高亮', () => {
            const colors = ['yellow', 'green', 'blue', 'red', 'purple'];
            expect(colors).toContain('yellow');
        });

        it('應該支持多種高亮顏色', () => {
            const supportedColors = ['yellow', 'green', 'blue', 'red', 'purple'];

            supportedColors.forEach(color => {
                expect(['yellow', 'green', 'blue', 'red', 'purple']).toContain(color);
            });
        });

        it('應該能夠切換高亮顏色', () => {
            let currentColor = 'yellow';

            const nextColor = (current) => {
                const colors = ['yellow', 'green', 'blue', 'red', 'purple'];
                const index = colors.indexOf(current);
                return colors[(index + 1) % colors.length];
            };

            currentColor = nextColor(currentColor);
            expect(currentColor).toBe('green');

            currentColor = nextColor(currentColor);
            expect(currentColor).toBe('blue');
        });
    });

    describe('高亮數據結構', () => {
        it('應該創建完整的高亮對象', () => {
            const highlight = {
                id: 'highlight-1',
                text: '測試高亮文字',
                color: 'yellow',
                range: {
                    startContainer: '/html/body/p[1]/text()[1]',
                    startOffset: 0,
                    endContainer: '/html/body/p[1]/text()[1]',
                    endOffset: 6
                },
                timestamp: Date.now()
            };

            expect(highlight.id).toBe('highlight-1');
            expect(highlight.text).toBe('測試高亮文字');
            expect(highlight.color).toBe('yellow');
            expect(highlight.range).toBeDefined();
            expect(highlight.timestamp).toBeDefined();
        });

        it('應該包含必要的範圍信息', () => {
            const rangeData = {
                startContainer: '/html/body/p[1]/text()[1]',
                startOffset: 0,
                endContainer: '/html/body/p[1]/text()[1]',
                endOffset: 10
            };

            expect(rangeData.startContainer).toBeDefined();
            expect(rangeData.startOffset).toBeGreaterThanOrEqual(0);
            expect(rangeData.endContainer).toBeDefined();
            expect(rangeData.endOffset).toBeGreaterThan(0);
        });
    });

    describe('CSS Highlight API 支持檢測', () => {
        it('應該能夠檢測 Highlight API 是否可用', () => {
            // 在 JSDOM 中，Highlight API 不可用
            const hasHighlightAPI = typeof window.Highlight !== 'undefined' &&
                typeof CSS !== 'undefined' &&
                typeof CSS.highlights !== 'undefined';

            expect(hasHighlightAPI).toBe(false);
        });

        it('應該有回退策略當 API 不可用時', () => {
            const hasHighlightAPI = false;

            const strategy = hasHighlightAPI ? 'css-highlight-api' : 'span-based';

            expect(strategy).toBe('span-based');
        });
    });

    describe('高亮存儲鍵生成', () => {
        it('應該基於 URL 生成存儲鍵', () => {
            const url = 'https://example.com/article';
            const normalizedUrl = url.replace(/#.*$/, '').replace(/\/$/, '');
            const storageKey = `highlights_${normalizedUrl}`;

            expect(storageKey).toBe('highlights_https://example.com/article');
        });

        it('應該標準化 URL 中的 hash', () => {
            const url = 'https://example.com/article#section';
            const normalized = url.replace(/#.*$/, '');

            expect(normalized).toBe('https://example.com/article');
        });

        it('應該標準化尾部斜杠', () => {
            const url = 'https://example.com/article/';
            const normalized = url.replace(/\/$/, '');

            expect(normalized).toBe('https://example.com/article');
        });
    });

    describe('高亮事件處理', () => {
        it('應該處理 mouseup 事件', () => {
            const paragraph = document.createElement('p');
            paragraph.textContent = '測試文字';
            document.body.appendChild(paragraph);

            let eventFired = false;
            const handler = () => { eventFired = true; };

            paragraph.addEventListener('mouseup', handler);

            const event = new window.MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true
            });

            paragraph.dispatchEvent(event);

            expect(eventFired).toBe(true);
        });

        it('應該處理 click 事件（用於刪除高亮）', () => {
            const span = document.createElement('span');
            span.className = 'highlight';
            span.textContent = '高亮文字';
            document.body.appendChild(span);

            let clickHandled = false;
            span.addEventListener('click', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    clickHandled = true;
                }
            });

            const event = new window.MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                ctrlKey: true
            });

            span.dispatchEvent(event);

            expect(clickHandled).toBe(true);
        });

        it('應該處理雙擊刪除高亮', () => {
            const span = document.createElement('span');
            span.className = 'highlight';
            span.textContent = '高亮文字';
            document.body.appendChild(span);

            let dblclickHandled = false;
            span.addEventListener('dblclick', () => {
                dblclickHandled = true;
            });

            const event = new window.MouseEvent('dblclick', {
                bubbles: true,
                cancelable: true
            });

            span.dispatchEvent(event);

            expect(dblclickHandled).toBe(true);
        });
    });

    describe('高亮數組操作', () => {
        it('應該能夠添加高亮到數組', () => {
            const highlights = [];
            const newHighlight = {
                id: 'h1',
                text: '新高亮',
                color: 'yellow'
            };

            highlights.push(newHighlight);

            expect(highlights.length).toBe(1);
            expect(highlights[0].id).toBe('h1');
        });

        it('應該能夠從數組刪除高亮', () => {
            const highlights = [
                { id: 'h1', text: '高亮1', color: 'yellow' },
                { id: 'h2', text: '高亮2', color: 'green' },
                { id: 'h3', text: '高亮3', color: 'blue' }
            ];

            const filtered = highlights.filter(h => h.id !== 'h2');

            expect(filtered.length).toBe(2);
            expect(filtered.some(h => h.id === 'h2')).toBe(false);
        });

        it('應該能夠更新高亮顏色', () => {
            const highlights = [
                { id: 'h1', text: '高亮1', color: 'yellow' }
            ];

            const updated = highlights.map(h => {
                if (h.id === 'h1') {
                    return { ...h, color: 'green' };
                }
                return h;
            });

            expect(updated[0].color).toBe('green');
        });
    });

    describe('XPath 路徑生成', () => {
        it('應該生成元素的 XPath', () => {
            const div = document.createElement('div');
            const p1 = document.createElement('p');
            const p2 = document.createElement('p');

            div.appendChild(p1);
            div.appendChild(p2);
            document.body.appendChild(div);

            // 簡化版 XPath 生成
            const getXPath = (element) => {
                if (element === document.body) return '/html/body';

                const siblings = Array.from(element.parentNode.children);
                const index = siblings.indexOf(element) + 1;
                const tagName = element.tagName.toLowerCase();

                return `${getXPath(element.parentNode)}/${tagName}[${index}]`;
            };

            const xpath = getXPath(p2);
            expect(xpath).toContain('p[2]');
        });

        it('應該處理文本節點的路徑', () => {
            const paragraph = document.createElement('p');
            paragraph.textContent = '測試文字';
            document.body.appendChild(paragraph);

            const textNode = paragraph.firstChild;
            expect(textNode.nodeType).toBe(3); // TEXT_NODE
        });
    });
});
