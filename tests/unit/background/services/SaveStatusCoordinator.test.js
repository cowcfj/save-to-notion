import { buildSavedPageData } from '../../../helpers/status-fixtures.js';
import { resolveSaveStatus } from '../../../../scripts/background/services/SaveStatusCoordinator.js';

describe('SaveStatusCoordinator', () => {
  let deps = null;
  let context = null;

  beforeEach(() => {
    deps = {
      notionService: {
        checkPageExists: jest.fn(),
      },
      storageService: {
        setSavedPageData: jest.fn().mockResolvedValue(),
        clearNotionStateWithRetry: jest.fn().mockResolvedValue({ cleared: true, attempts: 1 }),
        getSavedPageData: jest.fn(),
      },
      tabService: {
        consumeDeletionConfirmation: jest.fn().mockReturnValue({
          shouldDelete: false,
          deletionPending: false,
        }),
      },
      getActiveToken: jest.fn().mockResolvedValue({ token: 'token-123' }),
      wait: jest.fn().mockResolvedValue(),
      resolveCleanupUrl: jest.fn().mockResolvedValue('https://example.com/article'),
      now: 200_000,
      logger: {
        debug: jest.fn(),
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    };

    context = {
      savedData: buildSavedPageData({ lastVerifiedAt: 199_500 }),
      normUrl: 'https://example.com/article',
      resolvedUrl: 'https://example.com/article',
      migratedFromOldKey: false,
      forceRefresh: false,
    };
  });

  test('本地無保存資料時應回傳 unsaved', async () => {
    const result = await resolveSaveStatus(
      {
        ...context,
        savedData: null,
      },
      deps
    );

    expect(result).toEqual({
      success: true,
      statusKind: 'unsaved',
      isSaved: false,
      canSave: true,
      canSyncHighlights: false,
      stableUrl: 'https://example.com/article',
      wasDeleted: false,
      deletionPending: false,
    });
    expect(deps.notionService.checkPageExists).not.toHaveBeenCalled();
  });

  test('TTL 內快取應直接回傳 saved', async () => {
    const result = await resolveSaveStatus(context, deps);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        statusKind: 'saved',
        isSaved: true,
        canSave: false,
        canSyncHighlights: true,
        notionPageId: 'page-123',
      })
    );
    expect(deps.notionService.checkPageExists).not.toHaveBeenCalled();
  });

  test('無 token 時應回傳 unverified_saved', async () => {
    deps.getActiveToken.mockResolvedValue({ token: null });
    context.forceRefresh = true;

    const result = await resolveSaveStatus(context, deps);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        statusKind: 'unverified_saved',
        isSaved: true,
        canSave: false,
        canSyncHighlights: true,
      })
    );
    expect(deps.notionService.checkPageExists).not.toHaveBeenCalled();
  });

  test('retry 後仍為 null 時應回傳 unverified_saved', async () => {
    context.forceRefresh = true;
    deps.notionService.checkPageExists.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const result = await resolveSaveStatus(context, deps);

    expect(deps.notionService.checkPageExists).toHaveBeenCalledTimes(2);
    expect(deps.wait).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        statusKind: 'unverified_saved',
        isSaved: true,
        canSyncHighlights: true,
      })
    );
  });

  test('首次命中遠端不存在時應回傳 deletion_pending', async () => {
    context.forceRefresh = true;
    deps.notionService.checkPageExists.mockResolvedValue(false);
    deps.tabService.consumeDeletionConfirmation.mockReturnValue({
      shouldDelete: false,
      deletionPending: true,
    });

    const result = await resolveSaveStatus(context, deps);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        statusKind: 'deletion_pending',
        isSaved: true,
        deletionPending: true,
        canSave: false,
        canSyncHighlights: true,
      })
    );
  });

  test('第二次命中遠端不存在且清理成功時應回傳 deleted_remote', async () => {
    context.forceRefresh = true;
    deps.notionService.checkPageExists.mockResolvedValue(false);
    deps.tabService.consumeDeletionConfirmation.mockReturnValue({
      shouldDelete: true,
      deletionPending: false,
    });

    const result = await resolveSaveStatus(context, deps);

    expect(deps.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
      'https://example.com/article',
      expect.objectContaining({
        source: 'SaveStatusCoordinator.resolve',
        expectedPageId: 'page-123',
      })
    );
    expect(result).toEqual({
      success: true,
      statusKind: 'deleted_remote',
      isSaved: false,
      canSave: true,
      canSyncHighlights: false,
      stableUrl: 'https://example.com/article',
      wasDeleted: true,
      deletionPending: false,
    });
  });

  test('cleanup skipped 時應保留 saved 狀態', async () => {
    context.forceRefresh = true;
    deps.notionService.checkPageExists.mockResolvedValue(false);
    deps.tabService.consumeDeletionConfirmation.mockReturnValue({
      shouldDelete: true,
      deletionPending: false,
    });
    deps.storageService.clearNotionStateWithRetry.mockResolvedValue({
      skipped: true,
      reason: 'page_id_changed',
    });
    deps.storageService.getSavedPageData.mockResolvedValue(
      buildSavedPageData({
        notionPageId: 'page-latest',
        notionUrl: 'https://notion.so/page-latest',
      })
    );

    const result = await resolveSaveStatus(context, deps);

    expect(deps.storageService.getSavedPageData).toHaveBeenCalledWith(
      'https://example.com/article'
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        statusKind: 'saved',
        isSaved: true,
        notionPageId: 'page-latest',
        canSave: false,
        canSyncHighlights: true,
      })
    );
  });

  test('cleanup skipped 且查無最新綁定時應回傳 unsaved', async () => {
    context.forceRefresh = true;
    deps.notionService.checkPageExists.mockResolvedValue(false);
    deps.tabService.consumeDeletionConfirmation.mockReturnValue({
      shouldDelete: true,
      deletionPending: false,
    });
    deps.storageService.clearNotionStateWithRetry.mockResolvedValue({
      skipped: true,
      reason: 'pageId_mismatch',
    });
    deps.storageService.getSavedPageData.mockResolvedValue(null);

    const result = await resolveSaveStatus(context, deps);

    expect(deps.storageService.getSavedPageData).toHaveBeenCalledWith(
      'https://example.com/article'
    );
    expect(result).toEqual({
      success: true,
      statusKind: 'unsaved',
      isSaved: false,
      canSave: true,
      canSyncHighlights: false,
      stableUrl: 'https://example.com/article',
      wasDeleted: false,
      deletionPending: false,
    });
  });

  test('default deps (getActiveToken) should return unverified_saved', async () => {
    context.forceRefresh = true;
    const result = await resolveSaveStatus(context, { now: deps.now });
    expect(result.statusKind).toBe('unverified_saved');
  });

  test('default deps (resolveCleanupUrl) should use context.resolvedUrl on deletion', async () => {
    context.forceRefresh = true;
    deps.notionService.checkPageExists.mockResolvedValue(false);
    deps.tabService.consumeDeletionConfirmation.mockReturnValue({
      shouldDelete: true,
      deletionPending: false,
    });

    // Omit resolveCleanupUrl to hit the default implementation
    const minDeps = {
      notionService: deps.notionService,
      tabService: deps.tabService,
      storageService: deps.storageService,
      getActiveToken: deps.getActiveToken,
      now: deps.now,
    };

    const result = await resolveSaveStatus(context, minDeps);

    expect(deps.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
      context.resolvedUrl,
      expect.anything()
    );
    expect(result.stableUrl).toBe(context.resolvedUrl);
    expect(result.statusKind).toBe('deleted_remote');
  });
});
