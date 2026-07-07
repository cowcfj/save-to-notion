const DELETION_CONFIRMED = { shouldDelete: true, deletionPending: false };
const DELETION_NOT_PENDING = { shouldDelete: false, deletionPending: false };
const DELETION_PENDING = { shouldDelete: false, deletionPending: true };
let createSaveHandlersFactory;

export function setCreateSaveHandlersFactory(factory) {
  createSaveHandlersFactory = factory;
}

function normalizePageId(notionPageId) {
  return notionPageId ? String(notionPageId) : null;
}

function confirmMissingPage(deletionPendingPages, pageId) {
  if (deletionPendingPages.has(pageId)) {
    deletionPendingPages.delete(pageId);
    return DELETION_CONFIRMED;
  }

  deletionPendingPages.set(pageId, Date.now());
  return DELETION_PENDING;
}

function handleMissingPage(deletionPendingPages, notionPageId) {
  const pageId = normalizePageId(notionPageId);
  return pageId ? confirmMissingPage(deletionPendingPages, pageId) : DELETION_NOT_PENDING;
}

function resetMissingPage(deletionPendingPages, notionPageId) {
  const pageId = normalizePageId(notionPageId);
  if (pageId) {
    deletionPendingPages.delete(pageId);
  }
  return DELETION_NOT_PENDING;
}

function consumeConfirmation(deletionPendingPages, notionPageId, exists) {
  const pageId = normalizePageId(notionPageId);
  if (!pageId) {
    return DELETION_NOT_PENDING;
  }

  if (exists !== false) {
    deletionPendingPages.delete(pageId);
    return DELETION_NOT_PENDING;
  }

  return confirmMissingPage(deletionPendingPages, pageId);
}

function createDeletionPendingTracker() {
  const deletionPendingPages = new Map();

  return {
    handleMissingPage: notionPageId => handleMissingPage(deletionPendingPages, notionPageId),
    resetMissingPage: notionPageId => resetMissingPage(deletionPendingPages, notionPageId),
    consumeConfirmation: (notionPageId, exists) =>
      consumeConfirmation(deletionPendingPages, notionPageId, exists),
    getPendingCount: () => deletionPendingPages.size,
    clear: () => deletionPendingPages.clear(),
  };
}

export function createDeletionConfirmationState() {
  const deletionTracker = createDeletionPendingTracker();
  return {
    confirmRemotePageMissing: jest.fn().mockImplementation(deletionTracker.handleMissingPage),
    resetRemotePageMissingState: jest.fn().mockImplementation(deletionTracker.resetMissingPage),
    consumeDeletionConfirmation: jest.fn().mockImplementation(deletionTracker.consumeConfirmation),
    getPendingCount: deletionTracker.getPendingCount,
    clear: deletionTracker.clear,
  };
}

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
    },
  };
}

export function createSaveHandlersHarness() {
  if (typeof createSaveHandlersFactory !== 'function') {
    throw new TypeError('createSaveHandlers factory must be set before creating the harness');
  }

  const mockServices = createMockServices();
  const handlers = createSaveHandlersFactory(mockServices);
  return { handlers, mockServices };
}

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

export function buildSavedPageData(overrides = {}) {
  return {
    notionPageId: 'page-123',
    notionUrl: 'https://www.notion.so/page-123',
    title: 'Test Page',
    savedAt: 12_345,
    lastVerifiedAt: 12_345,
    ...overrides,
  };
}

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
