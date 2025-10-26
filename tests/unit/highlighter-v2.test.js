/**
 * highlighter-v2.testable.js 單元測試
 */

const {
    convertBgColorToName,
    validateHighlightData,
    normalizeHighlightData,
    generateHighlightId,
    validateRangeInfo,
    validatePathStep,
    validateNodePath,
    calculateMigrationSuccessRate,
    generateMigrationReport,
    cleanText,
    isTextSimilar,
    isValidHighlightColor,
    formatTimestamp,
    createStorageKey,
    parseStorageKey,
    isMigrationCompletionKey,
    createMigrationCompletionKey,
    filterValidHighlights,
    countHighlightsByColor
} = require('../helpers/highlighter-v2.testable');

describe('highlighter-v2.testable.js', () => {
    
    // ==================== convertBgColorToName ====================
    describe('convertBgColorToName', () => {
        test('應該轉換 hex 格式的黃色', () => {
            expect(convertBgColorToName('#fff3cd')).toBe('yellow');
        });
        
        test('應該轉換 rgb 格式的黃色', () => {
            expect(convertBgColorToName('rgb(255, 243, 205)')).toBe('yellow');
        });
        
        test('應該轉換綠色', () => {
            expect(convertBgColorToName('#d4edda')).toBe('green');
            expect(convertBgColorToName('rgb(212, 237, 218)')).toBe('green');
        });
        
        test('應該轉換藍色', () => {
            expect(convertBgColorToName('#cce7ff')).toBe('blue');
            expect(convertBgColorToName('rgb(204, 231, 255)')).toBe('blue');
        });
        
        test('應該轉換紅色', () => {
            expect(convertBgColorToName('#f8d7da')).toBe('red');
            expect(convertBgColorToName('rgb(248, 215, 218)')).toBe('red');
        });
        
        test('未知顏色應該返回默認黃色', () => {
            expect(convertBgColorToName('#000000')).toBe('yellow');
            expect(convertBgColorToName('rgb(0, 0, 0)')).toBe('yellow');
            expect(convertBgColorToName('purple')).toBe('yellow');
        });
    });
    
    // ==================== validateHighlightData ====================
    describe('validateHighlightData', () => {
        test('有效的標註數據應該通過驗證', () => {
            expect(validateHighlightData({ text: 'test' })).toBe(true);
            expect(validateHighlightData({ content: 'test' })).toBe(true);
        });
        
        test('null 或 undefined 應該失敗', () => {
            expect(validateHighlightData(null)).toBe(false);
            expect(validateHighlightData()).toBe(false);
        });
        
        test('非對象應該失敗', () => {
            expect(validateHighlightData('test')).toBe(false);
            expect(validateHighlightData(123)).toBe(false);
            expect(validateHighlightData([])).toBe(false);
        });
        
        test('缺少 text 和 content 應該失敗', () => {
            expect(validateHighlightData({ color: 'yellow' })).toBe(false);
        });
        
        test('空文本應該失敗', () => {
            expect(validateHighlightData({ text: '' })).toBe(false);
            expect(validateHighlightData({ text: '   ' })).toBe(false);
            expect(validateHighlightData({ content: '' })).toBe(false);
        });
        
        test('text 必須是字符串', () => {
            expect(validateHighlightData({ text: 123 })).toBe(false);
            expect(validateHighlightData({ text: null })).toBe(false);
        });
    });
    
    // ==================== normalizeHighlightData ====================
    describe('normalizeHighlightData', () => {
        test('應該規範化字符串為對象', () => {
            const result = normalizeHighlightData('test text');
            expect(result).toHaveProperty('text', 'test text');
            expect(result).toHaveProperty('color', 'yellow');
            expect(result).toHaveProperty('timestamp');
        });
        
        test('應該保留原有的 text', () => {
            const result = normalizeHighlightData({ text: 'original' });
            expect(result.text).toBe('original');
        });
        
        test('應該使用 content 作為 text 的回退', () => {
            const result = normalizeHighlightData({ content: 'fallback' });
            expect(result.text).toBe('fallback');
        });
        
        test('應該保留原有的 color', () => {
            const result = normalizeHighlightData({ text: 'test', color: 'blue' });
            expect(result.color).toBe('blue');
        });
        
        test('應該轉換 bgColor', () => {
            const result = normalizeHighlightData({ text: 'test', bgColor: '#d4edda' });
            expect(result.color).toBe('green');
        });
        
        test('應該轉換 backgroundColor', () => {
            const result = normalizeHighlightData({ text: 'test', backgroundColor: '#cce7ff' });
            expect(result.color).toBe('blue');
        });
        
        test('應該保留原有的 timestamp', () => {
            const timestamp = 1234567890;
            const result = normalizeHighlightData({ text: 'test', timestamp });
            expect(result.timestamp).toBe(timestamp);
        });
        
        test('缺少 timestamp 應該使用當前時間', () => {
            const before = Date.now();
            const result = normalizeHighlightData({ text: 'test' });
            const after = Date.now();
            expect(result.timestamp).toBeGreaterThanOrEqual(before);
            expect(result.timestamp).toBeLessThanOrEqual(after);
        });
    });
    
    // ==================== generateHighlightId ====================
    describe('generateHighlightId', () => {
        test('應該生成格式正確的 ID', () => {
            expect(generateHighlightId(1)).toBe('highlight-1');
            expect(generateHighlightId(42)).toBe('highlight-42');
            expect(generateHighlightId(999)).toBe('highlight-999');
        });
    });
    
    // ==================== validateRangeInfo ====================
    describe('validateRangeInfo', () => {
        const validRangeInfo = {
            startContainerPath: [{ type: 'element', tag: 'p', index: 0 }],
            startOffset: 0,
            endContainerPath: [{ type: 'element', tag: 'p', index: 0 }],
            endOffset: 5,
            text: 'test'
        };
        
        test('有效的範圍信息應該通過驗證', () => {
            expect(validateRangeInfo(validRangeInfo)).toBe(true);
        });
        
        test('null 或 undefined 應該失敗', () => {
            expect(validateRangeInfo(null)).toBe(false);
            expect(validateRangeInfo()).toBe(false);
        });
        
        test('缺少 startContainerPath 應該失敗', () => {
            const invalid = { ...validRangeInfo };
            delete invalid.startContainerPath;
            expect(validateRangeInfo(invalid)).toBe(false);
        });
        
        test('startContainerPath 不是數組應該失敗', () => {
            const invalid = { ...validRangeInfo, startContainerPath: 'not-array' };
            expect(validateRangeInfo(invalid)).toBe(false);
        });
        
        test('缺少 endContainerPath 應該失敗', () => {
            const invalid = { ...validRangeInfo };
            delete invalid.endContainerPath;
            expect(validateRangeInfo(invalid)).toBe(false);
        });
        
        test('缺少 startOffset 應該失敗', () => {
            const invalid = { ...validRangeInfo };
            delete invalid.startOffset;
            expect(validateRangeInfo(invalid)).toBe(false);
        });
        
        test('startOffset 不是數字應該失敗', () => {
            const invalid = { ...validRangeInfo, startOffset: '0' };
            expect(validateRangeInfo(invalid)).toBe(false);
        });
        
        test('負數偏移量應該失敗', () => {
            const invalid1 = { ...validRangeInfo, startOffset: -1 };
            const invalid2 = { ...validRangeInfo, endOffset: -1 };
            expect(validateRangeInfo(invalid1)).toBe(false);
            expect(validateRangeInfo(invalid2)).toBe(false);
        });
        
        test('缺少 text 應該失敗', () => {
            const invalid = { ...validRangeInfo };
            delete invalid.text;
            expect(validateRangeInfo(invalid)).toBe(false);
        });
        
        test('空 text 應該失敗', () => {
            const invalid = { ...validRangeInfo, text: '' };
            expect(validateRangeInfo(invalid)).toBe(false);
        });
    });
    
    // ==================== validatePathStep ====================
    describe('validatePathStep', () => {
        test('有效的元素步驟應該通過驗證', () => {
            expect(validatePathStep({ type: 'element', tag: 'div', index: 0 })).toBe(true);
        });
        
        test('有效的文本步驟應該通過驗證', () => {
            expect(validatePathStep({ type: 'text', index: 0 })).toBe(true);
        });
        
        test('null 或 undefined 應該失敗', () => {
            expect(validatePathStep(null)).toBe(false);
            expect(validatePathStep()).toBe(false);
        });
        
        test('缺少 type 應該失敗', () => {
            expect(validatePathStep({ index: 0 })).toBe(false);
        });
        
        test('無效的 type 應該失敗', () => {
            expect(validatePathStep({ type: 'invalid', index: 0 })).toBe(false);
        });
        
        test('缺少 index 應該失敗', () => {
            expect(validatePathStep({ type: 'text' })).toBe(false);
        });
        
        test('負數 index 應該失敗', () => {
            expect(validatePathStep({ type: 'text', index: -1 })).toBe(false);
        });
        
        test('元素類型缺少 tag 應該失敗', () => {
            expect(validatePathStep({ type: 'element', index: 0 })).toBe(false);
        });
        
        test('元素類型的 tag 不是字符串應該失敗', () => {
            expect(validatePathStep({ type: 'element', tag: 123, index: 0 })).toBe(false);
        });
    });
    
    // ==================== validateNodePath ====================
    describe('validateNodePath', () => {
        test('有效的路徑應該通過驗證', () => {
            const path = [
                { type: 'element', tag: 'div', index: 0 },
                { type: 'text', index: 0 }
            ];
            expect(validateNodePath(path)).toBe(true);
        });
        
        test('空數組應該失敗', () => {
            expect(validateNodePath([])).toBe(false);
        });
        
        test('非數組應該失敗', () => {
            expect(validateNodePath(null)).toBe(false);
            expect(validateNodePath('not-array')).toBe(false);
        });
        
        test('包含無效步驟應該失敗', () => {
            const path = [
                { type: 'element', tag: 'div', index: 0 },
                { type: 'invalid', index: 0 }
            ];
            expect(validateNodePath(path)).toBe(false);
        });
    });
    
    // ==================== calculateMigrationSuccessRate ====================
    describe('calculateMigrationSuccessRate', () => {
        test('應該計算正確的成功率', () => {
            expect(calculateMigrationSuccessRate(10, 10)).toBe(100);
            expect(calculateMigrationSuccessRate(5, 10)).toBe(50);
            expect(calculateMigrationSuccessRate(3, 10)).toBe(30);
            expect(calculateMigrationSuccessRate(0, 10)).toBe(0);
        });
        
        test('總數為 0 應該返回 0', () => {
            expect(calculateMigrationSuccessRate(0, 0)).toBe(0);
            expect(calculateMigrationSuccessRate(5, 0)).toBe(0);
        });
        
        test('應該四捨五入到整數', () => {
            expect(calculateMigrationSuccessRate(1, 3)).toBe(33); // 33.333...
            expect(calculateMigrationSuccessRate(2, 3)).toBe(67); // 66.666...
        });
    });
    
    // ==================== generateMigrationReport ====================
    describe('generateMigrationReport', () => {
        test('100% 成功應該標記為 complete', () => {
            const report = generateMigrationReport(10, 0, 10);
            expect(report.status).toBe('complete');
            expect(report.successRate).toBe(100);
        });
        
        test('超過 50% 應該標記為 partial', () => {
            const report = generateMigrationReport(6, 4, 10);
            expect(report.status).toBe('partial');
            expect(report.successRate).toBe(60);
        });
        
        test('1-50% 應該標記為 minimal', () => {
            const report = generateMigrationReport(3, 7, 10);
            expect(report.status).toBe('minimal');
            expect(report.successRate).toBe(30);
        });
        
        test('0% 應該標記為 failed', () => {
            const report = generateMigrationReport(0, 10, 10);
            expect(report.status).toBe('failed');
            expect(report.successRate).toBe(0);
        });
        
        test('應該包含所有必要字段', () => {
            const report = generateMigrationReport(5, 5, 10);
            expect(report).toHaveProperty('successCount', 5);
            expect(report).toHaveProperty('failCount', 5);
            expect(report).toHaveProperty('totalCount', 10);
            expect(report).toHaveProperty('successRate', 50);
            expect(report).toHaveProperty('status');
            expect(report).toHaveProperty('timestamp');
        });
        
        test('timestamp 應該是有效的時間戳', () => {
            const before = Date.now();
            const report = generateMigrationReport(5, 5, 10);
            const after = Date.now();
            expect(report.timestamp).toBeGreaterThanOrEqual(before);
            expect(report.timestamp).toBeLessThanOrEqual(after);
        });
    });
    
    // ==================== cleanText ====================
    describe('cleanText', () => {
        test('應該移除首尾空白', () => {
            expect(cleanText('  test  ')).toBe('test');
            expect(cleanText('\n\ntest\n\n')).toBe('test');
            expect(cleanText('\t test \t')).toBe('test');
        });
        
        test('應該壓縮多個空格為一個', () => {
            expect(cleanText('hello    world')).toBe('hello world');
            expect(cleanText('a  b  c')).toBe('a b c');
        });
        
        test('應該處理換行符', () => {
            expect(cleanText('hello\nworld')).toBe('hello world');
            expect(cleanText('hello\n\nworld')).toBe('hello world');
        });
        
        test('應該處理 tab', () => {
            expect(cleanText('hello\tworld')).toBe('hello world');
        });
        
        test('非字符串應該返回空字符串', () => {
            expect(cleanText(null)).toBe('');
            expect(cleanText()).toBe('');
            expect(cleanText(123)).toBe('');
        });
        
        test('空字符串應該返回空字符串', () => {
            expect(cleanText('')).toBe('');
            expect(cleanText('   ')).toBe('');
        });
    });
    
    // ==================== isTextSimilar ====================
    describe('isTextSimilar', () => {
        test('相同文本應該返回 true', () => {
            expect(isTextSimilar('test', 'test')).toBe(true);
        });
        
        test('應該容忍空白字符差異', () => {
            expect(isTextSimilar('  test  ', 'test')).toBe(true);
            expect(isTextSimilar('hello world', 'hello    world')).toBe(true);
            expect(isTextSimilar('hello\nworld', 'hello world')).toBe(true);
        });
        
        test('不同文本應該返回 false', () => {
            expect(isTextSimilar('hello', 'world')).toBe(false);
        });
        
        test('非字符串應該返回 false', () => {
            expect(isTextSimilar(null, 'test')).toBe(false);
            expect(isTextSimilar('test', null)).toBe(false);
            expect(isTextSimilar(123, 'test')).toBe(false);
        });
    });
    
    // ==================== isValidHighlightColor ====================
    describe('isValidHighlightColor', () => {
        test('有效的顏色應該返回 true', () => {
            expect(isValidHighlightColor('yellow')).toBe(true);
            expect(isValidHighlightColor('green')).toBe(true);
            expect(isValidHighlightColor('blue')).toBe(true);
            expect(isValidHighlightColor('red')).toBe(true);
        });
        
        test('無效的顏色應該返回 false', () => {
            expect(isValidHighlightColor('purple')).toBe(false);
            expect(isValidHighlightColor('orange')).toBe(false);
            expect(isValidHighlightColor('#fff3cd')).toBe(false);
        });
    });
    
    // ==================== formatTimestamp ====================
    describe('formatTimestamp', () => {
        test('有效的時間戳應該返回 ISO 格式', () => {
            const timestamp = 1609459200000; // 2021-01-01 00:00:00 UTC
            const result = formatTimestamp(timestamp);
            expect(result).toBe('2021-01-01T00:00:00.000Z');
        });
        
        test('無效的時間戳應該返回 Invalid Date', () => {
            expect(formatTimestamp(-1)).toBe('Invalid Date');
            expect(formatTimestamp(0)).toBe('Invalid Date');
            expect(formatTimestamp('not-a-number')).toBe('Invalid Date');
        });
    });
    
    // ==================== createStorageKey ====================
    describe('createStorageKey', () => {
        test('應該生成正確的存儲鍵名', () => {
            expect(createStorageKey('https://example.com')).toBe('highlights_https://example.com');
        });
        
        test('空字符串應該返回 null', () => {
            expect(createStorageKey('')).toBe(null);
            expect(createStorageKey('   ')).toBe(null);
        });
        
        test('非字符串應該返回 null', () => {
            expect(createStorageKey(null)).toBe(null);
            expect(createStorageKey()).toBe(null);
        });
    });
    
    // ==================== parseStorageKey ====================
    describe('parseStorageKey', () => {
        test('應該解析存儲鍵名', () => {
            expect(parseStorageKey('highlights_https://example.com')).toBe('https://example.com');
        });
        
        test('不以 highlights_ 開頭應該返回 null', () => {
            expect(parseStorageKey('other_key')).toBe(null);
        });
        
        test('非字符串應該返回 null', () => {
            expect(parseStorageKey(null)).toBe(null);
            expect(parseStorageKey(123)).toBe(null);
        });
    });
    
    // ==================== isMigrationCompletionKey ====================
    describe('isMigrationCompletionKey', () => {
        test('遷移完成鍵應該返回 true', () => {
            expect(isMigrationCompletionKey('migration_completed_https://example.com')).toBe(true);
        });
        
        test('非遷移完成鍵應該返回 false', () => {
            expect(isMigrationCompletionKey('highlights_https://example.com')).toBe(false);
            expect(isMigrationCompletionKey('other_key')).toBe(false);
        });
    });
    
    // ==================== createMigrationCompletionKey ====================
    describe('createMigrationCompletionKey', () => {
        test('應該生成正確的遷移完成鍵名', () => {
            expect(createMigrationCompletionKey('https://example.com')).toBe('migration_completed_https://example.com');
        });
        
        test('空字符串應該返回 null', () => {
            expect(createMigrationCompletionKey('')).toBe(null);
            expect(createMigrationCompletionKey('   ')).toBe(null);
        });
    });
    
    // ==================== filterValidHighlights ====================
    describe('filterValidHighlights', () => {
        test('應該過濾出有效的標註', () => {
            const highlights = [
                { text: 'valid1' },
                { text: '' }, // 無效
                { text: 'valid2' },
                { color: 'yellow' }, // 無效（無 text）
                { content: 'valid3' }
            ];
            const result = filterValidHighlights(highlights);
            expect(result).toHaveLength(3);
        });
        
        test('非數組應該返回空數組', () => {
            expect(filterValidHighlights(null)).toEqual([]);
            expect(filterValidHighlights('not-array')).toEqual([]);
        });
        
        test('空數組應該返回空數組', () => {
            expect(filterValidHighlights([])).toEqual([]);
        });
    });
    
    // ==================== countHighlightsByColor ====================
    describe('countHighlightsByColor', () => {
        test('應該正確統計顏色分佈', () => {
            const highlights = [
                { text: 'test1', color: 'yellow' },
                { text: 'test2', color: 'yellow' },
                { text: 'test3', color: 'green' },
                { text: 'test4', color: 'blue' },
                { text: 'test5', color: 'red' }
            ];
            const result = countHighlightsByColor(highlights);
            expect(result.yellow).toBe(2);
            expect(result.green).toBe(1);
            expect(result.blue).toBe(1);
            expect(result.red).toBe(1);
            expect(result.other).toBe(0);
        });
        
        test('缺少 color 應該默認為 yellow', () => {
            const highlights = [
                { text: 'test1' },
                { text: 'test2' }
            ];
            const result = countHighlightsByColor(highlights);
            expect(result.yellow).toBe(2);
        });
        
        test('未知顏色應該計入 other', () => {
            const highlights = [
                { text: 'test1', color: 'purple' },
                { text: 'test2', color: 'orange' }
            ];
            const result = countHighlightsByColor(highlights);
            expect(result.other).toBe(2);
        });
        
        test('非數組應該返回空統計', () => {
            expect(countHighlightsByColor(null)).toEqual({});
        });
        
        test('空數組應該返回全零統計', () => {
            const result = countHighlightsByColor([]);
            expect(result.yellow).toBe(0);
            expect(result.green).toBe(0);
            expect(result.blue).toBe(0);
            expect(result.red).toBe(0);
            expect(result.other).toBe(0);
        });
    });
});
