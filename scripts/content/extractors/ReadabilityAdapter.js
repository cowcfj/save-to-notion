/**
 * ReadabilityAdapter - Readability.js 適配層
 *
 * 職責:
 * - 調用 @mozilla/readability npm 套件
 * - 整合內容質量檢查 (isContentGood)
 * - 提供多層 fallback 策略 (Readability → CMS → List)
 * - 統一錯誤處理和日誌記錄
 */

/* global Logger, PerformanceOptimizer */

import { Readability } from '@mozilla/readability';
import { CONTENT_QUALITY } from '../../config/constants.js';
import { LIST_PREFIX_PATTERNS, IMAGE_ATTRIBUTES } from '../../config/patterns.js';
import {
  CMS_CONTENT_SELECTORS,
  ARTICLE_STRUCTURE_SELECTORS,
  CMS_CLEANING_RULES,
  GENERIC_CLEANING_RULES,
} from '../../config/extraction.js';

// 從 CONTENT_QUALITY 解構常用常量到模組級別
const { MIN_CONTENT_LENGTH } = CONTENT_QUALITY;

/**
 * 安全地查詢 DOM 元素,避免拋出異常
 *
 * @param {Element|Document} container - 要查詢的容器元素
 * @param {string} selector - CSS 選擇器
 * @returns {NodeList|Array} 查詢結果或空數組
 */
function safeQueryElements(container, selector) {
  if (!container || !selector) {
    return [];
  }

  try {
    return container.querySelectorAll(selector);
  } catch (error) {
    Logger.warn('查詢選擇器失敗', { action: 'safeQueryElements', selector, error: error.message });
    return [];
  }
}

/**
 * 評估提取的內容質量
 * 檢查內容長度和鏈接密度，判斷內容是否足夠好
 *
 * @param {object} article - Readability 提取的文章對象
 * @param {string} article.content - 文章 HTML 內容
 * @param {number} article.textContent - 文章文本內容（用於長度計算）
 * @returns {boolean} 如果內容質量良好返回 true，否則返回 false
 * @description
 * 質量評估標準：
 * 1. 內容長度至少 250 字符（MIN_CONTENT_LENGTH）
 * 2. 鏈接密度不超過 25%（MAX_LINK_DENSITY）
 * 3. 列表項數量 >= 8 時允許例外（LIST_EXCEPTION_THRESHOLD）
 *
 * 鏈接密度 = (所有鏈接文本長度) / (總文本長度)
 *
 * 特殊處理：
 * - 對於以清單為主的文件（如 CLI docs），如果包含 8+ 個 <li> 項目，即使鏈接密度高也視為有效
 */
function isContentGood(article) {
  const { MAX_LINK_DENSITY, LIST_EXCEPTION_THRESHOLD } = CONTENT_QUALITY;

  // 驗證輸入
  if (!article?.content) {
    Logger.warn('文章對象或內容為空', { action: 'isContentGood' });
    return false;
  }

  // 使用正確的文本長度：article.content 的長度
  const contentLength = article.content.length;

  // 內容太短，質量不佳
  if (contentLength < MIN_CONTENT_LENGTH) {
    Logger.warn('內容長度不足', {
      action: 'isContentGood',
      length: contentLength,
      minRequired: MIN_CONTENT_LENGTH,
    });
    return false;
  }

  // 創建臨時 DOM 容器以分析內容
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = article.content;

  // 計算鏈接密度
  let linkTextLength = 0;
  const links = safeQueryElements(tempDiv, 'a');

  // 修復 JS-0086: 使用顯式語句而非箭頭函數中的賦值返回
  Array.from(links).forEach(link => {
    linkTextLength += (link.textContent || '').length;
  });

  // 使用正確的總長度作為分母
  const linkDensity = contentLength > 0 ? linkTextLength / contentLength : 0;

  // 計算列表項數量
  const liNodes = safeQueryElements(tempDiv, 'li');
  const liCount = liNodes.length;

  // 如果頁面以長清單為主（如文件、命令列清單），允許通過
  if (liCount >= LIST_EXCEPTION_THRESHOLD) {
    Logger.log('內容被判定為有效清單', {
      action: 'isContentGood',
      liCount,
      linkDensity: linkDensity.toFixed(2),
    });
    return true;
  }

  // 檢查鏈接密度
  if (linkDensity > MAX_LINK_DENSITY) {
    Logger.log('內容因鏈接密度過高被拒絕', {
      action: 'isContentGood',
      linkDensity: linkDensity.toFixed(2),
    });
    return false;
  }

  return true;
}

