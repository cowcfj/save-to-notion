/**
 * background.js normalizeUrl 函數測試
 */

// 先設置 Chrome Mock
require('../mocks/chrome.js');

// 導入原始源碼
const { normalizeUrl } = require('../../scripts/background.js');

describe('background.normalizeUrl', () => {
    // ==========================================
    // 1. 基本功能測試
    // ==========================================

    describe('基本功能', () => {
        test('應該返回不變的簡單 URL', () => {
            const url = 'https://example.com/path';
            const result = normalizeUrl(url);
            
            expect(result).toBe(url);
        });

        test('應該處理根路徑', () => {
            const url = 'https://example.com/';
            const result = normalizeUrl(url);
            
            expect(result).toBe(url);
        });

        test('應該保持查詢參數（非追蹤參數）', () => {
            const url = 'https://example.com/?id=123&name=test';
            const result = normalizeUrl(url);
            
            expect(result).toContain('id=123');
            expect(result).toContain('name=test');
        });
    });

    // ==========================================
    // 2. 移除 Hash Fragment
    // ==========================================

    describe('移除 Hash Fragment', () => {
        test('應該移除 hash fragment', () => {
            const url = 'https://example.com/page#section';
            const result = normalizeUrl(url);
            
            expect(result).toBe('https://example.com/page');
        });

        test('應該移除複雜的 hash', () => {
            const url = 'https://example.com/page?id=1#complex-hash-with-params';
            const result = normalizeUrl(url);
            
            expect(result).toBe('https://example.com/page?id=1');
        });
    });

    // ==========================================
    // 3. 移除追蹤參數
    // ==========================================

    describe('移除追蹤參數', () => {
        test('應該移除 utm_source', () => {
            const url = 'https://example.com/?utm_source=newsletter';
            const result = normalizeUrl(url);
            
            expect(result).toBe('https://example.com/');
        });

        test('應該移除所有 UTM 參數', () => {
            const url = 'https://example.com/?utm_source=a&utm_medium=b&utm_campaign=c&utm_term=d&utm_content=e';
            const result = normalizeUrl(url);
            
            expect(result).toBe('https://example.com/');
        });

        test('應該移除 fbclid', () => {
            const url = 'https://example.com/?fbclid=IwAR123xyz';
            const result = normalizeUrl(url);
            
            expect(result).toBe('https://example.com/');
        });

        test('應該移除 gclid', () => {
            const url = 'https://example.com/?gclid=TeSter123';
            const result = normalizeUrl(url);
            
            expect(result).toBe('https://example.com/');
        });

        test('應該移除多個追蹤參數', () => {
            const url = 'https://example.com/?id=123&utm_source=a&fbclid=b&gclid=c';
            const result = normalizeUrl(url);
            
            expect(result).toBe('https://example.com/?id=123');
        });
    });

    // ==========================================
    // 4. 標準化尾部斜杠
    // ==========================================

    describe('標準化尾部斜杠', () => {
        test('應該移除非根路徑的尾部斜杠', () => {
            const url = 'https://example.com/path/';
            const result = normalizeUrl(url);
            
            expect(result).toBe('https://example.com/path');
        });

        test('應該保留根路徑的斜杠', () => {
            const url = 'https://example.com/';
            const result = normalizeUrl(url);
            
            expect(result).toBe(url);
        });

        test('應該移除多個尾部斜杠', () => {
            const url = 'https://example.com/path///';
            const result = normalizeUrl(url);
            
            expect(result).toBe('https://example.com/path');
        });
    });

    // ==========================================
    // 5. 組合場景
    // ==========================================

    describe('組合場景', () => {
        test('應該處理包含所有變體的 URL', () => {
            const url = 'https://example.com/path/?id=1&utm_source=test&utm_medium=email#section';
            const result = normalizeUrl(url);
            
            expect(result).toBe('https://example.com/path?id=1');
        });

        test('應該處理複雜的真實世界 URL', () => {
            const url = 'https://www.example.com/blog/post-title/?utm_source=twitter&utm_campaign=summer&fbclid=xyz#comment-123';
            const result = normalizeUrl(url);
            
            expect(result).toBe('https://www.example.com/blog/post-title');
        });
    });

    // ==========================================
    // 6. 錯誤處理
    // ==========================================

    describe('錯誤處理', () => {
        test('應該處理無效的 URL', () => {
            const invalid = 'not-a-url';
            const result = normalizeUrl(invalid);
            
            expect(result).toBe(invalid); // 返回原值
        });

        test('應該處理空字串', () => {
            const result = normalizeUrl('');
            
            expect(result).toBe('');
        });

        test('應該處理 null', () => {
            const result = normalizeUrl(null);
            
            // background.js 返回空字符串而非 null
            expect(result).toBe('');
        });

        test('應該處理 undefined', () => {
            const result = normalizeUrl();
            
            // background.js 返回空字符串而非 undefined
            expect(result).toBe('');
        });

        test('應該處理非字符串輸入', () => {
            const result = normalizeUrl(123);
            
            // background.js 在錯誤時返回原值或空字符串
            expect(result).toBe(123);
        });
    });

    // ==========================================
    // 7. 特殊字符和編碼
    // ==========================================

    describe('特殊字符和編碼', () => {
        test('應該處理 URL 編碼', () => {
            const url = 'https://example.com/path%20with%20spaces';
            const result = normalizeUrl(url);
            
            expect(result).toContain('example.com');
        });

        test('應該處理中文字符', () => {
            const url = 'https://example.com/路徑/文章';
            const result = normalizeUrl(url);
            
            expect(result).toContain('example.com');
        });

        test('應該處理特殊查詢參數', () => {
            const url = 'https://example.com/?q=test&value=100%';
            const result = normalizeUrl(url);
            
            expect(result).toContain('q=test');
        });
    });
});
