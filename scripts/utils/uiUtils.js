/**
 * UI Utilities Module
 * Provides generic, page-agnostic UI operations.
 */

import Logger from './Logger.js';
import { validateSafeSvg, isSafeSvgAttribute } from './securityUtils.js';

let __spriteInjectionScheduled = false;
let __pendingSpriteContainer = null;
const __expectedSymbolIds = new Set();

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 將 SVG 圖標精靈 (sprite) 注入至當前文件。
 * - 單例守衛：避免重複注入
 * - DOM 就緒：等待 DOMContentLoaded 或掛至 <html>
 * - 合併策略：若存在 #svg-sprite-definitions 則僅補齊缺失的 <symbol>
 * - ID 規則：icon-${key.toLowerCase()}
 *
 * @param {object} icons - key 為圖標鍵名，value 為對應 SVG 字串
 */
// ============================================================================
// Internal Helpers
// ============================================================================

const SPRITE_ID = 'svg-sprite-definitions';

/**
 * 驗證 SVG symbol 是否正確注入
 *
 * @param {Element} spriteContainer - The SVG container element
 * @returns {void}
 */
const _verifySymbols = spriteContainer => {
  try {
    const defsEl = spriteContainer.querySelector('defs');
    if (!defsEl) {
      Logger.warn('SVG sprite defs not found after injection', {
        action: 'injectIcons',
        operation: 'verifySymbols',
      });
      return;
    }

    // 進行全量完整性檢查
    __expectedSymbolIds.forEach(id => {
      // 使用 CSS.escape 轉義 ID 以支援特殊字元
      if (!defsEl.querySelector(`#${CSS.escape(id)}`)) {
        Logger.warn('Missing SVG symbol in final sprite', {
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
 *
 * @param {Element} spriteContainer - The SVG container element
 * @returns {void}
 */
const _attachSprite = spriteContainer => {
  if (!spriteContainer.parentNode) {
    // 優先掛在 <body>，否則退回 <html>
    const parent = document.body || document.documentElement;
    parent.prepend(spriteContainer);
  }
  // 掛載完成後清除暫存引用
  __pendingSpriteContainer = null;
  _verifySymbols(spriteContainer);
};

// ============================================================================
// Public API
// ============================================================================

/**
 * 將 SVG 圖標精靈 (sprite) 注入至當前文件。
 * - 單例守衛：避免重複注入
 * - DOM 就緒：等待 DOMContentLoaded 或掛至 <html>
 * - 合併策略：若存在 #svg-sprite-definitions 則僅補齊缺失的 <symbol>
 * - ID 規則：icon-${key.toLowerCase()}
 *
 * @param {object} icons - key 為圖標鍵名，value 為對應 SVG 字串
 * @returns {void}
 */
export function injectIcons(icons) {
  if (typeof document === 'undefined') {
    return;
  }

  if (!icons || typeof icons !== 'object') {
    Logger.warn('Invalid icons object provided to injectIcons', {
      action: 'injectIcons',
      icons,
    });
    return;
  }

  const existingSprite = document.querySelector(`#${SPRITE_ID}`);
  const parser = new DOMParser();

  // 若已存在 sprite，僅合併缺失；否則建立新的容器
  // 優先使用 DOM 中的元素，若無則使用待掛載的共享容器，防止競態條件
  let spriteContainer = existingSprite || __pendingSpriteContainer;

  // [JS-0119] Initialize defs on declaration
  let defs = null;

  if (spriteContainer) {
    defs = spriteContainer.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
    }
    if (!defs.parentNode) {
      spriteContainer.append(defs);
    }
  } else {
    spriteContainer = document.createElementNS(SVG_NS, 'svg');
    spriteContainer.id = SPRITE_ID;
    spriteContainer.style.display = 'none';
    defs = document.createElementNS(SVG_NS, 'defs');
    spriteContainer.append(defs);
    // 暫存此容器供後續並發呼叫使用
    __pendingSpriteContainer = spriteContainer;
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
      // 記錄預期注入的 ID 用於全量驗證
      __expectedSymbolIds.add(symbolId);

      // 使用 CSS.escape 轉義 ID，解決 key 包含點號或括號時的選擇器失效問題
      if (document.querySelector(`#${CSS.escape(symbolId)}`)) {
        return; // 已存在，跳過（冪等）
      }

      // Ensure SVG has proper namespace for DOMParser
      let validSvgString = svgString;
      if (!validSvgString.includes('xmlns=')) {
        validSvgString = validSvgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      // 解析並清洗 SVG
      const doc = parser.parseFromString(validSvgString, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (!svgEl) {
        return;
      }

      const symbol = document.createElementNS(SVG_NS, 'symbol');
      symbol.id = symbolId;

      // 遷移安全屬性
      Array.from(svgEl.attributes).forEach(attr => {
        if (isSafeSvgAttribute(attr.name, attr.value)) {
          symbol.setAttribute(attr.name, attr.value);
        }
      });

      // 深度清洗子節點危險屬性
      const sanitizeElement = el => {
        if (el?.nodeType === 1) {
          Array.from(el.attributes).forEach(attr => {
            if (!isSafeSvgAttribute(attr.name, attr.value)) {
              el.removeAttribute(attr.name);
            }
          });
          Array.from(el.children).forEach(child => {
            sanitizeElement(child);
          });
        }
      };

      const safeFragment = document.createDocumentFragment();
      Array.from(svgEl.childNodes).forEach(node => {
        const cloned = node.cloneNode(true);
        if (cloned?.nodeType === 1) {
          sanitizeElement(cloned);
        }
        safeFragment.append(cloned);
      });

      symbol.innerHTML = '';
      symbol.append(safeFragment);
      defs.append(symbol);
    } catch (error) {
      Logger.warn('Failed to parse icon', {
        action: 'injectIcons',
        key,
        error,
      });
    }
  });

  if (document.readyState === 'loading') {
    if (__spriteInjectionScheduled) {
      return;
    }
    __spriteInjectionScheduled = true;
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        _attachSprite(spriteContainer);
        __spriteInjectionScheduled = false;
      },
      { once: true }
    );
  } else {
    _attachSprite(spriteContainer);
  }
}

/**
 * 創建使用 Sprite 的 SVG 圖標
 *
 * @param {string} name - 圖標名稱 (不含 icon- 前綴)
 * @returns {SVGElement}
 */
export const createSpriteIcon = name => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('icon-svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');

  if (typeof name !== 'string' || !name) {
    Logger.warn('Invalid icon name provided to createSpriteIcon', { name });
    return svg;
  }

  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#icon-${name.toLowerCase()}`);
  svg.append(use);
  return svg;
};
