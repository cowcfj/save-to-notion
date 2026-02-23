/**
 * Chrome DevTools MCP E2E 測試示例
 *
 * 這個文件展示如何使用 MCP 工具進行 E2E 測試
 * 需要在 Claude Code 環境中運行
 */
/* eslint-disable unicorn/prefer-top-level-await */

/**
 * 測試 1: 高亮功能基礎測試
 *
 * 測試步驟：
 * 1. 打開測試頁面
 * 2. 等待頁面加載
 * 3. 注入高亮器腳本
 * 4. 創建高亮
 * 5. 驗證高亮存在
 */
function testBasicHighlighting() {
  console.log('📝 開始測試: 基礎高亮功能');

  const testUrl = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide';

  // 這些是使用 MCP 工具的步驟
  const steps = {
    step1: {
      tool: 'mcp__chrome-devtools__new_page',
      description: '創建新頁面標籤',
    },

    step2: {
      tool: 'mcp__chrome-devtools__navigate_page',
      params: { url: testUrl },
      description: '導航到測試頁面',
    },

    step3: {
      tool: 'mcp__chrome-devtools__wait_for',
      params: {
        selector: 'article',
        timeout: 5000,
      },
      description: '等待文章內容加載',
    },

    step4: {
      tool: 'mcp__chrome-devtools__evaluate_script',
      params: {
        script: `
                    // 檢查頁面是否有可標註的內容
                    const article = document.querySelector('article');
                    const paragraphs = article?.querySelectorAll('p');
                    return {
                        hasArticle: !!article,
                        paragraphCount: paragraphs?.length || 0,
                        firstParagraphText: paragraphs?.[0]?.textContent?.substring(0, 50)
                    };
                `,
      },
      description: '檢查頁面內容',
    },

    step5: {
      tool: 'mcp__chrome-devtools__evaluate_script',
      params: {
        script: `
                    // 模擬創建高亮
                    const p = document.querySelector('article p');
                    if (!p) return { success: false, error: 'No paragraph found' };

                    // 創建選擇
                    const range = document.createRange();
                    range.setStart(p.firstChild, 0);
                    range.setEnd(p.firstChild, 20);

                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);

                    return {
                        success: true,
                        selectedText: selection.toString(),
                        rangeCount: selection.rangeCount
                    };
                `,
      },
      description: '選擇文本',
    },

    step6: {
      tool: 'mcp__chrome-devtools__take_screenshot',
      params: {
        path: 'tests/e2e/screenshots/highlight-test.png',
        fullPage: false,
      },
      description: '截圖保存當前狀態',
    },
  };

  return {
    testName: 'Basic Highlighting',
    url: testUrl,
    steps,
    expectedResult: '應該成功選擇文本並準備創建高亮',
  };
}

/**
 * 測試 2: 高亮持久化測試
 */
function testHighlightPersistence() {
  console.log('💾 開始測試: 高亮持久化');

  const steps = {
    step1: {
      tool: 'mcp__chrome-devtools__evaluate_script',
      params: {
        script: `
                    // 模擬保存高亮到 storage
                    const highlights = [
                        {
                            id: 'test-highlight-1',
                            text: 'Test highlight text',
                            color: 'yellow',
                            timestamp: Date.now()
                        }
                    ];

                    return new Promise((resolve) => {
                        const key = 'highlights_' + window.location.href;
                        const data = {};
                        data[key] = highlights;
                        chrome.storage.local.set(
                            data,
                            () => resolve({ success: true, count: highlights.length })
                        );
                    });
                `,
      },
      description: '保存高亮到 Chrome Storage',
    },

    step2: {
      tool: 'mcp__chrome-devtools__navigate_page_history',
      params: { delta: 0 }, // 刷新頁面
      description: '刷新頁面',
    },

    step3: {
      tool: 'mcp__chrome-devtools__wait_for',
      params: {
        selector: 'article',
        timeout: 5000,
      },
      description: '等待頁面重新加載',
    },

    step4: {
      tool: 'mcp__chrome-devtools__evaluate_script',
      params: {
        script: `
                    // 從 storage 讀取高亮
                    return new Promise((resolve) => {
                        const key = 'highlights_' + window.location.href;
                        chrome.storage.local.get([key], (result) => {
                            resolve({
                                hasHighlights: !!result[key],
                                highlightCount: result[key]?.length || 0,
                                highlights: result[key]
                            });
                        });
                    });
                `,
      },
      description: '驗證高亮從 storage 恢復',
    },
  };

  return {
    testName: 'Highlight Persistence',
    steps,
    expectedResult: '刷新後應該從 storage 恢復高亮數據',
  };
}

/**
 * 測試 3: 內容提取測試
 */