/**
 * 嘗試展開頁面上常見的可折疊/懶載入內容，以便 Readability 能夠擷取隱藏的文本
 * Best-effort：會處理 <details>、aria-expanded/aria-hidden、常見 collapsed 類別 和 Bootstrap collapse
 *
 * @param {number} timeout - 等待時間（毫秒）
 * @returns {Promise<Array>} 展開的元素數組
 */
async function expandCollapsibleElements(timeout = 300) {
  try {
    const expanded = [];

    // 1) <details> 元素
    const details = Array.from(document.querySelectorAll('details:not([open])'));
    details.forEach(detail => {
      try {
        detail.setAttribute('open', '');
        expanded.push(detail);
      } catch (error) {
        Logger.warn('開啟 details 元素失敗', {
          action: 'expandCollapsibleElements',
          error: error.message,
        });
      }
    });

    // 2) aria-expanded 控制的按鈕/觸發器：嘗試找到與之對應的目標並展開
    const triggers = Array.from(document.querySelectorAll('[aria-expanded="false"]'));
    triggers.forEach(trigger => {
      try {
        // 直接設定 aria-expanded，並嘗試觸發 click
        trigger.setAttribute('aria-expanded', 'true');
        try {
          trigger.click();
        } catch (clickError) {
          /* ignore click failures but log for debug */
          Logger.debug('觸發元素點擊失敗', {
            action: 'expandCollapsibleElements',
            error: clickError.message,
          });
        }

        // 如果有 aria-controls，嘗試移除 aria-hidden 或 collapsed 類別
        const ctrl = trigger.getAttribute?.('aria-controls');
        if (ctrl) {
          try {
            const target = document.querySelector(`#${CSS.escape(ctrl)}`);
            if (target) {
              target.removeAttribute('aria-hidden');
              target.classList.remove('collapsed', 'collapse');
              expanded.push(target);
            }
          } catch {
            // Ignore querySelector errors
          }
        }
      } catch (error) {
        // 忽略單一項目錯誤但記錄警告
        Logger.warn('處理 aria-expanded 元素失敗', {
          action: 'expandCollapsibleElements',
          error: error.message,
        });
      }
    });

    // 3) 通用 collapsed / collapse 類別
    const collapsedEls = Array.from(document.querySelectorAll('.collapsed, .collapse:not(.show)'));
    collapsedEls.forEach(el => {
      try {
        el.classList.remove('collapsed', 'collapse');
        el.classList.add('expanded-by-clipper');
        el.removeAttribute('aria-hidden');
        expanded.push(el);
      } catch (error) {
        // 忽略但在開發模式表記錄
        Logger.debug('處理 collapsed 類別元素失敗', {
          action: 'expandCollapsibleElements',
          error: error.message,
        });
      }
    });

    // 4) 常見 JS 會隱藏的屬性 (display:none) — 嘗試設為 block 但不破壞原本樣式
    const hiddenByStyle = Array.from(
      document.querySelectorAll('[style*="display:none"], [hidden]')
    );
    hiddenByStyle.forEach(el => {
      try {
        // 只針對有可能是折疊式內容的元素進行短暫顯示
        const textLen = (el.textContent || '').trim().length;
        if (textLen > 20) {
          el.style.display = '';
          el.removeAttribute('hidden');
          expanded.push(el);
        }
      } catch (error) {
        Logger.warn('展開隱藏元素失敗', {
          action: 'expandCollapsibleElements',
          error: error.message,
        });
      }
    });

    // 等待短暫時間讓任何 JS 綁定或懶載入觸發
    await new Promise(resolve => setTimeout(resolve, timeout));

    Logger.log('可折疊元素展開完成', {
      action: 'expandCollapsibleElements',
      count: expanded.length,
    });
    return expanded;
  } catch (error) {
    Logger.warn('展開可折疊元素失敗', {
      action: 'expandCollapsibleElements',
      error: error.message,
    });
    return [];
  }
}

