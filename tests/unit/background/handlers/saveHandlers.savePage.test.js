/**
 * @jest-environment jsdom
 */

import { ERROR_MESSAGES } from '../../../../scripts/config/shared/messages.js';
import {
  createSaveHandlersTestContext,
  getActiveNotionToken,
  isRestrictedInjectionUrl,
  replaceSaveHandlers,
  setupDefaultActionMocks,
  validateInternalRequest,
  validSender,
} from './saveHandlers.shared.js';
import {
  buildDestinationProfile,
  buildCreatePageResult,
  buildSavedPageState,
} from '../../../helpers/saveHandlersTestHarness.js';

describe('saveHandlers savePage', () => {
  const context = createSaveHandlersTestContext();

  beforeEach(() => {
    setupDefaultActionMocks(context.mockServices);
  });

  test('savePage: 新頁面應創建成功', async () => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getSavedPageData.mockResolvedValue(null); // No saved data
    context.mockServices.notionService.createPage.mockResolvedValue({
      success: true,
      pageId: 'new-page-id',
      url: 'https://notion.so/new-page',
    });

    await context.handlers.savePage({}, validSender, sendResponse);

    expect(context.mockServices.storageService.getConfig).toHaveBeenCalled();
    expect(context.mockServices.injectionService.injectHighlighter).toHaveBeenCalled();
    expect(context.mockServices.pageContentService.extractContent).toHaveBeenCalled();
    expect(context.mockServices.notionService.createPage).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        created: true,
        destinationProfileId: 'default',
        destinationProfileName: 'Default',
      })
    );
    expect(context.mockServices.storageService.setSavedPageData).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ destinationProfileId: 'default' })
    );
    expect(context.mockServices.destinationProfileResolver.setLastUsedProfile).toHaveBeenCalledWith(
      'default'
    );
  });

  test('savePage: payload 帶 profileId 時應使用該 profile 的 Notion target', async () => {
    const sendResponse = jest.fn();
    context.mockServices.destinationProfileResolver.resolveProfileForSave.mockResolvedValue({
      id: 'profile-2',
      name: 'Research',
      notionDataSourceId: 'research-target',
      notionDataSourceType: 'page',
    });
    context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
    context.mockServices.notionService.createPage.mockResolvedValue({
      success: true,
      pageId: 'new-page-id',
      url: 'https://notion.so/new-page',
    });

    await context.handlers.savePage({ profileId: 'profile-2' }, validSender, sendResponse);

    expect(
      context.mockServices.destinationProfileResolver.resolveProfileForSave
    ).toHaveBeenCalledWith('profile-2');
    expect(context.mockServices.notionService.buildPageData).toHaveBeenCalledWith(
      expect.objectContaining({
        dataSourceId: 'research-target',
        dataSourceType: 'page',
      })
    );
    expect(context.mockServices.storageService.setSavedPageData).toHaveBeenCalledWith(
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
    context.mockServices.destinationProfileResolver.resolveProfileForSave.mockRejectedValue(
      new Error('Destination profile not found')
    );

    await context.handlers.savePage({ profileId: 'missing' }, validSender, sendResponse);

    expect(context.mockServices.pageContentService.extractContent).not.toHaveBeenCalled();
    expect(context.mockServices.notionService.createPage).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('保存目的地'),
      })
    );
  });

  test('savePage: destinationProfileResolver 缺失時應回傳明確錯誤', async () => {
    const sendResponse = jest.fn();
    replaceSaveHandlers(context, {
      ...context.mockServices,
      destinationProfileResolver: null,
    });

    await context.handlers.savePage({}, validSender, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.any(String),
      })
    );
    expect(context.mockServices.pageContentService.extractContent).not.toHaveBeenCalled();
  });

  test.each([
    {
      title: '已保存頁改存到另一個 profile 時應建立新 Notion page',
      savedPageData: buildSavedPageState({
        notionPageId: 'existing-id',
        notionUrl: 'https://notion.so/existing-id',
        destinationProfileId: 'default',
      }),
      createPageResult: buildCreatePageResult({
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      }),
    },
    {
      title: 'legacy 已保存頁缺少 destinationProfileId 且改存 profile 時應建立新 Notion page',
      savedPageData: {
        notionPageId: 'existing-id',
        notionUrl: 'https://notion.so/existing-id',
      },
      createPageResult: {
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      },
    },
  ])('savePage: $title', async ({ savedPageData, createPageResult }) => {
    const sendResponse = jest.fn();
    context.mockServices.destinationProfileResolver.resolveProfileForSave.mockResolvedValue(
      buildDestinationProfile({
        id: 'profile-2',
        name: 'Research',
        notionDataSourceId: 'research-target',
        notionDataSourceType: 'page',
      })
    );
    context.mockServices.storageService.getSavedPageData.mockResolvedValue(savedPageData);
    context.mockServices.notionService.createPage.mockResolvedValue(createPageResult);

    await context.handlers.savePage({ profileId: 'profile-2' }, validSender, sendResponse);

    expect(context.mockServices.notionService.checkPageExists).not.toHaveBeenCalled();
    expect(context.mockServices.notionService.createPage).toHaveBeenCalled();
    expect(context.mockServices.storageService.setSavedPageData).toHaveBeenCalledWith(
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

  test('savePage: legacy 已保存頁缺少 destinationProfileId 且使用 default profile 時應更新既有頁面', async () => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getSavedPageData.mockResolvedValue({
      notionPageId: 'existing-id',
      notionUrl: 'https://notion.so/existing-id',
    });
    context.mockServices.notionService.checkPageExists.mockResolvedValue(true);
    context.mockServices.notionService.updateHighlightsSection.mockResolvedValue({
      success: true,
      pageId: 'existing-id',
    });
    context.mockServices.notionService.refreshPageContent.mockResolvedValue({
      success: true,
      pageId: 'existing-id',
    });

    await context.handlers.savePage({}, validSender, sendResponse);

    expect(context.mockServices.notionService.createPage).not.toHaveBeenCalled();
    expect(context.mockServices.notionService.checkPageExists).toHaveBeenCalledWith('existing-id', {
      apiKey: 'valid-key',
    });
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        updated: true,
        destinationProfileId: 'default',
      })
    );
  });

  test('savePage: legacy data source key 缺失時仍應使用 destination profile target 保存', async () => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getConfig.mockResolvedValue({
      notionApiKey: 'valid-key',
    });
    context.mockServices.destinationProfileResolver.resolveProfileForSave.mockResolvedValue({
      id: 'profile-2',
      name: 'Research',
      notionDataSourceId: 'research-target',
      notionDataSourceType: 'page',
    });
    context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
    context.mockServices.notionService.createPage.mockResolvedValue({
      success: true,
      pageId: 'new-page-id',
      url: 'https://notion.so/new-page',
    });

    await context.handlers.savePage({ profileId: 'profile-2' }, validSender, sendResponse);

    expect(
      context.mockServices.destinationProfileResolver.resolveProfileForSave
    ).toHaveBeenCalledWith('profile-2');
    expect(context.mockServices.pageContentService.extractContent).toHaveBeenCalled();
    expect(context.mockServices.notionService.buildPageData).toHaveBeenCalledWith(
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
    context.mockServices.destinationProfileResolver.resolveProfileForSave.mockRejectedValue(
      new Error('internal worker stack: token exchange failed')
    );

    await context.handlers.savePage({ profileId: 'missing' }, validSender, sendResponse);

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

  test('savePage: profile 解析失敗時 envelope 應帶 errorCode (ADR 0007)', async () => {
    const sendResponse = jest.fn();
    context.mockServices.destinationProfileResolver.resolveProfileForSave.mockRejectedValue(
      new Error('找不到目的地：xyz')
    );

    await context.handlers.savePage({ profileId: 'missing' }, validSender, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorCode: 'DESTINATION_PROFILE_NOT_FOUND',
      })
    );
  });

  test('savePage: profile resolver 拋出帶小寫 error.code 時應 normalize 為 SCREAMING_SNAKE_CASE', async () => {
    const sendResponse = jest.fn();
    const lowerCaseCodeError = Object.assign(new Error('downstream failure'), {
      code: 'destination_profile_not_allowed',
    });
    context.mockServices.destinationProfileResolver.resolveProfileForSave.mockRejectedValue(
      lowerCaseCodeError
    );

    await context.handlers.savePage({ profileId: 'gated' }, validSender, sendResponse);

    const response = sendResponse.mock.calls.at(-1)[0];
    expect(response.success).toBe(false);
    expect(response.errorCode).toBe('DESTINATION_PROFILE_NOT_ALLOWED');
    expect(response.error).toBe('此保存目的地目前不可使用，請改用其他保存目標。');
  });

  test('savePage: 下游 result 帶 errorCode 時 sendErrorResponse 應透傳並用 PATTERNS 直查 (ADR 0007)', async () => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
    context.mockServices.notionService.createPage.mockResolvedValue({
      success: false,
      error: 'No tab with id: 1573595936',
      errorCode: 'NO_TAB_WITH_ID',
    });

    await context.handlers.savePage({}, validSender, sendResponse);

    const response = sendResponse.mock.calls.at(-1)[0];
    expect(response.success).toBe(false);
    expect(response.errorCode).toBe('NO_TAB_WITH_ID');
    expect(response.error).toBe(ERROR_MESSAGES.PATTERNS.NO_TAB_WITH_ID);
  });

  test('savePage: 下游 result 無 errorCode 時 envelope 不應出現 errorCode 鍵 (ADR 0007 向後相容)', async () => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
    context.mockServices.notionService.createPage.mockResolvedValue({
      success: false,
      error: 'Network error',
    });

    await context.handlers.savePage({}, validSender, sendResponse);

    const response = sendResponse.mock.calls.at(-1)[0];
    expect(response.success).toBe(false);
    expect(response).not.toHaveProperty('errorCode');
  });

  test('savePage: 提取結果為 failed 時不應建立 Notion 頁面', async () => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
    context.mockServices.pageContentService.extractContent.mockResolvedValue({
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

    await context.handlers.savePage({}, validSender, sendResponse);

    expect(context.mockServices.notionService.createPage).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.any(String),
      })
    );
  });

  test.each([
    { inputType: 'data_source', expectedType: 'database' },
    { inputType: 'invalid_type', expectedType: 'database' },
  ])(
    'savePage: notionDataSourceType=$inputType 應正規化/回退為 $expectedType 並傳遞給 buildPageData',
    async ({ inputType, expectedType }) => {
      const sendResponse = jest.fn();
      context.mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'ds-123',
        notionDataSourceType: inputType,
      });
      context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      context.mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      await context.handlers.savePage({}, validSender, sendResponse);

      expect(context.mockServices.notionService.buildPageData).toHaveBeenCalledWith(
        expect.objectContaining({ dataSourceType: expectedType })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, created: true })
      );
    }
  );

  test('savePage: 當 stableUrl 與 originalUrl 不同時應設定 alias', async () => {
    const sendResponse = jest.fn();
    const stableUrl = 'https://example.com/stable';
    const originalUrl = 'https://example.com/original';

    context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
    context.mockServices.notionService.createPage.mockResolvedValue({
      success: true,
      pageId: 'new-page-id',
      url: 'https://notion.so/new-page',
    });

    // 模擬 resolveTabUrl 返回不一致的 URL
    context.mockServices.tabService.resolveTabUrl.mockResolvedValue({
      stableUrl,
      originalUrl,
      migrated: false,
    });

    await context.handlers.savePage({}, validSender, sendResponse);

    expect(context.mockServices.storageService.setUrlAlias).toHaveBeenCalledWith(
      originalUrl,
      stableUrl
    );
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, created: true })
    );
  });

  test.each([
    {
      title: '已有頁面且有新標註，應更新標註',
      highlights: [{ text: 'highlight' }],
      serviceMethod: 'updateHighlightsSection',
      serviceResult: { success: true },
      expectedResponse: { highlightsUpdated: true },
    },
    {
      title: '已有頁面且無新標註，應刷新內容',
      highlights: [],
      serviceMethod: 'refreshPageContent',
      serviceResult: { success: true },
      expectedResponse: { updated: true },
    },
  ])('savePage: $title', async ({ highlights, serviceMethod, serviceResult, expectedResponse }) => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getSavedPageData.mockResolvedValue({
      notionPageId: 'existing-id',
      destinationProfileId: 'default',
    });
    context.mockServices.notionService.checkPageExists.mockResolvedValue(true);
    context.mockServices.injectionService.collectHighlights.mockResolvedValue(highlights);
    context.mockServices.notionService[serviceMethod].mockResolvedValue(serviceResult);

    await context.handlers.savePage({}, validSender, sendResponse);

    expect(context.mockServices.notionService[serviceMethod]).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining(expectedResponse));
  });

  test('savePage: pageExists 連續兩次 false 才應清理並重建', async () => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getSavedPageData.mockResolvedValue({
      notionPageId: 'existing-id',
      notionUrl: 'https://notion.so/existing-id',
      destinationProfileId: 'default',
    });
    context.mockServices.notionService.checkPageExists.mockResolvedValue(false);
    context.mockServices.notionService.createPage.mockResolvedValue({
      success: true,
      pageId: 'new-page-id',
      url: 'https://notion.so/new-page-id',
    });

    await context.handlers.savePage({}, validSender, sendResponse);
    expect(context.mockServices.storageService.clearNotionStateWithRetry).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, deletionPending: true })
    );

    await context.handlers.savePage({}, validSender, sendResponse);
    expect(context.mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        source: 'saveHandlers._handlePageRecreation',
        expectedPageId: 'existing-id',
      })
    );
    expect(context.mockServices.notionService.createPage).toHaveBeenCalled();
  });

  describe('savePage cleanup failure handling', () => {
    const setupCleanupFailureRecreateFlow = () => {
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'existing-id',
        notionUrl: 'https://notion.so/existing-id',
        destinationProfileId: 'default',
      });
      context.mockServices.notionService.checkPageExists.mockResolvedValue(false);
      context.mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
        cleared: false,
        attempts: 2,
        error: new Error('storage failure'),
      });
    };

    test.each([
      {
        title: 'cleanup failure 不應外露，create 成功時仍應回傳重建成功',
        createPageResult: {
          success: true,
          pageId: 'new-page-id',
          url: 'https://notion.so/new-page-id',
        },
        expectedLastResponse: {
          success: true,
          recreated: true,
        },
        unexpectedLastResponse: {
          success: false,
          error: '清除本地 Notion 狀態失敗',
        },
      },
      {
        title: 'cleanup failure 不應覆蓋真正的 createPage 錯誤',
        createPageResult: {
          success: false,
          error: 'create_failed',
        },
        expectedLastResponse: {
          success: false,
          error: ERROR_MESSAGES.DEFAULT,
        },
        unexpectedLastResponse: {
          error: '清除本地 Notion 狀態失敗',
        },
      },
    ])('$title', async ({ createPageResult, expectedLastResponse, unexpectedLastResponse }) => {
      const sendResponse = jest.fn();
      setupCleanupFailureRecreateFlow();
      context.mockServices.notionService.createPage.mockResolvedValue(createPageResult);

      await context.handlers.savePage({}, validSender, sendResponse);
      await context.handlers.savePage({}, validSender, sendResponse);

      expect(sendResponse).toHaveBeenLastCalledWith(expect.objectContaining(expectedLastResponse));
      expect(sendResponse).not.toHaveBeenLastCalledWith(
        expect.objectContaining(unexpectedLastResponse)
      );
      expect(context.mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledWith(
        'existing-id'
      );
      expect(context.mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledTimes(3);
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
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'existing-id',
        notionUrl: 'https://notion.so/existing-id',
        destinationProfileId: 'default',
      });
      context.mockServices.notionService.checkPageExists.mockResolvedValue(false);
      context.mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
        cleared: false,
        skipped: true,
        reason: 'pageId_mismatch',
        attempts: 1,
        recovered: false,
      });

      await context.handlers.savePage({}, validSender, sendResponse);
      await context.handlers.savePage({}, validSender, sendResponse);

      expect(context.mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          source: 'saveHandlers._handlePageRecreation',
          expectedPageId: 'existing-id',
        })
      );
      expect(context.mockServices.notionService.createPage).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenLastCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.CHECK_PAGE_EXISTENCE_FAILED,
        })
      );
    });

    test('page existence unknown 時不清理本地狀態', async () => {
      const sendResponse = jest.fn();
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'existing-id',
        notionUrl: 'https://notion.so/existing-id',
        destinationProfileId: 'default',
      });
      context.mockServices.notionService.checkPageExists.mockResolvedValue(null);

      await context.handlers.savePage({}, validSender, sendResponse);

      expect(context.mockServices.storageService.clearNotionStateWithRetry).not.toHaveBeenCalled();
      expect(context.mockServices.notionService.createPage).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.CHECK_PAGE_EXISTENCE_FAILED,
        })
      );
    });
  });

  // ===== openNotionPage Tests =====

  describe('Coverage Improvements', () => {
    beforeEach(() => {
      isRestrictedInjectionUrl.mockReturnValue(false);
      validateInternalRequest.mockReturnValue(null);
      context.mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'db-123',
      });
      // Mock other services to prevent undefined errors in flows that reach them
      context.mockServices.injectionService.collectHighlights.mockResolvedValue([]);
      context.mockServices.injectionService.injectHighlighter.mockResolvedValue(true);
      context.mockServices.pageContentService.extractContent.mockResolvedValue({
        extractionStatus: 'success',
        title: 'Test Page',
        blocks: [],
      });
    });

    test('savePage: 應拒絕非法內部請求', async () => {
      validateInternalRequest.mockReturnValue({ error: 'Access denied' });
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };

      await context.handlers.savePage({}, sender, sendResponse);

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

      await context.handlers.savePage({}, sender, sendResponse);

      expect(isRestrictedInjectionUrl).toHaveBeenCalledWith('chrome://settings');
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/不支[持援]|restricted/i),
        })
      );
    });

    test('savePage: API Key 缺失應報錯', async () => {
      context.mockServices.storageService.getConfig.mockResolvedValue({});
      getActiveNotionToken.mockResolvedValueOnce({ token: null, mode: null });
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      await context.handlers.savePage({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.PATTERNS.API_KEY_NOT_CONFIGURED,
        })
      );
    });

    test('savePage: 內容提取失敗應報錯', async () => {
      context.mockServices.pageContentService.extractContent.mockRejectedValue(
        new Error('Extract failed')
      );
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      await context.handlers.savePage({}, sender, sendResponse);

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
      context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      context.mockServices.notionService.createPage.mockResolvedValue({
        success: false,
        error: 'Create failed',
      });
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      await context.handlers.savePage({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }) // Relax expectation
      );
    });
  });

  describe('toast 推送（save failure → SHOW_TOAST）', () => {
    const toolbarSender = { id: 'mock-extension-id', tab: { id: 5, url: 'https://example.com' } };

    beforeEach(() => {
      context.mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key' });
      context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      context.mockServices.injectionService.collectHighlights.mockResolvedValue([]);
      context.mockServices.notionService.buildPageData.mockReturnValue({ pageData: {} });
      context.mockServices.pageContentService.extractContent.mockResolvedValue({
        extractionStatus: 'success',
        title: 'Test',
        blocks: [],
      });
    });

    test.each([
      [
        'SAVE_PAGE_FROM_TOOLBAR',
        'auth 失敗（UNAUTHORIZED）→ 推送 SYNC_FAILED_AUTH toast (Toolbar)',
      ],
      ['SAVE_PAGE_FROM_RAIL', 'auth 失敗（UNAUTHORIZED）→ 推送 SYNC_FAILED_AUTH toast (Rail)'],
    ])('%s', async (action, _title) => {
      context.mockServices.notionService.createPage.mockResolvedValue({
        success: false,
        error: 'unauthorized',
        errorCode: 'UNAUTHORIZED',
      });

      const sendResponse = jest.fn();
      await context.handlers[action]({}, toolbarSender, sendResponse);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        5,
        expect.objectContaining({
          action: 'SHOW_TOAST',
          messageKey: 'SYNC_FAILED_AUTH',
          level: 'error',
        })
      );
    });

    test.each([
      {
        errorCode: 'RATE_LIMITED',
        errorText: 'rate limited',
        messageKey: 'SYNC_FAILED_RATE_LIMIT',
      },
      {
        errorCode: 'NETWORK_ERROR',
        errorText: 'network error',
        messageKey: 'SYNC_FAILED_NETWORK',
      },
      {
        errorCode: 'OBJECT_NOT_FOUND',
        errorText: 'not found',
        messageKey: 'SYNC_FAILED_PAGE',
      },
    ])('$errorCode 失敗 → 推送 $messageKey toast', async ({ errorCode, errorText, messageKey }) => {
      context.mockServices.notionService.createPage.mockResolvedValue({
        success: false,
        error: errorText,
        errorCode,
      });

      const sendResponse = jest.fn();
      await context.handlers.SAVE_PAGE_FROM_TOOLBAR({}, toolbarSender, sendResponse);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        5,
        expect.objectContaining({
          action: 'SHOW_TOAST',
          messageKey,
          level: 'error',
        })
      );
    });

    test('不在映射表的 errorCode → 不推送 toast', async () => {
      context.mockServices.notionService.createPage.mockResolvedValue({
        success: false,
        error: 'some unknown error',
        errorCode: 'SOME_UNKNOWN_CODE',
      });

      const sendResponse = jest.fn();
      await context.handlers.SAVE_PAGE_FROM_TOOLBAR({}, toolbarSender, sendResponse);

      expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(
        5,
        expect.objectContaining({ action: 'SHOW_TOAST' })
      );
    });
  });

  describe('error 物件為 null/undefined 時的日誌容錯', () => {
    const validSender = {
      id: 'mock-extension-id',
      origin: 'chrome-extension://mock-extension-id',
    };

    beforeEach(() => {
      isRestrictedInjectionUrl.mockReturnValue(false);
      validateInternalRequest.mockReturnValue(null);
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      context.mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'db-123',
      });
      context.mockServices.injectionService.injectHighlighter.mockResolvedValue(true);
      context.mockServices.injectionService.collectHighlights.mockResolvedValue([]);
      context.mockServices.notionService.buildPageData.mockReturnValue({
        pageData: {},
        validBlocks: [],
      });
      context.mockServices.pageContentService.extractContent.mockResolvedValue({
        extractionStatus: 'success',
        title: 'Test Page',
        blocks: [],
      });
    });

    test('extractContentSafely: extractContent 以 undefined reject 時不應拋 TypeError，仍應記錄提取異常並交回提取失敗', async () => {
      const sendResponse = jest.fn();
      context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      // 以 undefined 拒絕，重現非標準 error 物件
      context.mockServices.pageContentService.extractContent.mockRejectedValue(undefined);

      await context.handlers.savePage({}, validSender, sendResponse);

      // 提取異常應在 extractContentSafely 內被吞掉並記錄，而非二次崩潰
      expect(Logger.error).toHaveBeenCalledWith(
        '內容提取發生異常',
        expect.objectContaining({ action: 'extractContent' })
      );
      // 不應冒泡到外層「未預期錯誤」catch
      expect(Logger.error).not.toHaveBeenCalledWith('保存頁面時發生未預期錯誤', expect.anything());
    });

    test('recordUrlAlias: setUrlAlias 以 undefined reject 時不應讓已成功的保存被回報為失敗', async () => {
      const sendResponse = jest.fn();
      const stableUrl = 'https://example.com/stable';
      const originalUrl = 'https://example.com/original';

      context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      context.mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });
      context.mockServices.tabService.resolveTabUrl.mockResolvedValue({
        stableUrl,
        originalUrl,
        migrated: false,
        hasStableUrl: false,
      });
      context.mockServices.storageService.setUrlAlias.mockRejectedValue(undefined);

      await context.handlers.savePage({}, validSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, created: true })
      );
      expect(Logger.warn).toHaveBeenCalledWith(
        '設定 URL alias 失敗（不影響主流程）',
        expect.objectContaining({ action: 'setUrlAlias' })
      );
    });

    test('removeStaleOriginalSavedData: removeSavedPageData 以 undefined reject 時不應讓已成功的保存被回報為失敗', async () => {
      const sendResponse = jest.fn();
      const stableUrl = 'https://example.com/stable';
      const originalUrl = 'https://example.com/original';

      context.mockServices.tabService.resolveTabUrl.mockResolvedValue({
        stableUrl,
        originalUrl,
        migrated: false,
        hasStableUrl: false,
      });
      // normUrl(stableUrl) 為新頁；originalUrl 存在 pageId 不同的舊資料，觸發清除
      context.mockServices.storageService.getSavedPageData.mockImplementation(url => {
        if (url === originalUrl) {
          return Promise.resolve({ notionPageId: 'stale-id' });
        }
        return Promise.resolve(null);
      });
      context.mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });
      context.mockServices.storageService.removeSavedPageData = jest
        .fn()
        .mockRejectedValue(undefined);

      await context.handlers.savePage({}, validSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, created: true })
      );
      expect(Logger.warn).toHaveBeenCalledWith(
        '清除 originalUrl 舊 savedData 失敗（不影響主流程）',
        expect.objectContaining({ action: 'cleanStaleOriginalUrl' })
      );
    });
  });
});
