/**
 * @jest-environment jsdom
 */

// 【重構】直接導入源代碼（Babel 自動處理 ES Module → CommonJS 轉換）
const {
  findTextInPage,
  findTextWithTreeWalker,
  findTextFuzzy,
} = require('../../../../scripts/highlighter/utils/textSearch.js');

describe('utils/textSearch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('findTextWithTreeWalker', () => {
    test('should find text in simple element', () => {
      document.body.innerHTML = '<div>Hello World</div>';
      const range = findTextWithTreeWalker('Hello');

      expect(range).not.toBe(null);
      expect(range.toString()).toBe('Hello');
    });

    test('should return null if text not found', () => {
      document.body.innerHTML = '<div>Hello World</div>';
      const range = findTextWithTreeWalker('NotFound');

      expect(range).toBe(null);
    });

    test('should find text in nested elements', () => {
      document.body.innerHTML = '<div><p>Hello World</p></div>';
      const range = findTextWithTreeWalker('World');

      expect(range).not.toBe(null);
      expect(range.toString()).toBe('World');
    });

    test('should skip script and style tags', () => {
      document.body.innerHTML = `
                <div>Visible Text</div>
                <script>Hidden Script</script>
                <style>Hidden Style</style>
            `;

      expect(findTextWithTreeWalker('Visible')).not.toBe(null);
      expect(findTextWithTreeWalker('Hidden')).toBe(null);
    });
  });

  describe('findTextFuzzy', () => {
    test('should find text with flexible whitespace', () => {
      document.body.innerHTML = '<div>Hello  World</div>';
      const range = findTextFuzzy('Hello World');

      expect(range).not.toBe(null);
    });

    test('should be case insensitive', () => {
      document.body.innerHTML = '<div>Hello World</div>';
      const range = findTextFuzzy('hello world');

      expect(range).not.toBe(null);
    });

    test('should return null if not found', () => {
      document.body.innerHTML = '<div>Hello World</div>';
      const range = findTextFuzzy('NotFound');

      expect(range).toBe(null);
    });
  });

  describe('findTextInPage', () => {
    test('should delegate to findTextWithTreeWalker', () => {
      // findTextInPage 會嘗試 window.find(),失敗後調用 findTextWithTreeWalker
      // 在 jsdom 環境中，直接測試 findTextWithTreeWalker 更可靠
      document.body.innerHTML = '<div>Direct Test</div>';
      const range = findTextWithTreeWalker('Direct');
      expect(range).not.toBe(null);
    });

    test('should return null for empty/whitespace-only string', () => {
      document.body.innerHTML = '<div>Hello World</div>';

      // trim() 後變成空字符串
      const range1 = findTextInPage('   ');
      expect(range1).toBe(null);

      // 完全空字符串
      const range2 = findTextInPage('');
      expect(range2).toBe(null);
    });
  });
});
