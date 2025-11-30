/**
 * 最小化圖標組件
 * 負責創建和管理最小化後的浮動圖標
 */

import { getMiniIconStyles } from '../styles/toolbarStyles.js';

/**
 * 創建最小化圖標
 * @returns {HTMLElement} 最小化圖標 DOM 元素
 */
export function createMiniIcon() {
    const miniIcon = document.createElement('div');
    miniIcon.id = 'notion-highlighter-mini';

    // 應用樣式
    const styles = getMiniIconStyles();
    Object.assign(miniIcon.style, styles);

    // 設置內容
    miniIcon.innerHTML = '📝';
    miniIcon.title = '點擊展開標註工具欄';

    return miniIcon;
}

/**
 * 綁定最小化圖標事件
 * @param {HTMLElement} miniIcon - 最小化圖標元素
 * @param {Function} onExpand - 展開回調函數
 */
export function bindMiniIconEvents(miniIcon, onExpand) {
    if (!miniIcon || typeof onExpand !== 'function') {
        throw new Error('Invalid arguments for bindMiniIconEvents');
    }

    // 鼠標懸停效果
    miniIcon.addEventListener('mouseenter', () => {
        miniIcon.style.background = '#f8f9fa';
        miniIcon.style.transform = 'scale(1.1)';
    });

    miniIcon.addEventListener('mouseleave', () => {
        miniIcon.style.background = 'white';
        miniIcon.style.transform = 'scale(1)';
    });

    // 點擊展開
    miniIcon.addEventListener('click', onExpand);
}
