import {
  isSavedStatusResponse,
  createSaveStatusResponse,
} from '../../../scripts/config/saveStatus.js';

describe('saveStatus edge cases', () => {
  test('isSavedStatusResponse should return false for null status', () => {
    expect(isSavedStatusResponse(null)).toBe(false);
    expect(isSavedStatusResponse(undefined)).toBe(false);
  });

  test('createSaveStatusResponse should handle unknown statusKind correctly', () => {
    const response = createSaveStatusResponse({
      statusKind: 'unknown_kind',
      stableUrl: 'https://example.com',
    });

    expect(response).toEqual(
      expect.objectContaining({
        canSave: false,
        canSyncHighlights: false,
        isSaved: false,
        statusKind: 'unknown_kind',
        success: true,
        stableUrl: 'https://example.com',
      })
    );
  });
});
