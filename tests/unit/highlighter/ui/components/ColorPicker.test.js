/**
 * ColorPicker.js 單元測試
 */

import { renderColorPicker } from '../../../../../scripts/highlighter/ui/components/ColorPicker.js';

describe('ColorPicker', () => {
  let container = null;
  const mockColors = {
    yellow: 'rgba(255, 255, 0, 0.3)',
    green: 'rgba(0, 255, 0, 0.3)',
    blue: 'rgba(0, 0, 255, 0.3)',
    red: 'rgba(255, 0, 0, 0.3)',
  };

  beforeEach(() => {
    // 建立測試容器
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // 清理
    document.body.removeChild(container);
  });

  describe('參數驗證', () => {
    test('應該要求容器參數', () => {
      expect(() => {
        renderColorPicker(null, mockColors, 'yellow', jest.fn());
      }).toThrow('Container is required');
    });

    test('應該要求 colors 是對象', () => {
      expect(() => {
        renderColorPicker(container, null, 'yellow', jest.fn());
      }).toThrow('Colors must be an object');

      expect(() => {
        renderColorPicker(container, 'not an object', 'yellow', jest.fn());
      }).toThrow('Colors must be an object');
    });

    test('應該要求 onColorChange 是函數', () => {
      expect(() => {
        renderColorPicker(container, mockColors, 'yellow', null);
      }).toThrow('onColorChange must be a function');

      expect(() => {
        renderColorPicker(container, mockColors, 'yellow', 'not a function');
      }).toThrow('onColorChange must be a function');
    });
  });

  describe('渲染', () => {
    test('應該渲染所有顏色按鈕', () => {
      const onColorChange = jest.fn();
      renderColorPicker(container, mockColors, 'yellow', onColorChange);

      const buttons = container.querySelectorAll('.nh-color-btn');
      expect(buttons.length).toBe(4); // 4 種顏色
    });

    test('應該為當前顏色添加選中樣式', () => {
      const onColorChange = jest.fn();
      renderColorPicker(container, mockColors, 'yellow', onColorChange);

      const yellowBtn = container.querySelector('[data-color="yellow"]');
      expect(yellowBtn.classList.contains('active')).toBe(true);
    });

    test('應該為非當前顏色添加未選中樣式', () => {
      const onColorChange = jest.fn();
      renderColorPicker(container, mockColors, 'yellow', onColorChange);

      const greenBtn = container.querySelector('[data-color="green"]');
      expect(greenBtn.classList.contains('active')).toBe(false);
    });

    test('應該設置正確的背景顏色', () => {
      const onColorChange = jest.fn();
      renderColorPicker(container, mockColors, 'yellow', onColorChange);

      const yellowBtn = container.querySelector('[data-color="yellow"]');
      expect(yellowBtn.style.background).toBe(mockColors.yellow);
    });

    test('應該設置正確的標題', () => {
      const onColorChange = jest.fn();
      renderColorPicker(container, mockColors, 'yellow', onColorChange);

      const yellowBtn = container.querySelector('[data-color="yellow"]');
      expect(yellowBtn.getAttribute('title')).toBe('黃色標註');
    });
  });

  describe('交互', () => {
    test('應該在點擊按鈕時調用 onColorChange', () => {
      const onColorChange = jest.fn();
      renderColorPicker(container, mockColors, 'yellow', onColorChange);

      const greenBtn = container.querySelector('[data-color="green"]');
      greenBtn.click();

      expect(onColorChange).toHaveBeenCalledWith('green');
    });

    test('應該在點擊後重新渲染以更新選中狀態', () => {
      const onColorChange = jest.fn();
      renderColorPicker(container, mockColors, 'yellow', onColorChange);

      const greenBtn = container.querySelector('[data-color="green"]');
      greenBtn.click();

      // 重新渲染後，green 應該被選中
      const updatedGreenBtn = container.querySelector('[data-color="green"]');
      expect(updatedGreenBtn.classList.contains('active')).toBe(true);
    });
  });
});
