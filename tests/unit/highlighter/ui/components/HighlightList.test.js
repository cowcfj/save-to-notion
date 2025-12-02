/**
 * HighlightList.js 單元測試
 */

import { renderHighlightList } from '../../../../../scripts/highlighter/ui/components/HighlightList.js';

describe('HighlightList', () => {
  let container = null;
  const mockHighlights = [
    { id: '1', text: '這是第一段標註文字', color: 'yellow' },
    {
      id: '2',
      text: '這是第二段標註文字，內容比較長需要截斷處理以確保不會破壞版面',
      color: 'green',
    },
    { id: '3', text: '這是第三段標註文字', color: 'blue' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('參數驗證', () => {
    test('應該要求容器參數', () => {
      expect(() => {
        renderHighlightList(null, [], jest.fn());
      }).toThrow('Container is required');
    });

    test('應該要求 highlights 是數組', () => {
      expect(() => {
        renderHighlightList(container, null, jest.fn());
      }).toThrow('Highlights must be an array');

      expect(() => {
        renderHighlightList(container, 'not an array', jest.fn());
      }).toThrow('Highlights must be an array');
    });

    test('應該要求 onDelete 是函數', () => {
      expect(() => {
        renderHighlightList(container, [], null);
      }).toThrow('onDelete must be a function');
    });
  });

  describe('空列表渲染', () => {
    test('應該顯示空列表提示', () => {
      renderHighlightList(container, [], jest.fn());

      expect(container.textContent).toContain('暫無標註');
    });
  });

  describe('列表渲染', () => {
    test('應該渲染所有標註項目', () => {
      renderHighlightList(container, mockHighlights, jest.fn());

      const items = container.querySelectorAll('.nh-btn-delete');
      expect(items.length).toBe(3);
    });

    test('應該正確顯示標註序號和顏色', () => {
      renderHighlightList(container, mockHighlights, jest.fn());

      expect(container.textContent).toContain('1. 黃色標註');
      expect(container.textContent).toContain('2. 綠色標註');
      expect(container.textContent).toContain('3. 藍色標註');
    });

    test('應該截斷過長的文本', () => {
      // 使用真正超過 40 字符的文本進行測試
      const longHighlights = [
        {
          id: '1',
          text: '這是一個非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常長的標註文字內容',
          color: 'yellow',
        },
      ];
      renderHighlightList(container, longHighlights, jest.fn());

      const longText = longHighlights[0].text;
      // 確認文本長度確實超過 40
      expect(longText.length).toBeGreaterThan(40);
      // 檢查 innerHTML 中是否包含省略符號
      expect(container.innerHTML).toContain('...');
    });

    test('應該不截斷短文本', () => {
      renderHighlightList(container, mockHighlights, jest.fn());

      expect(container.textContent).toContain(mockHighlights[0].text);
    });

    test('應該為每個項目設置正確的 data-highlight-id', () => {
      renderHighlightList(container, mockHighlights, jest.fn());

      const firstBtn = container.querySelector('[data-highlight-id="1"]');
      const secondBtn = container.querySelector('[data-highlight-id="2"]');

      expect(firstBtn).toBeTruthy();
      expect(secondBtn).toBeTruthy();
    });
  });

  describe('刪除功能', () => {
    test('應該在點擊刪除按鈕時調用 onDelete', () => {
      const onDelete = jest.fn();
      renderHighlightList(container, mockHighlights, onDelete);

      const firstDeleteBtn = container.querySelector('[data-highlight-id="1"]');
      firstDeleteBtn.click();

      expect(onDelete).toHaveBeenCalledWith('1');
    });

    test('應該為每個項目綁定獨立的刪除處理函數', () => {
      const onDelete = jest.fn();
      renderHighlightList(container, mockHighlights, onDelete);

      const buttons = container.querySelectorAll('.nh-btn-delete');
      buttons[0].click();
      buttons[1].click();
      buttons[2].click();

      expect(onDelete).toHaveBeenCalledTimes(3);
      expect(onDelete).toHaveBeenNthCalledWith(1, '1');
      expect(onDelete).toHaveBeenNthCalledWith(2, '2');
      expect(onDelete).toHaveBeenNthCalledWith(3, '3');
    });
  });

  describe('打開 Notion 功能', () => {
    test('應該在提供 onOpenNotion 時渲染打開按鈕', () => {
      const onOpenNotion = jest.fn();
      renderHighlightList(container, mockHighlights, jest.fn(), onOpenNotion);

      const openBtn = container.querySelector('#list-open-notion-v2');
      expect(openBtn).toBeTruthy();
    });

    test('應該在未提供 onOpenNotion 時不渲染打開按鈕', () => {
      renderHighlightList(container, mockHighlights, jest.fn());

      const openBtn = container.querySelector('#list-open-notion-v2');
      expect(openBtn).toBeFalsy();
    });

    test('應該在點擊打開按鈕時調用 onOpenNotion', () => {
      const onOpenNotion = jest.fn();
      renderHighlightList(container, mockHighlights, jest.fn(), onOpenNotion);

      const openBtn = container.querySelector('#list-open-notion-v2');
      openBtn.click();

      expect(onOpenNotion).toHaveBeenCalled();
    });
  });
});
