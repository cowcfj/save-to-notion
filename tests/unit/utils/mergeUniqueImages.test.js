import { mergeUniqueImages } from '../../../scripts/utils/imageUtils.js';

describe('mergeUniqueImages', () => {
  test('應該正確處理空輸入', () => {
    expect(mergeUniqueImages([], [])).toEqual([]);
    expect(mergeUniqueImages(null, [])).toEqual([]);
    expect(mergeUniqueImages([], null)).toEqual([]);
  });

  test('當沒有重複時應保留所有 additionalImages', () => {
    const contentBlocks = [{ type: 'text' }];
    const additionalImages = [{ type: 'image', image: { external: { url: 'https://img1.com' } } }];

    const result = mergeUniqueImages(contentBlocks, additionalImages);
    expect(result).toHaveLength(1);
    expect(result[0].image.external.url).toBe('https://img1.com');
  });

  test('應該過濾掉已存在於 contentBlocks 中的圖片', () => {
    const contentBlocks = [
      { type: 'image', image: { external: { url: 'https://duplicate.com' } } },
    ];
    const additionalImages = [
      { type: 'image', image: { external: { url: 'https://duplicate.com' } } },
      { type: 'image', image: { external: { url: 'https://unique.com' } } },
    ];

    const result = mergeUniqueImages(contentBlocks, additionalImages);
    expect(result).toHaveLength(1);
    expect(result[0].image.external.url).toBe('https://unique.com');
  });

  test('應該處理 additionalImages 中的自我重複', () => {
    const contentBlocks = [];
    const additionalImages = [
      { type: 'image', image: { external: { url: 'https://dup.com' } } },
      { type: 'image', image: { external: { url: 'https://dup.com' } } },
    ];

    const result = mergeUniqueImages(contentBlocks, additionalImages);
    expect(result).toHaveLength(1);
    expect(result[0].image.external.url).toBe('https://dup.com');
  });
});
