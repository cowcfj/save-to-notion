/**
 * background.js 圖片工具函數測試
 * 補充測試以提高覆蓋率
 */

// 先設置 Chrome Mock
require('../mocks/chrome.js');

// 導入原始源碼
const { cleanImageUrl, isValidImageUrl } = require('../../scripts/background.js');

describe('cleanImageUrl - 深度測試', () => {
    
    describe('代理 URL 處理（未覆蓋部分）', () => {
        test('應該處理 /photo.php 代理 URL', () => {
            const proxyUrl = 'https://proxy.example.com/photo.php?u=https://real.example.com/image.jpg';
            expect(cleanImageUrl(proxyUrl)).toBe('https://real.example.com/image.jpg');
        });
        
        test('應該處理 /gw/ 代理 URL', () => {
            const proxyUrl = 'https://pgw.example.com/gw/photo.php?u=https://real.example.com/photo.png';
            expect(cleanImageUrl(proxyUrl)).toBe('https://real.example.com/photo.png');
        });
        
        test('應該處理帶有額外參數的代理 URL', () => {
            const proxyUrl = 'https://proxy.example.com/photo.php?u=https://real.example.com/image.jpg&size=large';
            expect(cleanImageUrl(proxyUrl)).toBe('https://real.example.com/image.jpg');
        });
        
        test('代理 URL 中的 u 參數無效時應返回清理後的 URL', () => {
            const proxyUrl = 'https://proxy.example.com/photo.php?u=not-a-valid-url';
            expect(cleanImageUrl(proxyUrl)).toBe(proxyUrl);
        });
        
        test('代理 URL 缺少 u 參數應返回原 URL', () => {
            const proxyUrl = 'https://proxy.example.com/photo.php?other=value';
            expect(cleanImageUrl(proxyUrl)).toBe(proxyUrl);
        });
        
        test('應該遞歸清理嵌套代理 URL', () => {
            const nestedProxy = 'https://proxy1.com/photo.php?u=https://proxy2.com/gw/photo.php?u=https://real.com/image.jpg';
            expect(cleanImageUrl(nestedProxy)).toBe('https://real.com/image.jpg');
        });
    });
    
    describe('重複查詢參數處理', () => {
        test('應該移除重複的查詢參數（保留第一個）', () => {
            const url = 'https://example.com/image.jpg?size=large&size=small&quality=80';
            const result = cleanImageUrl(url);
            expect(result).toContain('size=large');
            expect(result).not.toContain('size=small');
        });
        
        test('應該保留所有不重複的查詢參數', () => {
            const url = 'https://example.com/image.jpg?a=1&b=2&c=3';
            const result = cleanImageUrl(url);
            expect(result).toContain('a=1');
            expect(result).toContain('b=2');
            expect(result).toContain('c=3');
        });
        
        test('多個重複參數應該都只保留第一個', () => {
            const url = 'https://example.com/image.jpg?a=1&a=2&b=3&b=4&c=5';
            const result = cleanImageUrl(url);
            const urlObj = new URL(result);
            expect(urlObj.searchParams.get('a')).toBe('1');
            expect(urlObj.searchParams.get('b')).toBe('3');
            expect(urlObj.searchParams.get('c')).toBe('5');
        });
    });
    
    describe('錯誤處理', () => {
        test('無效的 URL 應該返回 null', () => {
            expect(cleanImageUrl('not-a-url')).toBeNull();
            // FTP URL 是有效的 URL，只是不是 HTTP/HTTPS
            // cleanImageUrl 只檢查 URL 格式，不檢查協議
        });
        
        test('空值應該返回 null', () => {
            expect(cleanImageUrl(null)).toBeNull();
            expect(cleanImageUrl()).toBeNull();
            expect(cleanImageUrl('')).toBeNull();
        });
        
        test('非字符串應該返回 null', () => {
            expect(cleanImageUrl(123)).toBeNull();
            expect(cleanImageUrl({})).toBeNull();
            expect(cleanImageUrl([])).toBeNull();
        });
    });
});

