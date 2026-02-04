/**
 * @jest-environment jsdom
 */

// 【重構】直接導入源代碼（Babel 自動處理 ES Module → CommonJS 轉換）
const {
  getNodePath,
  parsePathFromString,
  getNodeByPath,
  isValidPathString,
} = require('../../../../scripts/highlighter/utils/path.js');

describe('utils/path', () => {
  beforeEach(() => {
    // 清除 body 內容
    document.body.innerHTML = '';
  });

  describe('getNodePath', () => {
    test('should return empty string for document.body', () => {
      expect(getNodePath(document.body)).toBe('');
    });

    test('should return path for element node', () => {
      const div = document.createElement('div');
      document.body.append(div);

      const path = getNodePath(div);
      expect(path).toBe('div[0]');
    });

    test('should return path for nested elements', () => {
      const div = document.createElement('div');
      const paragraph = document.createElement('p');
      div.append(paragraph);
      document.body.append(div);

      const path = getNodePath(paragraph);
      expect(path).toBe('div[0]/p[0]');
    });

    test('should return path for text node', () => {
      const div = document.createElement('div');
      div.textContent = 'Hello';
      document.body.append(div);

      const textNode = div.firstChild;
      const path = getNodePath(textNode);
      expect(path).toBe('div[0]/text[0]');
    });

    test('should handle multiple siblings', () => {
      document.body.innerHTML = '<div></div><div></div><div></div>';
      const thirdDiv = document.body.children[2];

      const path = getNodePath(thirdDiv);
      expect(path).toBe('div[2]');
    });
  });

  describe('parsePathFromString', () => {
    test('should parse simple element path', () => {
      const result = parsePathFromString('div[0]');
      expect(result).toEqual([{ type: 'element', tag: 'div', index: 0 }]);
    });

    test('should parse nested path', () => {
      const result = parsePathFromString('div[0]/p[2]/text[0]');
      expect(result).toEqual([
        { type: 'element', tag: 'div', index: 0 },
        { type: 'element', tag: 'p', index: 2 },
        { type: 'text', index: 0 },
      ]);
    });

    test('should return empty array for empty string', () => {
      expect(parsePathFromString('')).toEqual([]);
      expect(parsePathFromString('  ')).toEqual([]);
    });

    test('should return null for invalid format', () => {
      expect(parsePathFromString('invalid')).toBe(null);
      expect(parsePathFromString('div')).toBe(null);
      expect(parsePathFromString('div[]')).toBe(null);
    });

    test('should return null for non-string input', () => {
      expect(parsePathFromString(null)).toBe(null);
      expect(parsePathFromString()).toBe(null);
      expect(parsePathFromString(123)).toBe(null);
    });
  });

  describe('getNodeByPath', () => {
    test('should return document.body for empty array', () => {
      expect(getNodeByPath([])).toBe(document.body);
    });

    test('should return document.body for empty string', () => {
      expect(getNodeByPath('')).toBe(document.body);
    });

    test('should get element by path array', () => {
      const div = document.createElement('div');
      document.body.append(div);

      const path = [{ type: 'element', tag: 'div', index: 0 }];
      const node = getNodeByPath(path);

      expect(node).toBe(div);
    });

    test('should get element by path string', () => {
      const div = document.createElement('div');
      document.body.append(div);

      const node = getNodeByPath('div[0]');
      expect(node).toBe(div);
    });

    test('should get nested element', () => {
      const div = document.createElement('div');
      const paragraph = document.createElement('p');
      div.append(paragraph);
      document.body.append(div);

      const node = getNodeByPath('div[0]/p[0]');
      expect(node).toBe(paragraph);
    });

    test('should get text node', () => {
      const div = document.createElement('div');
      div.textContent = 'Hello';
      document.body.append(div);

      const node = getNodeByPath('div[0]/text[0]');
      expect(node).toBe(div.firstChild);
      expect(node.nodeType).toBe(Node.TEXT_NODE);
    });

    test('should return null for invalid path', () => {
      expect(getNodeByPath('div[999]')).toBe(null);
    });

    test('should return null for malformed path string', () => {
      expect(getNodeByPath('invalid')).toBe(null);
    });

    test('should use fuzzy matching when exact index not found', () => {
      document.body.innerHTML = '<div><p>First</p></div>';

      // 請求 p[5]（不存在），但會找到第一個 p 元素
      const path = [
        { type: 'element', tag: 'div', index: 0 },
        { type: 'element', tag: 'p', index: 5 },
      ];

      const node = getNodeByPath(path);
      expect(node).not.toBe(null);
      expect(node.tagName.toLowerCase()).toBe('p');
    });
  });

  describe('isValidPathString', () => {
    test('should return true for valid paths', () => {
      expect(isValidPathString('div[0]')).toBe(true);
      expect(isValidPathString('div[0]/p[2]/text[0]')).toBe(true);
      expect(isValidPathString('text[0]')).toBe(true);
    });

    test('should return true for empty string', () => {
      expect(isValidPathString('')).toBe(true);
      expect(isValidPathString('  ')).toBe(true);
    });

    test('should return false for invalid formats', () => {
      expect(isValidPathString('div')).toBe(false);
      expect(isValidPathString('div[]')).toBe(false);
      expect(isValidPathString('div[abc]')).toBe(false);
      expect(isValidPathString('invalid')).toBe(false);
    });

    test('should return false for non-string types', () => {
      expect(isValidPathString(null)).toBe(false);
      expect(isValidPathString()).toBe(false);
      expect(isValidPathString(123)).toBe(false);
      expect(isValidPathString({})).toBe(false);
    });
  });

  describe('round-trip conversion', () => {
    test('should maintain path integrity through conversion', () => {
      const div = document.createElement('div');
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Test';
      div.append(paragraph);
      document.body.append(div);

      const textNode = paragraph.firstChild;
      const path = getNodePath(textNode);
      const retrievedNode = getNodeByPath(path);

      expect(retrievedNode).toBe(textNode);
    });

    test('should handle complex nested structure', () => {
      document.body.innerHTML = `
                <div>
                    <div>
                        <p>First</p>
                        <p>Second</p>
                    </div>
                </div>
            `;

      const secondP = document.body.querySelector('div > div > p:nth-child(2)');
      const path = getNodePath(secondP);
      const retrievedNode = getNodeByPath(path);

      expect(retrievedNode).toBe(secondP);
      expect(retrievedNode.textContent).toBe('Second');
    });
  });
});
