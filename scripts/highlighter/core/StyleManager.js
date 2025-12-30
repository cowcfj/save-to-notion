/**
 * StyleManager - CSS Highlight API 樣式管理
 *
 * 從 HighlightManager 抽取的樣式相關邏輯
 * 負責初始化 Highlight 對象、注入 CSS 樣式、處理樣式模式切換
 */

import { COLORS, TEXT_COLORS, VALID_STYLES } from '../utils/color.js';
import { supportsHighlightAPI } from '../utils/dom.js';
import Logger from '../../utils/Logger.js';

/**
 * StyleManager
 * 管理 CSS Highlight API 樣式的初始化和更新
 */
export class StyleManager {
  /**
   * @param {Object} options - 配置選項
   * @param {string} [options.styleMode='background'] - 樣式模式
   */
  constructor(options = {}) {
    this.styleMode = options.styleMode || 'background';
    this.colors = COLORS;
    this.textColors = TEXT_COLORS;
    this.highlightObjects = {}; // 顏色 -> Highlight 對象
  }

  /**
   * 初始化 CSS Highlight 樣式
   * 創建 Highlight 對象並註冊到 CSS.highlights
   */
  initialize() {
    if (typeof window === 'undefined' || !supportsHighlightAPI()) {
      return;
    }

    // 安全性檢查：確保 Highlight 是原生實作，防止原型污染
    const isNativeHighlight =
      typeof window.Highlight === 'function' &&
      window.Highlight.toString().includes('[native code]');

    if (!isNativeHighlight || !window.CSS?.highlights) {
      if (typeof window.Highlight !== 'undefined' && !isNativeHighlight) {
        Logger.warn('[StyleManager] 檢測到非原生的 Highlight 實作，已略過初始化');
      }
      return;
    }

    // 使用全域 Highlight 建構函式
    const HighlightConstructor = window.Highlight;

    Object.keys(this.colors).forEach(colorName => {
      try {
        // 創建 Highlight 對象
        this.highlightObjects[colorName] = new HighlightConstructor();

        // 註冊到 CSS.highlights
        CSS.highlights.set(`notion-${colorName}`, this.highlightObjects[colorName]);
      } catch (error) {
        Logger.error(`[StyleManager] 初始化 ${colorName} 顏色樣式失敗:`, error);
      }
    });

    // 注入樣式
    this.injectStyles();
  }

  /**
   * 注入 CSS 樣式到頁面
   */
  injectStyles() {
    if (typeof document === 'undefined') {
      return;
    }

    if (document.querySelector('#notion-highlight-styles')) {
      // 如果樣式已存在，檢查是否需要更新（例如樣式模式改變）
      const existingStyle = document.querySelector('#notion-highlight-styles');
      if (existingStyle.dataset.styleMode === this.styleMode) {
        return;
      }
      existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = 'notion-highlight-styles';
    style.dataset.styleMode = this.styleMode;

    style.textContent = Object.entries(this.colors)
      .map(([colorName, bgColor]) => {
        let cssRules = '';
        const textColor = this.textColors[colorName] || bgColor;

        switch (this.styleMode) {
          case 'text':
            // 文字顏色模式
            cssRules = `
              background-color: transparent;
              color: ${textColor};
            `;
            break;

          case 'underline':
            // 底線模式
            cssRules = `
              background-color: transparent;
              color: inherit;
              text-decoration: underline;
              text-decoration-color: ${textColor};
              text-decoration-thickness: 3px;
              text-underline-offset: 3px;
            `;
            break;

          case 'background':
          default:
            // 預設背景模式（強制黑色文字以確保對比度）
            cssRules = `
              background-color: ${bgColor};
              color: black; 
            `;
            break;
        }

        return `
            ::highlight(notion-${colorName}) {
                ${cssRules}
                cursor: pointer;
            }
        `;
      })
      .join('\n');
    document.head.appendChild(style);
  }

  /**
   * 動態更新標註樣式模式
   * @param {string} newStyleMode - 新的樣式模式 ('background' | 'text' | 'underline')
   */
  updateMode(newStyleMode) {
    if (!VALID_STYLES.includes(newStyleMode)) {
      Logger.warn('[StyleManager] Invalid style mode:', newStyleMode);
      return;
    }

    if (this.styleMode === newStyleMode) {
      return; // 樣式未變更，無需更新
    }

    this.styleMode = newStyleMode;
    this.injectStyles(); // 重新注入樣式
    Logger.log(`[StyleManager] Style mode updated to: ${newStyleMode}`);
  }

  /**
   * 獲取指定顏色的 Highlight 對象
   * @param {string} color - 顏色名稱
   * @returns {Highlight|undefined} Highlight 對象
   */
  getHighlightObject(color) {
    return this.highlightObjects[color];
  }

  /**
   * 獲取當前樣式模式
   * @returns {string} 樣式模式
   */
  getStyleMode() {
    return this.styleMode;
  }

  /**
   * 清理所有 Highlight 對象的 ranges
   */
  clearAllHighlights() {
    Object.values(this.highlightObjects).forEach(highlight => highlight.clear());
  }

  /**
   * 清理資源，移除 CSS 註冊和樣式元素
   */
  cleanup() {
    if (typeof CSS !== 'undefined' && CSS?.highlights) {
      Object.keys(this.highlightObjects).forEach(color => {
        CSS.highlights.delete(`notion-${color}`);
      });
    }

    // 移除樣式元素
    if (typeof document !== 'undefined') {
      const styleEl = document.querySelector('#notion-highlight-styles');
      if (styleEl) {
        styleEl.remove();
      }
    }

    this.highlightObjects = {};
  }
}
