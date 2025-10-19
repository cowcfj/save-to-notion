/**
 * Highlighter E2E 測試場景
 *
 * 測試高亮功能在真實瀏覽器環境中的表現
 */

module.exports = {
  name: 'Highlighter Workflow',

  async run(page, config) {
    console.log('  📝 開始高亮功能測試...');

    // 1. 導航到測試頁面
    console.log('  1️⃣ 導航到 MDN JavaScript Guide...');
    await page.goto(config.testPages.mdn, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // 2. 等待頁面內容加載
    console.log('  2️⃣ 等待文章內容加載...');
    await page.waitForSelector('article', { timeout: 10000 });

    // 3. 檢查頁面結構
    console.log('  3️⃣ 驗證頁面結構...');
    const pageStructure = await page.evaluate(() => {
      const article = document.querySelector('article');
      const paragraphs = article?.querySelectorAll('p');

      return {
        hasArticle: !!article,
        paragraphCount: paragraphs?.length || 0,
        title: document.title
      };
    });

    if (!pageStructure.hasArticle) {
      throw new Error('頁面結構不正確：找不到 article 元素');
    }

    console.log(`     ✅ 找到 ${pageStructure.paragraphCount} 個段落`);

    // 4. 測試文本選擇
    console.log('  4️⃣ 測試文本選擇...');
    const selectionResult = await page.evaluate(() => {
      const p = document.querySelector('article p');
      if (!p || !p.firstChild) {
        return { success: false, error: 'No paragraph found' };
      }

      try {
        const range = document.createRange();
        const textNode = p.firstChild;
        const textLength = Math.min(textNode.textContent.length, 50);

        range.setStart(textNode, 0);
        range.setEnd(textNode, textLength);

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        return {
          success: true,
          text: selection.toString(),
          rangeCount: selection.rangeCount
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    if (!selectionResult.success) {
      throw new Error(`文本選擇失敗: ${selectionResult.error}`);
    }

    console.log(`     ✅ 成功選擇文本: "${selectionResult.text.substring(0, 30)}..."`);

    // 5. 檢測 CSS Highlight API 支持
    console.log('  5️⃣ 檢測 CSS Highlight API 支持...');
    const apiSupport = await page.evaluate(() => {
      return {
        hasHighlight: typeof window.Highlight !== 'undefined',
        hasCSSHighlights: typeof CSS !== 'undefined' && typeof CSS.highlights !== 'undefined'
      };
    });

    console.log(`     ${apiSupport.hasHighlight ? '✅' : '❌'} window.Highlight API`);
    console.log(`     ${apiSupport.hasCSSHighlights ? '✅' : '❌'} CSS.highlights registry`);

    // 6. 測試高亮創建（如果 API 可用）
    if (apiSupport.hasHighlight && apiSupport.hasCSSHighlights) {
      console.log('  6️⃣ 測試創建 CSS Highlight...');

      const highlightResult = await page.evaluate(() => {
        try {
          // 獲取當前選擇
          const selection = window.getSelection();
          if (selection.rangeCount === 0) {
            return { success: false, error: 'No selection' };
          }

          const range = selection.getRangeAt(0);

          // 創建 Highlight
          const highlight = new Highlight(range);
          CSS.highlights.set('test-highlight', highlight);

          return {
            success: true,
            highlightCount: CSS.highlights.size,
            text: range.toString()
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      });

      if (!highlightResult.success) {
        console.warn(`     ⚠️ 高亮創建失敗: ${highlightResult.error}`);
      } else {
        console.log(`     ✅ 成功創建高亮，當前共有 ${highlightResult.highlightCount} 個高亮`);
      }
    }

    // 7. 測試 localStorage 持久化（模擬 chrome.storage）
    console.log('  7️⃣ 測試高亮數據持久化...');
    const persistenceResult = await page.evaluate(() => {
      try {
        const highlightData = {
          id: 'test-highlight-1',
          text: 'Sample highlight text',
          color: 'yellow',
          timestamp: Date.now()
        };

        const storageKey = 'highlights_' + window.location.href;
        localStorage.setItem(storageKey, JSON.stringify([highlightData]));

        // 驗證保存
        const saved = localStorage.getItem(storageKey);
        const parsed = JSON.parse(saved);

        return {
          success: true,
          count: parsed.length,
          data: parsed[0]
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    if (!persistenceResult.success) {
      throw new Error(`持久化失敗: ${persistenceResult.error}`);
    }

    console.log(`     ✅ 成功保存 ${persistenceResult.count} 個高亮到 localStorage`);

    // 8. 測試刷新後恢復
    console.log('  8️⃣ 測試頁面刷新後恢復...');
    await page.reload({ waitUntil: 'networkidle2' });

    const restoreResult = await page.evaluate(() => {
      try {
        const storageKey = 'highlights_' + window.location.href;
        const saved = localStorage.getItem(storageKey);
        const highlights = JSON.parse(saved);

        return {
          success: true,
          count: highlights.length,
          restored: highlights
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    if (!restoreResult.success) {
      throw new Error(`恢復失敗: ${restoreResult.error}`);
    }

    console.log(`     ✅ 成功恢復 ${restoreResult.count} 個高亮`);

    // 9. 清理測試數據
    await page.evaluate(() => {
      const storageKey = 'highlights_' + window.location.href;
      localStorage.removeItem(storageKey);

      // 清除所有 CSS highlights
      if (CSS?.highlights) {
        CSS.highlights.clear();
      }
    });

    console.log('  ✅ 高亮功能測試完成！\n');

    return {
      pageStructure,
      selectionResult,
      apiSupport,
      persistenceResult,
      restoreResult
    };
  }
};