/**
 * 便捷的緩存查詢函數
 *
 * @param {string} selector - CSS 選擇器
 * @param {Element|Document} context - 查詢上下文
 * @param {object} options - 選項對象
 * @param {boolean} options.single - 是否返回單一元素
 * @param {boolean} options.all - 是否返回所有匹配元素
 * @returns {Element|NodeList|Array} 查詢結果
 */
function cachedQuery(selector, context = document, options = {}) {
  // 如果全域的 PerformanceOptimizer 可用,使用緩存查詢
  if (typeof PerformanceOptimizer !== 'undefined' && globalThis.performanceOptimizer) {
    return globalThis.performanceOptimizer.cachedQuery(selector, context, options);
  }
  // 回退到原生查詢
  return options.single ? context.querySelector(selector) : context.querySelectorAll(selector);
}

/**
 * 策略 1: 尋找 Drupal 結構
 *
 * @returns {string|null} HTML 內容或 null
 */
function findDrupalContent() {
  const drupalNodeContent = cachedQuery('.node__content', document, { single: true });
  if (drupalNodeContent) {
    const imageField = cachedQuery('.field--name-field-image', drupalNodeContent, { single: true });
    const bodyField = cachedQuery('.field--name-field-body', drupalNodeContent, { single: true });

    if (bodyField) {
      Logger.log('偵測到 Drupal 結構，正在合併欄位', { action: 'findContentCmsFallback' });
      const imageHtml = imageField ? imageField.innerHTML : '';
      const bodyHtml = bodyField.innerHTML;
      return imageHtml + bodyHtml;
    }
  }
  return null;
}

/**
 * 策略 2 & 3: 尋找 CMS 或文章結構選擇器
 *
 * @param {string[]} selectors List of selectors to check
 * @param {string} type Log type identifier
 * @returns {string|null} HTML 內容或 null
 */
function findContentBySelectors(selectors, type) {
  for (const selector of selectors) {
    const element = cachedQuery(selector, document, { single: true });
    if (element) {
      const textLength = element.textContent.trim().length;
      Logger.log(`找到潛在 ${type} 元素`, {
        action: 'findContentCmsFallback',
        selector,
        length: textLength,
      });

      if (textLength >= MIN_CONTENT_LENGTH) {
        Logger.log(`成功找到 ${type} 內容`, {
          action: 'findContentCmsFallback',
          selector,
          length: textLength,
        });
        return element.innerHTML;
      }

      Logger.log(`內容太短，跳過該 ${type} 選擇器`, {
        action: 'findContentCmsFallback',
        selector,
        length: textLength,
        minRequired: MIN_CONTENT_LENGTH,
      });
    } else {
      Logger.log(`未找到該 ${type} 選擇器對應的元素`, {
        action: 'findContentCmsFallback',
        selector,
      });
    }
  }
  return null;
}

/**
 * 策略 4: 通用內容尋找
 *
 * @returns {string|null} HTML 內容或 null
 */