function testContentExtraction() {
  console.log('📄 開始測試: 內容提取');

  const steps = {
    step1: {
      tool: 'mcp__chrome-devtools__navigate_page',
      params: { url: 'https://www.example.com' },
      description: '導航到簡單測試頁面',
    },

    step2: {
      tool: 'mcp__chrome-devtools__evaluate_script',
      params: {
        script: `
                    // 模擬內容提取
                    const title = document.title;
                    const paragraphs = Array.from(document.querySelectorAll('p'))
                        .map(p => p.textContent);
                    const images = Array.from(document.querySelectorAll('img'))
                        .map(img => ({
                            src: img.src,
                            alt: img.alt,
                            width: img.width,
                            height: img.height
                        }));

                    return {
                        title,
                        paragraphCount: paragraphs.length,
                        imageCount: images.length,
                        paragraphs: paragraphs.slice(0, 3),
                        images: images.slice(0, 3)
                    };
                `,
      },
      description: '提取頁面內容',
    },

    step3: {
      tool: 'mcp__chrome-devtools__evaluate_script',
      params: {
        script: `
                    // 驗證提取的內容格式
                    const hasTitle = document.title.length > 0;
                    const hasContent = document.body.textContent.length > 100;

                    return {
                        validStructure: hasTitle && hasContent,
                        titleLength: document.title.length,
                        contentLength: document.body.textContent.length
                    };
                `,
      },
      description: '驗證內容結構',
    },
  };

  return {
    testName: 'Content Extraction',
    steps,
    expectedResult: '應該成功提取頁面標題、段落和圖片',
  };
}

/**
 * 測試 4: 多顏色高亮測試
 */
function testMultiColorHighlights() {
  console.log('🎨 開始測試: 多顏色高亮');

  const colors = ['yellow', 'green', 'blue', 'red', 'purple'];

  const steps = {
    step1: {
      tool: 'mcp__chrome-devtools__evaluate_script',
      params: {
        script: `
                    // 創建多個不同顏色的高亮
                    const colors = ${JSON.stringify(colors)};
                    const highlights = colors.map((color, index) => ({
                        id: 'highlight-' + index,
                        text: 'Sample text ' + index,
                        color,
                        timestamp: Date.now() + index
                    }));

                    return new Promise((resolve) => {
                        chrome.storage.local.set(
                            { 'highlights_test': highlights },
                            () => resolve({
                                success: true,
                                colors: highlights.map(h => h.color)
                            })
                        );
                    });
                `,
      },
      description: '創建 5 種顏色的高亮',
    },

    step2: {
      tool: 'mcp__chrome-devtools__evaluate_script',
      params: {
        script: `
                    // 驗證所有顏色都被保存
                    return new Promise((resolve) => {
                        chrome.storage.local.get(['highlights_test'], (result) => {
                            const highlights = result.highlights_test || [];
                            const colorSet = new Set(highlights.map(h => h.color));

                            resolve({
                                totalHighlights: highlights.length,
                                uniqueColors: colorSet.size,
                                colors: Array.from(colorSet),
                                allColorsPresent: colorSet.size === 5
                            });
                        });
                    });
                `,
      },
      description: '驗證所有顏色保存成功',
    },
  };

  return {
    testName: 'Multi-Color Highlights',
    steps,
    colors,
    expectedResult: '應該成功創建並保存 5 種不同顏色的高亮',
  };
}

/**
 * 導出測試套件
 */
module.exports = {
  tests: [
    { name: 'Basic Highlighting', fn: testBasicHighlighting },
    { name: 'Highlight Persistence', fn: testHighlightPersistence },
    { name: 'Content Extraction', fn: testContentExtraction },
    { name: 'Multi-Color Highlights', fn: testMultiColorHighlights },
  ],

  // 測試執行器
  async runAllTests() {
    console.log('🧪 Chrome DevTools MCP E2E 測試套件');
    console.log('====================================\n');

    const results = [];

    for (const test of this.tests) {
      console.log(`\n▶️ 運行測試: ${test.name}`);
      try {
        const result = await Promise.resolve(test.fn());
        console.log(`✅ ${test.name} - 測試計劃準備完成`);
        console.log(`   預期結果: ${result.expectedResult}`);
        results.push({ ...result, status: 'ready' });
      } catch (error) {
        console.log(`❌ ${test.name} - 錯誤: ${error.message}`);
        results.push({
          testName: test.name,
          status: 'error',
          error: error.message,
        });
      }
    }

    console.log('\n====================================');
    console.log('📊 測試總結:');
    console.log(`   總測試數: ${results.length}`);
    console.log(`   準備就緒: ${results.filter(result => result.status === 'ready').length}`);
    console.log(`   錯誤: ${results.filter(result => result.status === 'error').length}`);

    return results;
  },
};

// 如果直接運行
if (require.main === module) {
  const suite = module.exports;
  suite
    .runAllTests()
    .then(() => {
      console.log('\n✅ 測試套件執行完成');
      console.log('\n💡 提示: 這些是測試計劃，需要在 Claude Code 中使用 MCP 工具實際執行');
      process.exitCode = 0;
    })
    .catch(error => {
      console.error('\n❌ 測試套件失敗:', error);
      process.exitCode = 1;
    });
}
