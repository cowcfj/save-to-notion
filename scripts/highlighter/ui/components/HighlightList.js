/**
 * 標註列表組件
 * 負責渲染和更新標註列表
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
 * 渲染標註列表
 * @param {HTMLElement} container - 容器元素
 * @param {Array} highlights - 標註數組，每個元素包含 {id, text, color}
 * @param {Function} onDelete - 刪除回調函數，接收標註 id
 * @param {Function} onOpenNotion - 打開 Notion 回調函數（可選）
 */
export function renderHighlightList(
    container,
    highlights,
    onDelete,
    onOpenNotion
) {
    if (!container) {
        throw new Error('Container is required');
    }
    if (!Array.isArray(highlights)) {
        throw new Error('Highlights must be an array');
    }
    if (typeof onDelete !== 'function') {
        throw new Error('onDelete must be a function');
    }

    // 空列表情況
    if (highlights.length === 0) {
        container.innerHTML = `
            <div style="padding: 8px; text-align: center; color: #666; font-size: 11px;">
                暫無標註
            </div>
        `;
        return;
    }

    // 列表標題
    const headerHtml = `
        <div style="padding: 8px; border-bottom: 2px solid #e5e7eb; background: #f8f9fa; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600; color: #333; font-size: 12px;">標註列表</span>
            ${onOpenNotion
            ? '<button id="list-open-notion-v2" class="btn-mini" style="padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 3px; background: white; color: #333; cursor: pointer; font-size: 11px;">🔗 打開</button>'
            : ''
        }
        </div>
    `;

    // 標註項目
    const highlightsHtml = highlights
        .map((highlight, index) => {
            // 截斷過長的文本
            const text =
                highlight.text.substring(0, 40) +
                (highlight.text.length > 40 ? '...' : '');
            const colorName = getColorName(highlight.color);

            return `
            <div style="display: flex; align-items: center; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; gap: 8px;">
                <div style="flex: 1; min-width: 0;">
                    <div style="color: #333; font-weight: 500; font-size: 12px; margin-bottom: 2px;">
                        ${index + 1}. ${colorName}色標註
                    </div>
                    <div style="color: #666; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${text}
                    </div>
                </div>
                <button 
                    data-highlight-id="${highlight.id}"
                    class="delete-highlight-btn-v2"
                    style="
                        padding: 4px 8px;
                        border: 1px solid #ef4444;
                        border-radius: 3px;
                        background: white;
                        color: #ef4444;
                        cursor: pointer;
                        font-size: 12px;
                        flex-shrink: 0;
                        transition: all 0.2s;
                    "
                    title="刪除此標註"
                >🗑️</button>
            </div>
        `;
        })
        .join('');

    // 組合 HTML
    container.innerHTML = headerHtml + highlightsHtml;

    // 綁定刪除事件
    container.querySelectorAll('.delete-highlight-btn-v2').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-highlight-id');
            if (id) {
                onDelete(id);
            }
        });

        // 添加 hover 效果
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#fee2e2';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'white';
        });
    });

    // 綁定打開 Notion 按鈕（如果存在）
    if (onOpenNotion) {
        const openBtn = container.querySelector('#list-open-notion-v2');
        if (openBtn) {
            openBtn.addEventListener('click', onOpenNotion);
        }
    }
}
