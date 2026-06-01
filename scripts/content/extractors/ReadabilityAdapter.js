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
import {
  CONTENT_QUALITY,
  CMS_CONTENT_SELECTORS,
  ARTICLE_STRUCTURE_SELECTORS,
  CMS_CLEANING_RULES,
  GENERIC_CLEANING_RULES,
  DOMAIN_CLEANING_RULES,
} from '../../config/shared/content.js';
import { IMAGE_ATTRIBUTES } from '../../utils/imageUtils.js';

/**
 * 列表處理的預編譯正則表達式模式
 * 性能優化：避免在循環中重複編譯
 */
const LIST_PREFIX_PATTERNS = {
  // 移除列表前綴：連字符、項目符號、星號、數字、點、管道、括號和空格
  bulletPrefix: /^(?:[-\u{2022}*·–—►▶✔▪]|\d+[.)])\s+/u,
  // 多餘空格正規化
  multipleSpaces: /\s+/g,
  // 空白行檢測
  emptyLine: /^\s*$/,
};

// 從 CONTENT_QUALITY 解構常用常量到模組級別
const { MIN_CONTENT_LENGTH } = CONTENT_QUALITY;
const DISPLAY_NONE_STYLE_PATTERN = /\bdisplay\s*:\s*none\b/i;

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

  // 創建臨時 DOM 容器以分析內容，使用 DOMParser 避免 XSS
  const parser = new DOMParser();
  const doc = parser.parseFromString(article.content, 'text/html');
  const tempDiv = doc.body;

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
 * 開啟所有未開啟的 <details> 元素
 *
 * @param {Array} expanded - 用於記錄已展開元素的陣列
 */
function openDetailsElements(expanded) {
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
}

/**
 * 展開所有 aria-expanded="false" 的控制元素
 *
 * @param {Array} expanded - 用於記錄已展開元素的陣列
 */
function expandAriaControlledElements(expanded) {
  const triggers = Array.from(document.querySelectorAll('[aria-expanded="false"]'));
  triggers.forEach(trigger => {
    try {
      trigger.setAttribute('aria-expanded', 'true');
      try {
        trigger.click();
      } catch (clickError) {
        Logger.debug('觸發元素點擊失敗', {
          action: 'expandCollapsibleElements',
          error: clickError.message,
        });
      }

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
          // 忽略 querySelector 錯誤
        }
      }
    } catch (error) {
      Logger.warn('處理 aria-expanded 元素失敗', {
        action: 'expandCollapsibleElements',
        error: error.message,
      });
    }
  });
}

/**
 * 展開所有包含 collapsed / collapse 類別的元素
 *
 * @param {Array} expanded - 用於記錄已展開元素的陣列
 */
function expandCollapsedClassElements(expanded) {
  const collapsedEls = Array.from(document.querySelectorAll('.collapsed, .collapse:not(.show)'));
  collapsedEls.forEach(el => {
    try {
      el.classList.remove('collapsed', 'collapse');
      el.classList.add('expanded-by-clipper');
      el.removeAttribute('aria-hidden');
      expanded.push(el);
    } catch (error) {
      Logger.debug('處理 collapsed 類別元素失敗', {
        action: 'expandCollapsibleElements',
        error: error.message,
      });
    }
  });
}

/**
 * 顯示常見的隱藏內容元素 (如 display:none 或 hidden 屬性)
 *
 * @param {Array} expanded - 用於記錄已展開元素的陣列
 */
