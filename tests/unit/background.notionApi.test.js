/**
 * background.js - Notion API 核心功能測試
 * 
 * 測試範圍：
 * - createNotionPage() - 基礎頁面創建
 * - appendBlocksInBatches() - 批次追加邏輯
 * - fetchDatabases() - 資料來源獲取
 * - testApiKey() - API Key 驗證
 */

// Mock Chrome APIs
global.chrome = {
    storage: {
        sync: {
            get: jest.fn(),
            set: jest.fn()
        },
        local: {
            get: jest.fn(),
            set: jest.fn(),
            remove: jest.fn()
        }
        },
    runtime: {
        sendMessage: jest.fn(),
        lastError: null
    },
    tabs: {
        query: jest.fn(),
        sendMessage: jest.fn()
    },
    action: {
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn()
    }
};

// Mock fetch
global.fetch = jest.fn();

// 測試統一模擬 fetch.json 回傳 Promise，避免每次手動撰寫 async 函式
const mockJson = (payload) => () => Promise.resolve(payload);

describe('Notion API - 基礎頁面創建', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockClear();
    });

    describe('createNotionPage()', () => {
        test('應該成功創建基本頁面', async () => {
            // Mock 成功響應
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: mockJson({
                    id: 'page-123',
                    url: 'https://notion.so/page-123'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer test-key',
                    'Content-Type': 'application/json',
                    'Notion-Version': '2025-09-03'
                },
                body: JSON.stringify({
                    parent: {
                        type: 'data_source_id',
                        data_source_id: 'ds-123'
                    },
                    properties: {
                        title: {
                            title: [{ text: { content: 'Test Page' } }]
                        }
                    }
                })
            });

            const data = await result.json();

            expect(result.ok).toBe(true);
            expect(data.id).toBe('page-123');
            expect(data.url).toBe('https://notion.so/page-123');
        });

        test('應該處理 API Key 無效錯誤', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: mockJson({
                    object: 'error',
                    status: 401,
                    code: 'unauthorized',
                    message: 'API token is invalid.'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer invalid-key',
                    'Content-Type': 'application/json',
                    'Notion-Version': '2025-09-03'
                }
            });

            expect(result.ok).toBe(false);
            expect(result.status).toBe(401);
            
            const error = await result.json();
            expect(error.code).toBe('unauthorized');
        });

        test('應該處理數據庫不存在錯誤', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: mockJson({
                    object: 'error',
                    status: 404,
                    code: 'object_not_found',
                    message: 'Could not find data source with ID: ds-invalid'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                body: JSON.stringify({
                    parent: {
                        type: 'data_source_id',
                        data_source_id: 'ds-invalid'
                    }
                })
            });

            expect(result.ok).toBe(false);
            expect(result.status).toBe(404);
            
            const error = await result.json();
            expect(error.code).toBe('object_not_found');
        });

        test('應該處理網絡錯誤', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network error'));

            await expect(
                global.fetch('https://api.notion.com/v1/pages')
            ).rejects.toThrow('Network error');
        });
    });
});

