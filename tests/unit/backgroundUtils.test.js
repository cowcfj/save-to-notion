/**
 * background.js 工具函數單元測試
 * 測試 URL 和文本處理工具函數
 */

describe('background.js - 工具函數', () => {
    // Mock cleanImageUrl 函數
    global.cleanImageUrl = function (url) {
        if (!url || typeof url !== 'string') return null;

        try {
            const urlObj = new URL(url);

            // 處理代理 URL
            if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
                const uParam = urlObj.searchParams.get('u');
                if (uParam?.match(/^https?:\/\//)) {
                    return cleanImageUrl(uParam);
                }
            }

            // 移除重複的查詢參數
            const params = new URLSearchParams();
            for (const [key, value] of urlObj.searchParams.entries()) {
                if (!params.has(key)) {
                    params.set(key, value);
                }
            }
            urlObj.search = params.toString();

            return urlObj.href;
        } catch (_e) {
            return null;
        }
    };

    // Mock isValidImageUrl 函數
    global.isValidImageUrl = function (url) {
        if (!url || typeof url !== 'string') return false;

        const cleanedUrl = cleanImageUrl(url);
        if (!cleanedUrl) return false;

        if (!/^https?:\/\//i.test(cleanedUrl)) return false;
        if (cleanedUrl.length > 2000) return false;

        const imageExtensions = /\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)(?:\?.*)?$/i;
        if (imageExtensions.test(cleanedUrl)) return true;

        const imagePathPatterns = [
            /\/image[s]?\//i,
            /\/img[s]?\//i,
            /\/photo[s]?\//i,
            /\/picture[s]?\//i,
            /\/media\//i,
            /\/upload[s]?\//i,
            /\/asset[s]?\//i,
            /\/file[s]?\//i
        ];

        const excludePatterns = [
            /\.(js|css|html|htm|php|asp|jsp)(\?|$)/i,
            /\/api\//i,
            /\/ajax\//i,
            /\/callback/i
        ];

        if (excludePatterns.some(pattern => pattern.test(cleanedUrl))) {
            return false;
        }

        return imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
    };

    describe('cleanImageUrl', () => {
        test('應該返回有效的圖片 URL', () => {
            const url = 'https://example.com/image.jpg';
            const result = cleanImageUrl(url);

            expect(result).toBe(url);
        });

        test('應該處理代理 URL', () => {
            const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?u=https://example.com/image.jpg';
            const result = cleanImageUrl(proxyUrl);

            expect(result).toBe('https://example.com/image.jpg');
        });

        test('應該移除重複的查詢參數', () => {
            const url = 'https://example.com/image.jpg?size=large&size=small&quality=high';
            const result = cleanImageUrl(url);

            // 應該只保留第一個 size 參數
            expect(result).toContain('size=large');
            expect(result).toContain('quality=high');
            // 計算 size 出現次數
            const sizeCount = (result.match(/size=/g) || []).length;
            expect(sizeCount).toBe(1);
        });

        test('應該處理無效 URL', () => {
            const result = cleanImageUrl('not-a-url');

            expect(result).toBeNull();
        });

        test('應該處理 null', () => {
            const result = cleanImageUrl(null);

            expect(result).toBeNull();
        });

        test('應該處理 undefined', () => {
            const result = cleanImageUrl();

            expect(result).toBeNull();
        });

        test('應該處理非字符串', () => {
            const result = cleanImageUrl(123);

            expect(result).toBeNull();
        });

        test('應該處理嵌套的代理 URL', () => {
            const nestedProxy = 'https://proxy1.com/photo.php?u=https://proxy2.com/photo.php?u=https://example.com/image.jpg';
            const result = cleanImageUrl(nestedProxy);

            expect(result).toBe('https://example.com/image.jpg');
        });
    });

    describe('isValidImageUrl', () => {
        test('應該識別有效的圖片 URL（帶擴展名）', () => {
            const urls = [
                'https://example.com/image.jpg',
                'https://example.com/photo.jpeg',
                'https://example.com/pic.png',
                'https://example.com/animation.gif',
                'https://example.com/modern.webp',
                'https://example.com/hdr.avif',
                'https://example.com/livephoto.heic',
                'https://example.com/proraw.heif'
            ];

            urls.forEach(url => {
                expect(isValidImageUrl(url)).toBe(true);
            });
        });

        test('應該識別圖片路徑模式', () => {
            const urls = [
                'https://example.com/images/123',
                'https://example.com/img/photo',
                'https://example.com/photos/456',
                'https://example.com/media/789'
            ];

            urls.forEach(url => {
                expect(isValidImageUrl(url)).toBe(true);
            });
        });

        test('應該拒絕非圖片 URL', () => {
            const urls = [
                'https://example.com/script.js',
                'https://example.com/style.css',
                'https://example.com/page.html',
                'https://example.com/api/data'
            ];

            urls.forEach(url => {
                expect(isValidImageUrl(url)).toBe(false);
            });
        });

        test('應該拒絕過長的 URL', () => {
            const longUrl = `https://example.com/${'a'.repeat(2000)}.jpg`;

            expect(isValidImageUrl(longUrl)).toBe(false);
        });

        test('應該拒絕非 HTTP/HTTPS URL', () => {
            const urls = [
                'ftp://example.com/image.jpg',
                'file:///local/image.jpg',
                'data:image/png;base64,iVBOR...'
            ];

            urls.forEach(url => {
                expect(isValidImageUrl(url)).toBe(false);
            });
        });

        test('應該處理帶查詢參數的圖片 URL', () => {
            const url = 'https://example.com/image.jpg?size=large&quality=high';

            expect(isValidImageUrl(url)).toBe(true);
        });

        test('應該處理 null', () => {
            expect(isValidImageUrl(null)).toBe(false);
        });

        test('應該處理 undefined', () => {
            expect(isValidImageUrl()).toBe(false);
        });

        test('應該處理空字符串', () => {
            expect(isValidImageUrl('')).toBe(false);
        });
    });

    describe('appendBlocksInBatches', () => {
        /** @type {jest.Mock|null} */
        let mockFetch = null;
        /** @type {Function|null} */
        let originalFetch = null;
        /** @type {Object|null} */
        let consoleSpy = null;

        beforeEach(() => {
            // 保存原始 fetch
            originalFetch = global.fetch;

            // Mock fetch
            mockFetch = jest.fn();
            global.fetch = mockFetch;

            // Mock console
            consoleSpy = {
                log: jest.fn(),
                error: jest.fn()
            };
            global.console = consoleSpy;

            // 定義 appendBlocksInBatches 函數
            global.appendBlocksInBatches = async function (pageId, blocks, apiKey, startIndex = 0) {
                const BLOCKS_PER_BATCH = 100;
                const DELAY_BETWEEN_BATCHES = 350;

                let addedCount = 0;
                const totalBlocks = blocks.length - startIndex;

                if (totalBlocks <= 0) {
                    return { success: true, addedCount: 0, totalCount: 0 };
                }

                console.log(`📦 準備分批添加區塊: 總共 ${totalBlocks} 個，從索引 ${startIndex} 開始`);

                try {
                    for (let i = startIndex; i < blocks.length; i += BLOCKS_PER_BATCH) {
                        const batch = blocks.slice(i, i + BLOCKS_PER_BATCH);
                        const batchNumber = Math.floor((i - startIndex) / BLOCKS_PER_BATCH) + 1;
                        const totalBatches = Math.ceil(totalBlocks / BLOCKS_PER_BATCH);

                        console.log(`📤 發送批次 ${batchNumber}/${totalBatches}: ${batch.length} 個區塊`);

                        const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Bearer ${apiKey}`,
                                'Content-Type': 'application/json',
                                'Notion-Version': '2025-09-03'
                            },
                            body: JSON.stringify({
                                children: batch
                            })
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            console.error(`❌ 批次 ${batchNumber} 失敗:`, errorText);
                            throw new Error(`批次添加失敗: ${response.status} - ${errorText}`);
                        }

                        addedCount += batch.length;
                        console.log(`✅ 批次 ${batchNumber} 成功: 已添加 ${addedCount}/${totalBlocks} 個區塊`);

                        if (i + BLOCKS_PER_BATCH < blocks.length) {
                            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                        }
                    }

                    return { success: true, addedCount, totalCount: totalBlocks };
                } catch (error) {
                    console.error('❌ 批次添加過程中出錯:', error);
                    return {
                        success: false,
                        addedCount,
                        totalCount: totalBlocks,
                        error: error.message
                    };
                }
            };
        });

        afterEach(() => {
            global.fetch = originalFetch;
            jest.clearAllMocks();
        });

        test('應該成功處理少量區塊（單批次）', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('{}')
            });

            const blocks = Array(50).fill({ type: 'paragraph' });
            const result = await appendBlocksInBatches('page123', blocks, 'api_key');

            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(50);
            expect(result.totalCount).toBe(50);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        test('應該分批處理大量區塊', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('{}')
            });

            const blocks = Array(250).fill({ type: 'paragraph' });
            const result = await appendBlocksInBatches('page123', blocks, 'api_key');

            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(250);
            expect(result.totalCount).toBe(250);
            expect(mockFetch).toHaveBeenCalledTimes(3); // 100 + 100 + 50
        });

        test('應該處理空區塊數組', async () => {
            const result = await appendBlocksInBatches('page123', [], 'api_key');

            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(0);
            expect(result.totalCount).toBe(0);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        test('應該從指定索引開始處理', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('{}')
            });

            const blocks = Array(150).fill({ type: 'paragraph' });
            const result = await appendBlocksInBatches('page123', blocks, 'api_key', 50);

            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(100); // 150 - 50 = 100
            expect(result.totalCount).toBe(100);
        });

        test('應該處理 API 錯誤', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 400,
                text: jest.fn().mockResolvedValue('Bad Request')
            });

            const blocks = Array(50).fill({ type: 'paragraph' });
            const result = await appendBlocksInBatches('page123', blocks, 'api_key');

            expect(result.success).toBe(false);
            expect(result.error).toContain('批次添加失敗');
        });

        test('應該使用正確的 API 端點和標頭', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: jest.fn().mockResolvedValue('{}')
            });

            const blocks = Array(10).fill({ type: 'paragraph' });
            await appendBlocksInBatches('page123', blocks, 'test_api_key');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.notion.com/v1/blocks/page123/children',
                expect.objectContaining({
                    method: 'PATCH',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test_api_key',
                        'Content-Type': 'application/json',
                        'Notion-Version': '2025-09-03'
                    })
                })
            );
        });
    });
});
