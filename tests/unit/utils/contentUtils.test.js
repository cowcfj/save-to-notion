/**
 * @jest-environment node
 */

import { isTitleConsistent } from '../../../scripts/utils/contentUtils.js';

describe('contentUtils', () => {
  describe('isTitleConsistent', () => {
    describe('邊界情況', () => {
      it('當 candidateTitle 為空時應返回 true', () => {
        expect(isTitleConsistent('', 'Some Title')).toBe(true);
        expect(isTitleConsistent(null, 'Some Title')).toBe(true);
        expect(isTitleConsistent(undefined, 'Some Title')).toBe(true);
      });

      it('當 docTitle 為空時應返回 true', () => {
        expect(isTitleConsistent('Some Title', '')).toBe(true);
        expect(isTitleConsistent('Some Title', null)).toBe(true);
        expect(isTitleConsistent('Some Title', undefined)).toBe(true);
      });
    });

    describe('短標題豁免', () => {
      it('當 candidateTitle 長度小於或等於 4 時應返回 true (避免誤殺)', () => {
        expect(isTitleConsistent('News', 'Different Title')).toBe(true);
        expect(isTitleConsistent('HK01', 'Something else')).toBe(true);
        expect(isTitleConsistent('A', 'B')).toBe(true);
      });

      it('當 candidateTitle 長度為 5 時應進行檢查', () => {
        // "12345" 長度為 5，不豁免。
        // docTitle 不包含 "12345"，應返回 false
        expect(isTitleConsistent('12345', 'Other')).toBe(false);
      });
    });

    describe('標題一致性檢查', () => {
      it('當標題完全一致時應返回 true', () => {
        const title = 'This is a very long title for testing';
        expect(isTitleConsistent(title, title)).toBe(true);
      });

      it('應忽略前後空白', () => {
        expect(isTitleConsistent('  Some Title  ', 'Some Title')).toBe(true);
        expect(isTitleConsistent('Some Title', '  Some Title  ')).toBe(true);
      });

      it('應不區分大小寫', () => {
        expect(isTitleConsistent('apple', 'APPLE')).toBe(true);
        expect(isTitleConsistent('Mixed Case Title', 'mixed case title')).toBe(true);
      });

      it('當 docTitle 包含 candidateTitle 的前 15 個字元特徵值時應返回 true', () => {
        const candidate = '這是一個超過十五個字元的長標題，用來測試特徵值匹配。';
        const signature = candidate.slice(0, 15);

        // docTitle 包含特徵值，但後綴不同
        const docTitle = `${signature} | 網站名稱`;

        expect(isTitleConsistent(candidate, docTitle)).toBe(true);
      });

      it('當 docTitle 不包含 candidateTitle 的前 15 個字元特徵值時應返回 false', () => {
        const candidate = '這是一個超過十五個字元的長標題，用來測試特徵值匹配。';
        const docTitle = '完全不相關的標題';

        expect(isTitleConsistent(candidate, docTitle)).toBe(false);
      });

      it('當 candidateTitle 長度剛好為 15 時應正確檢查', () => {
        const title = '123456789012345'; // length 15
        expect(isTitleConsistent(title, title)).toBe(true);
        expect(isTitleConsistent(title, '123456789012345 - Suffix')).toBe(true);
        expect(isTitleConsistent(title, 'Prefix - 123456789012345')).toBe(true);
        expect(isTitleConsistent(title, 'Mismatch')).toBe(false);
      });
    });
  });
});
