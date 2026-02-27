import {
  hasNotionData,
  isSameNotionPage,
} from '../../../../scripts/background/utils/migrationMetadataUtils.js';

describe('migrationMetadataUtils', () => {
  describe('hasNotionData', () => {
    test('should return true when notionPageId exists', () => {
      expect(hasNotionData({ notionPageId: 'page-1' })).toBe(true);
    });

    test('should return true when pageId exists', () => {
      expect(hasNotionData({ pageId: 'page-2' })).toBe(true);
    });

    test('should return true when notionUrl exists', () => {
      expect(hasNotionData({ notionUrl: 'https://notion.so/page-1' })).toBe(true);
    });

    test('should return false when only generic url exists', () => {
      expect(hasNotionData({ url: 'https://example.com/article' })).toBe(false);
    });

    test('should return false when no notion fields exist', () => {
      expect(hasNotionData({ title: 'no-notion' })).toBe(false);
      expect(hasNotionData(null)).toBe(false);
    });

    test('should return true when notion nested fields exist', () => {
      expect(
        hasNotionData({
          notion: {
            pageId: 'nested-page-1',
            url: 'https://notion.so/nested-page-1',
            title: 'Nested Title',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        })
      ).toBe(true);
    });

    test('should return false when notion nested object is null', () => {
      expect(hasNotionData({ notion: null, highlights: [{ id: 'h1' }] })).toBe(false);
    });
  });

  describe('isSameNotionPage', () => {
    test('should compare by pageId first when both page ids exist', () => {
      expect(
        isSameNotionPage({ notionPageId: 'same-id' }, { notionPageId: 'same-id', notionUrl: 'x' })
      ).toBe(true);
      expect(isSameNotionPage({ pageId: 'id-1' }, { pageId: 'id-2' })).toBe(false);
    });

    test('should compare by notion url when page ids are unavailable', () => {
      expect(
        isSameNotionPage({ notionUrl: 'https://notion.so/a' }, { notionUrl: 'https://notion.so/a' })
      ).toBe(true);
      expect(
        isSameNotionPage({ notionUrl: 'https://notion.so/a' }, { notionUrl: 'https://notion.so/b' })
      ).toBe(false);
    });

    test('should return null when both ids and notion urls are unavailable', () => {
      expect(isSameNotionPage({ title: 'a' }, { title: 'b' })).toBeNull();
      expect(isSameNotionPage(null, null)).toBeNull();
    });

    test('should return null when only one side has pageId or notionUrl', () => {
      expect(isSameNotionPage({ pageId: 'id-1' }, { notionUrl: 'https://notion.so/a' })).toBeNull();
    });

    test('should compare correctly between flat and nested notion fields', () => {
      expect(
        isSameNotionPage(
          { notionPageId: 'mixed-id', notionUrl: 'https://notion.so/flat' },
          { notion: { pageId: 'mixed-id', url: 'https://notion.so/nested' } }
        )
      ).toBe(true);

      expect(
        isSameNotionPage(
          { notionUrl: 'https://notion.so/flat-a' },
          { notion: { url: 'https://notion.so/flat-b' } }
        )
      ).toBe(false);
    });

    test('should compare correctly when both sides use nested notion fields', () => {
      expect(
        isSameNotionPage(
          { notion: { pageId: 'nested-id-1', url: 'https://notion.so/a' } },
          { notion: { pageId: 'nested-id-1', url: 'https://notion.so/b' } }
        )
      ).toBe(true);

      expect(
        isSameNotionPage(
          { notion: { pageId: 'nested-id-1', url: 'https://notion.so/a' } },
          { notion: { pageId: 'nested-id-2', url: 'https://notion.so/a' } }
        )
      ).toBe(false);
    });
  });
});
