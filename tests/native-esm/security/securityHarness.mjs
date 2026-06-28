import { jest } from '@jest/globals';
import { installChromeRuntime } from '../utils/rootUtilsHarness.mjs';

export function installSavePageChrome(options = {}) {
  return installChromeRuntime({
    id: 'trusted-extension-id',
    activeTabs: [{ id: 123, url: 'https://example.com/native-security' }],
    syncData: { highlightContentStyle: 'COLOR_SYNC' },
    ...options,
  });
}

export function createSaveHandlerServices(overrides = {}) {
  const services = {
    notionService: {
      buildPageData: jest.fn(() => ({ pageData: { children: [] }, validBlocks: [] })),
      createPage: jest.fn(async () => ({
        success: true,
        pageId: 'notion-page-native',
        url: 'https://notion.so/notion-page-native',
      })),
      checkPageExists: jest.fn(async () => false),
      updateHighlightsSection: jest.fn(async () => ({ success: true })),
      refreshPageContent: jest.fn(async () => ({ success: true })),
    },
    storageService: {
      getConfig: jest.fn(async () => ({
        notionApiKey: 'trusted-storage-token',
        notionDataSourceId: 'data-source-native',
        notionDataSourceType: 'database',
      })),
      getSavedPageData: jest.fn(async () => null),
      setSavedPageData: jest.fn(async () => {}),
      setUrlAlias: jest.fn(async () => {}),
      removeSavedPageData: jest.fn(async () => {}),
      clearNotionStateWithRetry: jest.fn(async () => {}),
    },
    injectionService: {
      injectHighlighter: jest.fn(async () => {}),
      collectHighlights: jest.fn(async () => []),
      inject: jest.fn(async () => {}),
    },
    pageContentService: {
      extractContent: jest.fn(async () => ({
        extractionStatus: 'success',
        title: 'Native Security Page',
        blocks: [{ type: 'paragraph', paragraph: { rich_text: [] } }],
        siteIcon: null,
      })),
    },
    tabService: {
      resolveTabUrl: jest.fn(async (_tabId, url) => ({
        stableUrl: url,
        originalUrl: url,
        migrated: false,
        hasStableUrl: false,
      })),
      confirmRemotePageMissing: jest.fn(() => ({
        shouldDelete: false,
        deletionPending: false,
      })),
      resetRemotePageMissingState: jest.fn(() => ({
        shouldDelete: false,
        deletionPending: false,
      })),
      consumeDeletionConfirmation: jest.fn(() => ({
        shouldDelete: false,
        deletionPending: false,
      })),
    },
    migrationService: {
      migrateStorageKey: jest.fn(async () => false),
    },
    destinationProfileResolver: {
      resolveProfileForSave: jest.fn(async () => ({
        id: 'default',
        name: 'Default',
        notionDataSourceId: 'data-source-native',
        notionDataSourceType: 'database',
      })),
    },
  };

  return {
    ...services,
    ...overrides,
  };
}
