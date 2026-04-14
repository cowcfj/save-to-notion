import {
  isSavedStatusResponse,
  createSaveStatusResponse,
} from '../../../scripts/config/saveStatus.js';

describe('saveStatus edge cases', () => {
  test('isSavedStatusResponse should return false for null status', () => {
    expect(isSavedStatusResponse(null)).toBe(false);
    expect(isSavedStatusResponse(undefined)).toBe(false);
  });

  test('isSavedStatusResponse should treat deletionPending as saved', () => {
    expect(
      isSavedStatusResponse({
        deletionPending: true,
      })
    ).toBe(true);
  });

  test('isSavedStatusResponse should treat wasDeleted as unsaved', () => {
    expect(
      isSavedStatusResponse({
        wasDeleted: true,
      })
    ).toBe(false);
  });

  test('isSavedStatusResponse should prioritize deletionPending over wasDeleted', () => {
    expect(
      isSavedStatusResponse({
        deletionPending: true,
        wasDeleted: true,
      })
    ).toBe(true);
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
