const { convertMarkdownToNotionBlocks, isValidAbsoluteUrl } = require('../helpers/htmlToNotionConverter.testable');

describe('HTML → Markdown → Notion Blocks - Wrapper', () => {
  test('標題與段落轉換', () => {
    const md = '# Title\n\nParagraph text.';
    const blocks = convertMarkdownToNotionBlocks(md);
    expect(blocks[0].type).toBe('heading_1');
    expect(blocks[1].type).toBe('paragraph');
  });

  test('列表與代碼塊轉換', () => {
    const md = '- item1\n- item2\n\n```js\nconsole.log(1)\n```\n';
    const blocks = convertMarkdownToNotionBlocks(md);
    const listItems = blocks.filter(b => b.type === 'bulleted_list_item');
    const code = blocks.find(b => b.type === 'code');
    expect(listItems.length).toBe(2);
    expect(code.code.language).toBe('js');
    expect(code.code.rich_text[0].text.content).toContain('console.log');
  });

  test('編號列表與未閉合代碼塊處理', () => {
    const md = '1. first\n2. second\n\n```py\nprint(\'hi\')\n'; // 未閉合，應收尾處理
    const blocks = convertMarkdownToNotionBlocks(md);
    const listItems = blocks.filter(b => b.type === 'bulleted_list_item');
    const code = blocks.find(b => b.type === 'code');
    expect(listItems.map(b => b.bulleted_list_item.rich_text[0].text.content)).toEqual(['first','second']);
    expect(code).toBeTruthy();
    expect(code.code.language).toBe('py');
  });

  test('多級標題 (h2,h3) 轉換', () => {
    const md = '## H2 heading\n### H3 heading';
    const blocks = convertMarkdownToNotionBlocks(md);
    expect(blocks[0].type).toBe('heading_2');
    expect(blocks[1].type).toBe('heading_3');
  });

  test('絕對連結驗證', () => {
    expect(isValidAbsoluteUrl('https://example.com/path')).toBe(true);
    expect(isValidAbsoluteUrl('/relative/path')).toBe(false);
    expect(isValidAbsoluteUrl('not a url')).toBe(false);
    expect(isValidAbsoluteUrl('javascript:alert(1)')).toBe(false);
    expect(isValidAbsoluteUrl('mailto:user@example.com')).toBe(false);
    expect(isValidAbsoluteUrl('ftp://example.com/file.txt')).toBe(true);
  });
});