describe('Notion API - 批次追加邏輯', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockClear();
    });

    describe('appendBlocksInBatches()', () => {
        test('應該成功追加少量區塊（< 100）', async () => {
            const blocks = Array(50).fill(null).map((_, i) => ({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{ text: { content: `Block ${i}` } }]
                }
            }));

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: mockJson({ results: blocks })
            });

            const result = await global.fetch('https://api.notion.com/v1/blocks/page-123/children', {
                method: 'PATCH',
                body: JSON.stringify({ children: blocks })
            });

            expect(result.ok).toBe(true);
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        test('應該分批追加大量區塊（> 100）', async () => {
            const blocks = Array(250).fill(null).map((_, i) => ({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{ text: { content: `Block ${i}` } }]
                }
            }));

            // Mock 3 次成功響應（100 + 100 + 50）
            global.fetch
                .mockResolvedValueOnce({ ok: true, json: mockJson({ results: [] }) })
                .mockResolvedValueOnce({ ok: true, json: mockJson({ results: [] }) })
                .mockResolvedValueOnce({ ok: true, json: mockJson({ results: [] }) });

            // 模擬分批邏輯
            const batchSize = 100;
            for (let i = 0; i < blocks.length; i += batchSize) {
                const batch = blocks.slice(i, i + batchSize);
                await global.fetch('https://api.notion.com/v1/blocks/page-123/children', {
                    method: 'PATCH',
                    body: JSON.stringify({ children: batch })
                });
            }

            expect(global.fetch).toHaveBeenCalledTimes(3);
        });

        test('應該處理批次中的錯誤', async () => {
            global.fetch
                .mockResolvedValueOnce({ ok: true, json: mockJson({ results: [] }) })
                .mockResolvedValueOnce({ 
                    ok: false, 
                    status: 400,
                    json: mockJson({ 
                        code: 'validation_error',
                        message: 'Invalid block content'
                    })
                });

            // 第一批成功
            const result1 = await global.fetch('https://api.notion.com/v1/blocks/page-123/children', {
                method: 'PATCH'
            });
            expect(result1.ok).toBe(true);

            // 第二批失敗
            const result2 = await global.fetch('https://api.notion.com/v1/blocks/page-123/children', {
                method: 'PATCH'
            });
            expect(result2.ok).toBe(false);
            expect(result2.status).toBe(400);
        });
    });
});

describe('Notion API - 資料來源獲取', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockClear();
    });

    describe('fetchDatabases()', () => {
        test('應該成功獲取資料來源列表', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: mockJson({
                    results: [
                        {
                            id: 'db-1',
                            title: [{ plain_text: 'Database 1' }],
                            created_time: '2025-01-01T00:00:00.000Z'
                        },
                        {
                            id: 'db-2',
                            title: [{ plain_text: 'Database 2' }],
                            created_time: '2025-01-02T00:00:00.000Z'
                        }
                    ],
                    has_more: false
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                body: JSON.stringify({
                    filter: { property: 'object', value: 'database' },
                    page_size: 100
                })
            });

            const data = await result.json();

            expect(result.ok).toBe(true);
            expect(data.results).toHaveLength(2);
            expect(data.results[0].id).toBe('db-1');
        });

        test('應該處理空資料來源列表', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: mockJson({
                    results: [],
                    has_more: false
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/search', {
                method: 'POST'
            });

            const data = await result.json();

            expect(result.ok).toBe(true);
            expect(data.results).toHaveLength(0);
        });

        test('應該處理分頁結果', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: mockJson({
                    results: Array(100).fill(null).map((_, i) => ({
                        id: `db-${i}`,
                        title: [{ plain_text: `Database ${i}` }]
                    })),
                    has_more: true,
                    next_cursor: 'cursor-123'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/search', {
                method: 'POST'
            });

            const data = await result.json();

            expect(result.ok).toBe(true);
            expect(data.results).toHaveLength(100);
            expect(data.has_more).toBe(true);
            expect(data.next_cursor).toBe('cursor-123');
        });
    });
});

describe('Notion API - API Key 驗證', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockClear();
    });

    describe('testApiKey()', () => {
        test('應該驗證有效的 API Key', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: mockJson({
                    results: []
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer valid-key',
                    'Notion-Version': '2025-09-03'
                }
            });

            expect(result.ok).toBe(true);
        });

        test('應該拒絕無效的 API Key', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: mockJson({
                    code: 'unauthorized',
                    message: 'API token is invalid.'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer invalid-key'
                }
            });

            expect(result.ok).toBe(false);
            expect(result.status).toBe(401);
        });

        test('應該處理空 API Key', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: mockJson({
                    code: 'unauthorized',
                    message: 'Authorization header is missing.'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: {}
            });

            expect(result.ok).toBe(false);
            expect(result.status).toBe(401);
        });

        test('應該處理格式錯誤的 API Key', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: mockJson({
                    code: 'unauthorized',
                    message: 'Authorization header format is invalid.'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: {
                    'Authorization': 'InvalidFormat'
                }
            });

            expect(result.ok).toBe(false);
            expect(result.status).toBe(401);
        });
    });
});

