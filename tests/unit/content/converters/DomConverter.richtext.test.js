/**
 * @jest-environment jsdom
 */

import { DomConverter } from '../../../../scripts/content/converters/DomConverter.js';

describe('DomConverter 富文字處理', () => {
  describe('_processRichTextArray 處理流程', () => {
    test('當 input 為空時應回傳空陣列', () => {
      const result = DomConverter._processRichTextArray([]);
      expect(result).toEqual([]);
    });

    test('當所有元素都只有空白時應回傳空陣列', () => {
      const input = [
        { type: 'text', text: { content: '   ' }, annotations: {} },
        { type: 'text', text: { content: '  ' }, annotations: {} },
        { type: 'text', text: { content: '\n\t' }, annotations: {} },
      ];
      const result = DomConverter._processRichTextArray(input);
      expect(result).toEqual([]);
    });

    test('單一文字元素應去除前後空白', () => {
      const input = [{ type: 'text', text: { content: '  Hello  ' }, annotations: {} }];
      const result = DomConverter._processRichTextArray(input);
      expect(result).toHaveLength(1);
      expect(result[0].text.content).toBe('Hello');
    });

    test('當第一個元素只有空白時應去除前導空白', () => {
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

    test('當最後一個元素只有空白時應去除尾端空白', () => {
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

    test('應正確處理前後多個只有空白的元素', () => {
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

    test('不應修改原始 input 陣列', () => {
      const input = [{ type: 'text', text: { content: '  Hello  ' }, annotations: {} }];
      const originalContent = input[0].text.content;

      DomConverter._processRichTextArray(input);

      // 原始輸入應保持不變
      expect(input[0].text.content).toBe(originalContent);
    });

    test('遇到 annotations.code 時應保留前後空白與換行', () => {
      const input = [
        {
          type: 'text',
          text: { content: '\n  const answer = 42;\n' },
          annotations: { code: true },
        },
      ];

      const result = DomConverter._processRichTextArray(input);

      expect(result).toHaveLength(1);
      expect(result[0].text.content).toBe('\n  const answer = 42;\n');
    });
  });
});
