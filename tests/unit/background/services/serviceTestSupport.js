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

export function buildPageRecord({
  notion = {
    notionPageId: 'page-123',
    notionUrl: 'https://www.notion.so/page-123',
    title: 'Test Page',
    savedAt: 12_345,
    lastVerifiedAt: 12_345,
  },
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
