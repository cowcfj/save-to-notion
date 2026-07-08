/**
 * @jest-environment jsdom
 */

import {
  createSaveHandlersTestContext,
  getActiveNotionToken,
  normalizeUrl,
  resolveStorageUrl,
  setupDefaultActionMocks,
  validContentScriptSender,
  validSender,
} from './saveHandlers.shared.js';
import {
  buildSavedPageData,
  buildContentScriptSender,
  mockResolvedTabUrlSequence,
  mockSavedPageDataSequence,
  mockRemotePageDeleted,
  mockCleanupSkipped,
} from './saveHandlersTestHarness.js';

describe('saveHandlers status and deletion', () => {
  const context = createSaveHandlersTestContext();

  const setupSavedRemoteDeletedPage = (overrides = {}) => {
    context.mockServices.storageService.getSavedPageData.mockResolvedValue({
      notionPageId: 'page123',
      notionUrl: 'https://notion.so/page123',
      ...overrides,
    });
    context.mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
    context.mockServices.notionService.checkPageExists.mockResolvedValue(false);
  };

  const expectDeletedRemoteResponse = (sendResponse, overrides = {}) => {
    expect(sendResponse).toHaveBeenLastCalledWith(
      expect.objectContaining({
        success: true,
        statusKind: 'deleted_remote',
        isSaved: false,
        wasDeleted: true,
        ...overrides,
      })
    );
  };

  describe('checkPageStatus', () => {
    beforeEach(() => {
      setupDefaultActionMocks(context.mockServices);
      normalizeUrl.mockImplementation(url => url);
      resolveStorageUrl.mockImplementation(url => url);
    });

    test('checkPageStatus: 緩存有效時應直接返回各個狀態', async () => {
      const sendResponse = jest.fn();
      const validCacheTime = Date.now();
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        lastVerifiedAt: validCacheTime,
        title: 'Cached Title',
      });

      await context.handlers.checkPageStatus({}, validSender, sendResponse);

      // Should verify calling checkPageExists is NOT called (cache hit)
      expect(context.mockServices.notionService.checkPageExists).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
    });

    test('checkPageStatus: 緩存過期時應調用 API 檢查', async () => {
      const sendResponse = jest.fn();
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        lastVerifiedAt: 0, // Expired
      });
      context.mockServices.notionService.checkPageExists.mockResolvedValue(true);

      await context.handlers.checkPageStatus({}, validSender, sendResponse);

      expect(context.mockServices.notionService.checkPageExists).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
    });

    test('checkPageStatus: 應接受來自 Content Script (Toolbar) 的請求', async () => {
      const sendResponse = jest.fn();
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        lastVerifiedAt: Date.now(),
        title: 'Test Title',
      });

      await context.handlers.checkPageStatus({}, validContentScriptSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
    });
  });

  describe('Data Migration (Move & Delete)', () => {
    const stableUrl = 'https://example.com/stable';
    const legacyUrl = 'https://example.com/legacy';
    const originalTabUrl = 'https://example.com/legacy';
    const sender = { id: 'mock-extension-id', origin: 'chrome-extension://mock-extension-id' };
    const sendResponse = jest.fn();

    beforeEach(() => {
      normalizeUrl.mockReturnValue(legacyUrl);
      resolveStorageUrl.mockReturnValue(stableUrl);
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: originalTabUrl }]);

      context.mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'db-123',
      });

      // Mock Injection Service default behavior
      context.mockServices.injectionService.injectHighlighter.mockResolvedValue(true);
      context.mockServices.injectionService.collectHighlights.mockResolvedValue([]);

      // Ensure utils return different URLs to trigger migration logic
      resolveStorageUrl.mockReturnValue(stableUrl);
      normalizeUrl.mockReturnValue(legacyUrl);

      // Mock tabService to simulating migration having occurred (returning stableUrl)
      context.mockServices.tabService.resolveTabUrl.mockResolvedValue({
        stableUrl,
        originalUrl: originalTabUrl,
        migrated: true,
      });

      context.mockServices.notionService.checkPageExists.mockResolvedValue(true);

      // Mock MigrationService behavior
      context.mockServices.migrationService.migrateStorageKey.mockImplementation(
        async (stable, legacy) => {
          return stable === stableUrl && legacy === legacyUrl;
        }
      );

      // Mock Storage: stable -> data (reflecting post-migration state)
      context.mockServices.storageService.getSavedPageData.mockImplementation(key => {
        if (key === stableUrl) {
          return Promise.resolve({
            notionPageId: 'legacy-id-123',
            title: 'Legacy Title',
            lastVerifiedAt: Date.now(),
            destinationProfileId: 'default',
          });
        }
        return Promise.resolve(null);
      });
    });

    test('checkPageStatus: 應檢測到舊數據並遷移至新 Key', async () => {
      await context.handlers.checkPageStatus({}, sender, sendResponse);

      // Expect MigrationService to be called
      // Expect MigrationService to be called (via tabService.resolveTabUrl)
      expect(context.mockServices.tabService.resolveTabUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        context.mockServices.migrationService
      );

      // Respond with migrated data (which comes from getSavedPageData after migration)
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          isSaved: true,
          notionPageId: 'legacy-id-123',
        })
      );
    });

    test('savePage: 保存流程中也應觸發遷移', async () => {
      context.mockServices.pageContentService.extractContent.mockResolvedValue({
        extractionStatus: 'success',
        title: 'Legacy Title',
        blocks: [],
      });

      await context.handlers.savePage({}, sender, sendResponse);

      expect(context.mockServices.tabService.resolveTabUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        context.mockServices.migrationService
      );

      // Should continue to refresh content for existing page
      expect(context.mockServices.notionService.refreshPageContent).toHaveBeenCalled();
    });
  });

  describe('Notion Page Deletion Handling', () => {
    beforeEach(() => {
      normalizeUrl.mockImplementation(url => url);
      resolveStorageUrl.mockImplementation(url => url);
    });

    it('checkPageStatus 第一次 false 應標記 deletionPending 並保留已保存狀態', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id', tab: { id: 1 } };
      const rawUrl = 'https://example.com';

      setupSavedRemoteDeletedPage();

      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(context.mockServices.tabService.consumeDeletionConfirmation).toHaveBeenCalledWith(
        'page123',
        false
      );
      expect(context.mockServices.storageService.clearNotionStateWithRetry).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          statusKind: 'deletion_pending',
          isSaved: true,
          deletionPending: true,
        })
      );
    });

    it('checkPageStatus 連續第二次 false 才應清理本地狀態', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id', tab: { id: 1 } };
      const rawUrl = 'https://example.com';

      setupSavedRemoteDeletedPage();

      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(context.mockServices.tabService.consumeDeletionConfirmation).toHaveBeenCalledTimes(2);
      expect(context.mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          source: 'SaveStatusCoordinator.resolve',
          expectedPageId: 'page123',
        })
      );
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
      expectDeletedRemoteResponse(sendResponse);
    });

    it('checkPageStatus cleanup failure 不應外露，仍應維持 deleted state', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id', tab: { id: 1 } };
      const rawUrl = 'https://example.com';

      setupSavedRemoteDeletedPage();
      context.mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
        cleared: false,
        attempts: 2,
        error: new Error('storage failure'),
      });

      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expectDeletedRemoteResponse(sendResponse);
      expect(sendResponse).not.toHaveBeenLastCalledWith(
        expect.objectContaining({
          success: false,
          error: '清除本地 Notion 狀態失敗',
        })
      );
      expect(context.mockServices.tabService.consumeDeletionConfirmation).toHaveBeenCalledTimes(2);
      expect(context.mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledWith(
        'page123'
      );
      expect(context.mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledTimes(1);
      expect(Logger.error).toHaveBeenCalledWith(
        '清理本地 notion 狀態失敗，維持 deleted_remote 對外狀態',
        expect.objectContaining({
          action: 'checkPageStatus',
          attempts: 2,
          error: expect.any(Object),
        })
      );
    });

    it('checkPageStatus cleanup skipped 時不應回報 wasDeleted，應保留最新已保存狀態', async () => {
      const sendResponse = jest.fn();
      const rawUrl = 'https://www.rapbull.net/posts/2928/long-slug/';
      const stableUrl = 'https://www.rapbull.net/?p=2928';
      const sender = buildContentScriptSender({
        tab: { id: 1, url: rawUrl },
      });

      mockResolvedTabUrlSequence(context.mockServices.tabService, [
        { stableUrl: rawUrl, hasStableUrl: false },
        { stableUrl: rawUrl, hasStableUrl: false },
        { stableUrl, hasStableUrl: true },
      ]);

      mockSavedPageDataSequence(context.mockServices.storageService, [
        { notionPageId: 'page123', title: 'Old Title' },
        { notionPageId: 'page123', title: 'Old Title' },
        { notionPageId: 'page456', title: 'New Title' },
      ]);

      context.mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockRemotePageDeleted(context.mockServices.notionService);
      mockCleanupSkipped(context.mockServices.storageService, { reason: 'pageId_mismatch' });

      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(context.mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        rawUrl,
        expect.objectContaining({
          source: 'SaveStatusCoordinator.resolve',
          expectedPageId: 'page123',
        })
      );
      expect(sendResponse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          success: true,
          statusKind: 'saved',
          isSaved: true,
          notionPageId: 'page456',
          notionUrl: 'https://notion.so/page456',
          stableUrl,
        })
      );
      expect(sendResponse).not.toHaveBeenLastCalledWith(
        expect.objectContaining({
          wasDeleted: true,
        })
      );
      expect(context.mockServices.tabService.consumeDeletionConfirmation).toHaveBeenCalledTimes(2);
    });

    it('checkPageStatus 刪除確認時應保留原 cleanup key，並以重新解析的 stableUrl 回應', async () => {
      const sendResponse = jest.fn();
      const rawUrl = 'https://www.rapbull.net/posts/2928/long-slug/';
      const stableUrl = 'https://www.rapbull.net/?p=2928';
      const sender = {
        id: 'mock-extension-id',
        tab: { id: 1, url: rawUrl },
      };

      context.mockServices.tabService.resolveTabUrl
        .mockResolvedValueOnce({
          stableUrl: rawUrl,
          originalUrl: rawUrl,
          migrated: false,
          hasStableUrl: false,
        })
        .mockResolvedValueOnce({
          stableUrl: rawUrl,
          originalUrl: rawUrl,
          migrated: false,
          hasStableUrl: false,
        })
        .mockResolvedValueOnce({
          stableUrl,
          originalUrl: rawUrl,
          migrated: false,
          hasStableUrl: true,
        });
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page123',
        notionUrl: 'https://notion.so/page123',
        title: 'Zombie Ass',
        lastVerifiedAt: 0,
      });
      context.mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      context.mockServices.notionService.checkPageExists.mockResolvedValue(false);

      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(context.mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        rawUrl,
        expect.objectContaining({
          source: 'SaveStatusCoordinator.resolve',
          expectedPageId: 'page123',
        })
      );
      expectDeletedRemoteResponse(sendResponse, { stableUrl });
    });

    it('checkPageStatus 重新解析 cleanup URL 失敗時應記錄原始 Error 並回退既有路徑', async () => {
      const sendResponse = jest.fn();
      const rawUrl = 'https://www.rapbull.net/posts/2928/long-slug/';
      const refreshError = new Error('refresh stable url failed');
      const sender = {
        id: 'mock-extension-id',
        tab: { id: 1, url: rawUrl },
      };

      context.mockServices.tabService.resolveTabUrl
        .mockResolvedValueOnce({
          stableUrl: rawUrl,
          originalUrl: rawUrl,
          migrated: false,
          hasStableUrl: false,
        })
        .mockResolvedValueOnce({
          stableUrl: rawUrl,
          originalUrl: rawUrl,
          migrated: false,
          hasStableUrl: false,
        })
        .mockRejectedValueOnce(refreshError);
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page123',
        notionUrl: 'https://notion.so/page123',
        title: 'Zombie Ass',
        lastVerifiedAt: 0,
      });
      context.mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      context.mockServices.notionService.checkPageExists.mockResolvedValue(false);

      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(context.mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        rawUrl,
        expect.objectContaining({
          source: 'SaveStatusCoordinator.resolve',
          expectedPageId: 'page123',
        })
      );
      expect(Logger.warn).toHaveBeenCalledWith(
        '重新解析刪除清理 URL 失敗，回退至既有路徑',
        expect.objectContaining({
          action: 'checkPageStatus',
          operation: 'resolveDeletionCleanupUrl',
          url: expect.any(String),
          error: refreshError,
        })
      );
      expectDeletedRemoteResponse(sendResponse, { stableUrl: rawUrl });
    });

    it('checkPageStatus 在 cleanup 後再次查詢，仍應保持未保存狀態', async () => {
      const sendResponse = jest.fn();
      const rawUrl = 'https://www.rapbull.net/posts/2928/long-slug/';
      const stableUrl = 'https://www.rapbull.net/?p=2928';
      const sender = {
        id: 'mock-extension-id',
        tab: { id: 1, url: rawUrl },
      };

      context.mockServices.tabService.resolveTabUrl
        .mockResolvedValueOnce({
          stableUrl: rawUrl,
          originalUrl: rawUrl,
          migrated: false,
          hasStableUrl: false,
        })
        .mockResolvedValueOnce({
          stableUrl: rawUrl,
          originalUrl: rawUrl,
          migrated: false,
          hasStableUrl: false,
        })
        .mockResolvedValueOnce({
          stableUrl,
          originalUrl: rawUrl,
          migrated: false,
          hasStableUrl: true,
        })
        .mockResolvedValueOnce({
          stableUrl,
          originalUrl: rawUrl,
          migrated: false,
          hasStableUrl: true,
        });

      context.mockServices.storageService.getSavedPageData
        .mockResolvedValueOnce(buildSavedPageData({ title: 'Zombie Ass', lastVerifiedAt: 0 }))
        .mockResolvedValueOnce(buildSavedPageData({ title: 'Zombie Ass', lastVerifiedAt: 0 }))
        .mockResolvedValueOnce(null);
      context.mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      context.mockServices.notionService.checkPageExists
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);
      context.mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
        cleared: true,
        attempts: 1,
      });

      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await context.handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(context.mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        rawUrl,
        expect.objectContaining({
          source: 'SaveStatusCoordinator.resolve',
          expectedPageId: 'page-123',
        })
      );
      expect(sendResponse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          success: true,
          statusKind: 'unsaved',
          isSaved: false,
          stableUrl,
        })
      );
    });

    it('checkPageStatus 應該在 checkPageExists 返回 null 時重試', async () => {
      const savedData = { notionPageId: 'page1', notionUrl: 'url1', title: 'Title1' };
      context.mockServices.storageService.getSavedPageData.mockResolvedValue(savedData);
      context.mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });

      // 第一次返回 null，第二次返回 true
      context.mockServices.notionService.checkPageExists
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(true);

      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };
      await context.handlers.checkPageStatus({ url: 'https://example.com' }, sender, sendResponse);

      expect(context.mockServices.notionService.checkPageExists).toHaveBeenCalledTimes(2);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('checkPageStatus 應該處理一般錯誤', async () => {
      context.mockServices.storageService.getSavedPageData.mockRejectedValue(
        new Error('Fatal Error')
      );
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };
      await context.handlers.checkPageStatus({ url: 'https://example.com' }, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('savePage 應在發生意外時返回錯誤', async () => {
      chrome.tabs.query.mockRejectedValue(new Error('Query failed'));
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' }; // Valid sender ensures validation passes
      await context.handlers.savePage({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('checkPageStatus 應該在缺少可用 token 時返回已保存但不執行檢查', async () => {
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page123',
        lastVerifiedAt: Date.now() - 1_000_000, // 過期了
      });
      getActiveNotionToken.mockResolvedValueOnce({ token: null, mode: null });
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };
      await context.handlers.checkPageStatus({ url: 'https://example.com' }, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
      expect(context.mockServices.notionService.checkPageExists).not.toHaveBeenCalled();
    });

    it('checkPageStatus 應該在 forceRefresh 為 true 時執行檢查', async () => {
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page123',
        lastVerifiedAt: Date.now(), // 雖然未過期
      });
      context.mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key' });
      context.mockServices.notionService.checkPageExists.mockResolvedValue(true);
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };
      await context.handlers.checkPageStatus(
        { url: 'https://example.com', forceRefresh: true },
        sender,
        sendResponse
      );

      expect(context.mockServices.notionService.checkPageExists).toHaveBeenCalled();
    });
  });
});
