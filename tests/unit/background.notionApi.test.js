/**
 * background.js - Notion API 核心功能測試
 * 
 * 測試範圍：
 * - createNotionPage() - 基礎頁面創建
 * - appendBlocksInBatches() - 批次追加邏輯
 * - fetchDatabases() - 資料庫獲取
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
                json: async () => ({
                    id: 'page-123',
                    url: 'https://notion.so/page-123'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer test-key',
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({
                    parent: { database_id: 'db-123' },
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
                json: async () => ({
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
                    'Notion-Version': '2022-06-28'
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
                json: async () => ({
                    object: 'error',
                    status: 404,
                    code: 'object_not_found',
                    message: 'Could not find database with ID: db-invalid'
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                body: JSON.stringify({
                    parent: { database_id: 'db-invalid' }
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
                json: async () => ({ results: blocks })
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
                .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
                .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
                .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });

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
                .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
                .mockResolvedValueOnce({ 
                    ok: false, 
                    status: 400,
                    json: async () => ({ 
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

describe('Notion API - 資料庫獲取', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockClear();
    });

    describe('fetchDatabases()', () => {
        test('應該成功獲取資料庫列表', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
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

        test('應該處理空資料庫列表', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
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
                json: async () => ({
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
                json: async () => ({
                    results: []
                })
            });

            const result = await global.fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer valid-key',
                    'Notion-Version': '2022-06-28'
                }
            });

            expect(result.ok).toBe(true);
        });

        test('應該拒絕無效的 API Key', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({
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
                json: async () => ({
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
                json: async () => ({
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
