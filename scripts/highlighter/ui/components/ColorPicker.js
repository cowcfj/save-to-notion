/**
 * 顏色選擇器組件
 * 負責渲染顏色選擇按鈕並處理選擇事件
 */

import { UI_MESSAGES } from '../../../config/shared/messages.js';

/**
 * 獲取顏色的中文名稱
 *
 * @param {string} color - 顏色英文名稱
 * @returns {string} 顏色的中文名稱
 */
function getColorName(color) {
  return UI_MESSAGES.TOOLBAR.COLOR_PICKER_NAMES[color] || color;
}

/**
 * 渲染顏色選擇器
 *
 * @param {HTMLElement} container - 容器元素
 * @param {object} colors - 顏色配置對象，格式: {colorName: colorValue}
 * @param {string} currentColor - 當前選中的顏色
 * @param {Function} onColorChange - 顏色變更回調函數
 */
export function renderColorPicker(container, colors, currentColor, onColorChange) {
  if (!container) {
    throw new Error('Container is required');
  }
  if (!colors || typeof colors !== 'object') {
    throw new Error('Colors must be an object');
  }
  if (typeof onColorChange !== 'function') {
    throw new TypeError('onColorChange must be a function');
  }

  // 生成顏色按鈕的 HTML
  const colorButtons = Object.keys(colors)
    .map(color => {
      const isActive = color === currentColor;
      const activeClass = isActive ? 'active' : '';

      return `
            <button 
                type="button"
                class="nh-color-btn ${activeClass}" 
                data-color="${color}"
                style="background: ${colors[color]};"
                title="${UI_MESSAGES.TOOLBAR.COLOR_PICKER_TITLE(getColorName(color))}"
                aria-label="${UI_MESSAGES.TOOLBAR.COLOR_PICKER_ARIA_LABEL(getColorName(color))}"
            ></button>
        `;
    })
    .join('');

  // 設置容器內容
  container.innerHTML = colorButtons;

  // 綁定點擊事件
  container.querySelectorAll('.nh-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      if (color) {
        onColorChange(color);
        // 重新渲染以更新選中狀態
        renderColorPicker(container, colors, color, onColorChange);
      }
    });
  });
}
