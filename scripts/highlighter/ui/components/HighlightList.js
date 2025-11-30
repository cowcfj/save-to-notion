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
    red: '紅',
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
export function renderHighlightList(container, highlights, onDelete, onOpenNotion) {
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
            <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 13px;">
                暫無標註
            </div>
        `;
    return;
  }

  // 列表標題
  const headerHtml = `
        <div class="nh-list-header">
            <span>標註列表</span>
            ${
              onOpenNotion
                ? '<button id="list-open-notion-v2" class="nh-btn nh-btn-mini">🔗 打開</button>'
                : ''
            }
        </div>
    `;

  // 標註項目
  const highlightsHtml = highlights
    .map((highlight, index) => {
      // 截斷過長的文本
      const text = highlight.text.substring(0, 40) + (highlight.text.length > 40 ? '...' : '');
      const colorName = getColorName(highlight.color);

      return `
            <div class="nh-list-item">
                <div class="nh-list-content">
                    <div class="nh-list-title">
                        ${index + 1}. ${colorName}色標註
                    </div>
                    <div class="nh-list-text">
                        ${text}
                    </div>
                </div>
                <button 
                    data-highlight-id="${highlight.id}"
                    class="nh-btn-delete"
                    title="刪除此標註"
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 3H13M2.5 3L3.5 12C3.5 12.5523 3.94772 13 4.5 13H9.5C10.0523 13 10.5 12.5523 10.5 12L11.5 3M5 1V3M9 1V3M5 6V10M9 6V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        `;
    })
    .join('');

  // 組合 HTML
  container.innerHTML = headerHtml + highlightsHtml;

  // 綁定刪除事件
  container.querySelectorAll('.nh-btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-highlight-id');
      if (id) {
        onDelete(id);
      }
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
