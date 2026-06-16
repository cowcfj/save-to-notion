// NotionService.highlight-section.test.js
import { NotionService } from '../../../../scripts/background/services/NotionService.js';
import { paragraphBlock, headingBlock } from '../../../helpers/notionServiceTestHarness.js';

describe('NotionService - _findHighlightSectionBlocks (靜態方法)', () => {
  const HEADER = '📝 頁面標記';

  it.each([
    {
      desc: '應該處理只有標題沒有內容的情況',
      blocks: [paragraphBlock('1'), headingBlock('2', 3, HEADER)],
      expected: ['2'],
    },
    {
      desc: '應該正確識別標記區塊',
      blocks: [
        paragraphBlock('1'),
        headingBlock('2', 3, HEADER),
        paragraphBlock('3'),
        paragraphBlock('4'),
      ],
      expected: ['2', '3', '4'],
    },
    {
      desc: '應該在遇到下一個標題時停止收集',
      blocks: [
        headingBlock('1', 3, HEADER),
        paragraphBlock('2'),
        headingBlock('3', 2),
        paragraphBlock('4'),
      ],
      expected: ['1', '2'],
    },
    {
      desc: '應該正確處理沒有標記區域的情況',
      blocks: [paragraphBlock('1'), headingBlock('2', 2)],
      expected: [],
    },
    {
      desc: '應該處理空區塊數組',
      blocks: [],
      expected: [],
    },
    {
      desc: '應收集所有非標題類型的區塊',
      blocks: [
        headingBlock('1', 3, HEADER),
        paragraphBlock('2'),
        { id: '3', type: 'image', image: {} },
        paragraphBlock('4'),
      ],
      expected: ['1', '2', '3', '4'],
    },
    {
      desc: '應該忽略沒有 ID 的區塊',
      blocks: [headingBlock('1', 3, HEADER), { type: 'paragraph' }, paragraphBlock('3')],
      expected: ['1', '3'],
    },
    {
      desc: '應該只處理第一個匹配的標記區域',
      blocks: [
        headingBlock('1', 3, HEADER),
        paragraphBlock('2'),
        headingBlock('3', 3, HEADER),
        paragraphBlock('4'),
      ],
      expected: ['1', '2'],
    },
    {
      desc: '應該跳過內容不同的 heading_3',
      blocks: [headingBlock('1', 3, '其他標題'), headingBlock('2', 3, HEADER), paragraphBlock('3')],
      expected: ['2', '3'],
    },
    {
      desc: '應該將 nullish 區塊視為標記區域邊界以避免擴大刪除範圍',
      blocks: [headingBlock('1', 3, HEADER), paragraphBlock('2'), null, paragraphBlock('3')],
      expected: ['1', '2'],
    },
    {
      desc: '應該處理標記區域在頁面末尾的情況',
      blocks: [
        paragraphBlock('1'),
        paragraphBlock('2'),
        headingBlock('3', 3, HEADER),
        paragraphBlock('4'),
      ],
      expected: ['3', '4'],
    },
  ])('$desc', ({ blocks, expected }) => {
    const result = NotionService._findHighlightSectionBlocks(blocks);
    expect(result).toEqual(expected);
  });
});
