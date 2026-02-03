/**
 * UI Utilities Module
 * Provides generic, page-agnostic UI operations.
 */

import Logger from './Logger.js';
import { validateSafeSvg, isSafeSvgAttribute } from './securityUtils.js';

let __spriteInjectionScheduled = false;

/**
 * 將 SVG 圖標精靈 (sprite) 注入至當前文件。
 * - 單例守衛：避免重複注入
 * - DOM 就緒：等待 DOMContentLoaded 或掛至 <html>
 * - 合併策略：若存在 #svg-sprite-definitions 則僅補齊缺失的 <symbol>
 * - ID 規則：icon-${key.toLowerCase()}
 *
 * @param {Object} icons - key 為圖標鍵名，value 為對應 SVG 字串
 */
export function injectIcons(icons) {
  if (typeof document === 'undefined') {
    return;
  }

  const SPRITE_ID = 'svg-sprite-definitions';

  /**
   * 執行實際的 SVG 注入邏輯
   */
  const performInjection = () => {
    const existingSprite = document.getElementById(SPRITE_ID);
    const parser = new DOMParser();

    // 若已存在 sprite，僅合併缺失；否則建立新的容器
    let spriteContainer = existingSprite;
    let defs = null;
    if (spriteContainer) {
      defs =
        spriteContainer.querySelector('defs') ||
        document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      if (!defs.parentNode) {
        spriteContainer.appendChild(defs);
      }
    } else {
      spriteContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      spriteContainer.id = SPRITE_ID;
      spriteContainer.style.display = 'none';
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      spriteContainer.appendChild(defs);
    }

    if (!icons || typeof icons !== 'object') {
      Logger.warn('Invalid icons object provided to injectIcons', {
        action: 'injectIcons',
        icons,
      });
      return;
    }

    Object.entries(icons).forEach(([key, svgString]) => {
      try {
        // 安全性檢查：阻擋可疑 SVG
        if (!validateSafeSvg(svgString)) {
          Logger.warn('Blocked unsafe SVG icon during injection', {
            action: 'injectIcons',
            key,
          });
          return;
        }

        const symbolId = `icon-${key.toLowerCase()}`;
        if (defs.querySelector(`#${symbolId}`)) {
          return; // 已存在，跳過（冪等）
        }

        // 解析並清洗 SVG
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (!svgEl) {
          return;
        }

        const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
        symbol.id = symbolId;

        // 遷移安全屬性
        Array.from(svgEl.attributes).forEach(attr => {
          if (isSafeSvgAttribute(attr.name, attr.value)) {
            symbol.setAttribute(attr.name, attr.value);
          }
        });

        // 深度清洗子節點危險屬性
        const sanitizeElement = el => {
          if (el && el.nodeType === 1) {
            Array.from(el.attributes).forEach(attr => {
              if (!isSafeSvgAttribute(attr.name, attr.value)) {
                el.removeAttribute(attr.name);
              }
            });
            Array.from(el.children).forEach(child => sanitizeElement(child));
          }
        };

        const safeFragment = document.createDocumentFragment();
        Array.from(svgEl.childNodes).forEach(node => {
          const cloned = node.cloneNode(true);
          if (cloned && cloned.nodeType === 1) {
            sanitizeElement(cloned);
          }
          safeFragment.appendChild(cloned);
        });

        symbol.innerHTML = '';
        symbol.appendChild(safeFragment);
        defs.appendChild(symbol);
      } catch (error) {
        Logger.warn('Failed to parse icon', {
          action: 'injectIcons',
          key,
          error,
        });
      }
    });

    /**
     * 驗證 SVG symbol 是否正確注入
     */
    const verifySymbols = () => {
      try {
        const defsEl = spriteContainer.querySelector('defs');
        if (!defsEl) {
          Logger.warn('SVG sprite defs not found after injection', {
            action: 'injectIcons',
            operation: 'verifySymbols',
          });
          return;
        }
        const required = Object.keys(icons).map(key => `icon-${key.toLowerCase()}`);
        required.forEach(id => {
          if (!defsEl.querySelector(`#${id}`)) {
            Logger.warn('Missing SVG symbol', {
              action: 'injectIcons',
              operation: 'verifySymbols',
              id,
            });
          }
        });
      } catch (error) {
        Logger.warn('Failed to verify SVG symbols', {
          action: 'injectIcons',
          operation: 'verifySymbols',
          error,
        });
      }
    };

    /**
     * 將 sprite 掛載到 DOM
     */
    const attach = () => {
      if (!spriteContainer.parentNode) {
        // 優先掛在 <body>，否則退回 <html>
        const parent = document.body || document.documentElement;
        parent.prepend(spriteContainer);
      }
      verifySymbols();
    };

    if (document.readyState === 'loading') {
      if (__spriteInjectionScheduled) {
        return;
      }
      __spriteInjectionScheduled = true;
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          attach();
          __spriteInjectionScheduled = false;
        },
        { once: true }
      );
    } else {
      attach();
    }
  };

  // 執行注入（單例守衛：避免重複排程）
  performInjection();
}
