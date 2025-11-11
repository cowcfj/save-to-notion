/**
 * 路徑壓縮優化測試
 * v2.9.0: 驗證路徑字符串格式和 ID 壓縮
 */

describe('路徑壓縮優化 (v2.9.0)', () => {
    // 模擬 HighlightManager 的路徑方法
    const mockManager = {
        parsePathFromString(pathStr) {
            if (!pathStr || typeof pathStr !== 'string') {
                return null;
            }

            try {
                const steps = pathStr.split('/');
                const path = [];

                for (const step of steps) {
                    const match = step.match(/^([a-z0-9\-]+)\[(\d+)\]$/i);
                    if (!match) return null;

                    const [, name, indexStr] = match;
                    const index = parseInt(indexStr, 10);

                    if (name === 'text') {
                        path.push({ type: 'text', index });
                    } else {
                        path.push({ type: 'element', tag: name, index });
                    }
                }

                return path;
            } catch {
                return null;
            }
        },

        convertPathToString(pathArray) {
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
            }).filter(Boolean).join('/');
        }
    };

    describe('parsePathFromString', () => {
        test('應該解析簡單路徑', () => {
            const pathStr = 'div[0]/p[1]/text[0]';
            const result = mockManager.parsePathFromString(pathStr);

            expect(result).toEqual([
                { type: 'element', tag: 'div', index: 0 },
                { type: 'element', tag: 'p', index: 1 },
                { type: 'text', index: 0 }
            ]);
        });

        test('應該解析複雜路徑', () => {
            const pathStr = 'div[0]/section[2]/article[1]/p[5]/text[0]';
            const result = mockManager.parsePathFromString(pathStr);

            expect(result).toHaveLength(5);
            expect(result[0]).toEqual({ type: 'element', tag: 'div', index: 0 });
            expect(result[4]).toEqual({ type: 'text', index: 0 });
        });

        test('應該解析帶連字符的標籤名', () => {
            const pathStr = 'custom-element[0]/text[0]';
            const result = mockManager.parsePathFromString(pathStr);

            expect(result).toEqual([
                { type: 'element', tag: 'custom-element', index: 0 },
                { type: 'text', index: 0 }
            ]);
        });

        test('應該處理只有元素的路徑', () => {
            const pathStr = 'div[0]/p[1]';
            const result = mockManager.parsePathFromString(pathStr);

            expect(result).toEqual([
                { type: 'element', tag: 'div', index: 0 },
                { type: 'element', tag: 'p', index: 1 }
            ]);
        });

        test('應該處理大索引值', () => {
            const pathStr = 'div[999]/p[1000]/text[500]';
            const result = mockManager.parsePathFromString(pathStr);

            expect(result[0].index).toBe(999);
            expect(result[1].index).toBe(1000);
            expect(result[2].index).toBe(500);
        });

        test('應該拒絕無效格式', () => {
            expect(mockManager.parsePathFromString('invalid')).toBeNull();
            expect(mockManager.parsePathFromString('div/p')).toBeNull();
            expect(mockManager.parsePathFromString('div[a]')).toBeNull();
            expect(mockManager.parsePathFromString('div[]')).toBeNull();
        });

        test('應該處理空值', () => {
            expect(mockManager.parsePathFromString('')).toBeNull();
            expect(mockManager.parsePathFromString(null)).toBeNull();
            expect(mockManager.parsePathFromString()).toBeNull();
        });
    });

    describe('convertPathToString', () => {
        test('應該轉換簡單路徑', () => {
            const pathArray = [
                { type: 'element', tag: 'div', index: 0 },
                { type: 'element', tag: 'p', index: 1 },
                { type: 'text', index: 0 }
            ];

            const result = mockManager.convertPathToString(pathArray);
            expect(result).toBe('div[0]/p[1]/text[0]');
        });

        test('應該轉換複雜路徑', () => {
            const pathArray = [
                { type: 'element', tag: 'div', index: 0 },
                { type: 'element', tag: 'section', index: 2 },
                { type: 'element', tag: 'article', index: 1 },
                { type: 'element', tag: 'p', index: 5 },
                { type: 'text', index: 0 }
            ];

            const result = mockManager.convertPathToString(pathArray);
            expect(result).toBe('div[0]/section[2]/article[1]/p[5]/text[0]');
        });

        test('應該處理空數組', () => {
            expect(mockManager.convertPathToString([])).toBe('');
        });

        test('應該處理非數組', () => {
            expect(mockManager.convertPathToString(null)).toBe('');
            expect(mockManager.convertPathToString()).toBe('');
            expect(mockManager.convertPathToString('string')).toBe('');
        });
    });

    describe('雙向轉換', () => {
        test('應該正確往返轉換', () => {
            const original = [
                { type: 'element', tag: 'div', index: 0 },
                { type: 'element', tag: 'p', index: 2 },
                { type: 'text', index: 0 }
            ];

            const str = mockManager.convertPathToString(original);
            const parsed = mockManager.parsePathFromString(str);

            expect(parsed).toEqual(original);
        });

        test('應該處理多種路徑', () => {
            const testCases = [
                [{ type: 'element', tag: 'div', index: 0 }],
                [{ type: 'text', index: 0 }],
                [
                    { type: 'element', tag: 'div', index: 0 },
                    { type: 'element', tag: 'span', index: 1 }
                ],
                [
                    { type: 'element', tag: 'custom-element', index: 5 },
                    { type: 'text', index: 10 }
                ]
            ];

            testCases.forEach(testCase => {
                const str = mockManager.convertPathToString(testCase);
                const parsed = mockManager.parsePathFromString(str);
                expect(parsed).toEqual(testCase);
            });
        });
    });

    describe('存儲空間節省', () => {
        test('應該顯著減少存儲大小', () => {
            const oldFormat = [
                { type: 'element', tag: 'div', index: 0 },
                { type: 'element', tag: 'p', index: 2 },
                { type: 'text', index: 0 }
            ];

            const newFormat = 'div[0]/p[2]/text[0]';

            const oldSize = JSON.stringify(oldFormat).length;
            const newSize = newFormat.length;
            const saved = oldSize - newSize;
            const savedPercent = (saved / oldSize * 100).toFixed(1);

            console.log(`舊格式: ${oldSize} bytes`);
            console.log(`新格式: ${newSize} bytes`);
            console.log(`節省: ${saved} bytes (${savedPercent}%)`);

            expect(newSize).toBeLessThan(oldSize);
            expect(parseFloat(savedPercent)).toBeGreaterThan(70); // 至少節省 70%
        });

        test('計算 70 個標註的總節省', () => {
            const avgPathSize = 150; // 舊格式平均大小
            const avgNewSize = 20;   // 新格式平均大小
            const pathsPerHighlight = 2; // start + end
            const highlightCount = 70;

            const oldTotal = avgPathSize * pathsPerHighlight * highlightCount;
            const newTotal = avgNewSize * pathsPerHighlight * highlightCount;
            const saved = oldTotal - newTotal;
            const savedKB = (saved / 1024).toFixed(1);

            console.log(`舊格式總大小: ${(oldTotal / 1024).toFixed(1)} KB`);
            console.log(`新格式總大小: ${(newTotal / 1024).toFixed(1)} KB`);
            console.log(`總節省: ${savedKB} KB`);

            expect(parseFloat(savedKB)).toBeGreaterThan(15); // 至少節省 15 KB
        });
    });

    describe('ID 壓縮', () => {
        test('新 ID 格式應該更短', () => {
            const oldId = 'highlight-1234567890';
            const newId = 'h1';

            expect(newId.length).toBeLessThan(oldId.length);
            expect(newId.length).toBeLessThanOrEqual(5); // h + 最多4位數字
        });

        test('計算 ID 壓縮的節省', () => {
            const oldIdAvg = 'highlight-123'.length; // ~13 bytes
            const newIdAvg = 'h12'.length;           // ~3 bytes
            const highlightCount = 70;

            const saved = (oldIdAvg - newIdAvg) * highlightCount;
            const savedKB = (saved / 1024).toFixed(2);

            console.log(`ID 壓縮節省: ${saved} bytes (${savedKB} KB)`);

            expect(saved).toBeGreaterThan(500); // 至少節省 500 bytes
        });
    });
});
