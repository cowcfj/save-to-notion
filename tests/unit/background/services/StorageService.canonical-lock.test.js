import {
  StorageService,
  PAGE_PREFIX,
  URL_ALIAS_PREFIX,
  SAVED_PREFIX,
} from '../../../../scripts/background/services/StorageService.js';
import {
  createStorageServiceHarness,
  mockStorageLookup,
  expectLockKeysToTarget,
} from './serviceTestSupport.js';

describe('StorageService - Canonical Lock', () => {
  let service = null;
  let mockStorage = null;

  beforeEach(() => {
    ({ service, mockStorage } = createStorageServiceHarness(StorageService));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Canonical lock alignment across writers', () => {
    it('updateHighlights 與 setSavedPageData 在 alias 命中時 MUST 鎖在同一個 page_<stable>', async () => {
      const originalUrl = 'https://example.com/post?utm=x';
      const stableUrl = 'https://example.com/post';
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;

      mockStorageLookup(mockStorage, {
        [`${URL_ALIAS_PREFIX}${originalUrl}`]: stableUrl,
        [`${URL_ALIAS_PREFIX}${stableUrl}`]: stableUrl,
        [stablePageKey]: {
          notion: null,
          highlights: [{ id: 'seed', text: 'seed', color: 'yellow' }],
          metadata: { lastUpdated: 1 },
        },
      });

      const lockSpy = jest.spyOn(service, '_withLock');

      await Promise.all([
        service.updateHighlights(originalUrl, [{ id: 'h-update', text: 'u', color: 'yellow' }]),
        service.setSavedPageData(originalUrl, {
          notionPageId: 'page-1',
          notionUrl: 'https://notion.so/page-1',
          title: 'T',
        }),
      ]);

      expect(lockSpy).toHaveBeenCalled();
      expectLockKeysToTarget(lockSpy, stablePageKey, 2);
    });

    it.each([
      {
        name: 'savePageDataAndHighlights',
        expectedCount: 1,
        action: (srv, url) =>
          srv.savePageDataAndHighlights(url, { title: 'T' }, [
            { id: 'h', text: 't', color: 'yellow' },
          ]),
      },
      {
        name: 'clearNotionState',
        expectedCount: 1,
        action: (srv, url) => srv.clearNotionState(url),
      },
      {
        name: 'removeSavedPageData',
        expectedCount: 1,
        action: (srv, url) => srv.removeSavedPageData(url),
      },
      {
        name: '_triggerReadTimeUpgrade',
        expectedCount: null,
        action: async (srv, url) => {
          const savedKey = `${SAVED_PREFIX}${url}`;
          const savedData = { notionPageId: 'pid', title: 'Recipe' };
          await srv._triggerReadTimeUpgrade(url, savedData, savedKey);
          await Promise.resolve();
          await Promise.resolve();
        },
      },
    ])('$name 在 alias 命中時 MUST 鎖在 page_<stable>', async ({ action, expectedCount }) => {
      const originalUrl = 'https://example.com/target?ref=x';
      const stableUrl = 'https://example.com/target';
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;

      mockStorageLookup(mockStorage, {
        [`${URL_ALIAS_PREFIX}${originalUrl}`]: stableUrl,
        [`${URL_ALIAS_PREFIX}${stableUrl}`]: stableUrl,
        [stablePageKey]: {
          notion: { pageId: 'pid', url: 'https://notion.so/pid' },
          highlights: [],
          metadata: { lastUpdated: 1 },
        },
      });

      const lockSpy = jest.spyOn(service, '_withLock');

      await action(service, originalUrl);

      expect(lockSpy).toHaveBeenCalled();
      expectLockKeysToTarget(lockSpy, stablePageKey, expectedCount);
    });
  });
});
