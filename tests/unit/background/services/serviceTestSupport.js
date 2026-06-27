import {
  HIGHLIGHTS_PREFIX,
  PAGE_PREFIX,
  SAVED_PREFIX,
  URL_ALIAS_PREFIX,
} from '../../../../scripts/config/shared/storage.js';

export const buildUnauthorizedError = (overrides = {}) => {
  const err = new Error(overrides.message || 'Unauthorized');
  err.status = 401;
  Object.assign(err, overrides);
  return err;
};

export const mockActiveToken = (getActiveNotionTokenMock, { token, mode }) => {
  getActiveNotionTokenMock.mockResolvedValueOnce({ token, mode });
};

export const mockRefreshToken = (refreshOAuthTokenMock, valueOrError) => {
  if (valueOrError instanceof Error) {
    refreshOAuthTokenMock.mockRejectedValueOnce(valueOrError);
    return;
  }

  refreshOAuthTokenMock.mockResolvedValueOnce(valueOrError);
};

export const paragraphBlock = id => ({ id, type: 'paragraph' });

export const headingBlock = (id, level = 3, content = '') => {
  const type = `heading_${level}`;
  return {
    id,
    type,
    [type]: { rich_text: content ? [{ text: { content } }] : [] },
  };
};

export function buildHighlight(overrides = {}) {
  return {
    id: 'highlight-1',
    text: 'Test highlight',
    color: 'yellow',
    rangeInfo: {},
    timestamp: 12_345,
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

export function buildPageRecord({
  notion = buildSavedPageData(),
  highlights = [],
  metadata = {},
} = {}) {
  const notionRecord = notion
    ? {
        pageId: notion.notionPageId ?? notion.pageId ?? null,
        url: notion.notionUrl ?? notion.url ?? null,
        title: notion.title ?? null,
        savedAt: notion.savedAt ?? null,
        lastVerifiedAt: notion.lastVerifiedAt ?? null,
      }
    : null;

  return {
    notion: notionRecord,
    highlights,
    metadata: {
      createdAt: 12_345,
      lastUpdated: 12_345,
      ...metadata,
    },
  };
}

export function buildPageState({
  url,
  notion = buildSavedPageData(),
  highlights = [],
  metadata,
} = {}) {
  return {
    [`${PAGE_PREFIX}${url}`]: buildPageRecord({ notion, highlights, metadata }),
  };
}

export function buildAliasState({ originalUrl, stableUrl }) {
  return {
    [`${URL_ALIAS_PREFIX}${originalUrl}`]: stableUrl,
  };
}

export function buildDeletedState({
  originalUrl,
  stableUrl = originalUrl,
  highlights = [buildHighlight()],
  includeAlias = stableUrl !== originalUrl,
} = {}) {
  return {
    ...(includeAlias ? buildAliasState({ originalUrl, stableUrl }) : {}),
    ...buildPageState({ url: stableUrl, notion: null, highlights }),
  };
}

export function buildStaleStableState({
  originalUrl,
  stableUrl,
  notion = buildSavedPageData(),
  highlights = [],
  includeAlias = true,
} = {}) {
  return {
    ...(includeAlias ? buildAliasState({ originalUrl, stableUrl }) : {}),
    ...buildPageState({ url: stableUrl, notion, highlights }),
  };
}

export function buildLegacyState({
  url,
  savedData = buildSavedPageData(),
  highlights = [buildHighlight()],
} = {}) {
  return {
    [`${SAVED_PREFIX}${url}`]: savedData,
    [`${HIGHLIGHTS_PREFIX}${url}`]: highlights,
  };
}

export function createStorageServiceHarness(StorageService) {
  const mockStorage = {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
    },
    sync: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
    },
  };
  const mockLogger = {
    log: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  };
  const service = new StorageService({
    chromeStorage: mockStorage,
    logger: mockLogger,
  });
  return { service, mockStorage, mockLogger };
}

export function mockStorageLookup(mockStorage, storageData) {
  mockStorage.local.get.mockImplementation(keys => {
    const isEmptyKeys = Array.isArray(keys) && keys.length === 0;
    const shouldReturnAll = keys === null || keys === undefined || isEmptyKeys;

    if (shouldReturnAll) {
      return Promise.resolve({ ...storageData });
    }
    const keyList = Array.isArray(keys) ? keys : [keys];
    const result = {};
    keyList.forEach(k => {
      if (storageData && k in storageData) {
        result[k] = storageData[k];
      }
    });
    return Promise.resolve(result);
  });
}

export async function flushReadTimeUpgrade() {
  await new Promise(process.nextTick);
  await new Promise(process.nextTick);
}

export function flattenRemovedKeys(mockStorage) {
  return mockStorage.local.remove.mock.calls.flatMap(args => args[0]);
}

export function buildAliasPageState({ originalUrl, stableUrl, pageState }) {
  return {
    ...buildAliasState({ originalUrl, stableUrl }),
    [`${PAGE_PREFIX}${stableUrl}`]: pageState,
  };
}

export function expectLockKeysToTarget(lockSpy, stablePageKey, expectedCount = 1) {
  const lockKeys = lockSpy.mock.calls.map(call => call[0]);
  if (expectedCount !== undefined && expectedCount !== null) {
    expect(lockKeys).toHaveLength(expectedCount);
    expect(lockKeys.every(k => k === stablePageKey)).toBe(true);
  } else {
    expect(lockKeys.length).toBeGreaterThan(0);
    expect(lockKeys[0]).toBe(stablePageKey);
  }
}
