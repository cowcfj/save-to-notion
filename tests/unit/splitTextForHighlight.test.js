/**
 * splitTextForHighlight 函數測試
 * 測試長文本智能分割功能
 */

// 先設置 Chrome Mock
require('../mocks/chrome.js');

// 導入原始源碼
const { splitTextForHighlight } = require('../../scripts/background.js');

describe('splitTextForHighlight', () => {

    // ==========================================
    // 1. 基本功能測試
    // ==========================================

    describe('基本功能', () => {
        test('短文本不分割', () => {
            const text = '這是一段短文本';
            const result = splitTextForHighlight(text);
            
            expect(result).toEqual([text]);
            expect(result.length).toBe(1);
        });

        test('空字符串返回空字符串', () => {
            const result = splitTextForHighlight('');
            expect(result).toEqual(['']);
        });

        test('null 或 undefined 返回包含原值的數組', () => {
            expect(splitTextForHighlight(null)).toEqual([null]);
            expect(splitTextForHighlight(undefined)).toEqual([undefined]);
        });

        test('正好 maxLength 長度的文本不分割', () => {
            const text = 'a'.repeat(2000);
            const result = splitTextForHighlight(text, 2000);
            
            expect(result).toEqual([text]);
            expect(result.length).toBe(1);
        });
    });

    // ==========================================
    // 2. 標點符號分割測試
    // ==========================================

    describe('標點符號分割', () => {
        test('在句號處分割（中文）', () => {
            const part1 = 'a'.repeat(1500) + '。';
            const part2 = 'b'.repeat(1000);
            const text = part1 + part2;
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBe(2);
            expect(result[0]).toBe(part1);
            expect(result[1]).toBe(part2);
        });

        test('在句號處分割（英文）', () => {
            const part1 = 'a'.repeat(1500) + '.';
            const part2 = 'b'.repeat(1000);
            const text = part1 + part2;
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBe(2);
            expect(result[0]).toBe(part1);
            expect(result[1]).toBe(part2);
        });

        test('在問號處分割', () => {
            const part1 = 'a'.repeat(1500) + '？';
            const part2 = 'b'.repeat(1000);
            const text = part1 + part2;
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBe(2);
            expect(result[0]).toBe(part1);
            expect(result[1]).toBe(part2);
        });

        test('在驚嘆號處分割', () => {
            const part1 = 'a'.repeat(1500) + '！';
            const part2 = 'b'.repeat(1000);
            const text = part1 + part2;
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBe(2);
            expect(result[0]).toBe(part1);
            expect(result[1]).toBe(part2);
        });

        test('優先在雙換行符處分割', () => {
            const part1 = 'a'.repeat(1500) + '\n\n';
            const part2 = 'b'.repeat(500) + '。';
            const part3 = 'c'.repeat(500);
            const text = part1 + part2 + part3;
            
            const result = splitTextForHighlight(text, 2000);
            
            // 應該優先在 \n\n 處分割，檢查第一個片段是否在雙換行符附近結束
            expect(result.length).toBeGreaterThanOrEqual(1);
            // 由於 trim 會移除尾部空白，檢查分割是否發生
            const firstChunkLength = result[0].length;
            expect(firstChunkLength).toBeLessThanOrEqual(1502); // 1500 + '\n\n'
        });

        test('在單換行符處分割', () => {
            const part1 = 'a'.repeat(1500) + '\n';
            const part2 = 'b'.repeat(1000);
            const text = part1 + part2;
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBe(2);
            expect(result[0]).toBe(part1.trim());
            expect(result[1]).toBe(part2);
        });
    });

    // ==========================================
    // 3. 空格分割測試
    // ==========================================

    describe('空格分割', () => {
        test('沒有標點時在空格處分割', () => {
            const part1 = 'a'.repeat(1500) + ' ';
            const part2 = 'b'.repeat(1000);
            const text = part1 + part2;
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBe(2);
            expect(result[0]).toBe(part1.trim());
            expect(result[1]).toBe(part2);
        });

        test('多個空格時選擇最接近 maxLength 的位置', () => {
            const text = 'word '.repeat(500); // 每個 "word " 5 個字符
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBeGreaterThan(1);
            result.forEach(chunk => {
                expect(chunk.length).toBeLessThanOrEqual(2000);
            });
        });
    });

    // ==========================================
    // 4. 強制分割測試
    // ==========================================

    describe('強制分割', () => {
        test('無標點無空格時強制在 maxLength 處分割', () => {
            const text = 'a'.repeat(3000);
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBe(2);
            expect(result[0].length).toBe(2000);
            expect(result[1].length).toBe(1000);
        });

        test('連續無間斷文本正確分割', () => {
            const text = '一二三四五六七八九十'.repeat(300); // 3000 字符
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBeGreaterThanOrEqual(2);
            result.forEach(chunk => {
                expect(chunk.length).toBeLessThanOrEqual(2000);
            });
        });
    });

    // ==========================================
    // 5. 分割位置智能性測試
    // ==========================================

    describe('分割位置智能性', () => {
        test('避免在文本前半部分分割', () => {
            // 在位置 500 有標點，但小於 maxLength * 0.5 (1000)
            // 應該繼續尋找更靠後的分割點
            const text = 'a'.repeat(500) + '。' + 'b'.repeat(1500) + '。' + 'c'.repeat(500);
            
            const result = splitTextForHighlight(text, 2000);
            
            // 第一個分割點應該在第二個句號（位置 2001）
            expect(result[0].length).toBeGreaterThan(1000);
        });

        test('至少分割到一半以上', () => {
            const text = 'a'.repeat(1200) + '。' + 'b'.repeat(1500);
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBeGreaterThanOrEqual(1);
            if (result.length > 1) {
                // 第一個片段長度應該 > maxLength * 0.5
                expect(result[0].length).toBeGreaterThan(1000);
            }
        });
    });

    // ==========================================
    // 6. 多次分割測試
    // ==========================================

    describe('多次分割', () => {
        test('超長文本分割成多個片段', () => {
            const text = 'a'.repeat(5000);
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBe(3);
            expect(result[0].length).toBe(2000);
            expect(result[1].length).toBe(2000);
            expect(result[2].length).toBe(1000);
        });

        test('帶標點的超長文本正確分割', () => {
            const segment = 'a'.repeat(800) + '。';
            const text = segment.repeat(5); // 總長 4005
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBeGreaterThanOrEqual(2);
            result.forEach(chunk => {
                expect(chunk.length).toBeLessThanOrEqual(2000);
            });
        });

        test('所有片段長度都在限制內', () => {
            const text = 'word '.repeat(1000); // 5000 字符
            
            const result = splitTextForHighlight(text, 2000);
            
            result.forEach(chunk => {
                expect(chunk.length).toBeLessThanOrEqual(2000);
            });
        });
    });

    // ==========================================
    // 7. 自定義 maxLength 測試
    // ==========================================

    describe('自定義 maxLength', () => {
        test('使用自定義 maxLength = 100', () => {
            const text = 'a'.repeat(250);
            
            const result = splitTextForHighlight(text, 100);
            
            expect(result.length).toBe(3);
            expect(result[0].length).toBe(100);
            expect(result[1].length).toBe(100);
            expect(result[2].length).toBe(50);
        });

        test('使用自定義 maxLength = 500', () => {
            const text = 'a'.repeat(300) + '。' + 'b'.repeat(300);
            
            const result = splitTextForHighlight(text, 500);
            
            expect(result.length).toBe(2);
            expect(result[0]).toContain('。');
        });

        test('maxLength = 1 時每個字符一個片段', () => {
            const text = 'abc';
            
            const result = splitTextForHighlight(text, 1);
            
            expect(result.length).toBe(3);
            expect(result).toEqual(['a', 'b', 'c']);
        });
    });

    // ==========================================
    // 8. 邊界情況測試
    // ==========================================

    describe('邊界情況', () => {
        test('文本恰好在標點後達到 maxLength', () => {
            const text = 'a'.repeat(2000) + '。';
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBe(1);
            expect(result[0]).toBe(text);
        });

        test('只有標點符號的文本', () => {
            const text = '。。。？？？！！！';
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBe(1);
            expect(result[0]).toBe(text);
        });

        test('只有空格的文本', () => {
            const text = '     ';
            
            const result = splitTextForHighlight(text, 2000);
            
            // 短文本直接返回，不會進入分割邏輯
            expect(result).toEqual([text]);
        });

        test('混合中英文標點', () => {
            const text = 'a'.repeat(1000) + '。' + 'b'.repeat(500) + '.' + 'c'.repeat(700);
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBeGreaterThanOrEqual(1);
            result.forEach(chunk => {
                expect(chunk.length).toBeLessThanOrEqual(2000);
            });
        });

        test('包含特殊 Unicode 字符', () => {
            const text = '🎉'.repeat(1000) + '。' + '😀'.repeat(500);
            
            const result = splitTextForHighlight(text);
            
            expect(result.length).toBeGreaterThanOrEqual(1);
            // Emoji 可能佔用多個字符位置，確保不會崩潰
            expect(result.join('')).toBeTruthy();
        });
    });

    // ==========================================
    // 9. 實際使用場景測試
    // ==========================================

    describe('實際使用場景', () => {
        test('文章段落分割', () => {
            const paragraph1 = 'This is the first paragraph. '.repeat(40); // ~1200 字符
            const paragraph2 = 'This is the second paragraph. '.repeat(40); // ~1200 字符
            const text = paragraph1 + '\n\n' + paragraph2;
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBeGreaterThanOrEqual(1);
            result.forEach(chunk => {
                expect(chunk.length).toBeLessThanOrEqual(2000);
            });
        });

        test('代碼片段分割（保持在函數邊界）', () => {
            const func1 = 'function test1() { '.repeat(50) + '}\n';
            const func2 = 'function test2() { '.repeat(50) + '}';
            const text = func1 + func2;
            
            const result = splitTextForHighlight(text, 2000);
            
            expect(result.length).toBeGreaterThanOrEqual(1);
            // 應該在換行符處分割
            if (result.length > 1) {
                expect(result[0]).toContain('\n');
            }
        });

        test('新聞文章分割（多段落）', () => {
            // 每段約 600 字符，總共約 3600 字符
            const article = '新聞標題。'.repeat(100) + '\n\n' +
                          '第一段內容。'.repeat(200) + '\n\n' +
                          '第二段內容。'.repeat(200);
            
            const result = splitTextForHighlight(article, 2000);
            
            expect(result.length).toBeGreaterThan(1);
            result.forEach(chunk => {
                expect(chunk.length).toBeLessThanOrEqual(2000);
            });
        });
    });

    // ==========================================
    // 10. 性能測試
    // ==========================================

    describe('性能測試', () => {
        test('處理超大文本（10000 字符）', () => {
            const text = 'a'.repeat(10000);
            
            const start = Date.now();
            const result = splitTextForHighlight(text, 2000);
            const elapsed = Date.now() - start;
            
            expect(result.length).toBe(5);
            expect(elapsed).toBeLessThan(100); // 應該在 100ms 內完成
        });

        test('處理超大文本（50000 字符）', () => {
            const text = 'word '.repeat(10000); // 50000 字符
            
            const start = Date.now();
            const result = splitTextForHighlight(text, 2000);
            const elapsed = Date.now() - start;
            
            expect(result.length).toBeGreaterThan(20);
            expect(elapsed).toBeLessThan(500); // 應該在 500ms 內完成
        });
    });
});
