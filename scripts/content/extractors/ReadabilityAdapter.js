/**
 * ReadabilityAdapter - Readability.js 適配層
 *
 * 職責:
 * - 調用 lib/Readability.js (透過全域變數 window.Readability)
 * - 整合內容質量檢查 (isContentGood)
 * - 提供多層 fallback 策略 (Readability → CMS → List)
 * - 統一錯誤處理和日誌記錄
 *
 * 注意: Readability 的實際調用邏輯 (parseArticleWithReadability)
 * 尚未遷移到此模組,仍在 content.js 中。
 */

/* global Logger, PerformanceOptimizer */

/**
 * 安全地查詢 DOM 元素,避免拋出異常
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
    Logger.warn(`查詢選擇器失敗: ${selector}`, error);
    return [];
  }
}

/**
 * 評估提取的內容質量
 * 檢查內容長度和鏈接密度，判斷內容是否足夠好
 *
 * @param {Object} article - Readability 提取的文章對象
 * @param {string} article.content - 文章 HTML 內容
 * @param {number} article.textContent - 文章文本內容（用於長度計算）
 * @returns {boolean} 如果內容質量良好返回 true，否則返回 false
 *
 * @description
 * 質量評估標準：
 * 1. 內容長度至少 250 字符（MIN_CONTENT_LENGTH）
 * 2. 鏈接密度不超過 30%（MAX_LINK_DENSITY）
 * 3. 列表項數量 >= 8 時允許例外（LIST_EXCEPTION_THRESHOLD）
 *
 * 鏈接密度 = (所有鏈接文本長度) / (總文本長度)
 *
 * 特殊處理：
 * - 對於以清單為主的文件（如 CLI docs），如果包含 8+ 個 <li> 項目，即使鏈接密度高也視為有效
 */
function isContentGood(article) {
  // @SYNC-WITH: scripts/config/constants.js (CONTENT_QUALITY)
  const MIN_CONTENT_LENGTH = 250;
  const MAX_LINK_DENSITY = 0.3;
  const LIST_EXCEPTION_THRESHOLD = 8;

  // 驗證輸入
  if (!article || !article.content) {
    Logger.warn('[內容質量] article 或 article.content 為空');
    return false;
  }

  // 使用正確的文本長度：article.content 的長度
  const contentLength = article.content.length;

  // 內容太短，質量不佳
  if (contentLength < MIN_CONTENT_LENGTH) {
    Logger.warn(`[內容質量] 內容長度不足: ${contentLength} < ${MIN_CONTENT_LENGTH}`);
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
    Logger.log(
      `Readability.js content accepted as list-heavy (liCount=${liCount}) despite link density ${linkDensity.toFixed(2)}`
    );
    return true;
  }

  // 檢查鏈接密度
  if (linkDensity > MAX_LINK_DENSITY) {
    Logger.log(
      `Readability.js content rejected due to high link density: ${linkDensity.toFixed(2)}`
    );
    return false;
  }

  return true;
}

/**
 * 嘗試展開頁面上常見的可折疊/懶載入內容，以便 Readability 能夠擷取隱藏的文本
 * Best-effort：會處理 <details>、aria-expanded/aria-hidden、常見 collapsed 類別 和 Bootstrap collapse
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
        Logger.warn('Failed to open <details> element', error);
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
        } catch {
          /* ignore click failures */
        }

        // 如果有 aria-controls，嘗試移除 aria-hidden 或 collapsed 類別
        const ctrl = trigger.getAttribute && trigger.getAttribute('aria-controls');
        if (ctrl) {
          const target = document.getElementById(ctrl) || document.querySelector(`#${ctrl}`);
          if (target) {
            target.removeAttribute('aria-hidden');
            target.classList.remove('collapsed');
            target.classList.remove('collapse');
            expanded.push(target);
          }
        }
      } catch {
        // 忽略單一項目錯誤
      }
    });

    // 3) 通用 collapsed / collapse 類別
    const collapsedEls = Array.from(document.querySelectorAll('.collapsed, .collapse:not(.show)'));
    collapsedEls.forEach(el => {
      try {
        el.classList.remove('collapsed');
        el.classList.remove('collapse');
        el.classList.add('expanded-by-clipper');
        el.removeAttribute('aria-hidden');
        expanded.push(el);
      } catch {
        // 忽略
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
        Logger.warn('Failed to expand hidden element', error);
      }
    });

    // 等待短暫時間讓任何 JS 綁定或懶載入觸發
    await new Promise(resolve => setTimeout(resolve, timeout));

    Logger.log(`✅ expandCollapsibleElements: expanded ${expanded.length} candidates`);
    return expanded;
  } catch (error) {
    Logger.warn('expandCollapsibleElements failed:', error);
    return [];
  }
}

/**
 * 內容長度最小值常量
 * @SYNC-WITH: scripts/config/constants.js (CONTENT_QUALITY.MIN_CONTENT_LENGTH)
 */
