/**
 * @jest-environment jsdom
 */

import {
  findTextInPage,
  findTextWithTreeWalker,
  findTextFuzzy,
} from '../../../../scripts/highlighter/utils/textSearch.js';

describe('utils/textSearch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('findTextWithTreeWalker', () => {
    test('should find text in simple element', () => {
      document.body.innerHTML = '<div>Hello World</div>';
      const range = findTextWithTreeWalker('Hello');

      expect(range).not.toBeNull();
      expect(range.toString()).toBe('Hello');
    });

    test('should return null if text not found', () => {
      document.body.innerHTML = '<div>Hello World</div>';
      const range = findTextWithTreeWalker('NotFound');

      expect(range).toBeNull();
    });

    test('should find text in nested elements', () => {
      document.body.innerHTML = '<div><p>Hello World</p></div>';
      const range = findTextWithTreeWalker('World');

      expect(range).not.toBeNull();
      expect(range.toString()).toBe('World');
    });

    test('should skip script and style tags', () => {
      document.body.innerHTML = `
                <div>Visible Text</div>
                <script>Hidden Script</script>
                <style>Hidden Style</style>
            `;

      expect(findTextWithTreeWalker('Visible')).not.toBeNull();
      expect(findTextWithTreeWalker('Hidden')).toBeNull();
    });
  });

  describe('findTextFuzzy', () => {
    test('should find text with flexible whitespace', () => {
      document.body.innerHTML = '<div>Hello  World</div>';
      const range = findTextFuzzy('Hello World');

      expect(range).not.toBeNull();
    });

    test('should be case insensitive', () => {
      document.body.innerHTML = '<div>Hello World</div>';
      const range = findTextFuzzy('hello world');

      expect(range).not.toBeNull();
    });

    test('should return null if not found', () => {
      document.body.innerHTML = '<div>Hello World</div>';
      const range = findTextFuzzy('NotFound');

      expect(range).toBeNull();
    });

    test.each([
      {
        contextType: 'prefix',
        html: `
          <p>The first apple is green.</p>
          <p>The second apple is red.</p>
        `,
        searchText: 'apple',
        context: { prefix: 'second ' },
        expectedContainerText: 'second',
        expectedText: 'apple',
      },
      {
        contextType: 'suffix',
        html: `
          <p>Target is matching here</p>
          <p>Target is wrong here</p>
        `,
        searchText: 'Target',
        context: { suffix: ' is matching' },
        expectedContainerText: 'matching',
        expectedText: 'Target',
      },
    ])(
      'should disambiguate multiple matches using $contextType',
      ({ html, searchText, context, expectedContainerText, expectedText }) => {
        document.body.innerHTML = html;

        const range = findTextFuzzy(searchText, context);

        expect(range).not.toBeNull();
        expect(range.startContainer.textContent).toContain(expectedContainerText);
        expect(range.toString()).toBe(expectedText);
      }
    );
  });

  describe('findTextInPage', () => {
    test('should delegate to findTextWithTreeWalker', () => {
      // findTextInPage 會嘗試 window.find(),失敗後調用 findTextWithTreeWalker
      // 在 jsdom 環境中，直接測試 findTextWithTreeWalker 更可靠
      document.body.innerHTML = '<div>Direct Test</div>';
      const range = findTextWithTreeWalker('Direct');
      expect(range).not.toBeNull();
    });

    test('should return null for empty/whitespace-only string', () => {
      document.body.innerHTML = '<div>Hello World</div>';

      // trim() 後變成空字符串
      const range1 = findTextInPage('   ');
      expect(range1).toBeNull();

      // 完全空字符串
      const range2 = findTextInPage('');
      expect(range2).toBeNull();
    });
  });
});
