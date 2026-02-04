/**
 * XSS 安全性測試
 * 驗證 renderHighlightList 能正確防禦惡意腳本注入
 */

import { renderHighlightList } from '../../../../../scripts/highlighter/ui/components/HighlightList.js';

describe('HighlightList - XSS 安全性測試', () => {
  let container = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  test('應該防禦 script 標籤注入', () => {
    const maliciousHighlights = [
      {
        id: '1',
        text: '<script>alert("XSS")</script>',
        color: 'yellow',
      },
    ];

    renderHighlightList(container, maliciousHighlights, jest.fn());

    // 確認文本被轉義顯示，而不是執行
    expect(container.textContent).toContain('<script>alert("XSS")</script>');
    // 確認沒有實際的 script 元素被創建
    expect(container.querySelector('script')).toBeNull();
  });

  test('應該防禦 img onerror 事件注入', () => {
    const maliciousHighlights = [
      {
        id: '1',
        text: '<img src=x onerror="alert(\'XSS\')">',
        color: 'green',
      },
    ];

    renderHighlightList(container, maliciousHighlights, jest.fn());

    // 確認文本被轉義顯示
    expect(container.textContent).toContain('<img src=x onerror="alert(\'XSS\')">');
    // 確認沒有 img 元素被創建（除了刪除按鈕中的 SVG）
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(0);
  });

  test('應該防禦 iframe 注入', () => {
    const maliciousHighlights = [
      {
        id: '1',
        text: '<iframe src="javascript:alert(\'XSS\')"></iframe>',
        color: 'blue',
      },
    ];

    renderHighlightList(container, maliciousHighlights, jest.fn());

    // 確認文本被轉義
    expect(container.textContent).toContain('<iframe');
    // 確認沒有 iframe 元素被創建
    expect(container.querySelector('iframe')).toBeNull();
  });

  test('應該防禦 HTML 實體注入', () => {
    const maliciousHighlights = [
      {
        id: '1',
        text: '&lt;script&gt;alert("XSS")&lt;/script&gt;',
        color: 'red',
      },
    ];

    renderHighlightList(container, maliciousHighlights, jest.fn());

    // textContent 會顯示原始的 HTML 實體
    expect(container.textContent).toContain('&lt;script&gt;');
    expect(container.querySelector('script')).toBeNull();
  });

  test('應該防禦事件處理器注入', () => {
    const maliciousHighlights = [
      {
        id: '1',
        text: '<div onclick="alert(\'XSS\')">Click me</div>',
        color: 'yellow',
      },
    ];

    renderHighlightList(container, maliciousHighlights, jest.fn());

    // 確認文本被轉義
    expect(container.textContent).toContain('<div onclick="alert(\'XSS\')">');
    // 確認沒有額外的 div 元素被創建（除了我們自己創建的結構）
    const allDivs = container.querySelectorAll('div');
    // 應該只有我們結構中的 div，不包含用戶注入的
    allDivs.forEach(div => {
      expect(div.getAttribute('onclick')).toBeNull();
    });
  });

  test('應該正確處理混合內容（合法文本 + 惡意腳本）', () => {
    const maliciousHighlights = [
      {
        id: '1',
        text: '正常文本 <script>alert("XSS")</script>',
        color: 'green',
      },
    ];

    renderHighlightList(container, maliciousHighlights, jest.fn());

    // 整個文本應該被當作純文本顯示（包含 HTML 標籤）
    expect(container.textContent).toContain('正常文本 <script>alert("XSS")</script>');
    expect(container.querySelector('script')).toBeNull();
  });

  test('應該防禦顏色參數注入（雖然風險較低）', () => {
    const maliciousHighlights = [
      {
        id: '1',
        text: '正常文本',
        color: '<script>alert("XSS")</script>',
      },
    ];

    renderHighlightList(container, maliciousHighlights, jest.fn());

    // 顏色參數也應該被安全處理
    expect(container.querySelector('script')).toBeNull();
    // 顯示的顏色名稱應該是轉義後的
    expect(container.textContent).toContain('<script>alert("XSS")</script>');
  });
});
