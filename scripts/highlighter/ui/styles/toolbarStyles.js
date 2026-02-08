import { TOOLBAR_SELECTORS } from '../../../config/ui-selectors.js';

/**
 * 注入全局樣式到頁面
 */
export function injectGlobalStyles() {
  const styleId = 'notion-highlighter-v2-styles';

  // 避免重複注入
  if (document.querySelector(`#${styleId}`)) {
    return;
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
        /* 容器樣式 */
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

        /* 標註列表 */
        .nh-list {
            margin-top: 12px;
            border-top: 1px solid #eee;
            max-height: 200px;
            overflow-y: auto;
        }

        .nh-list-header {
            padding: 12px 4px 8px;
            font-weight: 600;
            color: #374151;
            font-size: 13px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .nh-list-item {
            display: flex;
            align-items: center;
            padding: 8px;
            border-radius: 6px;
            margin-bottom: 4px;
            transition: background 0.2s;
            gap: 10px;
        }

        .nh-list-item:hover {
            background: #f3f4f6;
        }

        .nh-list-content {
            flex: 1;
            min-width: 0;
        }

        .nh-list-title {
            color: #1f2937;
            font-weight: 500;
            font-size: 13px;
            margin-bottom: 2px;
        }

        .nh-list-text {
            color: #6b7280;
            font-size: 12px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .nh-btn-mini {
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 4px;
            background: white;
            border: 1px solid #e5e7eb;
            color: #4b5563;
        }

        .nh-btn-mini:hover {
            background: #f9fafb;
            color: #111827;
            border-color: #d1d5db;
        }

        .nh-btn-delete {
            width: 24px;
            height: 24px;
            padding: 0;
            border-radius: 4px;
            color: #9ca3af;
            background: transparent;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }

        .nh-btn-delete:hover {
            background: #fee2e2;
            color: #ef4444;
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

        .nh-hint {
            margin-top: 8px;
            font-size: 11px;
            color: #9ca3af;
            text-align: center;
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

        /* 滾動條美化 */
        .nh-list::-webkit-scrollbar {
            width: 4px;
        }

        .nh-list::-webkit-scrollbar-track {
            background: transparent;
        }

        .nh-list::-webkit-scrollbar-thumb {
            background: #d1d5db;
            border-radius: 2px;
        }

        .nh-list::-webkit-scrollbar-thumb:hover {
            background: #9ca3af;
        }
    `;

  document.head.append(style);
}
