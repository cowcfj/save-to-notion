/**
 * @jest-environment jsdom
 */

import { createSaveHandlers } from '../../../../scripts/background/handlers/saveHandlers.js';
import { ERROR_MESSAGES } from '../../../../scripts/config/shared/messages.js';
import { isRestrictedInjectionUrl } from '../../../../scripts/background/services/InjectionService.js';
import {
  validateInternalRequest,
  isValidNotionUrl,
} from '../../../../scripts/utils/securityUtils.js';
import { normalizeUrl, resolveStorageUrl } from '../../../../scripts/utils/urlUtils.js';
import { getActiveNotionToken, ensureNotionApiKey } from '../../../../scripts/utils/notionAuth.js';
import { buildSavedPageData } from '../../../helpers/status-fixtures.js';

jest.mock('../../../../scripts/background/services/InjectionService.js', () => ({
  isRestrictedInjectionUrl: jest.fn(),
}));

jest.mock('../../../../scripts/utils/securityUtils.js', () => {
  const original = jest.requireActual('../../../../scripts/utils/securityUtils.js');
  return {
    __esModule: true,
    ...original,
    validateInternalRequest: jest.fn(original.validateInternalRequest),
    isValidNotionUrl: jest.fn(original.isValidNotionUrl),
  };
});

jest.mock('../../../../scripts/utils/urlUtils.js', () => ({
  __esModule: true,
  normalizeUrl: jest.fn(url => url), // Default identity
  resolveStorageUrl: jest.fn(url => url), // Default identity
}));

jest.mock('../../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken: jest.fn(),
  ensureNotionApiKey: jest.fn(),
}));

jest.mock('../../../../scripts/utils/ErrorHandler.js', () => ({
  __esModule: true,
  ErrorHandler: {
    formatUserMessage: jest.fn(msg => msg),
  },
}));

