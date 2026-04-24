import {
  HIGHLIGHTS_PREFIX,
  PAGE_PREFIX,
  SAVED_PREFIX,
  URL_ALIAS_PREFIX,
} from '../../scripts/config/shared/storage.js';

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
