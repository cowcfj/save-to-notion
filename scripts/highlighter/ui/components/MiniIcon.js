/**
 * 最小化圖標組件
 * 負責創建和管理最小化後的浮動圖標
 */

/**
 * 創建最小化圖標
 *
 * @returns {HTMLElement} 最小化圖標 DOM 元素
 */
export function createMiniIcon() {
  const miniIcon = document.createElement('div');
  miniIcon.id = 'notion-highlighter-mini-icon';

  // 設置內容
  miniIcon.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11 4H4C3.44772 4 3 4.44772 3 5V20C3 20.5523 3.44772 21 4 21H19C19.5523 21 20 20.5523 20 20V13M18.5858 2.58579C19.3668 1.80474 20.6332 1.80474 21.4142 2.58579C22.1953 3.36683 22.1953 4.63316 21.4142 5.41421L11.8284 15H9V12.1716L18.5858 2.58579Z" stroke="#2eaadc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
  miniIcon.title = '點擊展開標註工具欄';

  return miniIcon;
}

/**
 * 綁定最小化圖標事件
 *
 * @param {HTMLElement} miniIcon - 最小化圖標元素
 * @param {Function} onExpand - 展開回調函數
 */
export function bindMiniIconEvents(miniIcon, onExpand) {
  if (!miniIcon || typeof onExpand !== 'function') {
    throw new Error('Invalid arguments for bindMiniIconEvents');
  }

  // 點擊展開
  miniIcon.addEventListener('click', onExpand);
}
