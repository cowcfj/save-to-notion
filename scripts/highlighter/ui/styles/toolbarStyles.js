import { TOOLBAR_SELECTORS } from '../../../config/ui-selectors.js';

/**
 * 取得 Toolbar 的完整 CSS 字串，供 Shadow DOM 使用。
 * CSS 以 :host 選擇器開頭，確保在 Shadow Root 內完整隔離。
 *
 * @returns {string} CSS 字串
 */
export function getToolbarCSS() {
  return `
        /* ============================================
         * Shadow DOM Host 全域重置
         * 防止宿主頁面 CSS（如 Foundation、Bootstrap）入侵
         * ============================================ */
        :host {
            all: initial;
            display: block;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
        }

        /* 子元素 box model 重置 */
        :host *,
        :host *::before,
        :host *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        /* 按鈕重置 — 防止宿主的 button {...} 規則覆蓋 */
        :host button {
            all: unset;
            box-sizing: border-box;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            line-height: 1.5;
            font-family: inherit;
            font-size: inherit;
        }

        /* ============================================
         * 容器樣式
         * ============================================ */
        ${TOOLBAR_SELECTORS.CONTAINER} {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px;
            min-width: 240px;
            max-width: 300px;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            opacity: 0;
            transform: translateY(-10px) scale(0.98);
            animation: nh-fade-in 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
        }

        @keyframes nh-fade-in {
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        /* 標題區域 */
        .nh-header {
            margin-bottom: 16px;
            font-weight: 600;
            text-align: center;
            color: #1a1a1a;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 15px;
        }

        /* 按鈕基礎樣式 */
        .nh-btn {
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            outline: none;
        }

        .nh-btn:active {
            transform: scale(0.96);
        }

        /* 主按鈕 */
        .nh-btn-primary {
            background: #2eaadc;
            color: white;
            padding: 8px 16px;
            width: 100%;
            box-shadow: 0 2px 8px rgba(46, 170, 220, 0.25);
        }

        .nh-btn-primary:hover {
            background: #2590ba;
            box-shadow: 0 4px 12px rgba(46, 170, 220, 0.35);
        }

        .nh-btn-primary.active {
            background: #ef4444;
            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.25);
        }

        .nh-btn-primary.active:hover {
            background: #dc2626;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
        }

        /* 圖標按鈕 */
        .nh-btn-icon {
            background: transparent;
            color: #666;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            padding: 0;
        }

        .nh-btn-icon:hover {
            background: rgba(0, 0, 0, 0.05);
            color: #333;
        }

        /* 操作按鈕 */
        .nh-btn-action {
            flex: 1;
            padding: 8px 12px;
            background: white;
            border: 1px solid #e5e7eb;
            color: #4b5563;
        }

        .nh-btn-action:hover {
            background: #f9fafb;
            border-color: #d1d5db;
            color: #111827;
        }

        /* 顏色選擇器容器 */
        .nh-color-picker {
            display: flex;
            gap: 8px;
            justify-content: center;
            padding: 12px;
            background: #f3f4f6;
            border-radius: 10px;
            margin-bottom: 16px;
        }

        .nh-sync-badge {
            position: absolute;
            top: -6px;
            right: -6px;
            background: #c53030;
            color: white;
            font-size: 10px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 10px;
            line-height: 1;
            pointer-events: none;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        /* 保存網頁按鈕 */
        .nh-btn-save {
            flex: 1;
            background: #007aff !important;
            color: white !important;
            border-color: #007aff !important;
            font-weight: 600;
        }
        .nh-btn-save:hover {
            background: #005ecb !important;
            border-color: #005ecb !important;
        }

        /* 顏色按鈕 */
        .nh-color-btn {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: 2px solid white;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            position: relative;
        }

        .nh-color-btn:hover {
            transform: scale(1.15);
            z-index: 1;
        }

        .nh-color-btn.active {
            transform: scale(1.15);
            box-shadow: 0 0 0 2px #2eaadc, 0 4px 8px rgba(0,0,0,0.15);
        }

        /* 狀態欄 */
        .nh-status {
            margin-top: 12px;
            padding: 8px;
            background: #f8fafc;
            border-radius: 6px;
            font-size: 12px;
            color: #64748b;
            text-align: center;
            border: 1px solid #f1f5f9;
        }

        /* 最小化圖標 */
        ${TOOLBAR_SELECTORS.MINI_ICON} {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 48px;
            height: 48px;
            background: white;
            border-radius: 50%;
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
            z-index: 2147483647;
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            border: 1px solid rgba(0,0,0,0.05);
        }

        #notion-highlighter-mini-icon:hover {
            transform: scale(1.1) rotate(15deg);
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
    `;
}

/**
 * 將 Toolbar 樣式注入到 Shadow Root。
 * 優先使用 adoptedStyleSheets（效能更佳），
 * 否則回退到建立 <style> 元素。
 *
 * @param {ShadowRoot} shadowRoot - 目標 Shadow Root
 */
export function injectStylesIntoShadowRoot(shadowRoot) {
  const css = getToolbarCSS();

  if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in Document.prototype) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadowRoot.adoptedStyleSheets = [sheet];
      return;
    } catch {
      // 若 adoptedStyleSheets 在此環境不可用，fallback 到 <style>
    }
  }

  // Fallback：建立 <style> 元素插入 shadowRoot
  const style = document.createElement('style');
  style.textContent = css;
  shadowRoot.prepend(style);
}

/**
 * 向後相容的空函式（舊版 API，已不再注入到 document.head）。
 * @deprecated 請改用 injectStylesIntoShadowRoot(shadowRoot)
 */
export function injectGlobalStyles() {
  // No-op：樣式現由 Toolbar.js 透過 Shadow DOM 注入
}
