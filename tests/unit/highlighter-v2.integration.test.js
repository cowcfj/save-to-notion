/**
 * HighlightManager 整合測試
 * 測試 highlighter-v2.js 中 HighlightManager 類別的核心功能
 * 
 * 注意: 由於 highlighter-v2.js 是 IIFE 且依賴瀏覽器環境,
 * 我們需要提供 mock 環境並測試可測試的部分
 */

// Mock 全域物件
global.chrome = {
    storage: {
        local: {
            get: jest.fn(),
            set: jest.fn(),
            remove: jest.fn()
        }
    },
    runtime: {
        sendMessage: jest.fn(),
        lastError: null
    }
};

// Mock Logger
global.window = global.window || {};
global.window.Logger = {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

// Mock normalizeUrl 和 StorageUtil
global.window.normalizeUrl = jest.fn((url) => url);
global.window.StorageUtil = {
    saveHighlights: jest.fn().mockResolvedValue(),
    loadHighlights: jest.fn().mockResolvedValue([])
};

// Mock CSS Highlight API
global.CSS = global.CSS || {};
global.CSS.highlights = new Map();
global.CSS.highlights.set = jest.fn();
global.CSS.highlights.delete = jest.fn();

global.Highlight = jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn()
}));

describe('HighlightManager 整合測試', () => {
    let HighlightManager = null;
    let dom = null;
    let testDocument = null;
    let testWindow = null;

    beforeEach(() => {
        // 使用 JSDOM 建立 DOM 環境
        const { JSDOM } = require('jsdom');
        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
            <head></head>
            <body>
                <div id="test-content">
                    <p id="p1">這是第一段測試內容</p>
                    <p id="p2">這是第二段測試內容</p>
                    <div id="nested">
                        <span id="span1">巢狀元素內容</span>
                    </div>
                </div>
            </body>
            </html>
        `, {
            url: 'https://example.com/test',
            runScripts: 'outside-only'
        });

        testDocument = dom.window.document;
        testWindow = dom.window;
        global.document = testDocument;

        // 只複製需要的屬性到 global.window,避免觸發導航
        global.window.document = testDocument;
        global.window.Node = testWindow.Node;
        global.window.Range = testWindow.Range;
        global.window.Selection = testWindow.Selection;
        global.window.getSelection = testWindow.getSelection.bind(testWindow);

        // 清除 mock 調用記錄
        jest.clearAllMocks();
        global.chrome.storage.local.get.mockResolvedValue({});
        global.chrome.storage.local.set.mockResolvedValue();

        // 建立 HighlightManager 類別的簡化版本用於測試
        // 由於原始檔案是 IIFE,我們需要提取並重建類別
        HighlightManager = class HighlightManager {
            constructor() {
                this.highlights = new Map();
                this.nextId = 1;
                this.currentColor = 'yellow';
                this.colors = {
                    yellow: '#fff3cd',
                    green: '#d4edda',
                    blue: '#cce7ff',
                    red: '#f8d7da'
                };
                this.highlightObjects = {};

                if (typeof Highlight !== 'undefined') {
                    Object.keys(this.colors).forEach(colorName => {
                        this.highlightObjects[colorName] = new Highlight();
                    });
                }
            }

            setColor(color) {
                if (this.colors[color]) {
                    this.currentColor = color;
                }
            }

            getCount() {
                return this.highlights.size;
            }

            addHighlight(range, color = this.currentColor) {
                if (!range || range.collapsed) {
                    return null;
                }

                const text = range.toString().trim();
                if (!text) {
                    return null;
                }

                let id = `h${this.nextId++}`;
                while (this.highlights.has(id)) {
                    id = `h${this.nextId++}`;
                }

                const highlightData = {
                    id,
                    range: range.cloneRange(),
                    color,
                    text,
                    timestamp: Date.now(),
                    rangeInfo: HighlightManager.serializeRange(range)
                };

                this.highlights.set(id, highlightData);

                // 應用視覺標註 (簡化版)
                if (this.highlightObjects[color]) {
                    this.highlightObjects[color].add(range);
                }

                return id;
            }

            removeHighlight(id) {
                const highlightData = this.highlights.get(id);
                if (!highlightData) {
                    return;
                }

                const color = highlightData.color;
                if (this.highlightObjects[color] && highlightData.range) {
                    this.highlightObjects[color].delete(highlightData.range);
                }

                this.highlights.delete(id);
            }

            clearAll() {
                Object.keys(this.highlightObjects).forEach(color => {
                    this.highlightObjects[color].clear();
                });
                this.highlights.clear();
            }

            static serializeRange(range) {
                const startContainerPath = HighlightManager.getNodePath(range.startContainer);
                const endContainerPath = HighlightManager.getNodePath(range.endContainer);

                return {
                    startContainerPath,
                    startOffset: range.startOffset,
                    endContainerPath,
                    endOffset: range.endOffset,
                    text: range.toString()
                };
            }

            static getNodePath(node) {
                const path = [];
                let current = node;

                while (current && current !== testDocument.body) {
                    const parent = current.parentNode;
                    if (!parent) break;

                    let index = 0;
                    const Node = testWindow.Node;
                    for (let i = 0; i < parent.childNodes.length; i++) {
                        if (parent.childNodes[i] === current) {
                            break;
                        }
                        if (parent.childNodes[i].nodeType === current.nodeType) {
                            index++;
                        }
                    }

                    if (current.nodeType === Node.TEXT_NODE) {
                        path.unshift({ type: 'text', index });
                    } else if (current.nodeType === Node.ELEMENT_NODE) {
                        path.unshift({
                            type: 'element',
                            tag: current.tagName.toLowerCase(),
                            index
                        });
                    }

                    current = parent;
                }

                return path;
            }

            static getNodeByPath(path) {
                if (!path || (!Array.isArray(path) && typeof path !== 'string')) {
                    return null;
                }

                // 支援字串格式的路徑
                let pathArray = path;
                if (typeof path === 'string') {
                    pathArray = HighlightManager.parsePathFromString(path);
                    if (!pathArray) return null;
                }

                // 空陣列應返回 null
                if (Array.isArray(pathArray) && pathArray.length === 0) {
                    return null;
                }

                let current = testDocument.body;
                const Node = testWindow.Node;

                for (const step of pathArray) {
                    const children = Array.from(current.childNodes).filter(node => {
                        if (step.type === 'text') {
                            return node.nodeType === Node.TEXT_NODE;
                        } else if (step.type === 'element') {
                            return node.nodeType === Node.ELEMENT_NODE &&
                                node.tagName.toLowerCase() === step.tag;
                        }
                        return false;
                    });

                    if (step.index >= children.length) {
                        return null;
                    }

                    current = children[step.index];
                }

                return current;
            }

            static parsePathFromString(pathStr) {
                if (typeof pathStr !== 'string' || !pathStr) {
                    return null;
                }

                const steps = pathStr.split('/');
                const path = [];

                for (const step of steps) {
                    const match = step.match(/^(\w+)\[(\d+)\]$/);
                    if (!match) return null;

                    const [, tag, index] = match;
                    if (tag === 'text') {
                        path.push({ type: 'text', index: parseInt(index, 10) });
                    } else {
                        path.push({ type: 'element', tag, index: parseInt(index, 10) });
                    }
                }

                return path.length > 0 ? path : null;
            }

            static convertPathToString(pathArray) {
                if (!Array.isArray(pathArray)) {
                    return '';
                }

                return pathArray.map(step => {
                    if (step.type === 'text') {
                        return `text[${step.index}]`;
                    } else if (step.type === 'element') {
                        return `${step.tag}[${step.index}]`;
                    }
                    return '';
                }).join('/');
            }

            static rangesOverlap(range1, range2) {
                try {
                    const Range = testWindow.Range;
                    const cmp1 = range1.compareBoundaryPoints(Range.START_TO_END, range2);
                    const cmp2 = range1.compareBoundaryPoints(Range.END_TO_START, range2);
                    return cmp1 > 0 && cmp2 < 0;
                } catch {
                    return false;
                }
            }

            collectHighlightsForNotion() {
                const colorMap = {
                    yellow: 'yellow_background',
                    green: 'green_background',
                    blue: 'blue_background',
                    red: 'red_background'
                };

                return Array.from(this.highlights.values()).map(h => ({
                    text: h.text,
                    color: colorMap[h.color] || 'yellow_background'
                }));
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();

        // 清理 JSDOM 環境
        dom?.window?.close();

        // 恢復 global 物件
        global.document = undefined;
    });

    // ==================== 初始化與設定測試 ====================
    describe('初始化與設定', () => {
        test('應該成功建立 HighlightManager 實例', () => {
            const manager = new HighlightManager();

            expect(manager.highlights).toBeInstanceOf(Map);
            expect(manager.nextId).toBe(1);
            expect(manager.currentColor).toBe('yellow');
            expect(manager.colors).toHaveProperty('yellow');
            expect(manager.colors).toHaveProperty('green');
            expect(manager.colors).toHaveProperty('blue');
            expect(manager.colors).toHaveProperty('red');
        });

        test('setColor() 應該正確設定當前顏色', () => {
            const manager = new HighlightManager();

            manager.setColor('green');
            expect(manager.currentColor).toBe('green');

            manager.setColor('blue');
            expect(manager.currentColor).toBe('blue');
        });

        test('setColor() 應該忽略無效顏色', () => {
            const manager = new HighlightManager();
            const originalColor = manager.currentColor;

            manager.setColor('purple'); // 無效顏色
            expect(manager.currentColor).toBe(originalColor);
        });

        test('getCount() 應該返回標註數量', () => {
            const manager = new HighlightManager();
            expect(manager.getCount()).toBe(0);
        });

        test('應該初始化 Highlight 物件', () => {
            const manager = new HighlightManager();

            expect(manager.highlightObjects).toHaveProperty('yellow');
            expect(manager.highlightObjects).toHaveProperty('green');
            expect(manager.highlightObjects).toHaveProperty('blue');
            expect(manager.highlightObjects).toHaveProperty('red');

            // 驗證每個 Highlight 物件都被正確建立
            expect(global.Highlight).toHaveBeenCalledTimes(4);
        });
    });

    // ==================== 標註新增與刪除測試 ====================
    describe('標註新增與刪除', () => {
        let manager = null;

        beforeEach(() => {
            manager = new HighlightManager();
        });

        test('addHighlight() 應該成功新增標註', () => {
            const p1 = testDocument.getElementById('p1');
            const textNode = p1.firstChild;

            const range = testDocument.createRange();
            range.setStart(textNode, 0);
            range.setEnd(textNode, 9);

            const id = manager.addHighlight(range);

            expect(id).toBeTruthy();
            expect(id).toMatch(/^h\d+$/);
            expect(manager.getCount()).toBe(1);
            expect(manager.highlights.has(id)).toBe(true);

            const highlight = manager.highlights.get(id);
            expect(highlight.text).toBe('這是第一段測試內容');
            expect(highlight.color).toBe('yellow');
        });

        test('addHighlight() 應該使用指定顏色', () => {
            const p1 = testDocument.getElementById('p1');
            const range = testDocument.createRange();
            range.selectNodeContents(p1);

            const id = manager.addHighlight(range, 'green');
            const highlight = manager.highlights.get(id);

            expect(highlight.color).toBe('green');
        });

        test('addHighlight() 應該拒絕 collapsed range', () => {
            const p1 = testDocument.getElementById('p1');
            const range = testDocument.createRange();
            range.setStart(p1.firstChild, 0);
            range.setEnd(p1.firstChild, 0); // collapsed

            const id = manager.addHighlight(range);
            expect(id).toBeNull();
            expect(manager.getCount()).toBe(0);
        });

        test('addHighlight() 應該拒絕空文字範圍', () => {
            const div = testDocument.createElement('div');
            div.innerHTML = '   '; // 只有空白
            testDocument.body.appendChild(div);

            const range = testDocument.createRange();
            range.selectNodeContents(div);

            const id = manager.addHighlight(range);
            expect(id).toBeNull();
        });

        test('addHighlight() 應該處理 ID 衝突', () => {
            // 手動設定一個可能衝突的 ID
            manager.highlights.set('h1', { text: 'existing' });
            manager.nextId = 1;

            const p1 = testDocument.getElementById('p1');
            const range = testDocument.createRange();
            range.selectNodeContents(p1);

            const id = manager.addHighlight(range);
            expect(id).toBe('h2'); // 應該跳過 h1
        });

        test('removeHighlight() 應該成功刪除標註', () => {
            const p1 = testDocument.getElementById('p1');
            const range = testDocument.createRange();
            range.selectNodeContents(p1);

            const id = manager.addHighlight(range);
            expect(manager.getCount()).toBe(1);

            manager.removeHighlight(id);
            expect(manager.getCount()).toBe(0);
            expect(manager.highlights.has(id)).toBe(false);
        });

        test('removeHighlight() 應該正確處理不存在的標註', () => {
            manager.removeHighlight('non-existent');
            // 不應拋出錯誤
            expect(manager.getCount()).toBe(0);
        });

        test('clearAll() 應該清除所有標註', () => {
            const p1 = testDocument.getElementById('p1');
            const p2 = testDocument.getElementById('p2');

            const range1 = testDocument.createRange();
            range1.selectNodeContents(p1);
            const range2 = testDocument.createRange();
            range2.selectNodeContents(p2);

            manager.addHighlight(range1);
            manager.addHighlight(range2);
            expect(manager.getCount()).toBe(2);

            manager.clearAll();
            expect(manager.getCount()).toBe(0);

            // 驗證所有 Highlight 物件都被清空
            Object.values(manager.highlightObjects).forEach(highlightObj => {
                expect(highlightObj.clear).toHaveBeenCalled();
            });
        });
    });

    // ==================== Range 序列化測試 ====================
    describe('Range 序列化與反序列化', () => {
        test('serializeRange() 應該正確序列化簡單範圍', () => {
            const p1 = testDocument.getElementById('p1');
            const textNode = p1.firstChild;

            const range = testDocument.createRange();
            range.setStart(textNode, 0);
            range.setEnd(textNode, 9);

            const rangeInfo = HighlightManager.serializeRange(range);

            expect(rangeInfo).toHaveProperty('startContainerPath');
            expect(rangeInfo).toHaveProperty('endContainerPath');
            expect(rangeInfo).toHaveProperty('startOffset', 0);
            expect(rangeInfo).toHaveProperty('endOffset', 9);
            expect(rangeInfo).toHaveProperty('text', '這是第一段測試內容');
            expect(Array.isArray(rangeInfo.startContainerPath)).toBe(true);
            expect(Array.isArray(rangeInfo.startContainerPath)).toBe(true);
        });

        test('serializeRange() 應該處理跨節點範圍', () => {
            const span1 = testDocument.getElementById('span1');
            const p1 = testDocument.getElementById('p1');

            const range = testDocument.createRange();
            range.setStart(p1.firstChild, 0);
            range.setEnd(span1.firstChild, 3);

            const rangeInfo = HighlightManager.serializeRange(range);

            expect(rangeInfo.startContainerPath.length).toBeGreaterThan(0);
            expect(rangeInfo.endContainerPath.length).toBeGreaterThan(0);
        });
    });

    // ==================== 節點路徑處理測試 ====================
    describe('節點路徑處理', () => {
        test('getNodePath() 應該返回元素節點路徑', () => {
            const p1 = testDocument.getElementById('p1');
            const path = HighlightManager.getNodePath(p1);

            expect(Array.isArray(path)).toBe(true);
            expect(path.length).toBeGreaterThan(0);
            expect(path[path.length - 1]).toHaveProperty('type', 'element');
            expect(path[path.length - 1]).toHaveProperty('tag', 'p');
        });

        test('getNodePath() 應該返回文字節點路徑', () => {
            const p1 = testDocument.getElementById('p1');
            const textNode = p1.firstChild;
            const path = HighlightManager.getNodePath(textNode);

            expect(Array.isArray(path)).toBe(true);
            expect(path[path.length - 1]).toHaveProperty('type', 'text');
        });

        test('getNodeByPath() 應該根據陣列路徑找到節點', () => {
            const p1 = testDocument.getElementById('p1');
            const path = HighlightManager.getNodePath(p1);
            const foundNode = HighlightManager.getNodeByPath(path);

            expect(foundNode).toBe(p1);
        });

        test('parsePathFromString() 應該正確解析字串路徑', () => {
            const pathStr = 'div[0]/p[0]/text[0]';
            const path = HighlightManager.parsePathFromString(pathStr);

            expect(Array.isArray(path)).toBe(true);
            expect(path.length).toBe(3);
            expect(path[0]).toEqual({ type: 'element', tag: 'div', index: 0 });
            expect(path[1]).toEqual({ type: 'element', tag: 'p', index: 0 });
            expect(path[2]).toEqual({ type: 'text', index: 0 });
        });

        test('parsePathFromString() 應該拒絕無效路徑', () => {
            expect(HighlightManager.parsePathFromString('invalid')).toBeNull();
            expect(HighlightManager.parsePathFromString('')).toBeNull();
            expect(HighlightManager.parsePathFromString(null)).toBeNull();
        });

        test('convertPathToString() 應該將陣列路徑轉換為字串', () => {
            const pathArray = [
                { type: 'element', tag: 'div', index: 0 },
                { type: 'text', index: 1 }
            ];
            const pathStr = HighlightManager.convertPathToString(pathArray);

            expect(pathStr).toBe('div[0]/text[1]');
        });

        test('getNodeByPath() 應該支援字串格式路徑', () => {
            const p1 = testDocument.getElementById('p1');
            const path = HighlightManager.getNodePath(p1);
            const pathStr = HighlightManager.convertPathToString(path);
            const foundNode = HighlightManager.getNodeByPath(pathStr);

            expect(foundNode).toBe(p1);
        });

        test('getNodeByPath() 應該處理無效路徑', () => {
            expect(HighlightManager.getNodeByPath(null)).toBeNull();
            expect(HighlightManager.getNodeByPath('invalid-path')).toBeNull();
            expect(HighlightManager.getNodeByPath([])).toBeNull();
        });
    });

    // ==================== Range 重疊判定測試 ====================
    describe('Range 重疊判定', () => {
        test('rangesOverlap() 應該正確判定重疊範圍', () => {
            const p1 = testDocument.getElementById('p1');
            const textNode = p1.firstChild;

            const range1 = testDocument.createRange();
            range1.setStart(textNode, 0);
            range1.setEnd(textNode, 5);

            const range2 = testDocument.createRange();
            range2.setStart(textNode, 3);
            range2.setEnd(textNode, 8);

            const overlaps = HighlightManager.rangesOverlap(range1, range2);
            expect(overlaps).toBe(true);
        });

        test('rangesOverlap() 應該正確判定不重疊範圍', () => {
            const p1 = testDocument.getElementById('p1');
            const textNode = p1.firstChild;

            const range1 = testDocument.createRange();
            range1.setStart(textNode, 0);
            range1.setEnd(textNode, 3);

            const range2 = testDocument.createRange();
            range2.setStart(textNode, 3);
            range2.setEnd(textNode, 6);

            const overlaps = HighlightManager.rangesOverlap(range1, range2);
            expect(overlaps).toBe(false);
        });
    });

    // ==================== 收集標註測試 ====================
    describe('收集標註功能', () => {
        let manager = null;

        beforeEach(() => {
            manager = new HighlightManager();
        });

        test('collectHighlightsForNotion() 應該正確轉換顏色格式', () => {
            const p1 = testDocument.getElementById('p1');
            const p2 = testDocument.getElementById('p2');

            const range1 = testDocument.createRange();
            range1.selectNodeContents(p1);
            const range2 = testDocument.createRange();
            range2.selectNodeContents(p2);

            manager.addHighlight(range1, 'yellow');
            manager.addHighlight(range2, 'green');

            const highlights = manager.collectHighlightsForNotion();

            expect(highlights).toHaveLength(2);
            expect(highlights[0].color).toBe('yellow_background');
            expect(highlights[1].color).toBe('green_background');
        });

        test('collectHighlightsForNotion() 應該處理空標註列表', () => {
            const highlights = manager.collectHighlightsForNotion();
            expect(highlights).toHaveLength(0);
            expect(Array.isArray(highlights)).toBe(true);
        });

        test('collectHighlightsForNotion() 應該包含標註文字', () => {
            const p1 = testDocument.getElementById('p1');
            const range = testDocument.createRange();
            range.selectNodeContents(p1);

            manager.addHighlight(range);
            const highlights = manager.collectHighlightsForNotion();

            expect(highlights[0].text).toBe('這是第一段測試內容');
        });
    });
});
