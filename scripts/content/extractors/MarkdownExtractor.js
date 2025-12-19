/**
 * MarkdownExtractor - 針對 Markdown 渲染頁面（如 GitHub, GitBook）的專用提取器
 *
 * 職責:
 * - 精確定位 Markdown 內容容器 (.markdown-body, .docs-content 等)
 * - 預處理 DOM：
 *   - 移除 UI 雜訊 (Copy buttons, language labels, anchors)
 *   - 修復常見的結構問題
 * - 保持 DOM 結構以供 DomConverter 進行高保真轉換
 */

import Logger from '../../utils/Logger.js';
import { TECHNICAL_CONTENT_SELECTORS } from '../../config/selectors.js';

export class MarkdownExtractor {
  /**
   * 嘗試提取 Markdown 內容
   * @param {Document} doc
   * @returns {Object|null} { content, type: 'html', rawArticle }
   */
  static extract(doc) {
    Logger.log('📘 Executing MarkdownExtractor...');

    // 1. 尋找最佳容器
    const container = this.findContainer(doc);
    if (!container) {
      Logger.warn(
        '⚠️ MarkdownExtractor activated but no valid container found using strict selectors.'
      );
      return null;
    }

    // 2. 克隆並清洗 DOM
    const cleanedContainer = this.cleanDOM(container);

    // 3. 返回結果
    return {
      content: cleanedContainer.innerHTML,
      type: 'html', // 仍然是 HTML，但標記為來自 Markdown 源，DomConverter 可以據此優化
      rawArticle: {
        title: doc.title,
        content: cleanedContainer.innerHTML,
        byline: 'MarkdownExtractor',
      },
    };
  }

  /**
   * 尋找內容容器
   */
  static findContainer(doc) {
    for (const selector of TECHNICAL_CONTENT_SELECTORS) {
      const element = doc.querySelector(selector);
      if (element) {
        Logger.log(`✅ Found Markdown container: ${selector}`);
        return element;
      }
    }
    return null;
  }

  /**
   * 清洗 DOM，移除 UI 元素但保留內容結構
   * @param {Element} element
   * @returns {Element}
   */
  static cleanDOM(element) {
    const clone = element.cloneNode(true);

    // 定義需要移除的雜訊選擇器
    const noiseSelectors = [
      // Copy Buttons & Toolbars
      '.clipboard-button',
      '.copy-button',
      '[data-clipboard-target]',
      'button[aria-label*="Copy"]',
      '.octicon-copy',

      // GitHub specific UI
      '.anchor', // 標題旁邊的錨點鏈接
      '.blob-num', // 代碼行號
      '.blob-code-inner > span.react-code-text', // 有時這只是行號容器

      // GitHub specific code block headers
      // '.code-example header', // 保留 Header 以供 DomConverter 提取標題
      'pre[hidden]', // 移除隱藏的代碼預覽

      // General Ads/Nav within content (通常 markdown body 比較乾淨，但以防萬一)
      '.google-auto-placed',
      '#carbonads',
    ];

    noiseSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // 特殊處理：處理代碼塊頭部
    // GitHub 的代碼塊有時是這樣的結構：
    // <div class="highlight">
    //   <pre>...</pre>
    //   <div class="zeroclipboard-container">...</div>
    // </div>
    // 我們需要確保移除 copy 按鈕容器
    clone.querySelectorAll('.zeroclipboard-container').forEach(el => el.remove());

    // 針對 .code-example header，用戶明確要求過濾掉
    // 因此我們直接移除它
    clone.querySelectorAll('.code-example header').forEach(header => header.remove());

    // 針對 GitHub Copilot instructions 或類似提示框的特殊清洗
    // 如果存在 "MarkdownYour task..." 之類的問題，通常是因為 textContent 連接了 label
    // 嘗試移除語言標籤
    const labelSelectors = ['.language-label', '.lang-label', 'span[data-code-text]'];
    labelSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // 清洗完成
    return clone;
  }
}