const MIN_CONTENT_LENGTH = 250;

/**
 * 便捷的緩存查詢函數
 * @param {string} selector - CSS 選擇器
 * @param {Element|Document} context - 查詢上下文
 * @param {Object} options - 選項對象
 * @param {boolean} options.single - 是否返回單一元素
 * @param {boolean} options.all - 是否返回所有匹配元素
 * @returns {Element|NodeList|Array} 查詢結果
 */
function cachedQuery(selector, context = document, options = {}) {
  // 如果全域的 PerformanceOptimizer 可用,使用緩存查詢
  if (typeof PerformanceOptimizer !== 'undefined' && window.performanceOptimizer) {
    return window.performanceOptimizer.cachedQuery(selector, context, options);
  }
  // 回退到原生查詢
  return options.single ? context.querySelector(selector) : context.querySelectorAll(selector);
}

/**
 * A new, CMS-aware fallback function. It specifically looks for patterns
 * found in CMS like Drupal and other common website structures.
 * @returns {string|null} The combined innerHTML of the article components.
 */
function findContentCmsFallback() {
  Logger.log('Executing CMS-aware fallback finder...');

  // Strategy 1: Look for Drupal's typical structure
  const drupalNodeContent = cachedQuery('.node__content', document, { single: true });
  if (drupalNodeContent) {
    const imageField = cachedQuery('.field--name-field-image', drupalNodeContent, {
      single: true,
    });
    const bodyField = cachedQuery('.field--name-field-body', drupalNodeContent, { single: true });

    if (bodyField) {
      Logger.log('Drupal structure detected. Combining fields.');
      const imageHtml = imageField ? imageField.innerHTML : '';
      const bodyHtml = bodyField.innerHTML;
      return imageHtml + bodyHtml;
    }
  }

  // Strategy 2: Look for WordPress and other CMS patterns
  // @SYNC-WITH: scripts/config/selectors.js (CMS_CONTENT_SELECTORS)
  const wordpressSelectors = [
    '.entry-content',
    '.post-content',
    '.article-content',
    '.content-area',
    '.single-content',
    '.main-content',
    '.page-content',
    '.content-wrapper',
    '.article-wrapper',
    '.post-wrapper',
    '.content-body',
    '.article-text',
    '.post-text',
    '.content-main',
    '.article-main',
    // 移動版常用選擇器
    '.mobile-content',
    '.m-content',
    '.content',
    '.text-content',
    '.article-detail',
    '.post-detail',
    '.detail-content',
    '.news-content',
    '.story-content',
  ];

  for (const selector of wordpressSelectors) {
    const element = cachedQuery(selector, document, { single: true });
    if (element) {
      const textLength = element.textContent.trim().length;
      Logger.log(`Found element with selector "${selector}": ${textLength} characters`);
      if (textLength >= MIN_CONTENT_LENGTH) {
        Logger.log(`✅ CMS content found with selector: ${selector} (${textLength} chars)`);
        return element.innerHTML;
      }
      Logger.log(
        `❌ Content too short with selector: ${selector} (${textLength} < ${MIN_CONTENT_LENGTH})`
      );
    } else {
      Logger.log(`❌ No element found with selector: ${selector}`);
    }
  }

  // Strategy 3: Look for common article structures
  const articleSelectors = [
    'article[role="main"]',
    'article.post',
    'article.article',
    'article.content',
    'article.entry',
    '.post-body',
    '.article-body',
    '.entry-body',
    '.news-body',
    '.story-body',
    '.content-text',
    '.article-container',
    '.post-container',
    '.content-container',
    // 通用文章標籤
    'article',
    'main article',
    '.article',
    '.post',
    '.entry',
    '.news',
    '.story',
    // ID 選擇器（常見的）
    '#content',
    '#main-content',
    '#article-content',
    '#post-content',
    '#article',
    '#post',
    '#main',
  ];

  for (const selector of articleSelectors) {
    const element = cachedQuery(selector, document, { single: true });
    if (element) {
      const textLength = element.textContent.trim().length;
      Logger.log(`Found element with selector "${selector}": ${textLength} characters`);
      if (textLength >= MIN_CONTENT_LENGTH) {
        Logger.log(`✅ Article content found with selector: ${selector} (${textLength} chars)`);
        return element.innerHTML;
      }
      Logger.log(
        `❌ Content too short with selector: ${selector} (${textLength} < ${MIN_CONTENT_LENGTH})`
      );
    } else {
      Logger.log(`❌ No element found with selector: ${selector}`);
    }
  }

  // Strategy 4: Generic "biggest content block" as a final attempt
  Logger.log('🔍 CMS structure not found. Reverting to generic content finder...');
  Logger.log(`📏 Minimum content length required: ${MIN_CONTENT_LENGTH} characters`);

  const candidates = cachedQuery('article, section, main, div', document);
  Logger.log(`🎯 Found ${candidates.length} potential content candidates`);

  let bestElement = null;
  let maxScore = 0;
  let candidateCount = 0;

  for (const el of candidates) {
    const text = el.textContent?.trim() || '';
    candidateCount++;

    if (text.length < MIN_CONTENT_LENGTH) {
      Logger.log(
        `❌ Candidate ${candidateCount}: Too short (${text.length} < ${MIN_CONTENT_LENGTH})`
      );
      continue;
    }

    const paragraphs = cachedQuery('p', el).length;
    const images = cachedQuery('img', el).length;
    const links = cachedQuery('a', el).length;

    // 給圖片加分，因為我們想要包含圖片的內容
    const score = text.length + paragraphs * 50 + images * 30 - links * 25;

    Logger.log(
      `📊 Candidate ${candidateCount}: ${text.length} chars, ${paragraphs}p, ${images}img, ${links}links, score: ${score}`
    );

    if (score > maxScore) {
      // 避免選擇嵌套的父元素
      if (bestElement && el.contains(bestElement)) {
        Logger.log('⚠️ Skipping nested parent element');
        continue;
      }
      maxScore = score;
      bestElement = el;
      Logger.log(`✅ New best candidate found with score: ${score}`);
    }
  }

  if (bestElement) {
    Logger.log(`🎉 Best content found with ${bestElement.textContent.trim().length} characters`);
    return bestElement.innerHTML;
  }
  Logger.log(
    `❌ No suitable content found. All ${candidateCount} candidates were too short or scored too low.`
  );

  // 最後的嘗試：降低標準
  Logger.log(`🔄 Trying with lower standards (${MIN_CONTENT_LENGTH / 2} chars)...`);
  for (const el of candidates) {
    const text = el.textContent?.trim() || '';
    if (text.length >= MIN_CONTENT_LENGTH / 2) {
      Logger.log(`🆘 Emergency fallback: Found content with ${text.length} characters`);
      return el.innerHTML;
    }
  }

  Logger.log('💥 Complete failure: No content found even with lower standards');
  return null;
}