describe('isValidImageUrl - 深度測試', () => {
    
    describe('URL 長度限制', () => {
        test('長度超過 2000 應該返回 false', () => {
            const longUrl = 'https://example.com/' + 'a'.repeat(2000) + '.jpg';
            expect(isValidImageUrl(longUrl)).toBe(false);
        });
        
        test('長度正好 2000 應該返回 true', () => {
            const baseUrl = 'https://example.com/';
            const padding = 'a'.repeat(2000 - baseUrl.length - 4); // -4 for .jpg
            const url = baseUrl + padding + '.jpg';
            expect(isValidImageUrl(url)).toBe(true);
        });
        
        test('長度小於 2000 應該返回 true', () => {
            const url = 'https://example.com/image.jpg';
            expect(isValidImageUrl(url)).toBe(true);
        });
    });
    
    describe('圖片擴展名檢查', () => {
        test('常見圖片格式應該返回 true', () => {
            expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.jpeg')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.png')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.gif')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.webp')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.svg')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.bmp')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.ico')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.tiff')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.tif')).toBe(true);
        });
        
        test('大小寫不敏感', () => {
            expect(isValidImageUrl('https://example.com/image.JPG')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.PNG')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.GIF')).toBe(true);
        });
        
        test('帶查詢參數的圖片 URL 應該返回 true', () => {
            expect(isValidImageUrl('https://example.com/image.jpg?size=large')).toBe(true);
            expect(isValidImageUrl('https://example.com/image.png?v=123')).toBe(true);
        });
    });
    
    describe('圖片路徑模式檢查', () => {
        test('包含 /images/ 路徑應該返回 true', () => {
            expect(isValidImageUrl('https://example.com/images/photo123')).toBe(true);
            expect(isValidImageUrl('https://example.com/image/photo123')).toBe(true);
        });
        
        test('包含 /img/ 路徑應該返回 true', () => {
            expect(isValidImageUrl('https://example.com/img/photo123')).toBe(true);
            expect(isValidImageUrl('https://example.com/imgs/photo123')).toBe(true);
        });
        
        test('包含 /photo/ 路徑應該返回 true', () => {
            expect(isValidImageUrl('https://example.com/photo/123')).toBe(true);
            expect(isValidImageUrl('https://example.com/photos/abc')).toBe(true);
        });
        
        test('包含 /picture/ 路徑應該返回 true', () => {
            expect(isValidImageUrl('https://example.com/picture/123')).toBe(true);
            expect(isValidImageUrl('https://example.com/pictures/abc')).toBe(true);
        });
        
        test('包含 /media/ 路徑應該返回 true', () => {
            expect(isValidImageUrl('https://example.com/media/photo123')).toBe(true);
        });
        
        test('包含 /upload/ 路徑應該返回 true', () => {
            expect(isValidImageUrl('https://example.com/upload/photo123')).toBe(true);
            expect(isValidImageUrl('https://example.com/uploads/abc')).toBe(true);
        });
        
        test('包含 /asset/ 路徑應該返回 true', () => {
            expect(isValidImageUrl('https://example.com/asset/photo123')).toBe(true);
            expect(isValidImageUrl('https://example.com/assets/abc')).toBe(true);
        });
        
        test('包含 /file/ 路徑應該返回 true', () => {
            expect(isValidImageUrl('https://example.com/file/photo123')).toBe(true);
            expect(isValidImageUrl('https://example.com/files/abc')).toBe(true);
        });
        
        test('大小寫不敏感', () => {
            expect(isValidImageUrl('https://example.com/IMAGES/photo')).toBe(true);
            expect(isValidImageUrl('https://example.com/Photos/abc')).toBe(true);
        });
    });
    
    describe('排除非圖片 URL', () => {
        test('JavaScript 文件應該返回 false', () => {
            expect(isValidImageUrl('https://example.com/script.js')).toBe(false);
            expect(isValidImageUrl('https://example.com/script.js?v=123')).toBe(false);
        });
        
        test('CSS 文件應該返回 false', () => {
            expect(isValidImageUrl('https://example.com/style.css')).toBe(false);
        });
        
        test('HTML 文件應該返回 false', () => {
            expect(isValidImageUrl('https://example.com/page.html')).toBe(false);
            expect(isValidImageUrl('https://example.com/page.htm')).toBe(false);
        });
        
        test('PHP 文件應該返回 false', () => {
            expect(isValidImageUrl('https://example.com/script.php')).toBe(false);
        });
        
        test('ASP/JSP 文件應該返回 false', () => {
            expect(isValidImageUrl('https://example.com/page.asp')).toBe(false);
            expect(isValidImageUrl('https://example.com/page.jsp')).toBe(false);
        });
        
        test('API 路徑應該返回 false', () => {
            expect(isValidImageUrl('https://example.com/api/data')).toBe(false);
        });
        
        test('AJAX 路徑應該返回 false', () => {
            expect(isValidImageUrl('https://example.com/ajax/load')).toBe(false);
        });
        
        test('Callback 路徑應該返回 false', () => {
            expect(isValidImageUrl('https://example.com/callback')).toBe(false);
        });
        
        test('大小寫不敏感', () => {
            expect(isValidImageUrl('https://example.com/SCRIPT.JS')).toBe(false);
            expect(isValidImageUrl('https://example.com/API/data')).toBe(false);
        });
    });
    
    describe('協議檢查', () => {
        test('HTTP 協議應該返回 true', () => {
            expect(isValidImageUrl('http://example.com/image.jpg')).toBe(true);
        });
        
        test('HTTPS 協議應該返回 true', () => {
            expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
        });
        
        test('非 HTTP/HTTPS 協議應該返回 false', () => {
            expect(isValidImageUrl('ftp://example.com/image.jpg')).toBe(false);
            expect(isValidImageUrl('file:///path/to/image.jpg')).toBe(false);
            expect(isValidImageUrl('data:image/png;base64,iVBORw0KG...')).toBe(false);
        });
    });
    
    describe('錯誤處理', () => {
        test('null 應該返回 false', () => {
            expect(isValidImageUrl(null)).toBe(false);
        });
        
        test('undefined 應該返回 false', () => {
            expect(isValidImageUrl()).toBe(false);
        });
        
        test('空字符串應該返回 false', () => {
            expect(isValidImageUrl('')).toBe(false);
        });
        
        test('無效的 URL 應該返回 false', () => {
            expect(isValidImageUrl('not-a-url')).toBe(false);
            expect(isValidImageUrl('example.com')).toBe(false);
        });
        
        test('非字符串應該返回 false', () => {
            expect(isValidImageUrl(123)).toBe(false);
            expect(isValidImageUrl({})).toBe(false);
            expect(isValidImageUrl([])).toBe(false);
        });
    });
    
    describe('邊界情況', () => {
        test('既有擴展名又有圖片路徑', () => {
            expect(isValidImageUrl('https://example.com/images/photo.jpg')).toBe(true);
        });
        
        test('既沒有擴展名也沒有圖片路徑', () => {
            expect(isValidImageUrl('https://example.com/page')).toBe(false);
        });
        
        test('有圖片路徑但被排除模式匹配', () => {
            // API 路徑應該優先於圖片路徑
            expect(isValidImageUrl('https://example.com/api/images/data.js')).toBe(false);
        });
        
        test('代理 URL 經過清理後的驗證', () => {
            const proxyUrl = 'https://proxy.com/photo.php?u=https://real.com/image.jpg';
            expect(isValidImageUrl(proxyUrl)).toBe(true);
        });
    });
});
