import { createSaveHandlers } from '../../scripts/background/handlers/saveHandlers.js';

/**
 * 建立刪除確認的內部狀態機 (對應原本 test 的 Map 邏輯)
 */
export function createDeletionConfirmationState() {
  const deletionPendingPages = new Map();
  return {
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
    getPendingCount: () => deletionPendingPages.size,
    clear: () => deletionPendingPages.clear(),
  };
}

/**
 * 建立所有背景服務的 Mock
 */
export function createMockServices() {
  const deletionState = createDeletionConfirmationState();
  return {
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
      confirmRemotePageMissing: deletionState.confirmRemotePageMissing,
      resetRemotePageMissingState: deletionState.resetRemotePageMissingState,
      consumeDeletionConfirmation: deletionState.consumeDeletionConfirmation,
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
}

/**
 * 建立 Save Handlers 測試 harness 實例
 */
export function createSaveHandlersHarness() {
  const mockServices = createMockServices();
  const handlers = createSaveHandlers(mockServices);
  return { handlers, mockServices };
}

/**
 * Fixture Builders / Overriders
 */

export function buildExtensionSender(overrides = {}) {
  return {
    id: 'mock-extension-id',
    ...overrides,
  };
}

export function buildContentScriptSender(overrides = {}) {
  return {
    id: 'mock-extension-id',
    url: 'https://example.com/some-page',
    ...overrides,
  };
}

export function buildResolvedTabUrl(overrides = {}) {
  return {
    stableUrl: 'https://example.com/stable',
    originalUrl: 'https://example.com/original',
    migrated: false,
    ...overrides,
  };
}

export function buildDestinationProfile(overrides = {}) {
  return {
    id: 'default',
    name: 'Default',
    notionDataSourceId: 'db-123',
    notionDataSourceType: 'database',
    ...overrides,
  };
}

export function buildCreatePageResult(overrides = {}) {
  return {
    success: true,
    pageId: 'new-page-123',
    url: 'https://notion.so/new-page-123',
    ...overrides,
  };
}

export function buildSavedPageState(overrides = {}) {
  return {
    notionPageId: 'saved-page-123',
    notionUrl: 'https://notion.so/saved-page-123',
    title: 'Saved Page Title',
    savedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Sequence Mock Helpers
 */

export function mockResolvedTabUrlSequence(tabService, entries) {
  let mock = tabService.resolveTabUrl;
  entries.forEach(entry => {
    mock = mock.mockResolvedValueOnce({
      stableUrl: entry.stableUrl,
      originalUrl: entry.originalUrl || entry.stableUrl,
      migrated: entry.migrated === undefined ? false : entry.migrated,
      hasStableUrl: entry.hasStableUrl === undefined ? false : entry.hasStableUrl,
      ...entry,
    });
  });
}

export function mockSavedPageDataSequence(storageService, entries) {
  let mock = storageService.getSavedPageData;
  entries.forEach(entry => {
    mock = mock.mockResolvedValueOnce({
      notionPageId: entry.notionPageId || 'page-123',
      notionUrl: entry.notionUrl || `https://notion.so/${entry.notionPageId || 'page-123'}`,
      title: entry.title || 'Some Title',
      lastVerifiedAt: entry.lastVerifiedAt === undefined ? 0 : entry.lastVerifiedAt,
      ...entry,
    });
  });
}

export function mockRemotePageDeleted(notionService) {
  notionService.checkPageExists.mockResolvedValue(false);
}

export function mockCleanupSkipped(storageService, overrides = {}) {
  storageService.clearNotionStateWithRetry.mockResolvedValue({
    cleared: false,
    skipped: true,
    reason: 'pageId_mismatch',
    attempts: 1,
    recovered: false,
    ...overrides,
  });
}