/**
 * 當 Readability 與 CMS fallback 都無法取得內容時，嘗試擷取最大的一個 <ul> 或 <ol>
 * 針對像是 CLI 文件或參考頁面（大量 bullet points）的改善。
 * 回傳該列表的 innerHTML 或 null。
 */
function extractLargestListFallback() {
  try {
    Logger.log('🔎 Running extractLargestListFallback to find large <ul>/<ol>');

    // 策略 1: 尋找真正的 <ul> / <ol>
    const lists = Array.from(document.querySelectorAll('ul, ol'));
    Logger.log(`Found ${lists.length} actual <ul>/<ol> elements`);

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

      const bulletPattern = /^(?:[-\u{2022}*•·–—►▶✔▪]|\d+[.)])\s+/u;
      const matchingLines = lines.filter(line => bulletPattern.test(line)).length;
      return matchingLines >= Math.max(3, Math.floor(lines.length * 0.4));
    });

    Logger.log(`Found ${possibleListContainers.length} possible list containers`);

    // 合併真正的清單和可能的清單容器
    const allCandidates = [...lists, ...possibleListContainers];

    if (!allCandidates || allCandidates.length === 0) {
      Logger.log('✗ No lists or list-like containers found on page');
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
        const bulletPattern = /^(?:[-\u{2022}*•·–—►▶✔▪]|\d+[.)])\s+/u;
        effectiveItemCount = lines.filter(line => bulletPattern.test(line)).length;
      }

      const score = effectiveItemCount * 10 + Math.min(500, Math.floor(textLength / 10));

      Logger.log(
        `Candidate ${idx + 1}: itemCount=${effectiveItemCount}, textLength=${textLength}, score=${score}, tagName=${candidate.tagName}`
      );

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
      Logger.log(
        `✅ extractLargestListFallback chose a container with score ${bestScore}, tagName=${best.tagName}`
      );
      // 嘗試把周邊標題包含進去（若存在相鄰的 <h1>-<h3>）
      let containerHtml = best.innerHTML;
      const prev = best.previousElementSibling;
      if (prev && /^H[1-3]$/.test(prev.nodeName)) {
        containerHtml = `${prev.outerHTML}\n${containerHtml}`;
        Logger.log('Included preceding heading in fallback content');
      }
      return containerHtml;
    }

    Logger.log('✗ No suitable large list or list-like container found');
    return null;
  } catch (error) {
    Logger.warn('extractLargestListFallback failed:', error);
    return null;
  }
}

// 導出函數供其他模組使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    safeQueryElements,
    isContentGood,
    expandCollapsibleElements,
    cachedQuery,
    findContentCmsFallback,
    extractLargestListFallback,
  };
}
