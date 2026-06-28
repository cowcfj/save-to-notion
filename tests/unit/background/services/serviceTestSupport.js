export {
  buildAliasState,
  buildDeletedState,
  buildHighlight,
  buildLegacyState,
  buildPageRecord,
  buildPageState,
  buildSavedPageData,
  buildStaleStableState,
} from '../../../helpers/status-fixtures.js';

export {
  buildAliasPageState,
  createStorageServiceHarness,
  expectLockKeysToTarget,
  flattenRemovedKeys,
  flushReadTimeUpgrade,
  mockStorageLookup,
} from '../../../helpers/storageServiceTestHarness.js';

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
