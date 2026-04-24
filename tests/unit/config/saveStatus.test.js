import {
  isSavedStatusResponse,
  createSaveStatusResponse,
} from '../../../scripts/config/saveStatus.js';

describe('saveStatus 邊界情境', () => {
  test('isSavedStatusResponse 對 null 狀態應回傳 false', () => {
    expect(isSavedStatusResponse(null)).toBe(false);
    expect(isSavedStatusResponse(undefined)).toBe(false);
  });

  test('isSavedStatusResponse 應將 deletionPending 視為已保存', () => {
    expect(
      isSavedStatusResponse({
        deletionPending: true,
      })
    ).toBe(true);
  });

  test('isSavedStatusResponse 應將 wasDeleted 視為未保存', () => {
    expect(
      isSavedStatusResponse({
        wasDeleted: true,
      })
    ).toBe(false);
  });

  test('isSavedStatusResponse 應優先以 deletionPending 覆蓋 wasDeleted', () => {
    expect(
      isSavedStatusResponse({
        deletionPending: true,
        wasDeleted: true,
      })
    ).toBe(true);
  });

  test('createSaveStatusResponse 應正確處理未知的 statusKind', () => {
    const response = createSaveStatusResponse({
      statusKind: 'unknown_kind',
      stableUrl: 'https://example.com',
    });

    expect(response).toEqual(
      expect.objectContaining({
        canSave: false,
        canSyncHighlights: false,
        isSaved: false,
        statusKind: 'error',
        success: false,
        stableUrl: 'https://example.com',
        error: 'unknown_status_kind',
      })
    );
  });

  test('createSaveStatusResponse 不應允許 extra 覆寫 canonical 欄位與 savedData 欄位', () => {
    const response = createSaveStatusResponse({
      statusKind: 'saved',
      stableUrl: 'https://example.com',
      savedData: {
        notionPageId: 'saved-page-id',
        notionUrl: 'https://www.notion.so/saved-page-id',
        title: 'saved-title',
      },
      extra: {
        statusKind: 'unsaved',
        stableUrl: 'https://override.example.com',
        canSave: false,
        canSyncHighlights: false,
        isSaved: false,
        wasDeleted: true,
        deletionPending: true,
        notionPageId: 'extra-page-id',
        notionUrl: 'https://www.notion.so/extra-page-id',
        title: 'extra-title',
        customFlag: 'preserved',
      },
    });

    expect(response).toEqual(
      expect.objectContaining({
        statusKind: 'saved',
        stableUrl: 'https://example.com',
        canSave: false,
        canSyncHighlights: true,
        isSaved: true,
        wasDeleted: false,
        deletionPending: false,
        notionPageId: 'saved-page-id',
        notionUrl: 'https://www.notion.so/saved-page-id',
        title: 'saved-title',
        customFlag: 'preserved',
      })
    );
  });
});
