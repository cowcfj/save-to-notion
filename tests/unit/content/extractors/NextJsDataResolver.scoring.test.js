/**
 * @jest-environment jsdom
 */

import * as NextJsDataResolver from '../../../../scripts/content/extractors/NextJsDataResolver.js';

describe('NextJsDataResolver Scoring Helpers', () => {
  describe('_scoreKeysDimension', () => {
    it('同時包含合法的 title 和 author 時加 15 分', () => {
      const node = { title: 'Some Title', author: 'Some Author' };
      expect(NextJsDataResolver.scoreKeysDimension(node)).toBe(15);
    });

    it('僅包含合法的 title 時加 10 分', () => {
      const node = { title: 'Some Title' };
      expect(NextJsDataResolver.scoreKeysDimension(node)).toBe(10);
    });

    it('僅包含合法的 author 時加 5 分', () => {
      const node = { author: 'Some Author' };
      expect(NextJsDataResolver.scoreKeysDimension(node)).toBe(5);
    });

    it('空節點或無匹配特徵時得 0 分', () => {
      const node = {};
      expect(NextJsDataResolver.scoreKeysDimension(node)).toBe(0);
    });

    it('非物件節點時得 0 分', () => {
      expect(NextJsDataResolver.scoreKeysDimension(null)).toBe(0);
      expect(NextJsDataResolver.scoreKeysDimension(undefined)).toBe(0);
    });
  });

  describe('_scoreStructuralDimension', () => {
    it('包含非空 paragraphs 陣列時加 40 分', () => {
      const node = { paragraphs: ['Para 1'] };
      expect(NextJsDataResolver.scoreStructuralDimension(node)).toBe(40);
    });

    it('paragraphs 陣列為空或非陣列時得 0 分', () => {
      expect(NextJsDataResolver.scoreStructuralDimension({ paragraphs: [] })).toBe(0);
      expect(NextJsDataResolver.scoreStructuralDimension({})).toBe(0);
    });

    it('非物件節點時得 0 分', () => {
      expect(NextJsDataResolver.scoreStructuralDimension(null)).toBe(0);
      expect(NextJsDataResolver.scoreStructuralDimension(undefined)).toBe(0);
    });
  });

  describe('_scoreContentDimension', () => {
    it('包含 text (字串) 且有 id 時加 15 分', () => {
      const node = { text: 'Some text', id: '123' };
      expect(NextJsDataResolver.scoreContentDimension(node)).toBe(15);
    });

    it('包含 content (字串且長度 > 100) 時加 20 分', () => {
      const longContent = 'A'.repeat(101);
      const node = { content: longContent };
      expect(NextJsDataResolver.scoreContentDimension(node)).toBe(20);
    });

    it('同時滿足 text+id 與 content (> 100) 時累加 35 分', () => {
      const longContent = 'A'.repeat(101);
      const node = { text: 'Some text', id: '123', content: longContent };
      expect(NextJsDataResolver.scoreContentDimension(node)).toBe(35);
    });

    it('條件不滿足時得 0 分', () => {
      expect(NextJsDataResolver.scoreContentDimension({ text: 'Some text' })).toBe(0); // 缺 id
      expect(NextJsDataResolver.scoreContentDimension({ content: 'short content' })).toBe(0); // 長度 <= 100
    });

    it('非物件節點時得 0 分', () => {
      expect(NextJsDataResolver.scoreContentDimension(null)).toBe(0);
      expect(NextJsDataResolver.scoreContentDimension(undefined)).toBe(0);
    });
  });

  describe('_scoreStructureAndText', () => {
    it('應正確加總各個特徵維度的分數', () => {
      const node = {
        title: 'Title',
        author: 'Author',
        paragraphs: ['P1'],
        text: 'Text',
        id: '999',
        content: 'C'.repeat(105),
      };
      // Keys (15) + Structural (40) + Content (35) = 90
      expect(NextJsDataResolver.scoreStructureAndText(node)).toBe(90);
    });
  });
});
