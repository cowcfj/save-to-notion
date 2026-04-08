/**
 * @jest-environment jsdom
 */

import { DomConverter } from '../../../../scripts/content/converters/DomConverter.js';

describe('DomConverter Rich Text Processing', () => {
  describe('_processRichTextArray', () => {
    test('returns empty array when input is empty', () => {
      const result = DomConverter._processRichTextArray([]);
      expect(result).toEqual([]);
    });

    test('returns empty array when all elements are whitespace-only', () => {
      const input = [
        { type: 'text', text: { content: '   ' }, annotations: {} },
        { type: 'text', text: { content: '  ' }, annotations: {} },
        { type: 'text', text: { content: '\n\t' }, annotations: {} },
      ];
      const result = DomConverter._processRichTextArray(input);
      expect(result).toEqual([]);
    });

    test('trims surrounding spaces from single text element', () => {
      const input = [{ type: 'text', text: { content: '  Hello  ' }, annotations: {} }];
      const result = DomConverter._processRichTextArray(input);
      expect(result).toHaveLength(1);
      expect(result[0].text.content).toBe('Hello');
    });

    test('trims leading whitespace when first element is whitespace-only', () => {
      const input = [
        { type: 'text', text: { content: '   ' }, annotations: {} },
        { type: 'text', text: { content: '  Hello' }, annotations: {} },
        { type: 'text', text: { content: ' world  ' }, annotations: {} },
      ];

      const result = DomConverter._processRichTextArray(input);
      const joined = result.map(r => r.text.content).join('');

      expect(joined).toBe('Hello world');
      expect(joined.startsWith(' ')).toBe(false);
    });

    test('trims trailing whitespace when last element is whitespace-only', () => {
      // 輸入：第一個有前導空白，最後一個是純空白
      // 預期：第一個元素 trimStart，倒數第二個元素（最後一個非空白）trimEnd
      const input = [
        { type: 'text', text: { content: '  Hello' }, annotations: {} },
        { type: 'text', text: { content: ' world  ' }, annotations: {} },
        { type: 'text', text: { content: '   ' }, annotations: {} },
      ];

      const result = DomConverter._processRichTextArray(input);
      const joined = result.map(r => r.text.content).join('');

      expect(joined).toBe('Hello world');
      expect(joined.endsWith(' ')).toBe(false);
    });

    test('handles multiple whitespace-only elements at boundaries', () => {
      // 前後都有多個純空白節點
      const input = [
        { type: 'text', text: { content: '   ' }, annotations: {} },
        { type: 'text', text: { content: '  ' }, annotations: {} },
        { type: 'text', text: { content: '  Hello' }, annotations: { bold: true } },
        { type: 'text', text: { content: ' ' }, annotations: {} },
        { type: 'text', text: { content: 'world  ' }, annotations: {} },
        { type: 'text', text: { content: '  ' }, annotations: {} },
        { type: 'text', text: { content: '   ' }, annotations: {} },
      ];

      const result = DomConverter._processRichTextArray(input);
      const joined = result.map(r => r.text.content).join('');

      // 預期：Hello 被 trimStart，world 被 trimEnd，中間的空白保留
      expect(joined).toBe('Hello world');
    });

    test('does not mutate original input array', () => {
      const input = [{ type: 'text', text: { content: '  Hello  ' }, annotations: {} }];
      const originalContent = input[0].text.content;

      DomConverter._processRichTextArray(input);

      // 原始輸入應保持不變
      expect(input[0].text.content).toBe(originalContent);
    });
  });
});
