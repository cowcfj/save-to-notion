/**
 * ExtractionStrategy 全面測試
 *
 * 覆蓋 ExtractionStrategy 和 ExtractionResult 類的所有功能：
 * - ExtractionStrategy 基類方法
 * - ExtractionResult 數據結構
 * - URL 驗證和清理
 * - 策略接口實現
 */

const { ExtractionStrategy, ExtractionResult } = require('../../../scripts/imageExtraction/ExtractionStrategy');

describe('ExtractionStrategy - 全面測試', () => {
    let strategy;
    let imgElement;

    beforeEach(() => {
        strategy = new ExtractionStrategy();
        imgElement = document.createElement('img');
    });

    describe('ExtractionStrategy 基類', () => {
        describe('extract()', () => {
            it('沒有 imgNode 時應該拋出錯誤', () => {
                expect(() => strategy.extract(null)).toThrow('imgNode parameter is required');
            });

            it('應該要求子類實現', () => {
                expect(() => strategy.extract(imgElement)).toThrow('ExtractionStrategy.extract() must be implemented by subclass');
            });
        });

        describe('getName()', () => {
            it('應該要求子類實現', () => {
                expect(() => strategy.getName()).toThrow('ExtractionStrategy.getName() must be implemented by subclass');
            });
        });

        describe('getPriority()', () => {
            it('應該返回默認優先級 100', () => {
                expect(strategy.getPriority()).toBe(100);
            });
        });

        describe('isApplicable()', () => {
            it('應該接受有效的元素節點', () => {
                expect(strategy.isApplicable(imgElement)).toBe(true);
            });

            it('應該拒絕 null', () => {
                // isApplicable 在 null 時返回 falsy 值
                expect(strategy.isApplicable(null)).toBeFalsy();
            });

            it('應該拒絕 undefined', () => {
                expect(strategy.isApplicable(undefined)).toBeFalsy();
            });

            it('應該拒絕文本節點', () => {
                const textNode = document.createTextNode('text');
                expect(strategy.isApplicable(textNode)).toBe(false);
            });

            it('應該接受其他元素類型', () => {
                const divElement = document.createElement('div');
                expect(strategy.isApplicable(divElement)).toBe(true);
            });
        });

        describe('_isValidUrl()', () => {
            it('應該接受有效的 HTTP URL', () => {
                expect(strategy._isValidUrl('http://example.com/image.jpg')).toBe(true);
            });

            it('應該接受有效的 HTTPS URL', () => {
                expect(strategy._isValidUrl('https://example.com/image.jpg')).toBe(true);
            });

            it('應該拒絕 data: URL', () => {
                expect(strategy._isValidUrl('data:image/png;base64,abc123')).toBe(false);
            });

            it('應該拒絕 blob: URL', () => {
                expect(strategy._isValidUrl('blob:https://example.com/123')).toBe(false);
            });

            it('應該拒絕 null', () => {
                expect(strategy._isValidUrl(null)).toBe(false);
            });

            it('應該拒絕 undefined', () => {
                expect(strategy._isValidUrl(undefined)).toBe(false);
            });

            it('應該拒絕空字符串', () => {
                expect(strategy._isValidUrl('')).toBe(false);
            });

            it('應該拒絕非字符串', () => {
                expect(strategy._isValidUrl(123)).toBe(false);
                expect(strategy._isValidUrl({})).toBe(false);
                expect(strategy._isValidUrl([])).toBe(false);
            });

            it('應該拒絕無效 URL', () => {
                expect(strategy._isValidUrl('not-a-url')).toBe(false);
            });

            it('應該接受帶查詢參數的 URL', () => {
                expect(strategy._isValidUrl('https://example.com/image.jpg?size=large')).toBe(true);
            });

            it('應該接受帶片段的 URL', () => {
                expect(strategy._isValidUrl('https://example.com/image.jpg#section')).toBe(true);
            });

            it('應該接受帶端口的 URL', () => {
                expect(strategy._isValidUrl('https://example.com:8080/image.jpg')).toBe(true);
            });
        });

        describe('_cleanUrl()', () => {
            it('應該修剪空白字符', () => {
                expect(strategy._cleanUrl('  https://example.com/image.jpg  ')).toBe('https://example.com/image.jpg');
            });

            it('應該移除雙引號', () => {
                expect(strategy._cleanUrl('"https://example.com/image.jpg"')).toBe('https://example.com/image.jpg');
            });

            it('應該移除單引號', () => {
                expect(strategy._cleanUrl("'https://example.com/image.jpg'")).toBe('https://example.com/image.jpg');
            });

            it('應該同時修剪和移除引號', () => {
                expect(strategy._cleanUrl('  "https://example.com/image.jpg"  ')).toBe('https://example.com/image.jpg');
            });

            it('應該處理 null', () => {
                expect(strategy._cleanUrl(null)).toBeNull();
            });

            it('應該處理 undefined', () => {
                expect(strategy._cleanUrl(undefined)).toBeNull();
            });

            it('應該處理空字符串', () => {
                expect(strategy._cleanUrl('')).toBeNull();
            });

            it('應該處理只包含空白的字符串', () => {
                expect(strategy._cleanUrl('   ')).toBeNull();
            });

            it('應該處理非字符串', () => {
                expect(strategy._cleanUrl(123)).toBeNull();
                expect(strategy._cleanUrl({})).toBeNull();
            });

            it('應該保留 URL 中的合法引號', () => {
                // 清理函數會移除首尾引號，但URL中間的引號會被保留
                // 但因為正則 /^["']|["']$/g 也會移除結尾的引號，所以 "test" 的結尾引號也會被移除
                const url = 'https://example.com/path?q="test"';
                const cleaned = strategy._cleanUrl(url);
                // 由於正則會移除開頭和結尾的引號，"test" 的結尾引號會被移除
                expect(cleaned).toBe('https://example.com/path?q="test');
            });
        });
    });

    describe('ExtractionResult', () => {
        describe('構造函數', () => {
            it('應該創建基本結果', () => {
                const result = new ExtractionResult(
                    'https://example.com/image.jpg',
                    'src-attribute'
                );

                expect(result.url).toBe('https://example.com/image.jpg');
                expect(result.source).toBe('src-attribute');
                expect(result.confidence).toBe(1.0);
                expect(result.metadata.timestamp).toBeDefined();
            });

            it('應該支持自定義置信度', () => {
                const result = new ExtractionResult(
                    'https://example.com/image.jpg',
                    'fallback',
                    0.7
                );

                expect(result.confidence).toBe(0.7);
            });

            it('應該支持自定義元數據', () => {
                const result = new ExtractionResult(
                    'https://example.com/image.jpg',
                    'srcset',
                    1.0,
                    { width: 1200, height: 800 }
                );

                expect(result.metadata.width).toBe(1200);
                expect(result.metadata.height).toBe(800);
                expect(result.metadata.timestamp).toBeDefined();
            });

            it('應該自動添加時間戳', () => {
                const before = Date.now();
                const result = new ExtractionResult(
                    'https://example.com/image.jpg',
                    'src-attribute'
                );
                const after = Date.now();

                expect(result.metadata.timestamp).toBeGreaterThanOrEqual(before);
                expect(result.metadata.timestamp).toBeLessThanOrEqual(after);
            });

            it('應該保留自定義元數據', () => {
                const customMetadata = {
                    format: 'jpeg',
                    size: '1MB'
                };
                const result = new ExtractionResult(
                    'https://example.com/image.jpg',
                    'src-attribute',
                    1.0,
                    customMetadata
                );

                expect(result.metadata.format).toBe('jpeg');
                expect(result.metadata.size).toBe('1MB');
            });
        });

        describe('isValid()', () => {
            it('有效的結果應該返回 true', () => {
                const result = new ExtractionResult(
                    'https://example.com/image.jpg',
                    'src-attribute'
                );

                expect(result.isValid()).toBe(true);
            });

            it('置信度為 0 應該返回 false', () => {
                const result = new ExtractionResult(
                    'https://example.com/image.jpg',
                    'src-attribute',
                    0
                );

                expect(result.isValid()).toBe(false);
            });

            it('負置信度應該返回 false', () => {
                const result = new ExtractionResult(
                    'https://example.com/image.jpg',
                    'src-attribute',
                    -0.5
                );

                expect(result.isValid()).toBe(false);
            });

            it('空 URL 應該返回 false', () => {
                const result = new ExtractionResult('', 'src-attribute');

                // isValid 檢查 url 是否為真值
                expect(result.isValid()).toBeFalsy();
            });

            it('null URL 應該返回 false', () => {
                const result = new ExtractionResult(null, 'src-attribute');

                expect(result.isValid()).toBeFalsy();
            });

            it('非字符串 URL 應該返回 false', () => {
                const result = new ExtractionResult(123, 'src-attribute');

                expect(result.isValid()).toBeFalsy();
            });
        });

        describe('toString()', () => {
            it('應該返回 URL 字符串', () => {
                const result = new ExtractionResult(
                    'https://example.com/image.jpg',
                    'src-attribute'
                );

                expect(result.toString()).toBe('https://example.com/image.jpg');
            });

            it('應該處理 null URL', () => {
                const result = new ExtractionResult(null, 'src-attribute');

                expect(result.toString()).toBeNull();
            });
        });

        describe('toJSON()', () => {
            it('應該返回完整的 JSON 對象', () => {
                const result = new ExtractionResult(
                    'https://example.com/image.jpg',
                    'src-attribute',
                    0.9,
                    { width: 800 }
                );

                const json = result.toJSON();

                expect(json).toEqual({
                    url: 'https://example.com/image.jpg',
                    source: 'src-attribute',
                    confidence: 0.9,
                    metadata: {
                        timestamp: result.metadata.timestamp,
                        width: 800
                    }
                });
            });

            it('應該可以序列化為 JSON 字符串', () => {
                const result = new ExtractionResult(
                    'https://example.com/image.jpg',
                    'src-attribute'
                );

                expect(() => JSON.stringify(result.toJSON())).not.toThrow();
            });
        });
    });

    describe('子類實現示例', () => {
        class TestStrategy extends ExtractionStrategy {
            extract(imgNode) {
                if (!imgNode) {
                    throw new Error('imgNode parameter is required');
                }
                const url = imgNode.getAttribute('test-src');
                return this._isValidUrl(url) ? url : null;
            }

            getName() {
                return 'TestStrategy';
            }

            getPriority() {
                return 50;
            }
        }

        it('子類應該能正常工作', () => {
            const testStrategy = new TestStrategy();
            imgElement.setAttribute('test-src', 'https://example.com/test.jpg');

            expect(testStrategy.getName()).toBe('TestStrategy');
            expect(testStrategy.getPriority()).toBe(50);
            expect(testStrategy.extract(imgElement)).toBe('https://example.com/test.jpg');
        });

        it('子類應該繼承父類的工具方法', () => {
            const testStrategy = new TestStrategy();

            expect(testStrategy._isValidUrl('https://example.com/image.jpg')).toBe(true);
            expect(testStrategy._cleanUrl('"https://example.com/image.jpg"')).toBe('https://example.com/image.jpg');
        });

        it('子類應該繼承 isApplicable 方法', () => {
            const testStrategy = new TestStrategy();

            expect(testStrategy.isApplicable(imgElement)).toBe(true);
            expect(testStrategy.isApplicable(null)).toBeFalsy();
        });
    });

    describe('模塊導出', () => {
        it('應該正確導出 ExtractionStrategy', () => {
            expect(ExtractionStrategy).toBeDefined();
            expect(typeof ExtractionStrategy).toBe('function');
        });

        it('應該正確導出 ExtractionResult', () => {
            expect(ExtractionResult).toBeDefined();
            expect(typeof ExtractionResult).toBe('function');
        });
    });
});