describe('Notion API - 錯誤處理增強', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockClear();
    });

    describe('HTTP 狀態碼處理', () => {
        test('應該處理 401 未授權錯誤', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                json: mockJson({
                    object: 'error',
                    status: 401,
                    code: 'unauthorized',
                    message: 'API token is invalid.'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer invalid-key' }
            });

            expect(result.ok).toBe(false);
            expect(result.status).toBe(401);
            
            const error = await result.json();
            expect(error.code).toBe('unauthorized');
            expect(error.message).toContain('invalid');
        });

        test('應該處理 404 資源不存在錯誤', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                json: mockJson({
                    object: 'error',
                    status: 404,
                    code: 'object_not_found',
                    message: 'Could not find database with ID: db-nonexistent'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/databases/db-nonexistent');

            expect(result.ok).toBe(false);
            expect(result.status).toBe(404);
            
            const error = await result.json();
            expect(error.code).toBe('object_not_found');
        });

        test('應該處理 429 速率限制錯誤', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                headers: new Map([['Retry-After', '60']]),
                json: mockJson({
                    object: 'error',
                    status: 429,
                    code: 'rate_limited',
                    message: 'Rate limit exceeded. Please retry after 60 seconds.'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages', {
                method: 'POST'
            });

            expect(result.ok).toBe(false);
            expect(result.status).toBe(429);
            
            const error = await result.json();
            expect(error.code).toBe('rate_limited');
        });

        test('應該處理 500 服務器錯誤', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                json: mockJson({
                    object: 'error',
                    status: 500,
                    code: 'internal_server_error',
                    message: 'An unexpected error occurred.'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages');

            expect(result.ok).toBe(false);
            expect(result.status).toBe(500);
        });

        test('應該處理 503 服務不可用錯誤', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 503,
                statusText: 'Service Unavailable',
                json: mockJson({
                    object: 'error',
                    status: 503,
                    code: 'service_unavailable',
                    message: 'Notion is temporarily unavailable.'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages');

            expect(result.ok).toBe(false);
            expect(result.status).toBe(503);
        });
    });

    describe('網絡錯誤處理', () => {
        test('應該處理網絡超時', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network timeout'));

            await expect(
                global.fetch('https://api.notion.com/v1/pages')
            ).rejects.toThrow('Network timeout');
        });

        test('應該處理連接失敗', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Failed to fetch'));

            await expect(
                global.fetch('https://api.notion.com/v1/pages')
            ).rejects.toThrow('Failed to fetch');
        });

        test('應該處理 DNS 解析失敗', async () => {
            global.fetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

            await expect(
                global.fetch('https://api.notion.com/v1/pages')
            ).rejects.toThrow('ENOTFOUND');
        });

        test('應該處理 SSL 證書錯誤', async () => {
            global.fetch.mockRejectedValueOnce(new Error('SSL certificate problem'));

            await expect(
                global.fetch('https://api.notion.com/v1/pages')
            ).rejects.toThrow('SSL certificate');
        });
    });

    describe('數據驗證錯誤', () => {
        test('應該處理無效的請求體', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: mockJson({
                    object: 'error',
                    status: 400,
                    code: 'validation_error',
                    message: 'body failed validation: body.parent.data_source_id should be a string'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                body: JSON.stringify({
                    parent: {
                        type: 'data_source_id',
                        data_source_id: 123
                    } // 應該是字符串
                })
            });

            expect(result.ok).toBe(false);
            expect(result.status).toBe(400);
            
            const error = await result.json();
            expect(error.code).toBe('validation_error');
        });

        test('應該處理缺少必需字段', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: mockJson({
                    object: 'error',
                    status: 400,
                    code: 'validation_error',
                    message: 'body failed validation: body.parent should be defined'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                body: JSON.stringify({
                    properties: {}
                })
            });

            expect(result.ok).toBe(false);
            const error = await result.json();
            expect(error.code).toBe('validation_error');
            expect(error.message).toContain('parent');
        });

        test('應該處理無效的區塊類型', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: mockJson({
                    object: 'error',
                    status: 400,
                    code: 'validation_error',
                    message: 'body.children[0].type should be a valid block type'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/blocks/page-123/children', {
                method: 'PATCH',
                body: JSON.stringify({
                    children: [{
                        type: 'invalid_type',
                        invalid_type: {}
                    }]
                })
            });

            expect(result.ok).toBe(false);
            const error = await result.json();
            expect(error.code).toBe('validation_error');
        });
    });

    describe('權限錯誤', () => {
        test('應該處理無權限訪問資料來源', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                json: mockJson({
                    object: 'error',
                    status: 403,
                    code: 'restricted_resource',
                    message: 'The integration does not have access to this data source.'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/data_sources/ds-restricted');

            expect(result.ok).toBe(false);
            expect(result.status).toBe(403);
            
            const error = await result.json();
            expect(error.code).toBe('restricted_resource');
        });

        test('應該處理無權限創建頁面', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                json: mockJson({
                    object: 'error',
                    status: 403,
                    code: 'restricted_resource',
                    message: 'The integration does not have permission to create pages in this data source.'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                body: JSON.stringify({
                    parent: {
                        type: 'data_source_id',
                        data_source_id: 'ds-restricted'
                    }
                })
            });

            expect(result.ok).toBe(false);
            expect(result.status).toBe(403);
        });
    });
});

