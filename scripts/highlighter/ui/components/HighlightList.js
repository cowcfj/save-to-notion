import { TOOLBAR_SELECTORS } from '../../../config/selectors.js';

/**
 * 獲取顏色的中文名稱
 *
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
 *
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
    throw new TypeError('Highlights must be an array');
  }
  if (typeof onDelete !== 'function') {
    throw new TypeError('onDelete must be a function');
  }

  // 清空容器
  container.innerHTML = '';

  // 空列表情況
  if (highlights.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'padding: 16px; text-align: center; color: #9ca3af; font-size: 13px;';
    emptyDiv.textContent = '暫無標註';
    container.append(emptyDiv);
    return;
  }

  // 列表標題
  const headerDiv = document.createElement('div');
  headerDiv.className = 'nh-list-header';

  const headerSpan = document.createElement('span');
  headerSpan.textContent = '標註列表';
  headerDiv.append(headerSpan);

  // 打開 Notion 按鈕（可選）
  if (onOpenNotion) {
    const openBtn = document.createElement('button');
    openBtn.id = TOOLBAR_SELECTORS.LIST_OPEN_NOTION.slice(1);
    openBtn.className = 'nh-btn nh-btn-mini';
    openBtn.textContent = '🔗 打開';
    openBtn.addEventListener('click', onOpenNotion);
    headerDiv.append(openBtn);
  }

  container.append(headerDiv);

  // 標註項目
  highlights.forEach((highlight, index) => {
    // 截斷過長的文本
    const text = highlight.text.slice(0, 40) + (highlight.text.length > 40 ? '...' : '');
    const colorName = getColorName(highlight.color);

    // 創建項目容器
    const itemDiv = document.createElement('div');
    itemDiv.className = 'nh-list-item';

    // 創建內容區域
    const contentDiv = document.createElement('div');
    contentDiv.className = 'nh-list-content';

    // 標題
    const titleDiv = document.createElement('div');
    titleDiv.className = 'nh-list-title';
    titleDiv.textContent = `${index + 1}. ${colorName}色標註`;

    // 文本內容（使用 textContent 防止 XSS）
    const textDiv = document.createElement('div');
    textDiv.className = 'nh-list-text';
    textDiv.textContent = text;

    contentDiv.append(titleDiv);
    contentDiv.append(textDiv);

    // 刪除按鈕
    const deleteBtn = document.createElement('button');
    deleteBtn.dataset.highlightId = highlight.id;
    deleteBtn.className = 'nh-btn-delete';
    deleteBtn.title = '刪除此標註';

    // SVG 圖標（靜態內容，安全使用 innerHTML）
    deleteBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 3H13M2.5 3L3.5 12C3.5 12.5523 3.94772 13 4.5 13H9.5C10.0523 13 10.5 12.5523 10.5 12L11.5 3M5 1V3M9 1V3M5 6V10M9 6V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    // 綁定刪除事件
    deleteBtn.addEventListener('click', () => {
      onDelete(highlight.id);
    });

    itemDiv.append(contentDiv);
    itemDiv.append(deleteBtn);
    container.append(itemDiv);
  });
}
