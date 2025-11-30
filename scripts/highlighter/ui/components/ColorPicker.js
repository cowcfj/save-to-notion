/**
 * 顏色選擇器組件
 * 負責渲染顏色選擇按鈕並處理選擇事件
 */

/**
 * 獲取顏色的中文名稱
 * @param {string} color - 顏色英文名稱
 * @returns {string} 顏色的中文名稱
 */
function getColorName(color) {
    const names = {
        yellow: '黃',
        green: '綠',
        blue: '藍',
        red: '紅'
    };
    return names[color] || color;
}

/**
 * 渲染顏色選擇器
 * @param {HTMLElement} container - 容器元素
 * @param {Object} colors - 顏色配置對象，格式: {colorName: colorValue}
 * @param {string} currentColor - 當前選中的顏色
 * @param {Function} onColorChange - 顏色變更回調函數
 */
export function renderColorPicker(
    container,
    colors,
    currentColor,
    onColorChange
) {
    if (!container) {
        throw new Error('Container is required');
    }
    if (!colors || typeof colors !== 'object') {
        throw new Error('Colors must be an object');
    }
    if (typeof onColorChange !== 'function') {
        throw new Error('onColorChange must be a function');
    }

    // 生成顏色按鈕的 HTML
    const colorButtons = Object.keys(colors)
        .map((color) => {
            const isActive = color === currentColor;
            const borderStyle = isActive
                ? '3px solid #333'
                : '2px solid #ddd';

            return `
            <button 
                class="color-btn-v2" 
                data-color="${color}"
                style="
                    width: 32px;
                    height: 32px;
                    background: ${colors[color]};
                    border: ${borderStyle};
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.2s;
                    padding: 0;
                    margin: 0;
                "
                title="${getColorName(color)}色標註"
            ></button>
        `;
        })
        .join('');

    // 設置容器內容
    container.innerHTML = `
        <div style="display: flex; gap: 6px; justify-content: center; padding: 8px; background: #f8f9fa; border-radius: 4px;">
            ${colorButtons}
        </div>
    `;

    // 綁定點擊事件
    container.querySelectorAll('.color-btn-v2').forEach((btn) => {
        btn.addEventListener('click', () => {
            const color = btn.getAttribute('data-color');
            if (color) {
                onColorChange(color);
                // 重新渲染以更新選中狀態
                renderColorPicker(container, colors, color, onColorChange);
            }
        });

        // 添加 hover 效果
        btn.addEventListener('mouseenter', () => {
            if (btn.getAttribute('data-color') !== currentColor) {
                btn.style.transform = 'scale(1.1)';
            }
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
        });
    });
}