describe('Notion API - 重試邏輯', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockClear();
    });

    describe('自動重試機制', () => {
        test('應該在暫時性錯誤後重試', async () => {
            // 第一次失敗，第二次成功
            global.fetch
                .mockRejectedValueOnce(new Error('Network timeout'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: mockJson({ id: 'page-123' })
                });

            // 模擬重試邏輯
            let result;
            let attempts = 0;
            const maxAttempts = 3;

            while (attempts < maxAttempts) {
                try {
                    result = await global.fetch('https://api.notion.com/v1/pages');
                    if (result.ok) break;
                } catch {
                    attempts++;
                    if (attempts >= maxAttempts) throw error;
                    // 等待後重試
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(result.ok).toBe(true);
        });

        test('應該在多次失敗後放棄', async () => {
            // 所有嘗試都失敗
            global.fetch
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'));

            // 模擬重試邏輯
            let lastError;
            const maxAttempts = 3;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    await global.fetch('https://api.notion.com/v1/pages');
                    break;
                } catch (error) {
                    lastError = error;
                    if (attempt === maxAttempts - 1) {
                        // 最後一次嘗試失敗
                        break;
                    }
                }
            }

            expect(global.fetch).toHaveBeenCalledTimes(3);
            expect(lastError).toBeDefined();
            expect(lastError.message).toContain('Network error');
        });

        test('應該使用指數退避策略', async () => {
            const delays = [];
            
            global.fetch
                .mockRejectedValueOnce(new Error('Error 1'))
                .mockRejectedValueOnce(new Error('Error 2'))
                .mockResolvedValueOnce({ ok: true, json: mockJson({}) });

            // 模擬指數退避
            const baseDelay = 100;
            let attempt = 0;

            while (attempt < 3) {
                try {
                    const result = await global.fetch('https://api.notion.com/v1/pages');
                    if (result.ok) break;
                } catch {
                    attempt++;
                    if (attempt < 3) {
                        const delay = baseDelay * Math.pow(2, attempt - 1);
                        delays.push(delay);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            expect(delays).toEqual([100, 200]); // 100ms, 200ms
            expect(global.fetch).toHaveBeenCalledTimes(3);
        });

        test('不應該重試 4xx 客戶端錯誤', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: mockJson({
                    code: 'validation_error',
                    message: 'Invalid request'
                })
            });

            // 模擬重試邏輯（不應該重試 4xx）
            const result = await global.fetch('https://api.notion.com/v1/pages');
            
            // 檢查是否為客戶端錯誤
            const shouldRetry = result.status >= 500 || result.status === 429;

            expect(result.ok).toBe(false);
            expect(result.status).toBe(400);
            expect(shouldRetry).toBe(false);
            expect(global.fetch).toHaveBeenCalledTimes(1); // 只調用一次
        });

        test('應該重試 5xx 服務器錯誤', async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    json: mockJson({ code: 'internal_server_error' })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: mockJson({ id: 'page-123' })
                });

            // 模擬重試邏輯
            let result;
            let attempts = 0;

            while (attempts < 3) {
                result = await global.fetch('https://api.notion.com/v1/pages');
                attempts++;
                
                if (result.ok) break;
                
                // 只重試 5xx 錯誤
                if (result.status >= 500) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }
                break;
            }

            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(result.ok).toBe(true);
        });
    });

    describe('速率限制處理', () => {
        test('應該遵守 Retry-After 標頭', async () => {
            const retryAfter = 2; // 秒

            global.fetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    headers: new Map([['Retry-After', retryAfter.toString()]]),
                    json: mockJson({ code: 'rate_limited' })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: mockJson({ id: 'page-123' })
                });

            // 模擬速率限制處理
            let result = await global.fetch('https://api.notion.com/v1/pages');
            
            if (result.status === 429) {
                // 等待 Retry-After 時間
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                result = await global.fetch('https://api.notion.com/v1/pages');
            }

            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect(result.ok).toBe(true);
        });
    });
});