function findGenericContent() {
  Logger.log('未找到 CMS 結構，回退到通用內容尋找', {
    action: 'findContentCmsFallback',
    minRequired: MIN_CONTENT_LENGTH,
  });

  const candidates = cachedQuery('article, section, main, div', document);
  Logger.log('找到潛在內容候選者', { action: 'findContentCmsFallback', count: candidates.length });

  let bestElement = null;
  let maxScore = 0;
  for (const el of candidates) {
    const text = el.textContent?.trim() || '';

    if (text.length < MIN_CONTENT_LENGTH) {
      continue;
    }

    const paragraphs = cachedQuery('p', el).length;
    const images = cachedQuery('img', el).length;
    const links = cachedQuery('a', el).length;

    // 給圖片加分，因為我們想要包含圖片的內容
    const score = text.length + paragraphs * 50 + images * 30 - links * 25;

    if (score > maxScore) {
      // 避免選擇嵌套的父元素
      if (bestElement && el.contains(bestElement)) {
        continue;
      }
      maxScore = score;
      bestElement = el;
    }
  }

  if (bestElement) {
    Logger.log('找到最佳內容', {
      action: 'findContentCmsFallback',
      length: bestElement.textContent.trim().length,
    });
    return bestElement.innerHTML;
  }

  // 最後的嘗試：降低標準
  for (const el of candidates) {
    const text = el.textContent?.trim() || '';
    if (text.length >= MIN_CONTENT_LENGTH / 2) {
      Logger.log('緊急備案：找到內容', { action: 'findContentCmsFallback', length: text.length });
      return el.innerHTML;
    }
  }

  return null;
}

/**
 * A new, CMS-aware fallback function. It specifically looks for patterns
 * found in CMS like Drupal and other common website structures.
 *
 * @returns {string|null} The combined innerHTML of the article components.
 */
function findContentCmsFallback() {
  Logger.log('執行 CMS 導向的備案尋找', { action: 'findContentCmsFallback' });

  // 1. Drupal
  const drupalContent = findDrupalContent();
  if (drupalContent) {
    return drupalContent;
  }

  // 2. CMS Selectors
  const cmsContent = findContentBySelectors(CMS_CONTENT_SELECTORS, 'CMS');
  if (cmsContent) {
    return cmsContent;
  }

  // 3. Article Structure Selectors
  const articleContent = findContentBySelectors(ARTICLE_STRUCTURE_SELECTORS, '文章結構');
  if (articleContent) {
    return articleContent;
  }

  // 4. Generic Fallback
  return findGenericContent();
}

/**
 * 當 Readability 與 CMS fallback 都無法取得內容時，嘗試擷取最大的一個 <ul> 或 <ol>
 * 針對像是 CLI 文件或參考頁面（大量 bullet points）的改善。
 * 回傳該列表的 innerHTML 或 null。
 *
 * @returns {string|null} The largest list's innerHTML or null
 */
