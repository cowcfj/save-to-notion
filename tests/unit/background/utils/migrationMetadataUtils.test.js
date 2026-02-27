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

    test('should return true when url exists', () => {
      expect(hasNotionData({ url: 'https://notion.so/page-2' })).toBe(true);
    });

    test('should return false when no notion fields exist', () => {
      expect(hasNotionData({ title: 'no-notion' })).toBe(false);
      expect(hasNotionData(null)).toBe(false);
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
        isSameNotionPage({ notionUrl: 'https://notion.so/a' }, { url: 'https://notion.so/a' })
      ).toBe(true);
      expect(
        isSameNotionPage({ notionUrl: 'https://notion.so/a' }, { notionUrl: 'https://notion.so/b' })
      ).toBe(false);
    });

    test('should default to true when both ids and urls are unavailable', () => {
      expect(isSameNotionPage({ title: 'a' }, { title: 'b' })).toBe(true);
      expect(isSameNotionPage(null, null)).toBe(true);
    });
  });
});