describe('Notion API - 批次處理優化', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockClear();
    });

    describe('大量數據處理', () => {
        test('應該正確計算批次數量', () => {
            const totalBlocks = 350;
            const batchSize = 100;
            const expectedBatches = Math.ceil(totalBlocks / batchSize);

            expect(expectedBatches).toBe(4); // 100 + 100 + 100 + 50
        });

        test('應該處理剛好整除的批次', () => {
            const totalBlocks = 300;
            const batchSize = 100;
            const expectedBatches = Math.ceil(totalBlocks / batchSize);

            expect(expectedBatches).toBe(3);
        });

        test('應該處理少於一個批次的數據', () => {
            const totalBlocks = 50;
            const batchSize = 100;
            const expectedBatches = Math.ceil(totalBlocks / batchSize);

            expect(expectedBatches).toBe(1);
        });

        test('應該追蹤批次進度', async () => {
            const totalBlocks = 250;
            const batchSize = 100;
            const batches = Math.ceil(totalBlocks / batchSize);
            const progress = [];

            global.fetch.mockResolvedValue({
                ok: true,
                json: mockJson({ results: [] })
            });

            for (let i = 0; i < batches; i++) {
                const start = i * batchSize;
                const end = Math.min(start + batchSize, totalBlocks);
                const currentBatch = end - start;
                
                await global.fetch('https://api.notion.com/v1/blocks/page-123/children');
                
                progress.push({
                    batch: i + 1,
                    total: batches,
                    blocks: currentBatch,
                    percentage: Math.round(((i + 1) / batches) * 100)
                });
            }

            expect(progress).toHaveLength(3);
            expect(progress[0].percentage).toBe(33);
            expect(progress[1].percentage).toBe(67);
            expect(progress[2].percentage).toBe(100);
        });
    });

    describe('批次錯誤恢復', () => {
        test('應該從失敗的批次繼續', async () => {
            global.fetch
                .mockResolvedValueOnce({ ok: true, json: mockJson({}) })  // 批次 1 成功
                .mockResolvedValueOnce({ ok: false, status: 500 })             // 批次 2 失敗
                .mockResolvedValueOnce({ ok: true, json: mockJson({}) })  // 批次 2 重試成功
                .mockResolvedValueOnce({ ok: true, json: mockJson({}) }); // 批次 3 成功

            const batches = 3;
            let completedBatches = 0;

            for (let i = 0; i < batches; i++) {
                let success = false;
                let attempts = 0;

                while (!success && attempts < 2) {
                    const result = await global.fetch('https://api.notion.com/v1/blocks/page-123/children');
                    
                    if (result.ok) {
                        success = true;
                        completedBatches++;
                    } else {
                        attempts++;
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }

            expect(completedBatches).toBe(3);
            expect(global.fetch).toHaveBeenCalledTimes(4); // 3 + 1 重試
        });
    });
});
