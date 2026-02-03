/**
 * OAuth 端到端整合測試
 *
 * 測試完整的 OAuth 授權流程，從開始到結束
 * 包括資料庫載入、API 操作和錯誤恢復機制
 */

describe('OAuth 端到端整合測試', () => {
  let oauthManager = null;
  let tokenManager = null;
  let apiClient = null;

  beforeEach(() => {
    // 重置 Chrome API 模擬
    globalThis.chrome = {
      identity: {
        launchWebAuthFlow: jest.fn(),
        getRedirectURL: jest.fn(() => 'chrome-extension://test/oauth-callback.html'),
      },
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
        sync: {
          get: jest.fn(),
          set: jest.fn(),
        },
      },
      runtime: {
        getManifest: jest.fn(() => ({
          manifest_version: 3,
          permissions: ['identity', 'storage'],
          host_permissions: ['https://api.notion.com/*'],
        })),
      },
    };

    // 初始化測試對象
    oauthManager = new NotionOAuthManager();
    tokenManager = new NotionTokenManager();
    apiClient = new NotionAPIClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('完整 OAuth 授權流程', () => {
    test('E2E-001: 成功的 OAuth 授權流程', async () => {
      // 模擬成功的 OAuth 流程
      const mockAuthCode = 'test_auth_code_12345';
      const mockTokens = {
        access_token: 'notion_access_token_12345',
        refresh_token: 'notion_refresh_token_12345',
        expires_in: 3600,
      };

      // 模擬 Chrome Identity API 回應
      chrome.identity.launchWebAuthFlow.mockResolvedValue(
        `chrome-extension://test/oauth-callback.html?code=${mockAuthCode}&state=test_state`
      );

      // 模擬權杖交換 API 回應
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTokens),
      });

      // 模擬儲存操作
      chrome.storage.local.set.mockResolvedValue();

      // 執行 OAuth 流程
      const result = await oauthManager.startAuthFlow();

      // 驗證結果
      expect(result.success).toBe(true);
      expect(result.tokens).toEqual(mockTokens);

      // 驗證 Chrome Identity API 被正確調用
      expect(chrome.identity.launchWebAuthFlow).toHaveBeenCalledWith({
        url: expect.stringContaining('https://api.notion.com/v1/oauth/authorize'),
        interactive: true,
      });

      // 驗證權杖被正確儲存
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        notion_oauth_tokens: expect.objectContaining({
          access_token: mockTokens.access_token,
          refresh_token: mockTokens.refresh_token,
        }),
      });
    });

    test('E2E-002: OAuth 授權失敗處理', async () => {
      // 模擬用戶取消授權
      chrome.identity.launchWebAuthFlow.mockRejectedValue(
        new Error('User cancelled the authorization')
      );

      // 執行 OAuth 流程
      const result = await oauthManager.startAuthFlow();

      // 驗證錯誤處理
      expect(result.success).toBe(false);
      expect(result.error).toContain('User cancelled');

      // 確保沒有儲存任何權杖
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    test('E2E-003: 權杖交換失敗處理', async () => {
      const mockAuthCode = 'test_auth_code_12345';

      // 模擬成功的授權但失敗的權杖交換
      chrome.identity.launchWebAuthFlow.mockResolvedValue(
        `chrome-extension://test/oauth-callback.html?code=${mockAuthCode}&state=test_state`
      );

      // 模擬權杖交換 API 失敗
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'Authorization code is invalid',
          }),
      });

      // 執行 OAuth 流程
      const result = await oauthManager.startAuthFlow();

      // 驗證錯誤處理
      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid_grant');
    });
  });

  describe('權杖管理和自動重新整理', () => {
    test('E2E-004: 自動權杖重新整理', async () => {
      const mockTokens = {
        access_token: 'old_access_token',
        refresh_token: 'refresh_token_12345',
        expires_at: Date.now() - 1000, // 已過期
      };

      const mockNewTokens = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600,
      };

      // 模擬儲存的過期權杖
      chrome.storage.local.get.mockResolvedValue({
        notion_oauth_tokens: mockTokens,
      });

      // 模擬權杖重新整理 API 回應
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockNewTokens),
      });

      chrome.storage.local.set.mockResolvedValue();

      // 執行權杖重新整理
      const result = await tokenManager.refreshToken();

      // 驗證結果
      expect(result.success).toBe(true);
      expect(result.tokens.access_token).toBe(mockNewTokens.access_token);

      // 驗證 API 調用
      expect(fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/oauth/token',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('refresh_token'),
        })
      );

      // 驗證新權杖被儲存
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        notion_oauth_tokens: expect.objectContaining({
          access_token: mockNewTokens.access_token,
        }),
      });
    });

    test('E2E-005: 權杖重新整理失敗回退', async () => {
      const mockTokens = {
        access_token: 'old_access_token',
        refresh_token: 'invalid_refresh_token',
        expires_at: Date.now() - 1000,
      };

      // 模擬儲存的過期權杖
      chrome.storage.local.get.mockResolvedValue({
        notion_oauth_tokens: mockTokens,
      });

      // 模擬權杖重新整理失敗
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
          }),
      });

      // 執行權杖重新整理
      const result = await tokenManager.refreshToken();

      // 驗證失敗處理
      expect(result.success).toBe(false);
      expect(result.requiresReauth).toBe(true);

      // 驗證權杖被清除
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['notion_oauth_tokens']);
    });
  });

  describe('API 操作整合測試', () => {
    test('E2E-006: 使用 OAuth 載入資料庫', async () => {
      const mockTokens = {
        access_token: 'valid_access_token',
        refresh_token: 'refresh_token',
        expires_at: Date.now() + 3_600_000,
      };

      const mockDatabases = {
        results: [
          {
            id: 'db1',
            title: [{ plain_text: '測試資料庫 1' }],
            properties: {},
          },
          {
            id: 'db2',
            title: [{ plain_text: '測試資料庫 2' }],
            properties: {},
          },
        ],
      };

      // 模擬有效權杖
      chrome.storage.local.get.mockResolvedValue({
        notion_oauth_tokens: mockTokens,
      });

      // 模擬 Notion API 回應
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDatabases),
      });

      // 執行資料庫載入
      const result = await apiClient.loadDatabases();

      // 驗證結果
      expect(result.success).toBe(true);
      expect(result.databases).toHaveLength(2);
      expect(result.databases[0].title).toBe('測試資料庫 1');

      // 驗證 API 調用使用了正確的授權標頭
      expect(fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/search',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockTokens.access_token}`,
          }),
        })
      );
    });

    test('E2E-007: API 請求中的自動權杖重新整理', async () => {
      const mockExpiredTokens = {
        access_token: 'expired_access_token',
        refresh_token: 'refresh_token',
        expires_at: Date.now() - 1000,
      };

      const mockNewTokens = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600,
      };

      const mockDatabases = {
        results: [{ id: 'db1', title: [{ plain_text: '測試資料庫' }] }],
      };

      // 模擬過期權杖
      chrome.storage.local.get
        .mockResolvedValueOnce({ notion_oauth_tokens: mockExpiredTokens })
        .mockResolvedValueOnce({
          notion_oauth_tokens: { ...mockNewTokens, expires_at: Date.now() + 3_600_000 },
        });

      chrome.storage.local.set.mockResolvedValue();

      // 模擬權杖重新整理和 API 調用
      globalThis.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          // 權杖重新整理
          ok: true,
          json: () => Promise.resolve(mockNewTokens),
        })
        .mockResolvedValueOnce({
          // 資料庫 API 調用
          ok: true,
          json: () => Promise.resolve(mockDatabases),
        });

      // 執行資料庫載入
      const result = await apiClient.loadDatabases();

      // 驗證結果
      expect(result.success).toBe(true);
      expect(result.databases).toHaveLength(1);

      // 驗證權杖重新整理被調用
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.notion.com/v1/oauth/token',
        expect.objectContaining({ method: 'POST' })
      );

      // 驗證資料庫 API 使用新權杖
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.notion.com/v1/search',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockNewTokens.access_token}`,
          }),
        })
      );
    });

    test('E2E-008: API 錯誤處理和回退', async () => {
      const mockTokens = {
        access_token: 'valid_access_token',
        refresh_token: 'refresh_token',
        expires_at: Date.now() + 3_600_000,
      };

      // 模擬有效權杖
      chrome.storage.local.get.mockResolvedValue({
        notion_oauth_tokens: mockTokens,
      });

      // 模擬 API 錯誤
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            code: 'unauthorized',
            message: 'API token is invalid',
          }),
      });

      // 執行資料庫載入
      const result = await apiClient.loadDatabases();

      // 驗證錯誤處理
      expect(result.success).toBe(false);
      expect(result.error).toContain('unauthorized');
      expect(result.requiresReauth).toBe(true);
    });
  });

  describe('遷移流程整合測試', () => {
    test('E2E-009: 從手動 API 金鑰遷移到 OAuth', async () => {
      const mockManualConfig = {
        apiKey: 'secret_manual_api_key',
        databaseId: 'manual_database_id',
      };

      const mockOAuthTokens = {
        access_token: 'oauth_access_token',
        refresh_token: 'oauth_refresh_token',
        expires_in: 3600,
      };

      // 模擬現有手動配置
      chrome.storage.sync.get.mockResolvedValue(mockManualConfig);
      chrome.storage.local.get.mockResolvedValue({});

      // 模擬成功的 OAuth 流程
      chrome.identity.launchWebAuthFlow.mockResolvedValue(
        'chrome-extension://test/oauth-callback.html?code=auth_code&state=test_state'
      );

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOAuthTokens),
      });

      chrome.storage.local.set.mockResolvedValue();

      // 執行遷移
      const migrationDetector = new MigrationDetector();
      const migrationStatus = await migrationDetector.detectMigrationStatus();

      expect(migrationStatus.canMigrate).toBe(true);
      expect(migrationStatus.hasManualSetup).toBe(true);

      // 執行 OAuth 設置
      const oauthResult = await oauthManager.startAuthFlow();

      // 驗證遷移成功
      expect(oauthResult.success).toBe(true);
      expect(oauthResult.tokens).toEqual(mockOAuthTokens);

      // 驗證手動配置被保留作為備份
      expect(chrome.storage.sync.get).toHaveBeenCalled();
    });

    test('E2E-010: 遷移失敗時的回退機制', async () => {
      const mockManualConfig = {
        apiKey: 'secret_manual_api_key',
        databaseId: 'manual_database_id',
      };

      // 模擬現有手動配置
      chrome.storage.sync.get.mockResolvedValue(mockManualConfig);
      chrome.storage.local.get.mockResolvedValue({});

      // 模擬 OAuth 失敗
      chrome.identity.launchWebAuthFlow.mockRejectedValue(new Error('OAuth authorization failed'));

      // 執行遷移嘗試
      const oauthResult = await oauthManager.startAuthFlow();

      // 驗證 OAuth 失敗
      expect(oauthResult.success).toBe(false);

      // 驗證可以回退到手動配置
      const apiClient = new NotionAPIClient();
      const authHeader = await apiClient.getAuthHeader();

      expect(authHeader).toContain(mockManualConfig.apiKey);
    });
  });

  describe('安全性和 PKCE 驗證', () => {
    test('E2E-011: PKCE 流程驗證', async () => {
      // 執行 PKCE 參數生成
      const pkceParams = await oauthManager.generatePKCEParams();

      // 驗證 PKCE 參數格式
      expect(pkceParams.codeVerifier).toMatch(/^[\w.~\-]{43,128}$/);
      expect(pkceParams.codeChallenge).toMatch(/^[\w\-]{43}$/);
      expect(pkceParams.codeChallengeMethod).toBe('S256');

      // 模擬完整的 PKCE 流程
      const mockAuthCode = 'test_auth_code';
      const mockTokens = {
        access_token: 'access_token',
        refresh_token: 'refresh_token',
        expires_in: 3600,
      };

      chrome.identity.launchWebAuthFlow.mockResolvedValue(
        `chrome-extension://test/oauth-callback.html?code=${mockAuthCode}&state=test_state`
      );

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTokens),
      });

      chrome.storage.local.set.mockResolvedValue();

      // 執行授權流程
      const result = await oauthManager.startAuthFlow();

      // 驗證 PKCE 參數被正確使用
      expect(fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/oauth/token',
        expect.objectContaining({
          body: expect.stringContaining('code_verifier'),
        })
      );

      expect(result.success).toBe(true);
    });

    test('E2E-012: 狀態參數 CSRF 保護', async () => {
      // 生成狀態參數
      const state1 = oauthManager.generateState();
      const state2 = oauthManager.generateState();

      // 驗證狀態參數唯一性
      expect(state1).not.toBe(state2);
      expect(state1.length).toBeGreaterThanOrEqual(32);
      expect(state2.length).toBeGreaterThanOrEqual(32);

      // 模擬狀態不匹配的攻擊
      chrome.identity.launchWebAuthFlow.mockResolvedValue(
        'chrome-extension://test/oauth-callback.html?code=auth_code&state=invalid_state'
      );

      // 執行授權流程
      const result = await oauthManager.startAuthFlow();

      // 驗證狀態不匹配被拒絕
      expect(result.success).toBe(false);
      expect(result.error).toContain('state');
    });
  });

  describe('性能和快取測試', () => {
    test('E2E-013: 用戶資料快取性能', () => {
      const mockUserData = {
        id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
      };

      // 測試快取寫入
      const writeStart = performance.now();
      oauthManager.cacheUserData(mockUserData);
      const writeTime = performance.now() - writeStart;

      // 測試快取讀取
      const readStart = performance.now();
      const cachedData = oauthManager.getCachedUserData();
      const readTime = performance.now() - readStart;

      // 驗證性能
      expect(writeTime).toBeLessThan(50); // 50ms 閾值
      expect(readTime).toBeLessThan(10); // 10ms 閾值

      // 驗證資料完整性
      expect(cachedData).toEqual(mockUserData);
    });

    test('E2E-014: 資料庫列表快取', async () => {
      const mockDatabases = [
        { id: 'db1', title: [{ plain_text: '資料庫 1' }] },
        { id: 'db2', title: [{ plain_text: '資料庫 2' }] },
      ];

      // 模擬 API 回應
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: mockDatabases }),
      });

      chrome.storage.local.get.mockResolvedValue({
        notion_oauth_tokens: {
          access_token: 'valid_token',
          expires_at: Date.now() + 3_600_000,
        },
      });

      // 第一次載入（應該調用 API）
      const result1 = await apiClient.loadDatabases();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result1.databases).toHaveLength(2);

      // 第二次載入（應該使用快取）
      const result2 = await apiClient.loadDatabases();
      expect(fetch).toHaveBeenCalledTimes(1); // 沒有額外的 API 調用
      expect(result2.databases).toHaveLength(2);
    });
  });

  describe('錯誤恢復和重試機制', () => {
    test('E2E-015: 網路錯誤重試機制', async () => {
      const mockTokens = {
        access_token: 'valid_token',
        expires_at: Date.now() + 3_600_000,
      };

      chrome.storage.local.get.mockResolvedValue({
        notion_oauth_tokens: mockTokens,
      });

      // 模擬網路錯誤然後成功
      globalThis.fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [] }),
        });

      // 執行 API 調用
      const result = await apiClient.loadDatabases();

      // 驗證重試機制
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });

    test('E2E-016: 最大重試次數限制', async () => {
      const mockTokens = {
        access_token: 'valid_token',
        expires_at: Date.now() + 3_600_000,
      };

      chrome.storage.local.get.mockResolvedValue({
        notion_oauth_tokens: mockTokens,
      });

      // 模擬持續的網路錯誤
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      // 執行 API 調用
      const result = await apiClient.loadDatabases();

      // 驗證最大重試次數
      expect(fetch).toHaveBeenCalledTimes(3); // 最多重試 3 次
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });
});
