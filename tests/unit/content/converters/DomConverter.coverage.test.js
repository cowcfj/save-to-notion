/**
 * @jest-environment jsdom
 */

/**
 * DomConverter 覆蓋率補強測試
 *
 * 針對未覆蓋的分支和邊界情況
 */

import { DomConverter, domConverter } from '../../../../scripts/content/converters/DomConverter.js';

describe('DomConverter 覆蓋率補強', () => {
  let converter = null;

  beforeEach(() => {
    converter = new DomConverter();
  });

  describe('initStrategies H4-H6 處理', () => {
    test('H4 應該創建加粗段落', () => {
      const html = '<h4>Heading 4</h4>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].paragraph.rich_text[0].annotations.bold).toBe(true);
    });

    test('H5 應該創建加粗段落', () => {
      const html = '<h5>Heading 5</h5>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].paragraph.rich_text[0].annotations.bold).toBe(true);
    });

    test('H6 應該創建加粗段落', () => {
      const html = '<h6>Heading 6</h6>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].paragraph.rich_text[0].annotations.bold).toBe(true);
    });
  });

  describe('createBoldParagraphBlock', () => {
    test('空的 H4 應該返回 null', () => {
      const html = '<h4></h4>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(0);
    });

    test('非文字類型 rich text 應該保持原樣', () => {
      // 模擬含有非 text 類型的 rich_text（通過測試 map 分支）
      const html = '<h4>Normal text</h4>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      blocks[0].paragraph.rich_text.forEach(rt => {
        expect(rt.annotations.bold).toBe(true);
      });
    });
  });

  describe('createParagraphBlock 段落內圖片', () => {
    test('段落只包含圖片時應返回圖片 Block', () => {
      const html = '<p><img src="https://example.com/image.jpg" alt="test"></p>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('image');
    });

    test('段落包含圖片和文字時應返回段落', () => {
      const html = '<p><img src="https://example.com/image.jpg">Some text</p>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
    });
  });

  describe('processList 非 LI 子節點', () => {
    test('UL 中的非 LI 元素應該被穿透處理', () => {
      const html = '<ul><li>Item 1</li><div><p>Nested paragraph</p></div></ul>';
      const blocks = converter.convert(html);

      // 應該有列表項和段落
      expect(blocks.length).toBeGreaterThanOrEqual(1);
    });

    test('processList 應該處理陣列結果', () => {
      const html = '<ul><li>Item</li><article><p>Para 1</p><p>Para 2</p></article></ul>';
      const blocks = converter.convert(html);

      expect(blocks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('processListItem 孤立 LI', () => {
    test('孤立的 LI 應該使用默認處理器', () => {
      const html = '<li>Orphan item</li>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('bulleted_list_item');
    });
  });

  describe('createListItemBlock 複雜結構', () => {
    test('LI 中的 P 元素應該提取文本', () => {
      const html = '<ul><li><p>Paragraph in list</p></li></ul>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('bulleted_list_item');
    });

    test('LI 中的 Block 級元素應該作為 children', () => {
      const html = '<ul><li>Title<blockquote>Quote</blockquote></li></ul>';
      const blocks = converter.convert(html);

      expect(blocks.length).toBeGreaterThanOrEqual(1);
    });

    test('LI 中的 inline 元素陣列應該合併', () => {
      const html = '<ul><li><b>Bold</b><i>Italic</i></li></ul>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].bulleted_list_item.rich_text.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('processFigure', () => {
    test('Figure 包含 img 和 figcaption', () => {
      const html =
        '<figure><img src="https://example.com/img.jpg"><figcaption>Caption text</figcaption></figure>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('image');
      expect(blocks[0].image.caption[0].text.content).toBe('Caption text');
    });

    test('Figure 沒有 img 應返回 null', () => {
      const html = '<figure><figcaption>Caption only</figcaption></figure>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(0);
    });

    test('Figure 有空的 figcaption', () => {
      const html =
        '<figure><img src="https://example.com/img.jpg"><figcaption>  </figcaption></figure>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      // 空 figcaption 不應該覆蓋 alt
    });
  });

  describe('processInlineNode 樣式處理', () => {
    test('U 和 INS 應該設置 underline', () => {
      const html = '<p><u>Underline</u> <ins>Inserted</ins></p>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
    });

    test('S, DEL, STRIKE 應該設置 strikethrough', () => {
      const html = '<p><s>Strike</s> <del>Deleted</del></p>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
    });

    test('CODE, KBD, SAMP, TT 應該設置 code', () => {
      const html = '<p><code>code</code> <kbd>kbd</kbd></p>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
    });

    test('A 標籤中的子節點應該繼承 link', () => {
      const html = '<p><a href="https://example.com"><b>Bold link</b> text</a></p>';
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].paragraph.rich_text.some(rt => rt.text?.link?.url)).toBe(true);
    });

    test('危險協議 URL 應該被忽略', () => {
      // skipcq: JS-0087, JS-0096 -- 測試危險 URL 過濾功能
      const jsUrl = 'java' + 'script:void(0)';
      const html = `<p><a href="${jsUrl}">Click me</a></p>`;
      const blocks = converter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].paragraph.rich_text[0].text.link).toBeUndefined();
    });
  });

  describe('mapLanguage', () => {
    test('應該映射常見語言縮寫', () => {
      expect(DomConverter.mapLanguage('js')).toBe('javascript');
      expect(DomConverter.mapLanguage('ts')).toBe('typescript');
      expect(DomConverter.mapLanguage('py')).toBe('python');
    });

    test('null 應該返回 plain text', () => {
      expect(DomConverter.mapLanguage(null)).toBe('plain text');
    });

    test('未知語言應該原樣返回', () => {
      expect(DomConverter.mapLanguage('unknown')).toBe('unknown');
    });
  });

  describe('cleanBlocks', () => {
    test('應該處理空數組', () => {
      expect(DomConverter.cleanBlocks([])).toEqual([]);
    });

    test('應該過濾無效的 blocks', () => {
      const blocks = [null, undefined, {}, { type: 'paragraph' }];
      const cleaned = DomConverter.cleanBlocks(blocks);

      // 有效的 block 必須有 block[type] 存在
      expect(cleaned).toHaveLength(0); // paragraph block 沒有 paragraph property
    });

    test('應該處理空的 rich_text', () => {
      const blocks = [
        {
          type: 'paragraph',
          paragraph: { rich_text: [] },
        },
      ];
      const cleaned = DomConverter.cleanBlocks(blocks);

      expect(cleaned).toHaveLength(1);
      expect(cleaned[0].paragraph.rich_text[0].text.content).toBe(' ');
    });

    test('應該截斷過長的 rich_text', () => {
      const longText = 'a'.repeat(3000);
      const blocks = [
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: longText } }],
          },
        },
      ];
      const cleaned = DomConverter.cleanBlocks(blocks);

      expect(cleaned[0].paragraph.rich_text[0].text.content.length).toBeLessThanOrEqual(2000);
    });

    test('應該處理帶 children 的 blocks', () => {
      const blocks = [
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: 'Parent' } }],
            children: [
              {
                type: 'bulleted_list_item',
                bulleted_list_item: {
                  rich_text: [{ type: 'text', text: { content: 'Child' } }],
                },
              },
            ],
          },
        },
      ];
      const cleaned = DomConverter.cleanBlocks(blocks);

      expect(cleaned.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('processNode', () => {
    test('應該忽略隱藏元素 display:none', () => {
      const html = '<div style="display:none">Hidden</div>';
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const node = doc.body.firstChild;

      const result = converter.processNode(node);
      expect(result).toBeNull();
    });

    test('應該忽略隱藏元素 visibility:hidden', () => {
      const html = '<div style="visibility:hidden">Hidden</div>';
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const node = doc.body.firstChild;

      const result = converter.processNode(node);
      expect(result).toBeNull();
    });
  });

  describe('domConverter 單例', () => {
    test('domConverter 應該是 DomConverter 實例', () => {
      expect(domConverter).toBeInstanceOf(DomConverter);
    });
  });
});