function extractLargestListFallback() {
  try {
    Logger.log('正在執行 extractLargestListFallback 尋找大型列表', {
      action: 'extractLargestListFallback',
    });

    // 策略 1: 尋找真正的 <ul> / <ol>
    const lists = Array.from(document.querySelectorAll('ul, ol'));
    Logger.log('找到實際的列表元素', { action: 'extractLargestListFallback', count: lists.length });

    // 策略 2: 尋找可能是清單但用 div/section 呈現的內容
    const possibleListContainers = Array.from(
      document.querySelectorAll('div, section, article')
    ).filter(container => {
      const text = container.textContent || '';
      // 尋找包含多個以 bullet 字元或數字開頭的行的容器
      const lines = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
      if (lines.length < 4) {
        return false;
      }

      const bulletPattern = LIST_PREFIX_PATTERNS.bulletPrefix;
      const matchingLines = lines.filter(line => bulletPattern.test(line)).length;
      return matchingLines >= Math.max(3, Math.floor(lines.length * 0.4));
    });

    Logger.log('找到可能的列表容器', {
      action: 'extractLargestListFallback',
      count: possibleListContainers.length,
    });

    // 合併真正的清單和可能的清單容器
    const allCandidates = [...lists, ...possibleListContainers];

    if (!allCandidates || allCandidates.length === 0) {
      Logger.log('頁面上未找到列表或類列表容器', { action: 'extractLargestListFallback' });
      return null;
    }

    // 評分：以 <li> 數量為主，並加上文字長度作為次要指標
    let best = null;
    let bestScore = 0;

    allCandidates.forEach((candidate, idx) => {
      const liItems = Array.from(candidate.querySelectorAll('li'));
      const liCount = liItems.length;
      const textLength = (candidate.textContent || '').trim().length;

      // 對於非 <ul>/<ol> 的容器，用行數代替 li 數量
      let effectiveItemCount = liCount;
      if (liCount === 0) {
        const lines = (candidate.textContent || '')
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean);
        const bulletPattern = LIST_PREFIX_PATTERNS.bulletPrefix;
        effectiveItemCount = lines.filter(line => bulletPattern.test(line)).length;
      }

      const score = effectiveItemCount * 10 + Math.min(500, Math.floor(textLength / 10));

      Logger.log('清單候選者統計', {
        action: 'extractLargestListFallback',
        index: idx + 1,
        itemCount: effectiveItemCount,
        textLength,
        score,
        tagName: candidate.tagName,
      });

      // 過濾太短或只有單一項目的容器
      if (effectiveItemCount < 4) {
        return;
      }

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    if (best) {
      Logger.log('選擇了最佳清單容器', {
        action: 'extractLargestListFallback',
        score: bestScore,
        tagName: best.tagName,
      });
      // 嘗試把周邊標題包含進去（若存在相鄰的 <h1>-<h3>）
      let containerHtml = best.innerHTML;
      const prev = best.previousElementSibling;
      if (prev && /^H[1-3]$/.test(prev.nodeName)) {
        containerHtml = `${prev.outerHTML}\n${containerHtml}`;
        Logger.log('在備案內容中包含前置標題', { action: 'extractLargestListFallback' });
      }
      return containerHtml;
    }

    Logger.log('未找到合適的大型列表或類列表容器', { action: 'extractLargestListFallback' });
    return null;
  } catch (error) {
    Logger.warn('extractLargestListFallback 失敗', {
      action: 'extractLargestListFallback',
      error: error.message,
    });
    return null;
  }
}

/**
 * 檢查單個 CMS 信號是否匹配
 *
 * @param {object} signal - 信號配置對象
 * @returns {string|null} 匹配的信號類型 ('meta' | 'class') 或 null
 */
function checkCmsSignal(signal) {
  if (signal.type === 'meta') {
    const meta = document.querySelector(`meta[name="${CSS.escape(signal.name)}"]`);
    if (meta && signal.pattern.test(meta.content)) {
      return 'meta';
    }
  } else if (signal.type === 'class') {
    const element = document.querySelector(signal.target);
    if (element && signal.pattern.test(element.className)) {
      return 'class';
    }
  }
  return null;
}

/**
 * 檢測網站使用的 CMS 類型
 *
 * @returns {string|null} CMS 類型 (e.g., 'wordpress') 或 null
 */
function detectCMS() {
  for (const [type, config] of Object.entries(CMS_CLEANING_RULES)) {
    // 檢查所有信號
    for (const signal of config.signals) {
      const matchType = checkCmsSignal(signal);
      if (matchType) {
        Logger.log('檢測到 CMS', { action: 'detectCMS', type, signal: matchType });
        return type;
      }
    }
  }
  return null;
}

/**
 * 執行智慧清洗 (Smart Cleaning)
 * 在 Readability 解析後，針對特定 CMS 或通用雜訊進行二次清理
 *
 * @param {string} articleContent - Readability 返回的 HTML 內容
 * @param {string|null} cmsType - 檢測到的 CMS 類型
 * @returns {string} 清洗後的 HTML 內容
 */
function performSmartCleaning(articleContent, cmsType) {
  if (!articleContent) {
    return '';
  }

  // 使用 DOMParser 解析 HTML 字符串，避免直接設置 innerHTML 帶來的 XSS 風險
  const parser = new DOMParser();
  const doc = parser.parseFromString(articleContent, 'text/html');
  // 使用 doc.body 作為臨時容器
  const tempDiv = doc.body;
  let removedCount = 0;

  // 1. 通用清洗 (Generic Cleaning)
  GENERIC_CLEANING_RULES.forEach(selector => {
    const elements = safeQueryElements(tempDiv, selector);
    elements.forEach(el => {
      // Whitelist check
      if (
        el.dataset.keep ||
        el.getAttribute('role') === 'main' ||
        (el.textContent && el.textContent.length > 300)
      ) {
        return;
      }
      el.remove();
      removedCount++;
    });
  });

  // 1.1 特別處理 display: none (使用正則防止誤判)
  const styleElements = safeQueryElements(tempDiv, '[style*="display" i]');
  styleElements.forEach(el => {
    const style = el.getAttribute('style');
    if (style && /\bdisplay\s*:\s*none\b/i.test(style)) {
      if (
        el.dataset.keep ||
        el.getAttribute('role') === 'main' ||
        (el.textContent && el.textContent.length > 300)
      ) {
        return;
      }
      el.remove();
      removedCount++;
    }
  });

  // 2. CMS 特定清洗 (CMS Specific Cleaning)
  if (cmsType && CMS_CLEANING_RULES[cmsType]) {
    const cmsRules = CMS_CLEANING_RULES[cmsType];
    cmsRules.remove.forEach(selector => {
      const elements = safeQueryElements(tempDiv, selector);
      elements.forEach(el => {
        el.remove();
        removedCount++;
      });
    });
  }

  // 3. 安全性清洗 (Security Cleaning)
  // 移除所有元素的 on* 屬性 (e.g. onerror, onclick) 以防止 DOMParser 保留潛在的 XSS 風險
  const allElements = tempDiv.querySelectorAll('*');
  allElements.forEach(el => {
    // 遍歷所有屬性
    const attributes = Array.from(el.attributes);
    attributes.forEach(attr => {
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  Logger.log('智慧清洗完成', {
    action: 'performSmartCleaning',
    cmsType,
    removedCount,
  });

  return tempDiv.innerHTML;
}

/**
 * 預處理克隆 DOM 中的懶加載圖片
 * 將 data-src 等懶加載屬性的值寫入 src，確保 Readability 不會移除這些圖片
 *
 * @param {Document} doc - 克隆的文檔對象（會被直接修改）
 * @returns {number} 處理的圖片數量
 */
function _prepareLazyImages(doc) {
  const images = doc.querySelectorAll('img');
  let fixedCount = 0;

  images.forEach(img => {
    const currentSrc = img.getAttribute('src') || '';

    // 已有有效 src 的圖片不需要處理
    if (
      currentSrc &&
      !currentSrc.startsWith('data:') &&
      !currentSrc.includes('loading') &&
      !currentSrc.includes('placeholder') &&
      !currentSrc.includes('blank')
    ) {
      return;
    }

    // 依序嘗試 IMAGE_ATTRIBUTES 中的屬性（跳過 src 本身）
    for (const attr of IMAGE_ATTRIBUTES) {
      if (attr === 'src') {
        continue;
      }
      const value = img.getAttribute(attr);
      if (value?.trim() && !value.startsWith('data:') && !value.startsWith('blob:')) {
        img.setAttribute('src', value.trim());
        fixedCount++;
        break;
      }
    }
  });

  // 同時處理 <source> 元素的 data-srcset → srcset
  const sources = doc.querySelectorAll('source[data-srcset]');
  sources.forEach(source => {
    if (!source.getAttribute('srcset')) {
      const dataSrcset = source.dataset.srcset;
      if (dataSrcset?.trim()) {
        source.setAttribute('srcset', dataSrcset.trim());
      }
    }
  });

  if (fixedCount > 0) {
    Logger.log('懶加載圖片預處理完成', {
      action: '_prepareLazyImages',
      totalImages: images.length,
      fixedCount,
    });
  }

  return fixedCount;
}

/**
 * 使用 Readability.js 解析文章內容
 * 包含性能優化、錯誤處理和邊緣情況處理
 *
 * @returns {object} 解析後的文章對象,包含 title 和 content 屬性
 * @throws {Error} 當 Readability 不可用或解析失敗時拋出錯誤
 */
function parseArticleWithReadability() {
  // 1. (Removed) Readability dependency check is no longer needed with NPM package

  Logger.log('開始 Readability 內容解析', { action: 'parseArticleWithReadability' });

  // 1. 檢測 CMS 類型 (用於後續清洗)
  const cmsType = detectCMS();

  // 2. 克隆文檔 (直接克隆，保留完整結構讓 Readability 判斷)
  const clonedDocument = document.cloneNode(true);

  // 2.5 預處理懶加載圖片（確保 Readability 保留 data-src 圖片）
  _prepareLazyImages(clonedDocument);

  // 3. 執行 Readability 解析
  let parsedArticle = null;

  try {
    Logger.log('正在初始化 Readability 解析器', { action: 'parseArticleWithReadability' });
    // [Changed] Enable keepClasses to allow for smart cleaning post-processing
    const readabilityInstance = new Readability(clonedDocument, { keepClasses: true });

    Logger.log('正在解析文檔內容', { action: 'parseArticleWithReadability' });
    parsedArticle = readabilityInstance.parse();

    Logger.log('Readability 解析完成', { action: 'parseArticleWithReadability' });
  } catch (parseError) {
    Logger.error('Readability 解析失敗', {
      action: 'parseArticleWithReadability',
      error: parseError.message,
    });
    throw new Error(`Readability parsing error: ${parseError.message}`);
  }

  // 4. [Moved] 執行智慧清洗 (獨立於 Readability 解析過程)
  try {
    if (parsedArticle?.content) {
      Logger.log('正在執行智慧清洗', { action: 'parseArticleWithReadability', cmsType });
      parsedArticle.content = performSmartCleaning(parsedArticle.content, cmsType);
    }
  } catch (cleaningError) {
    // 清洗失敗不應阻斷流程，僅記錄錯誤
    Logger.warn('智慧清洗過程中發生錯誤，將使用原始解析結果', {
      action: 'parseArticleWithReadability',
      error: cleaningError.message,
    });
  }

  // 5. 驗證解析結果
  if (!parsedArticle) {
    Logger.warn('Readability 返回空結果', { action: 'parseArticleWithReadability' });
    throw new Error('Readability parsing returned no result');
  }

  // 6. 驗證基本屬性
  if (!parsedArticle.content || typeof parsedArticle.content !== 'string') {
    Logger.info('Readability 結果缺少內容屬性', { action: 'parseArticleWithReadability' });
    throw new Error('Parsed article has no valid content');
  }

  if (!parsedArticle.title || typeof parsedArticle.title !== 'string') {
    Logger.warn('Readability 結果缺少標題，使用備用標題', {
      action: 'parseArticleWithReadability',
    });
    parsedArticle.title = document.title || 'Untitled Page';
  }

  Logger.log('解析完成統計', {
    action: 'parseArticleWithReadability',
    length: parsedArticle.content.length,
    title: parsedArticle.title,
  });
  return parsedArticle;
}

// 導出函數供其他模組使用
const readabilityAdapter = {
  safeQueryElements,
  isContentGood,
  expandCollapsibleElements,
  cachedQuery,
  findContentCmsFallback,
  extractLargestListFallback,
  parseArticleWithReadability,
  detectCMS,
  performSmartCleaning,
  _prepareLazyImages,
};

export {
  readabilityAdapter,
  safeQueryElements,
  isContentGood,
  expandCollapsibleElements,
  cachedQuery,
  findContentCmsFallback,
  extractLargestListFallback,
  detectCMS,
  performSmartCleaning,
  parseArticleWithReadability,
  _prepareLazyImages,
};