describe('saveHandlers', () => {
  let handlers = null;
  let mockServices = null;

  beforeEach(() => {
    jest.clearAllMocks();
    getActiveNotionToken.mockResolvedValue({ token: 'valid-key', mode: 'manual' });
    ensureNotionApiKey.mockResolvedValue('valid-key');
    const deletionPendingPages = new Map();
    mockServices = {
      notionService: {
        checkPageExists: jest.fn(),
        createPage: jest.fn(),
        buildPageData: jest.fn(),
        updateHighlightsSection: jest.fn(),
        refreshPageContent: jest.fn(),
      },
      storageService: {
        getConfig: jest.fn(),
        getSavedPageData: jest.fn(),
        setSavedPageData: jest.fn(),
        clearPageState: jest.fn(),
        clearNotionState: jest.fn(),
        clearNotionStateWithRetry: jest.fn().mockResolvedValue({ cleared: true, attempts: 1 }),
        setUrlAlias: jest.fn().mockResolvedValue(),
      },
      injectionService: {
        injectHighlighter: jest.fn(),
        collectHighlights: jest.fn(),
        inject: jest.fn(),
      },
      pageContentService: {
        extractContent: jest.fn(),
      },
      tabService: {
        getPreloaderData: jest.fn().mockResolvedValue(null),
        confirmRemotePageMissing: jest.fn().mockImplementation(notionPageId => {
          const pageId = notionPageId ? String(notionPageId) : null;
          if (!pageId) {
            return { shouldDelete: false, deletionPending: false };
          }

          if (deletionPendingPages.has(pageId)) {
            deletionPendingPages.delete(pageId);
            return { shouldDelete: true, deletionPending: false };
          }

          deletionPendingPages.set(pageId, Date.now());
          return { shouldDelete: false, deletionPending: true };
        }),
        resetRemotePageMissingState: jest.fn().mockImplementation(notionPageId => {
          const pageId = notionPageId ? String(notionPageId) : null;
          if (pageId) {
            deletionPendingPages.delete(pageId);
          }
          return { shouldDelete: false, deletionPending: false };
        }),
        consumeDeletionConfirmation: jest.fn().mockImplementation((notionPageId, exists) => {
          const pageId = notionPageId ? String(notionPageId) : null;
          if (!pageId) {
            return { shouldDelete: false, deletionPending: false };
          }

          if (exists !== false) {
            deletionPendingPages.delete(pageId);
            return { shouldDelete: false, deletionPending: false };
          }

          if (deletionPendingPages.has(pageId)) {
            deletionPendingPages.delete(pageId);
            return { shouldDelete: true, deletionPending: false };
          }

          deletionPendingPages.set(pageId, Date.now());
          return { shouldDelete: false, deletionPending: true };
        }),
        resolveTabUrl: jest.fn().mockImplementation((_tabId, url) =>
          Promise.resolve({
            stableUrl: url,
            originalUrl: url,
            migrated: false,
          })
        ),
      },
      migrationService: {
        migrateStorageKey: jest.fn(),
        executeContentMigration: jest.fn(),
      },
      destinationProfileResolver: {
        resolveProfileForSave: jest.fn().mockResolvedValue({
          id: 'default',
          name: 'Default',
          notionDataSourceId: 'db-123',
          notionDataSourceType: 'database',
        }),
        setLastUsedProfile: jest.fn().mockResolvedValue(),
      },
    };
    handlers = createSaveHandlers(mockServices);
  });

  describe('Security Checks', () => {
    test('savePage 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.savePage({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('openNotionPage 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.openNotionPage({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('checkNotionPageExists 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.checkNotionPageExists({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('checkPageStatus 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.checkPageStatus({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    it('checkNotionPageExists 應該處理意外錯誤', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };
      ensureNotionApiKey.mockRejectedValueOnce(new Error('Fatal'));

      await handlers.checkNotionPageExists({ pageId: 'page1' }, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.any(String) })
      );
    });

    test('devLogSink 應拒絕非 Content Script 請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id', url: 'https://evil.com' };
      await handlers.devLogSink({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });
  });

  describe('Action Logic', () => {
    // Shared setup for action tests
    const validSender = {
      id: 'mock-extension-id',
      origin: 'chrome-extension://mock-extension-id',
    };
    const validContentScriptSender = {
      id: 'mock-extension-id',
      tab: { id: 1 },
      url: 'https://example.com',
    };

    beforeEach(() => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      // Default config
      mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'db-123',
      });
      // Default extraction result
      mockServices.pageContentService.extractContent.mockResolvedValue({
        extractionStatus: 'success',
        title: 'Test Page',
        blocks: [],
      });
      // Default highlights
      mockServices.injectionService.collectHighlights.mockResolvedValue([]);
      // Default buildPageData
      mockServices.notionService.buildPageData.mockReturnValue({
        pageData: {},
        validBlocks: [],
      });
    });

    // ===== checkNotionPageExists Tests =====
    test('checkNotionPageExists 應在合法請求時調用 service', async () => {
      const sendResponse = jest.fn();
      mockServices.notionService.checkPageExists.mockResolvedValue(true);

      await handlers.checkNotionPageExists({ pageId: 'page1' }, validSender, sendResponse);

      expect(mockServices.notionService.checkPageExists).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, exists: true })
      );
    });

    test('checkNotionPageExists 缺少 pageId 時應返回錯誤', async () => {
      const sendResponse = jest.fn();

      await handlers.checkNotionPageExists({}, validSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
      expect(mockServices.notionService.checkPageExists).not.toHaveBeenCalled();
    });

    // ===== savePage Tests =====
    test('savePage: 新頁面應創建成功', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue(null); // No saved data
      mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      await handlers.savePage({}, validSender, sendResponse);

      expect(mockServices.storageService.getConfig).toHaveBeenCalled();
      expect(mockServices.injectionService.injectHighlighter).toHaveBeenCalled();
      expect(mockServices.pageContentService.extractContent).toHaveBeenCalled();
      expect(mockServices.notionService.createPage).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          created: true,
          destinationProfileId: 'default',
          destinationProfileName: 'Default',
        })
      );
      expect(mockServices.storageService.setSavedPageData).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ destinationProfileId: 'default' })
      );
      expect(mockServices.destinationProfileResolver.setLastUsedProfile).toHaveBeenCalledWith(
        'default'
      );
    });

    test('savePage: payload 帶 profileId 時應使用該 profile 的 Notion target', async () => {
      const sendResponse = jest.fn();
      mockServices.destinationProfileResolver.resolveProfileForSave.mockResolvedValue({
        id: 'profile-2',
        name: 'Research',
        notionDataSourceId: 'research-target',
        notionDataSourceType: 'page',
      });
      mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      await handlers.savePage({ profileId: 'profile-2' }, validSender, sendResponse);

      expect(mockServices.destinationProfileResolver.resolveProfileForSave).toHaveBeenCalledWith(
        'profile-2'
      );
      expect(mockServices.notionService.buildPageData).toHaveBeenCalledWith(
        expect.objectContaining({
          dataSourceId: 'research-target',
          dataSourceType: 'page',
        })
      );
      expect(mockServices.storageService.setSavedPageData).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ destinationProfileId: 'profile-2' })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          destinationProfileId: 'profile-2',
          destinationProfileName: 'Research',
        })
      );
    });

    test('savePage: profile 不存在時應回傳目的地錯誤且不提取內容', async () => {
      const sendResponse = jest.fn();
      mockServices.destinationProfileResolver.resolveProfileForSave.mockRejectedValue(
        new Error('Destination profile not found')
      );

      await handlers.savePage({ profileId: 'missing' }, validSender, sendResponse);

      expect(mockServices.pageContentService.extractContent).not.toHaveBeenCalled();
      expect(mockServices.notionService.createPage).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('保存目的地'),
        })
      );
    });

    test('savePage: destinationProfileResolver 缺失時應回傳明確錯誤', async () => {
      const sendResponse = jest.fn();
      handlers = createSaveHandlers({
        ...mockServices,
        destinationProfileResolver: null,
      });

      await handlers.savePage({}, validSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
      expect(mockServices.pageContentService.extractContent).not.toHaveBeenCalled();
    });

    test('savePage: 已保存頁改存到另一個 profile 時應建立新 Notion page', async () => {
      const sendResponse = jest.fn();
      mockServices.destinationProfileResolver.resolveProfileForSave.mockResolvedValue({
        id: 'profile-2',
        name: 'Research',
        notionDataSourceId: 'research-target',
        notionDataSourceType: 'page',
      });
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'existing-id',
        notionUrl: 'https://notion.so/existing-id',
        destinationProfileId: 'default',
      });
      mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      await handlers.savePage({ profileId: 'profile-2' }, validSender, sendResponse);

      expect(mockServices.notionService.checkPageExists).not.toHaveBeenCalled();
      expect(mockServices.notionService.createPage).toHaveBeenCalled();
      expect(mockServices.storageService.setSavedPageData).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          notionPageId: 'new-page-id',
          destinationProfileId: 'profile-2',
        })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, created: true, destinationProfileId: 'profile-2' })
      );
    });

    test('savePage: legacy 已保存頁缺少 destinationProfileId 且改存 profile 時應建立新 Notion page', async () => {
      const sendResponse = jest.fn();
      mockServices.destinationProfileResolver.resolveProfileForSave.mockResolvedValue({
        id: 'profile-2',
        name: 'Research',
        notionDataSourceId: 'research-target',
        notionDataSourceType: 'page',
      });
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'existing-id',
        notionUrl: 'https://notion.so/existing-id',
      });
      mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      await handlers.savePage({ profileId: 'profile-2' }, validSender, sendResponse);

      expect(mockServices.notionService.checkPageExists).not.toHaveBeenCalled();
      expect(mockServices.notionService.createPage).toHaveBeenCalled();
      expect(mockServices.storageService.setSavedPageData).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          notionPageId: 'new-page-id',
          destinationProfileId: 'profile-2',
        })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, created: true, destinationProfileId: 'profile-2' })
      );
    });

    test('savePage: legacy data source key 缺失時仍應使用 destination profile target 保存', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
      });
      mockServices.destinationProfileResolver.resolveProfileForSave.mockResolvedValue({
        id: 'profile-2',
        name: 'Research',
        notionDataSourceId: 'research-target',
        notionDataSourceType: 'page',
      });
      mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      await handlers.savePage({ profileId: 'profile-2' }, validSender, sendResponse);

      expect(mockServices.destinationProfileResolver.resolveProfileForSave).toHaveBeenCalledWith(
        'profile-2'
      );
      expect(mockServices.pageContentService.extractContent).toHaveBeenCalled();
      expect(mockServices.notionService.buildPageData).toHaveBeenCalledWith(
        expect.objectContaining({
          dataSourceId: 'research-target',
          dataSourceType: 'page',
        })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, created: true, destinationProfileId: 'profile-2' })
      );
    });

    test('savePage: profile 解析失敗時不應暴露 raw error message', async () => {
      const sendResponse = jest.fn();
      mockServices.destinationProfileResolver.resolveProfileForSave.mockRejectedValue(
        new Error('internal worker stack: token exchange failed')
      );

      await handlers.savePage({ profileId: 'missing' }, validSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
      const response = sendResponse.mock.calls.at(-1)[0];
      expect(response.error).toContain('保存目的地');
      expect(response.error).not.toContain('internal worker stack');
      expect(response.error).not.toContain('token exchange failed');
    });

    test('savePage: 提取結果為 failed 時不應建立 Notion 頁面', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      mockServices.pageContentService.extractContent.mockResolvedValue({
        extractionStatus: 'failed',
        title: 'Protected Page',
        blocks: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: 'Extraction failed. The page may be empty or protected.' },
                },
              ],
            },
          },
        ],
        error: 'Content extraction failed',
      });

      await handlers.savePage({}, validSender, sendResponse);

      expect(mockServices.notionService.createPage).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
    });

    test('savePage: notionDataSourceType=data_source 應正規化為 database 並傳遞給 buildPageData', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'ds-123',
        notionDataSourceType: 'data_source',
      });
      mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      await handlers.savePage({}, validSender, sendResponse);

      expect(mockServices.notionService.buildPageData).toHaveBeenCalledWith(
        expect.objectContaining({ dataSourceType: 'database' })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, created: true })
      );
    });

    test('savePage: 無效 notionDataSourceType 應回退為 database', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'db-123',
        notionDataSourceType: 'invalid_type',
      });
      mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      await handlers.savePage({}, validSender, sendResponse);

      expect(mockServices.notionService.buildPageData).toHaveBeenCalledWith(
        expect.objectContaining({ dataSourceType: 'database' })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, created: true })
      );
    });

    test('savePage: 當 stableUrl 與 originalUrl 不同時應設定 alias', async () => {
      const sendResponse = jest.fn();
      const stableUrl = 'https://example.com/stable';
      const originalUrl = 'https://example.com/original';

      mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      // 模擬 resolveTabUrl 返回不一致的 URL
      mockServices.tabService.resolveTabUrl.mockResolvedValue({
        stableUrl,
        originalUrl,
        migrated: false,
      });

      await handlers.savePage({}, validSender, sendResponse);

      expect(mockServices.storageService.setUrlAlias).toHaveBeenCalledWith(originalUrl, stableUrl);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, created: true })
      );
    });

    test('savePage: 已有頁面且有新標註，應更新標註', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'existing-id',
        destinationProfileId: 'default',
      });
      mockServices.notionService.checkPageExists.mockResolvedValue(true);
      mockServices.injectionService.collectHighlights.mockResolvedValue([{ text: 'highlight' }]);
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.savePage({}, validSender, sendResponse);

      expect(mockServices.notionService.updateHighlightsSection).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ highlightsUpdated: true })
      );
    });

    test('savePage: 已有頁面且無新標註，應刷新內容', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'existing-id',
        destinationProfileId: 'default',
      });
      mockServices.notionService.checkPageExists.mockResolvedValue(true);
      mockServices.injectionService.collectHighlights.mockResolvedValue([]); // No highlights
      mockServices.notionService.refreshPageContent.mockResolvedValue({ success: true });

      await handlers.savePage({}, validSender, sendResponse);

      expect(mockServices.notionService.refreshPageContent).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ updated: true }));
    });

    test('savePage: pageExists 連續兩次 false 才應清理並重建', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'existing-id',
        notionUrl: 'https://notion.so/existing-id',
        destinationProfileId: 'default',
      });
      mockServices.notionService.checkPageExists.mockResolvedValue(false);
      mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page-id',
      });

      await handlers.savePage({}, validSender, sendResponse);
      expect(mockServices.storageService.clearNotionStateWithRetry).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenLastCalledWith(
        expect.objectContaining({ success: false, deletionPending: true })
      );

      await handlers.savePage({}, validSender, sendResponse);
      expect(mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          source: 'saveHandlers._handlePageRecreation',
          expectedPageId: 'existing-id',
        })
      );
      expect(mockServices.notionService.createPage).toHaveBeenCalled();
    });

    describe('savePage cleanup failure handling', () => {
      const setupCleanupFailureRecreateFlow = () => {
        mockServices.storageService.getSavedPageData.mockResolvedValue({
          notionPageId: 'existing-id',
          notionUrl: 'https://notion.so/existing-id',
          destinationProfileId: 'default',
        });
        mockServices.notionService.checkPageExists.mockResolvedValue(false);
        mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
          cleared: false,
          attempts: 2,
          error: new Error('storage failure'),
        });
      };

      test('cleanup failure 不應外露，create 成功時仍應回傳重建成功', async () => {
        const sendResponse = jest.fn();
        setupCleanupFailureRecreateFlow();
        mockServices.notionService.createPage.mockResolvedValue({
          success: true,
          pageId: 'new-page-id',
          url: 'https://notion.so/new-page-id',
        });

        await handlers.savePage({}, validSender, sendResponse);
        await handlers.savePage({}, validSender, sendResponse);

        expect(sendResponse).toHaveBeenLastCalledWith(
          expect.objectContaining({
            success: true,
            recreated: true,
          })
        );
        expect(sendResponse).not.toHaveBeenLastCalledWith(
          expect.objectContaining({
            success: false,
            error: '清除本地 Notion 狀態失敗',
          })
        );
        expect(mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledWith(
          'existing-id'
        );
        expect(mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledTimes(3);
        expect(Logger.error).toHaveBeenCalledWith(
          '重建頁面前清除本地 Notion 狀態失敗，改以內部自癒處理',
          expect.objectContaining({
            action: 'recreatePage',
            operation: 'clearNotionStateWithCanonicalPath',
            url: expect.any(String),
            attempts: 2,
            error: expect.any(Object),
          })
        );
      });

      test('cleanup failure 不應覆蓋真正的 createPage 錯誤', async () => {
        const sendResponse = jest.fn();
        setupCleanupFailureRecreateFlow();
        mockServices.notionService.createPage.mockResolvedValue({
          success: false,
          error: 'create_failed',
        });

        await handlers.savePage({}, validSender, sendResponse);
        await handlers.savePage({}, validSender, sendResponse);

        expect(sendResponse).toHaveBeenLastCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.stringContaining('create_failed'),
          })
        );
        expect(sendResponse).not.toHaveBeenLastCalledWith(
          expect.objectContaining({
            error: '清除本地 Notion 狀態失敗',
          })
        );
        expect(mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledWith(
          'existing-id'
        );
        expect(mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledTimes(3);
        expect(Logger.error).toHaveBeenCalledWith(
          '重建頁面前清除本地 Notion 狀態失敗，改以內部自癒處理',
          expect.objectContaining({
            action: 'recreatePage',
            operation: 'clearNotionStateWithCanonicalPath',
            url: expect.any(String),
            attempts: 2,
            error: expect.any(Object),
          })
        );
      });

      test('cleanup skipped 時不應繼續重建新頁面', async () => {
        const sendResponse = jest.fn();
        mockServices.storageService.getSavedPageData.mockResolvedValue({
          notionPageId: 'existing-id',
          notionUrl: 'https://notion.so/existing-id',
          destinationProfileId: 'default',
        });
        mockServices.notionService.checkPageExists.mockResolvedValue(false);
        mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
          cleared: false,
          skipped: true,
          reason: 'pageId_mismatch',
          attempts: 1,
          recovered: false,
        });

        await handlers.savePage({}, validSender, sendResponse);
        await handlers.savePage({}, validSender, sendResponse);

        expect(mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
          'https://example.com',
          expect.objectContaining({
            source: 'saveHandlers._handlePageRecreation',
            expectedPageId: 'existing-id',
          })
        );
        expect(mockServices.notionService.createPage).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenLastCalledWith(
          expect.objectContaining({
            success: false,
            error: ERROR_MESSAGES.USER_MESSAGES.CHECK_PAGE_EXISTENCE_FAILED,
          })
        );
      });
    });

    // ===== openNotionPage Tests =====
    test('openNotionPage: 應該成功打開已保存的 Notion 頁面', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page-123',
      });
      // Mock chrome.tabs.create callback
      chrome.tabs.create.mockImplementation((opts, callback) => {
        // Support callback style
        if (callback) {
          callback({ id: 99 });
        }
        // Support Promise style
        return Promise.resolve({ id: 99 });
      });

      await handlers.openNotionPage({ url: 'https://example.com' }, validSender, sendResponse);

      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://notion.so/page-123' })
      );
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('openNotionPage: 缺少 url 時應返回錯誤', async () => {
      const sendResponse = jest.fn();

      await handlers.openNotionPage({}, validSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
      expect(mockServices.storageService.getSavedPageData).not.toHaveBeenCalled();
    });

    test('openNotionPage: 缺少 notionUrl 時應生成 URL，若非法則拒絕打開', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'abcd-1234',
        notionUrl: null,
      });

      isValidNotionUrl.mockReturnValueOnce(false);

      await handlers.openNotionPage({ url: 'https://example.com' }, validSender, sendResponse);

      expect(isValidNotionUrl).toHaveBeenCalledWith('https://www.notion.so/abcd1234');
      expect(chrome.tabs.create).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
    });

    test('openNotionPage: 打開分頁失敗時應返回錯誤', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page-123',
      });
      chrome.tabs.create.mockRejectedValue(new Error('Create tab failed'));
      isValidNotionUrl.mockReturnValueOnce(true);

      await handlers.openNotionPage({ url: 'https://example.com' }, validSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
    });

    test('SAVE_PAGE_FROM_TOOLBAR: 內部錯誤時應返回錯誤', async () => {
      const sendResponse = jest.fn();

      mockServices.pageContentService.extractContent.mockRejectedValue(new Error('Toolbar failed'));

      await handlers.SAVE_PAGE_FROM_TOOLBAR({}, validContentScriptSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
    });

    test('SAVE_PAGE_FROM_TOOLBAR: 不應讀取 request.profileId 覆寫保存目標', async () => {
      const sendResponse = jest.fn();
      const toolbarSender = {
        ...validContentScriptSender,
        tab: { id: 1, url: 'https://example.com' },
      };
      mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      await handlers.SAVE_PAGE_FROM_TOOLBAR(
        { profileId: 'malicious-profile' },
        toolbarSender,
        sendResponse
      );

      expect(mockServices.destinationProfileResolver.resolveProfileForSave).toHaveBeenCalledWith(
        undefined
      );
      expect(mockServices.storageService.setSavedPageData).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ destinationProfileId: 'default' })
      );
    });

    // ===== checkPageStatus Tests =====
    test('checkPageStatus: 緩存有效時應直接返回各個狀態', async () => {
      const sendResponse = jest.fn();
      const validCacheTime = Date.now();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        lastVerifiedAt: validCacheTime,
        title: 'Cached Title',
      });

      await handlers.checkPageStatus({}, validSender, sendResponse);

      // Should verify calling checkPageExists is NOT called (cache hit)
      expect(mockServices.notionService.checkPageExists).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
    });

    test('checkPageStatus: 緩存過期時應調用 API 檢查', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        lastVerifiedAt: 0, // Expired
      });
      mockServices.notionService.checkPageExists.mockResolvedValue(true);

      await handlers.checkPageStatus({}, validSender, sendResponse);

      expect(mockServices.notionService.checkPageExists).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
    });

    test('checkPageStatus: 應接受來自 Content Script (Toolbar) 的請求', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        lastVerifiedAt: Date.now(),
        title: 'Test Title',
      });

      await handlers.checkPageStatus({}, validContentScriptSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
    });

    // ===== devLogSink Tests (Positive) =====
    test('devLogSink: 應接受來自合法 content script 的請求並記錄日誌', () => {
      const sendResponse = jest.fn();
      const logData = { level: 'info', message: 'Test message from content script' };

      handlers.devLogSink(logData, validContentScriptSender, sendResponse);

      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('[ClientLog] Test message'));
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('devLogSink Log Level Validation', () => {
    const validSender = {
      id: 'mock-extension-id',
      tab: { id: 1 },
      url: 'https://example.com',
    };

    test('should use correct log level when valid', () => {
      const levels = ['log', 'info', 'warn', 'error', 'debug'];
      levels.forEach(level => {
        handlers.devLogSink({ level, message: 'test' }, validSender, jest.fn());
        expect(Logger[level]).toHaveBeenCalledWith(expect.stringContaining('[ClientLog] test'));
      });
    });

    test('should fallback to log for invalid level', () => {
      handlers.devLogSink({ level: 'invalid', message: 'test' }, validSender, jest.fn());
      expect(Logger.log).toHaveBeenCalledWith(expect.stringContaining('[ClientLog] test'));
    });

    test('should fallback to log for non-function property access', () => {
      handlers.devLogSink({ level: 'addLogToBuffer', message: 'test' }, validSender, jest.fn());
      expect(Logger.log).toHaveBeenCalledWith(expect.stringContaining('[ClientLog] test'));
    });

    test('should fallback to log for prototype property access', () => {
      handlers.devLogSink({ level: 'constructor', message: 'test' }, validSender, jest.fn());
      expect(Logger.log).toHaveBeenCalledWith(expect.stringContaining('[ClientLog] test'));
    });
  });

  describe('Coverage Improvements', () => {
    beforeEach(() => {
      isRestrictedInjectionUrl.mockReturnValue(false);
      validateInternalRequest.mockReturnValue(null);
      mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'db-123',
      });
      // Mock other services to prevent undefined errors in flows that reach them
      mockServices.injectionService.collectHighlights.mockResolvedValue([]);
      mockServices.injectionService.injectHighlighter.mockResolvedValue(true);
      mockServices.pageContentService.extractContent.mockResolvedValue({
        extractionStatus: 'success',
        title: 'Test Page',
        blocks: [],
      });
    });

    test('savePage: 應拒絕非法內部請求', async () => {
      validateInternalRequest.mockReturnValue({ error: 'Access denied' });
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };

      await handlers.savePage({}, sender, sendResponse);

      expect(validateInternalRequest).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Access denied' })
      );
    });

    test('savePage: 應拒絕受限 URL', async () => {
      isRestrictedInjectionUrl.mockReturnValue(true);
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'chrome://settings' }]);

      await handlers.savePage({}, sender, sendResponse);

      expect(isRestrictedInjectionUrl).toHaveBeenCalledWith('chrome://settings');
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/不支[持援]|restricted/i),
        })
      );
    });

    test('savePage: API Key 缺失應報錯', async () => {
      mockServices.storageService.getConfig.mockResolvedValue({});
      getActiveNotionToken.mockResolvedValueOnce({ token: null, mode: null });
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      await handlers.savePage({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/API Key|配置/i),
        })
      );
    });

    test('savePage: 內容提取失敗應報錯', async () => {
      mockServices.pageContentService.extractContent.mockRejectedValue(new Error('Extract failed'));
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      await handlers.savePage({}, sender, sendResponse);

      expect(Logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/內容提取失敗|驗證失敗/),
        expect.anything()
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/內容提取失敗|驗證失敗|Missing/),
        })
      );
    });

    test('savePage: 應處理創建頁面失敗', async () => {
      mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      mockServices.notionService.createPage.mockResolvedValue({
        success: false,
        error: 'Create failed',
      });
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      await handlers.savePage({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }) // Relax expectation
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
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: originalTabUrl }]);

      mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'db-123',
      });

      // Mock Injection Service default behavior
      mockServices.injectionService.injectHighlighter.mockResolvedValue(true);
      mockServices.injectionService.collectHighlights.mockResolvedValue([]);

      // Ensure utils return different URLs to trigger migration logic
      resolveStorageUrl.mockReturnValue(stableUrl);
      normalizeUrl.mockReturnValue(legacyUrl);

      // Mock tabService to simulating migration having occurred (returning stableUrl)
      mockServices.tabService.resolveTabUrl.mockResolvedValue({
        stableUrl,
        originalUrl: originalTabUrl,
        migrated: true,
      });

      mockServices.notionService.checkPageExists.mockResolvedValue(true);

      // Mock MigrationService behavior
      mockServices.migrationService.migrateStorageKey.mockImplementation(async (stable, legacy) => {
        return stable === stableUrl && legacy === legacyUrl;
      });

      // Mock Storage: stable -> data (reflecting post-migration state)
      mockServices.storageService.getSavedPageData.mockImplementation(key => {
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
      await handlers.checkPageStatus({}, sender, sendResponse);

      // Expect MigrationService to be called
      // Expect MigrationService to be called (via tabService.resolveTabUrl)
      expect(mockServices.tabService.resolveTabUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        mockServices.migrationService
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
      mockServices.pageContentService.extractContent.mockResolvedValue({
        extractionStatus: 'success',
        title: 'Legacy Title',
        blocks: [],
      });

      await handlers.savePage({}, sender, sendResponse);

      expect(mockServices.tabService.resolveTabUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        mockServices.migrationService
      );

      // Should continue to refresh content for existing page
      expect(mockServices.notionService.refreshPageContent).toHaveBeenCalled();
    });
  });

  describe('devLogSink', () => {
    const sender = {
      id: 'mock-extension-id',
      tab: { id: 1 },
      origin: 'chrome-extension://mock-extension-id',
    };

    it('應該處理單一字串訊息', async () => {
      const sendResponse = jest.fn();
      await handlers.devLogSink(
        { message: 'hello', level: 'info', args: [] },
        sender,
        sendResponse
      );

      expect(globalThis.Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '[ClientLog] hello',
          level: 'info',
        })
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('應該處理帶有物件參數的訊息', async () => {
      const sendResponse = jest.fn();
      const context = { key: 'value' };
      await handlers.devLogSink(
        { message: 'hello', level: 'info', args: [context] },
        sender,
        sendResponse
      );

      expect(globalThis.Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { key: 'value' },
        })
      );
    });

    it('應該處理多個參數', async () => {
      const sendResponse = jest.fn();
      const context = { key: 'value' };
      const extra = 'more data';
      await handlers.devLogSink(
        { message: 'hello', level: 'info', args: [context, extra] },
        sender,
        sendResponse
      );

      expect(globalThis.Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { key: 'value', details: ['more data'] },
        })
      );
    });

    it('應該處理第一個參數非物件的情況', async () => {
      const sendResponse = jest.fn();
      await handlers.devLogSink(
        { message: 'hello', level: 'info', args: ['data1', 'data2'] },
        sender,
        sendResponse
      );

      expect(globalThis.Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          context: { details: ['data1', 'data2'] },
        })
      );
    });

    it('應該處理異常情況', async () => {
      const sendResponse = jest.fn();
      // 故意使 Logger 噴錯
      globalThis.Logger.addLogToBuffer.mockImplementationOnce(() => {
        throw new Error('Buffer fail');
      });

      await handlers.devLogSink(
        { message: 'hello', level: 'info', args: [] },
        sender,
        sendResponse
      );

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ [錯誤] [ClientLog] dev_log_sink:'),
        expect.anything()
      );
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe('Notion Page Deletion Handling', () => {
    it('checkPageStatus 第一次 false 應標記 deletionPending 並保留已保存狀態', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id', tab: { id: 1 } };
      const rawUrl = 'https://example.com';

      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page123',
        notionUrl: 'https://notion.so/page123',
      });
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });

      // 模擬頁面已刪除
      mockServices.notionService.checkPageExists.mockResolvedValue(false);

      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(mockServices.tabService.consumeDeletionConfirmation).toHaveBeenCalledWith(
        'page123',
        false
      );
      expect(mockServices.storageService.clearNotionStateWithRetry).not.toHaveBeenCalled();
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

      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page123',
        notionUrl: 'https://notion.so/page123',
      });
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockServices.notionService.checkPageExists.mockResolvedValue(false);

      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(mockServices.tabService.consumeDeletionConfirmation).toHaveBeenCalledTimes(2);
      expect(mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          source: 'SaveStatusCoordinator.resolve',
          expectedPageId: 'page123',
        })
      );
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
      expect(sendResponse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          success: true,
          statusKind: 'deleted_remote',
          isSaved: false,
          wasDeleted: true,
        })
      );
    });

    it('checkPageStatus cleanup failure 不應外露，仍應維持 deleted state', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id', tab: { id: 1 } };
      const rawUrl = 'https://example.com';

      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page123',
        notionUrl: 'https://notion.so/page123',
      });
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockServices.notionService.checkPageExists.mockResolvedValue(false);
      mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
        cleared: false,
        attempts: 2,
        error: new Error('storage failure'),
      });

      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(sendResponse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          success: true,
          statusKind: 'deleted_remote',
          isSaved: false,
          wasDeleted: true,
        })
      );
      expect(sendResponse).not.toHaveBeenLastCalledWith(
        expect.objectContaining({
          success: false,
          error: '清除本地 Notion 狀態失敗',
        })
      );
      expect(mockServices.tabService.consumeDeletionConfirmation).toHaveBeenCalledTimes(2);
      expect(mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledWith('page123');
      expect(mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledTimes(1);
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
      const sender = {
        id: 'mock-extension-id',
        tab: { id: 1, url: rawUrl },
      };

      mockServices.tabService.resolveTabUrl
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

      mockServices.storageService.getSavedPageData
        .mockResolvedValueOnce({
          notionPageId: 'page123',
          notionUrl: 'https://notion.so/page123',
          title: 'Old Title',
          lastVerifiedAt: 0,
        })
        .mockResolvedValueOnce({
          notionPageId: 'page123',
          notionUrl: 'https://notion.so/page123',
          title: 'Old Title',
          lastVerifiedAt: 0,
        })
        .mockResolvedValueOnce({
          notionPageId: 'page456',
          notionUrl: 'https://notion.so/page456',
          title: 'New Title',
          lastVerifiedAt: 0,
        });
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockServices.notionService.checkPageExists.mockResolvedValue(false);
      mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
        cleared: false,
        skipped: true,
        reason: 'pageId_mismatch',
        attempts: 1,
        recovered: false,
      });

      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
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
      expect(mockServices.tabService.consumeDeletionConfirmation).toHaveBeenCalledTimes(2);
    });

    it('checkPageStatus 刪除確認時應保留原 cleanup key，並以重新解析的 stableUrl 回應', async () => {
      const sendResponse = jest.fn();
      const rawUrl = 'https://www.rapbull.net/posts/2928/long-slug/';
      const stableUrl = 'https://www.rapbull.net/?p=2928';
      const sender = {
        id: 'mock-extension-id',
        tab: { id: 1, url: rawUrl },
      };

      mockServices.tabService.resolveTabUrl
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
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page123',
        notionUrl: 'https://notion.so/page123',
        title: 'Zombie Ass',
        lastVerifiedAt: 0,
      });
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockServices.notionService.checkPageExists.mockResolvedValue(false);

      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        rawUrl,
        expect.objectContaining({
          source: 'SaveStatusCoordinator.resolve',
          expectedPageId: 'page123',
        })
      );
      expect(sendResponse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          success: true,
          statusKind: 'deleted_remote',
          isSaved: false,
          wasDeleted: true,
          stableUrl,
        })
      );
    });

    it('checkPageStatus 重新解析 cleanup URL 失敗時應記錄原始 Error 並回退既有路徑', async () => {
      const sendResponse = jest.fn();
      const rawUrl = 'https://www.rapbull.net/posts/2928/long-slug/';
      const refreshError = new Error('refresh stable url failed');
      const sender = {
        id: 'mock-extension-id',
        tab: { id: 1, url: rawUrl },
      };

      mockServices.tabService.resolveTabUrl
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
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page123',
        notionUrl: 'https://notion.so/page123',
        title: 'Zombie Ass',
        lastVerifiedAt: 0,
      });
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockServices.notionService.checkPageExists.mockResolvedValue(false);

      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
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
      expect(sendResponse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          success: true,
          statusKind: 'deleted_remote',
          isSaved: false,
          wasDeleted: true,
          stableUrl: rawUrl,
        })
      );
    });

    it('checkPageStatus 在 cleanup 後再次查詢，仍應保持未保存狀態', async () => {
      const sendResponse = jest.fn();
      const rawUrl = 'https://www.rapbull.net/posts/2928/long-slug/';
      const stableUrl = 'https://www.rapbull.net/?p=2928';
      const sender = {
        id: 'mock-extension-id',
        tab: { id: 1, url: rawUrl },
      };

      mockServices.tabService.resolveTabUrl
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

      mockServices.storageService.getSavedPageData
        .mockResolvedValueOnce(buildSavedPageData({ title: 'Zombie Ass', lastVerifiedAt: 0 }))
        .mockResolvedValueOnce(buildSavedPageData({ title: 'Zombie Ass', lastVerifiedAt: 0 }))
        .mockResolvedValueOnce(null);
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockServices.notionService.checkPageExists
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);
      mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
        cleared: true,
        attempts: 1,
      });

      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);
      await handlers.checkPageStatus({ url: rawUrl }, sender, sendResponse);

      expect(mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
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
      mockServices.storageService.getSavedPageData.mockResolvedValue(savedData);
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });

      // 第一次返回 null，第二次返回 true
      mockServices.notionService.checkPageExists
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(true);

      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };
      await handlers.checkPageStatus({ url: 'https://example.com' }, sender, sendResponse);

      expect(mockServices.notionService.checkPageExists).toHaveBeenCalledTimes(2);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('checkPageStatus 應該處理一般錯誤', async () => {
      mockServices.storageService.getSavedPageData.mockRejectedValue(new Error('Fatal Error'));
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };
      await handlers.checkPageStatus({ url: 'https://example.com' }, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('savePage 應在發生意外時返回錯誤', async () => {
      chrome.tabs.query.mockRejectedValue(new Error('Query failed'));
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' }; // Valid sender ensures validation passes
      await handlers.savePage({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('checkPageStatus 應該在缺少可用 token 時返回已保存但不執行檢查', async () => {
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page123',
        lastVerifiedAt: Date.now() - 1_000_000, // 過期了
      });
      getActiveNotionToken.mockResolvedValueOnce({ token: null, mode: null });
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };
      await handlers.checkPageStatus({ url: 'https://example.com' }, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
      expect(mockServices.notionService.checkPageExists).not.toHaveBeenCalled();
    });

    it('checkPageStatus 應該在 forceRefresh 為 true 時執行檢查', async () => {
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page123',
        lastVerifiedAt: Date.now(), // 雖然未過期
      });
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key' });
      mockServices.notionService.checkPageExists.mockResolvedValue(true);
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };
      await handlers.checkPageStatus(
        { url: 'https://example.com', forceRefresh: true },
        sender,
        sendResponse
      );

      expect(mockServices.notionService.checkPageExists).toHaveBeenCalled();
    });
  });
});
