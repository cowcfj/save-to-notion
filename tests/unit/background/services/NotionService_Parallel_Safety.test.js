/**
 * NotionService 並行請求隔離測試
 * 驗證不同 API Key 的請求不會互相干擾 (修復競態條件)
 */

import { NotionService } from '../../../../scripts/background/services/NotionService.js';
import { Client } from '@notionhq/client';

// Mock Notion SDK
jest.mock('@notionhq/client', () => {
  return {
    Client: jest.fn().mockImplementation(config => {
      return {
        auth: config.auth,
        request: jest.fn().mockResolvedValue({ success: true }),
        search: jest.fn().mockResolvedValue({ results: [], next_cursor: null }),
        pages: {
          retrieve: jest.fn().mockResolvedValue({ archived: false }),
        },
        blocks: {
          children: {
            list: jest.fn().mockResolvedValue({ results: [] }),
            append: jest.fn().mockResolvedValue({ results: [] }),
          },
        },
        databases: {
          retrieve: jest.fn().mockResolvedValue({ properties: {} }),
          query: jest.fn().mockResolvedValue({ results: [] }),
        },
      };
    }),
  };
});

describe('NotionService Race Condition Fix Verification', () => {
  let service;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    };

    // 建立服務實例（預設使用 Key A）
    service = new NotionService({
      apiKey: 'KEY_A',
      logger: mockLogger,
    });

    // 重置 Mock
    Client.mockClear();
  });

  it('並行請求應該使用各自獨立的 API Key (Scoped Client)', async () => {
    // 啟動兩個並行請求，使用不同的 API Key
    const p1 = service.search({ query: 'test1' }, { apiKey: 'KEY_B' });
    const p2 = service.checkPageExists('page-123', { apiKey: 'KEY_C' });
    const p3 = service.search({ query: 'test3' }); // 使用預設 KEY_A

    await Promise.all([p1, p2, p3]);

    // 驗證創建了多個 Client 實例
    // 1. KEY_B (search scoped)
    // 2. KEY_C (checkPageExists scoped)
    // 3. KEY_A (雖然在 constructor 建立過一次，但 search 可能會再建立一次，具體取決於實現)

    // 檢查 Client 實例的 auth
    const auths = Client.mock.calls.map(call => call[0].auth);

    expect(auths).toContain('KEY_B'); // p1 使用了 KEY_B
    expect(auths).toContain('KEY_C'); // p2 使用了 KEY_C

    // 獲取所有創建的 mock 實例
    const mockInstances = Client.mock.results.map(r => r.value);

    // 找到對應 KEY_B 的實例
    const instanceB = mockInstances.find(i => i.auth === 'KEY_B');
    expect(instanceB.search).toHaveBeenCalled();

    // 找到對應 KEY_C 的實例
    const instanceC = mockInstances.find(i => i.auth === 'KEY_C');
    expect(instanceC.pages.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        page_id: 'page-123',
      })
    );

    // 驗證預設實例也被使用
    // 由於 NotionService 復用構造函數中創建的 client (KEY_A)，因此這裡不會有新的 Client 實例產生
    const newInstanceA = mockInstances.find(i => i.auth === 'KEY_A');
    expect(newInstanceA).toBeUndefined();

    // 直接驗證 service.client (預設實例) 是否被調用
    expect(service.client).toBeDefined();
    expect(service.client.auth).toBe('KEY_A');
    expect(service.client.search).toHaveBeenCalled();
  });
});