function revealHiddenContentElements(expanded) {
  const hiddenByStyle = Array.from(
    document.querySelectorAll('[style*="display" i], [hidden]')
  ).filter(el => {
    const style = el.getAttribute('style') || '';
    return el.hasAttribute('hidden') || DISPLAY_NONE_STYLE_PATTERN.test(style);
  });
  hiddenByStyle.forEach(el => {
    try {
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

    openDetailsElements(expanded);
    expandAriaControlledElements(expanded);
    expandCollapsedClassElements(expanded);
    revealHiddenContentElements(expanded);

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
 * 計算通用內容候選元素的評分 (基於文字長度、段落、圖片與超連結數量)
 *
 * @param {Element} el - 候選元素
 * @param {string} text - 候選元素的純文字內容
 * @returns {number} 評分分數
 */
function scoreGenericContentCandidate(el, text) {
  const paragraphs = cachedQuery('p', el).length;
  const images = cachedQuery('img', el).length;
  const links = cachedQuery('a', el).length;

  // 給圖片加分，因為我們想要包含圖片的內容
  return text.length + paragraphs * 50 + images * 30 - links * 25;
}

/**
 * 讀取候選元素的純文字內容
 *
 * @param {Element} el - 候選元素
 * @returns {string} 去除前後空白的文字
 */
function getGenericContentCandidateText(el) {
  return el.textContent?.trim() || '';
}

/**
 * 從通用內容候選元素中選出評分最高的主要內容元素
 *
 * @param {NodeList|Array} candidates - 通用內容候選元素
 * @returns {Element|null} 最佳候選元素
 */
function selectBestGenericContentCandidate(candidates) {
  let bestElement = null;
  let maxScore = 0;

  for (const el of candidates) {
    const text = getGenericContentCandidateText(el);

    if (text.length < MIN_CONTENT_LENGTH) {
      continue;
    }

    const score = scoreGenericContentCandidate(el, text);

    if (score <= maxScore) {
      continue;
    }

    // 避免選擇嵌套的父元素
    if (bestElement && el.contains(bestElement)) {
      continue;
    }

    maxScore = score;
    bestElement = el;
  }

  return bestElement;
}

/**
 * 在沒有最佳候選元素時，使用較低內容長度門檻尋找緊急備案內容
 *
 * @param {NodeList|Array} candidates - 通用內容候選元素
 * @returns {Element|null} 緊急備案候選元素
 */
function findEmergencyGenericContentCandidate(candidates) {
  for (const el of candidates) {
    const text = getGenericContentCandidateText(el);
    if (text.length >= MIN_CONTENT_LENGTH / 2) {
      Logger.log('緊急備案：找到內容', { action: 'findContentCmsFallback', length: text.length });
      return el;
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

  const bestElement = selectBestGenericContentCandidate(candidates);

  if (bestElement) {
    Logger.log('找到最佳內容', {
      action: 'findContentCmsFallback',
      length: bestElement.textContent.trim().length,
    });
    return bestElement.innerHTML;
  }

  // 最後的嘗試：降低標準
  return findEmergencyGenericContentCandidate(candidates)?.innerHTML || null;
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
 * 判斷一個容器元素是否呈現出類似列表的結構 (包含多個項目符號或數字)
 *
 * @param {Element} container - 要檢查的 DOM 容器
 * @returns {boolean} 是否為類列表容器
 */
function isListLikeContainer(container) {
  const text = container.textContent || '';
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
}

/**
 * 收集頁面中所有真實的列表元素和可能的類列表容器
 *
 * @returns {Array} 所有候選元素的陣列
 */
function collectListFallbackCandidates() {
  const lists = Array.from(document.querySelectorAll('ul, ol'));
  Logger.log('找到實際的列表元素', { action: 'extractLargestListFallback', count: lists.length });

  const possibleListContainers = Array.from(
    document.querySelectorAll('div, section, article')
  ).filter(container => isListLikeContainer(container));

  Logger.log('找到可能的列表容器', {
    action: 'extractLargestListFallback',
    count: possibleListContainers.length,
  });

  return [...lists, ...possibleListContainers];
}

/**
 * 計算候選列表的有效項目數量 (優先使用 <li> 數量，否則使用以項目符號開頭的行數)
 *
 * @param {Element} candidate - 候選元素
 * @returns {number} 有效的項目數量
 */
function getEffectiveListItemCount(candidate) {
  const liItems = Array.from(candidate.querySelectorAll('li'));
  const liCount = liItems.length;
  if (liCount > 0) {
    return liCount;
  }

  const lines = (candidate.textContent || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const bulletPattern = LIST_PREFIX_PATTERNS.bulletPrefix;
  return lines.filter(line => bulletPattern.test(line)).length;
}

/**
 * 對候選列表進行評估與評分
 *
 * @param {Element} candidate - 候選元素
 * @param {number} index - 候選元素的索引
 * @returns {object} 包含評估數據與得分的物件
 */
function scoreListFallbackCandidate(candidate, index) {
  const textLength = (candidate.textContent || '').trim().length;
  const itemCount = getEffectiveListItemCount(candidate);
  const score = itemCount * 10 + Math.min(500, Math.floor(textLength / 10));

  Logger.log('清單候選者統計', {
    action: 'extractLargestListFallback',
    index: index + 1,
    itemCount,
    textLength,
    score,
    tagName: candidate.tagName,
  });

  return {
    candidate,
    itemCount,
    textLength,
    score,
    tagName: candidate.tagName,
  };
}

/**
 * 從多個候選列表選出得分最高的最佳列表
 *
 * @param {Array} candidates - 所有候選元素的陣列
 * @returns {Element|null} 最佳列表元素，若無則返回 null
 */
function selectBestListFallbackCandidate(candidates) {
  let best = null;
  let bestScore = 0;

  candidates.forEach((candidate, idx) => {
    const scored = scoreListFallbackCandidate(candidate, idx);
    if (scored.itemCount < 4) {
      return;
    }
    if (scored.score > bestScore) {
      bestScore = scored.score;
      best = scored.candidate;
    }
  });

  if (best) {
    Logger.log('選擇了最佳清單容器', {
      action: 'extractLargestListFallback',
      score: bestScore,
      tagName: best.tagName,
    });
  }
  return best;
}

/**
 * 嘗試將最佳列表周邊的相鄰標題 (H1-H3) 合併至結果 HTML 中
 *
 * @param {Element} best - 最佳列表元素
 * @returns {string} 合併標題後的 HTML 內容
 */
function prependPreviousHeadingHtml(best) {
  let containerHtml = best.innerHTML;
  const prev = best.previousElementSibling;
  if (prev && /^H[1-3]$/.test(prev.nodeName)) {
    containerHtml = `${prev.outerHTML}\n${containerHtml}`;
    Logger.log('在備案內容中包含前置標題', { action: 'extractLargestListFallback' });
  }
  return containerHtml;
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

    const allCandidates = collectListFallbackCandidates();

    if (!allCandidates || allCandidates.length === 0) {
      Logger.log('頁面上未找到列表或類列表容器', { action: 'extractLargestListFallback' });
      return null;
    }

    const best = selectBestListFallbackCandidate(allCandidates);

    if (best) {
      return prependPreviousHeadingHtml(best);
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
 * 檢查 meta CMS 信號是否匹配
 *
 * @param {object} signal - 信號配置對象
 * @returns {boolean} meta 信號匹配時返回 true
 */
function matchesCmsMetaSignal(signal) {
  if (signal.type !== 'meta') {
    return false;
  }

  const meta = document.querySelector(`meta[name="${CSS.escape(signal.name)}"]`);
  return Boolean(meta && signal.pattern.test(meta.content));
}

/**
 * 檢查 class CMS 信號是否匹配
 *
 * @param {object} signal - 信號配置對象
 * @returns {boolean} class 信號匹配時返回 true
 */
function matchesCmsClassSignal(signal) {
  if (signal.type !== 'class') {
    return false;
  }

  const element = document.querySelector(signal.target);
  return Boolean(element && signal.pattern.test(element.className));
}

/**
 * 檢查單個 CMS 信號是否匹配
 *
 * @param {object} signal - 信號配置對象
 * @returns {string|null} 匹配的信號類型 ('meta' | 'class') 或 null
 */
function checkCmsSignal(signal) {
  if (matchesCmsMetaSignal(signal)) {
    return 'meta';
  }

  if (matchesCmsClassSignal(signal)) {
    return 'class';
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
 * 獲取網域專屬清洗規則
 *
 * @param {string} hostname - 當前的網域 (e.g. news.qq.com)
 * @returns {object|null} 網域專屬規則對象或 null
 */
function getDomainRules(hostname) {
  if (!hostname) {
    return null;
  }

  // 比對完整主機名稱，或檢查是否以指定網域結尾（用於子網域匹配）
  for (const [domain, rules] of Object.entries(DOMAIN_CLEANING_RULES)) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      Logger.log('檢測到網域專屬清洗規則', { action: 'getDomainRules', domain });
      return rules;
    }
  }
  return null;
}

/**
 * 判斷被清洗的元素是否應該保留 (白名單機制：data-keep, role="main" 或長度大於 300 字符)
 *
 * @param {Element} el - 要檢查的元素
 * @returns {boolean} 是否保留
 */
function shouldPreserveCleanedElement(el) {
  if (!el) {
    return false;
  }
  return Boolean(
    el.dataset.keep ||
    el.getAttribute('role') === 'main' ||
    (el.textContent && el.textContent.length > 300)
  );
}

/**
 * 依據選擇器清單移除匹配的 DOM 元素，並可選擇是否套用白名單保留機制
 *
 * @param {Element} root - 起始查詢的根節點
 * @param {string[]} selectors - CSS 選擇器清單
 * @param {object} options - 參數選項
 * @param {boolean} options.preserve - 是否啟用白名單保留機制
 * @returns {number} 被移除的元素數量
 */
function removeElementsMatchingSelectors(root, selectors, { preserve = false } = {}) {
  let count = 0;
  selectors.forEach(selector => {
    const elements = safeQueryElements(root, selector);
    elements.forEach(el => {
      if (preserve && shouldPreserveCleanedElement(el)) {
        return;
      }
      el.remove();
      count++;
    });
  });
  return count;
}

/**
 * 移除所有具有 display:none 樣式的隱藏元素 (套用白名單保留機制)
 *
 * @param {Element} root - 起始查詢的根節點
 * @returns {number} 被移除的元素數量
 */
function removeDisplayNoneElements(root) {
  let count = 0;
  const styleElements = safeQueryElements(root, '[style*="display" i]');
  styleElements.forEach(el => {
    const style = el.getAttribute('style');
    if (style && DISPLAY_NONE_STYLE_PATTERN.test(style)) {
      if (shouldPreserveCleanedElement(el)) {
        return;
      }
      el.remove();
      count++;
    }
  });
  return count;
}

/**
 * 移除元素中的所有 inline 事件處理器屬性 (如 onclick, onload 等 on* 屬性)
 *
 * @param {Element} root - 起始查詢的根節點
 */
function stripEventHandlerAttributes(root) {
  const allElements = root.querySelectorAll('*');
  allElements.forEach(el => {
    const attributes = Array.from(el.attributes);
    attributes.forEach(attr => {
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
  });
}

/**
 * 執行智慧清洗 (Smart Cleaning)
 * 在 Readability 解析後，針對特定 CMS 或通用雜訊進行二次清理
 *
 * @param {string} articleContent - Readability 返回的 HTML 內容
 * @param {string|null} cmsType - 檢測到的 CMS 類型
 * @param {object|null} domainRules - 該網域的專屬清洗規則
 * @returns {string} 清洗後的 HTML 內容
 */
function performSmartCleaning(articleContent, cmsType, domainRules = null) {
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
  removedCount += removeElementsMatchingSelectors(tempDiv, GENERIC_CLEANING_RULES, {
    preserve: true,
  });

  // 1.1 特別處理 display: none
  removedCount += removeDisplayNoneElements(tempDiv);

  // 2. CMS 特定清洗 (CMS Specific Cleaning)
  if (cmsType && CMS_CLEANING_RULES[cmsType]) {
    const cmsRules = CMS_CLEANING_RULES[cmsType];
    removedCount += removeElementsMatchingSelectors(tempDiv, cmsRules.remove, { preserve: false });
  }

  // 3. 網域特定清洗 (Domain Specific Cleaning)
  if (domainRules && Array.isArray(domainRules.remove)) {
    removedCount += removeElementsMatchingSelectors(tempDiv, domainRules.remove, {
      preserve: false,
    });
  }

  // 4. 輕量級屬性清理 (Lightweight Attribute Sanitization)
  stripEventHandlerAttributes(tempDiv);

  Logger.log('智慧清洗完成', {
    action: 'performSmartCleaning',
    cmsType,
    removedCount,
  });

  return tempDiv.innerHTML;
}

/**
 * 從 srcset 屬性中提取第一個候選 URL
 *
 * @param {string} srcset - srcset 屬性值
 * @returns {string} 第一個候選 URL
 */
function extractFirstSrcsetUrl(srcset) {
  const firstEntry = srcset.split(',')[0].trim();
  return firstEntry.split(/\s+/)[0];
}

/**
 * 正規化 lazy image 候選網址，並排除 transient URL
 *
 * @param {string|null} value - 原始候選值
 * @returns {string|null} 可用候選網址
 */
function normalizeLazyImageCandidateSrc(value) {
  const candidateSrc = value?.trim();

  if (!candidateSrc) {
    return null;
  }

  if (candidateSrc.startsWith('data:')) {
    return null;
  }

  if (candidateSrc.startsWith('blob:')) {
    return null;
  }

  return candidateSrc;
}

/**
 * 讀取單一圖片屬性的 lazy image 候選網址
 *
 * @param {Element} img - 圖片元素
 * @param {string} attr - IMAGE_ATTRIBUTES 中的屬性名稱
 * @returns {string|null} 可用候選網址
 */
function resolveLazyImageAttributeCandidateSrc(img, attr) {
  const attrValue = img.getAttribute(attr);

  if (!attrValue) {
    return null;
  }

  if (attr.includes('srcset')) {
    return normalizeLazyImageCandidateSrc(extractFirstSrcsetUrl(attrValue));
  }

  return normalizeLazyImageCandidateSrc(attrValue);
}

/**
 * 依據 IMAGE_ATTRIBUTES 尋找第一個有效且與當前不同的懶加載候選網址
 *
 * @param {Element} img - 圖片元素
 * @param {string} currentSrc - 當前的 src 值
 * @returns {string|null} 第一個有效的候選網址，若無則返回 null
 */
function resolveLazyImageCandidateSrc(img, currentSrc) {
  for (const attr of IMAGE_ATTRIBUTES) {
    if (attr === 'src') {
      continue;
    }

    const candidateSrc = resolveLazyImageAttributeCandidateSrc(img, attr);

    if (!candidateSrc) {
      continue;
    }

    return candidateSrc === currentSrc ? null : candidateSrc;
  }

  return null;
}

/**
 * 遍歷所有 <img> 元素，將懶加載屬性提升為正常的 src
 *
 * @param {Document} doc - 要修改的文檔對象
 * @returns {object} 包含總圖片數與修改次數的物件
 */
function promoteLazyImageSources(doc) {
  const images = doc.querySelectorAll('img');
  let fixedCount = 0;

  images.forEach(img => {
    const currentSrc = img.getAttribute('src') || '';
    const candidateSrc = resolveLazyImageCandidateSrc(img, currentSrc);
    if (candidateSrc) {
      img.setAttribute('src', candidateSrc);
      fixedCount++;
    }
  });

  return {
    totalImages: images.length,
    fixedCount,
  };
}

/**
 * 處理 <source> 元素的 data-srcset / data-lazy-srcset，將其提升至 srcset
 *
 * @param {Document} doc - 要修改的文檔對象
 * @returns {number} 修改的 <source> 元素數量
 */
function promotePictureSourceSrcsets(doc) {
  let fixedCount = 0;
  const sources = doc.querySelectorAll('source[data-srcset], source[data-lazy-srcset]');
  sources.forEach(source => {
    const dataSrcset = source.dataset.srcset || source.dataset.lazySrcset;
    const currentSrcset = source.getAttribute('srcset');

    if (dataSrcset?.trim() && dataSrcset.trim() !== currentSrcset) {
      source.setAttribute('srcset', dataSrcset.trim());
      fixedCount++;
    }
  });
  return fixedCount;
}

/**
 * 移除遮蔽圖片的 CSS 可見性設定 (如 opacity-0 類別、lazyload 類別與行內透明度樣式)
 *
 * @param {Document} doc - 要修改的文檔對象
 * @returns {number} 移除或修改的容器數量
 */
function revealHiddenImageContainers(doc) {
  let fixedCount = 0;
  const hiddenImageContainers = doc.querySelectorAll('.opacity-0, [class*="lazyload"]');
  hiddenImageContainers.forEach(container => {
    if (!(container.querySelector('img') || container.tagName === 'IMG')) {
      return;
    }

    let changed = false;

    if (container.classList.contains('opacity-0')) {
      container.classList.remove('opacity-0');
      changed = true;
    }

    const lazyloadClasses = [...container.classList].filter(className =>
      className.startsWith('lazyload')
    );
    if (lazyloadClasses.length > 0) {
      container.classList.remove(...lazyloadClasses);
      changed = true;
    }

    if (container.style.opacity) {
      container.style.opacity = '';
      changed = true;
    }

    if (container.style.visibility) {
      container.style.visibility = '';
      changed = true;
    }

    if (changed) {
      fixedCount++;
    }
  });
  return fixedCount;
}

/**
 * 預處理克隆 DOM 中的懶加載圖片
 * 將 data-src 等懶加載屬性的值寫入 src，確保 Readability 不會移除 these 圖片
 * 策略：模擬所有圖片進入視口，將 lazy-load 屬性(data-src 等) 提升為 src
 *
 * @param {Document} doc - 克隆的文檔對象（會被直接修改）
 * @returns {number} 處理的圖片數量
 */
function prepareLazyImages(doc) {
  const { totalImages, fixedCount: imgFixedCount } = promoteLazyImageSources(doc);
  const sourceFixedCount = promotePictureSourceSrcsets(doc);
  const containerFixedCount = revealHiddenImageContainers(doc);

  const totalFixed = imgFixedCount + sourceFixedCount + containerFixedCount;

  if (totalFixed > 0) {
    Logger.log('懶加載圖片預處理完成', {
      action: 'prepareLazyImages',
      totalImages,
      fixedCount: totalFixed,
    });
  }

  return totalFixed;
}

/**
 * 解析目標文檔的 hostname 主機名稱，套用多層 fallback
 *
 * @param {Document} targetDoc - 目標 DOM 文檔對象
 * @returns {string} 網域名稱字串
 */
function resolveDocumentHostname(targetDoc) {
  return (
    targetDoc.location?.hostname ||
    targetDoc.defaultView?.location?.hostname ||
    globalThis.location?.hostname ||
    ''
  );
}

/**
 * 網域容器聚焦：若規則指定了正文容器，將克隆文檔縮窄至該容器內
 *
 * @param {Document} clonedDocument - 克隆的 DOM 文檔對象 (會被直接修改)
 * @param {object|null} domainRules - 網域專屬清洗與配置規則
 */
function applyDomainContainerNarrowing(clonedDocument, domainRules) {
  if (domainRules?.container) {
    const containerEl = clonedDocument.querySelector(domainRules.container);
    if (containerEl) {
      const clonedBody = clonedDocument.body;
      if (!clonedBody) {
        Logger.warn('克隆文檔缺少 body，跳過網域容器聚焦', {
          action: 'parseArticleWithReadability',
          container: domainRules.container,
        });
        return;
      }

      Logger.log('套用網域容器聚焦', {
        action: 'parseArticleWithReadability',
        container: domainRules.container,
      });
      clonedBody.replaceChildren();
      clonedBody.append(containerEl);
    } else {
      Logger.info('網域容器未找到，使用完整文檔', {
        action: 'parseArticleWithReadability',
        container: domainRules.container,
      });
    }
  }
}

/**
 * 複製與預處理用於 Readability 解析的文檔
 *
 * @param {Document} targetDoc - 原始 DOM 文檔對象
 * @param {object|null} domainRules - 網域專屬清洗與配置規則
 * @returns {Document} 克隆且預處理完畢的文檔對象
 */
function prepareReadabilityDocument(targetDoc, domainRules) {
  const clonedDocument = targetDoc.cloneNode(true);
  prepareLazyImages(clonedDocument);
  applyDomainContainerNarrowing(clonedDocument, domainRules);
  return clonedDocument;
}

/**
 * 執行 Readability 主解析流程
 *
 * @param {Document} clonedDocument - 預處理後的克隆文檔
 * @returns {object|null} Readability 返回的文章物件
 * @throws {Error} 當解析過程中發生錯誤時拋出
 */
function runReadabilityParser(clonedDocument) {
  try {
    Logger.log('正在初始化 Readability 解析器', { action: 'parseArticleWithReadability' });
    const readabilityInstance = new Readability(clonedDocument, { keepClasses: true });

    Logger.log('正在解析文檔內容', { action: 'parseArticleWithReadability' });
    const parsedArticle = readabilityInstance.parse();

    Logger.log('Readability 解析完成', { action: 'parseArticleWithReadability' });
    return parsedArticle;
  } catch (parseError) {
    Logger.error('Readability 解析失敗', {
      action: 'parseArticleWithReadability',
      error: parseError.message,
    });
    throw new Error(`Readability parsing error: ${parseError.message}`);
  }
}

/**
 * 安全地對 Readability 解析後的文章內容進行二次智慧清洗，確保清洗錯誤不會阻斷整體流程
 *
 * @param {object} parsedArticle - Readability 解析後的文章物件
 * @param {string|null} cmsType - 檢測到的 CMS 類型
 * @param {object|null} domainRules - 網域專屬清洗規則
 */
function cleanParsedArticleSafely(parsedArticle, cmsType, domainRules) {
  try {
    if (parsedArticle?.content) {
      Logger.log('正在執行智慧清洗', {
        action: 'parseArticleWithReadability',
        cmsType,
        hasDomainRules: Boolean(domainRules),
      });
      parsedArticle.content = performSmartCleaning(parsedArticle.content, cmsType, domainRules);
    }
  } catch (cleaningError) {
    Logger.warn('智慧清洗過程中發生錯誤，將使用原始解析結果', {
      action: 'parseArticleWithReadability',
      error: cleaningError.message,
    });
  }
}

/**
 * 確認 Readability 回傳了文章物件
 *
 * @param {object|null} parsedArticle - 文章物件
 * @throws {Error} 當文章物件不存在時拋出錯誤
 */
function assertParsedArticleExists(parsedArticle) {
  if (parsedArticle) {
    return;
  }

  Logger.warn('Readability 返回空結果', { action: 'parseArticleWithReadability' });
  throw new Error('Readability parsing returned no result');
}

/**
 * 拋出內容缺失錯誤並記錄對應日誌
 *
 * @throws {Error} 永遠拋出內容缺失錯誤
 */
function throwInvalidParsedArticleContent() {
  Logger.info('Readability 結果缺少內容屬性', { action: 'parseArticleWithReadability' });
  throw new Error('Parsed article has no valid content');
}

/**
 * 確認文章物件包含有效內容
 *
 * @param {object} parsedArticle - 文章物件
 * @throws {Error} 當內容不存在或不是字串時拋出錯誤
 */
function assertParsedArticleHasContent(parsedArticle) {
  if (typeof parsedArticle.content !== 'string') {
    throwInvalidParsedArticleContent();
  }

  if (!parsedArticle.content) {
    throwInvalidParsedArticleContent();
  }
}

/**
 * 判斷文章標題是否為有效字串
 *
 * @param {object} parsedArticle - 文章物件
 * @returns {boolean} 標題有效時返回 true
 */
function hasValidParsedArticleTitle(parsedArticle) {
  if (typeof parsedArticle.title !== 'string') {
    return false;
  }

  return Boolean(parsedArticle.title);
}

/**
 * 在標題缺失時使用文檔標題補救
 *
 * @param {object} parsedArticle - 文章物件
 * @param {Document} targetDoc - 原始文檔對象
 */
function ensureParsedArticleTitle(parsedArticle, targetDoc) {
  if (hasValidParsedArticleTitle(parsedArticle)) {
    return;
  }

  Logger.warn('Readability 結果缺少標題，使用備用標題', {
    action: 'parseArticleWithReadability',
  });
  parsedArticle.title = targetDoc.title || 'Untitled Page';
}

/**
 * 驗證解析完成的文章物件與基本屬性，並在標題缺失時進行補救
 *
 * @param {object|null} parsedArticle - 文章物件
 * @param {Document} targetDoc - 原始文檔對象 (用於標題補救)
 * @returns {object} 驗證無誤的文章物件
 * @throws {Error} 當缺少文章、缺少有效內容時拋出錯誤
 */
function validateParsedArticle(parsedArticle, targetDoc) {
  assertParsedArticleExists(parsedArticle);
  assertParsedArticleHasContent(parsedArticle);
  ensureParsedArticleTitle(parsedArticle, targetDoc);

  return parsedArticle;
}

/**
 * 使用 Readability.js 解析文章內容
 * 包含性能優化、錯誤處理和邊緣情況處理
 *
 * @param {Document} [doc] - 要解析的 DOM Document，預設使用全局 document
 * @returns {object} 解析後的文章對象,包含 title 和 content 屬性
 * @throws {Error} 當 Readability 不可用或解析失敗時拋出錯誤
 */
function parseArticleWithReadability(doc) {
  const targetDoc = doc || document;

  Logger.log('開始 Readability 內容解析', { action: 'parseArticleWithReadability' });

  const cmsType = detectCMS();
  const hostname = resolveDocumentHostname(targetDoc);
  const domainRules = getDomainRules(hostname);

  const clonedDocument = prepareReadabilityDocument(targetDoc, domainRules);
  const parsedArticle = runReadabilityParser(clonedDocument);

  cleanParsedArticleSafely(parsedArticle, cmsType, domainRules);

  const validatedArticle = validateParsedArticle(parsedArticle, targetDoc);

  Logger.log('解析完成統計', {
    action: 'parseArticleWithReadability',
    length: validatedArticle.content.length,
    title: validatedArticle.title,
  });

  return validatedArticle;
}
export {
  safeQueryElements,
  isContentGood,
  expandCollapsibleElements,
  cachedQuery,
  findContentCmsFallback,
  extractLargestListFallback,
  detectCMS,
  getDomainRules,
  performSmartCleaning,
  parseArticleWithReadability,
  prepareLazyImages,
};
