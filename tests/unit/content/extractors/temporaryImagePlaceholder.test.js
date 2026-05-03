import { buildTemporaryImagePlaceholderBlock } from '../../../../scripts/content/extractors/temporaryImagePlaceholder.js';

const SAMPLE_URL =
  'https://c10.patreonusercontent.com/4/patreon-media/p/post/1.png?token-time=1700000000&token-hash=abc';

// 與 source 模板對齊（scripts/content/extractors/temporaryImagePlaceholder.js）。
// 全形 「」（）， 與 source 完全相同；source 改字會視覺對比即發現。
const buildExpectedPrefix = (altTag = '') =>
  `🖼️ Patreon 圖片${altTag}（暫存連結，可能無法在 Notion 中顯示）：`;

const PREFIX_WITHOUT_ALT_TAG = buildExpectedPrefix('');

describe('buildTemporaryImagePlaceholderBlock', () => {
  describe('預設行為', () => {
    test('不傳 options 時回傳完整 paragraph block 結構', () => {
      const block = buildTemporaryImagePlaceholderBlock(SAMPLE_URL);

      expect(block.object).toBe('block');
      expect(block.type).toBe('paragraph');
      expect(block.paragraph.rich_text).toHaveLength(2);
      expect(block.paragraph.rich_text[0]).toEqual({
        type: 'text',
        text: { content: PREFIX_WITHOUT_ALT_TAG },
      });
      expect(block._meta).toEqual({
        placeholder: true,
        placeholderReason: 'temporary_image_url',
        originalSrc: SAMPLE_URL,
        alt: '',
      });
    });
  });

  describe('alt 處理', () => {
    test('alt 為非空有效字串時，prefix 包含「alt」且 _meta.alt 等於原值', () => {
      const block = buildTemporaryImagePlaceholderBlock(SAMPLE_URL, { alt: 'Cat' });

      expect(block.paragraph.rich_text[0].text.content).toBe(buildExpectedPrefix('「Cat」'));
      expect(block._meta.alt).toBe('Cat');
    });

    test('alt 為空字串時，prefix 不含「」標記', () => {
      const block = buildTemporaryImagePlaceholderBlock(SAMPLE_URL, { alt: '' });

      expect(block.paragraph.rich_text[0].text.content).toBe(PREFIX_WITHOUT_ALT_TAG);
      expect(block._meta.alt).toBe('');
    });

    test('alt 為全空白字串時，prefix 不含「」但 _meta.alt 保留原始空白', () => {
      const block = buildTemporaryImagePlaceholderBlock(SAMPLE_URL, { alt: '   ' });

      expect(block.paragraph.rich_text[0].text.content).toBe(PREFIX_WITHOUT_ALT_TAG);
      expect(block._meta.alt).toBe('   ');
    });

    test('alt 為非字串（number）時，prefix 不含「」且 _meta.alt 為空字串', () => {
      const block = buildTemporaryImagePlaceholderBlock(SAMPLE_URL, { alt: 123 });

      expect(block.paragraph.rich_text[0].text.content).toBe(PREFIX_WITHOUT_ALT_TAG);
      expect(block._meta.alt).toBe('');
    });

    test('alt 含前後空白時，prefix 內為 trimmed 值，_meta.alt 保留原值', () => {
      const block = buildTemporaryImagePlaceholderBlock(SAMPLE_URL, { alt: '  Cat  ' });

      expect(block.paragraph.rich_text[0].text.content).toBe(buildExpectedPrefix('「Cat」'));
      expect(block._meta.alt).toBe('  Cat  ');
    });
  });

  describe('結構不變式', () => {
    test('rich_text 第二段固定為帶 link 的「原始連結」，url 同時寫入 _meta.originalSrc', () => {
      const block = buildTemporaryImagePlaceholderBlock(SAMPLE_URL);

      expect(block.paragraph.rich_text[1]).toEqual({
        type: 'text',
        text: {
          content: '原始連結',
          link: { url: SAMPLE_URL },
        },
      });
      expect(block._meta.originalSrc).toBe(SAMPLE_URL);
    });
  });
});
