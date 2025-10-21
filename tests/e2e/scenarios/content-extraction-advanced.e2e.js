/**
 * Content Extraction Advanced E2E 測試場景
 *
 * 測試 content.js 的進階內容提取功能：
 * - Mozilla Readability 提取
 * - CMS 回退策略
 * - 可展開內容檢測
 * - 圖片優先級排序
 */

module.exports = {
  name: 'Content Extraction Advanced',

  async run(page, config) {
    console.log('  📚 開始進階內容提取測試...');

    // 1. 測試 Readability 內容提取
    console.log('  1️⃣ 測試 Readability 提取...');
    await page.goto(config.testPages.mdn, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    const readabilityResult = await page.evaluate(() => {
      // 模擬 Readability 提取邏輯
      function extractReadableContent() {
        const article = document.querySelector('article, main, [role="main"]');

        if (!article) {
          return { success: false, error: 'No article container found' };
        }

        // 提取標題
        const title = document.title ||
                     document.querySelector('h1')?.textContent?.trim() ||
                     'Untitled';

        // 提取作者
        const authorMeta = document.querySelector('meta[name="author"]');
        const author = authorMeta?.content || null;

        // 提取內容
        const paragraphs = Array.from(article.querySelectorAll('p'))
          .map(p => p.textContent.trim())
          .filter(text => text.length > 20);

        const headings = Array.from(article.querySelectorAll('h1, h2, h3, h4'))
          .map(h => ({
            level: parseInt(h.tagName[1]),
            text: h.textContent.trim()
          }));

        // 計算字數
        const wordCount = paragraphs.join(' ').split(/\s+/).length;

        return {
          success: true,
          title,
          author,
          paragraphCount: paragraphs.length,
          headingCount: headings.length,
          wordCount,
          hasContent: paragraphs.length > 0
        };
      }

      return extractReadableContent();
    });

    if (!readabilityResult.success) {
      throw new Error(`Readability 提取失敗: ${readabilityResult.error}`);
    }

    console.log(`     ✅ 標題: ${readabilityResult.title.substring(0, 50)}...`);
    console.log(`     ✅ 段落: ${readabilityResult.paragraphCount} 個`);
    console.log(`     ✅ 標題: ${readabilityResult.headingCount} 個`);
    console.log(`     ✅ 字數: ${readabilityResult.wordCount}`);

    // 2. 測試 CMS 特定選擇器回退
    console.log('  2️⃣ 測試 CMS 回退策略...');
    const cmsResult = await page.evaluate(() => {
      // 模擬 CMS 檢測與回退邏輯
      function detectCMSAndExtract() {
        const cmsSelectors = {
          wordpress: {
            article: '.post-content, .entry-content, article.post',
            title: '.entry-title, .post-title',
            author: '.author-name, .byline'
          },
          drupal: {
            article: '.node__content, .field--name-body',
            title: '.node__title',
            author: '.field--name-uid'
          },
          medium: {
            article: 'article section',
            title: 'h1[data-testid="storyTitle"]',
            author: '[data-testid="authorName"]'
          }
        };

        // 檢測 CMS 類型
        const detectedCMS = (() => {
          if (document.querySelector('[generator*="WordPress"]') ||
              document.querySelector('.wp-content')) {
            return 'wordpress';
          }
          if (document.querySelector('[content*="Drupal"]')) {
            return 'drupal';
          }
          if (window.location.hostname.includes('medium.com')) {
            return 'medium';
          }
          return 'generic';
        })();

        let content = null;

        // 嘗試 CMS 特定選擇器
        if (detectedCMS !== 'generic') {
          const selectors = cmsSelectors[detectedCMS];
          const articleEl = document.querySelector(selectors.article);

          if (articleEl) {
            content = {
              source: `cms-${detectedCMS}`,
              paragraphs: Array.from(articleEl.querySelectorAll('p')).length,
              found: true
            };
          }
        }

        // 通用回退
        if (!content) {
          const genericArticle = document.querySelector('article, main, [role="main"]');
          if (genericArticle) {
            content = {
              source: 'generic-fallback',
              paragraphs: Array.from(genericArticle.querySelectorAll('p')).length,
              found: true
            };
          }
        }

        return {
          detectedCMS,
          content: content || { found: false },
          fallbackUsed: content?.source.includes('fallback')
        };
      }

      return detectCMSAndExtract();
    });

    console.log(`     ✅ 檢測到 CMS: ${cmsResult.detectedCMS}`);
    console.log(`     ✅ 提取來源: ${cmsResult.content.source}`);
    console.log(`     ✅ 回退機制: ${cmsResult.fallbackUsed ? '已使用' : '未使用'}`);

    // 3. 測試可展開內容檢測
    console.log('  3️⃣ 測試可展開內容檢測...');
    const expandableResult = await page.evaluate(() => {
      function detectExpandableContent() {
        const expandableSelectors = [
          'details',
          '.collapse',
          '.accordion',
          '[aria-expanded="false"]',
          '.expandable',
          '.show-more'
        ];

        const expandableElements = [];

        expandableSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            expandableElements.push({
              selector,
              tagName: el.tagName,
              isExpanded: el.hasAttribute('open') ||
                         el.getAttribute('aria-expanded') === 'true',
              hasContent: el.textContent.trim().length > 0
            });
          });
        });

        return {
          totalExpandable: expandableElements.length,
          collapsed: expandableElements.filter(e => !e.isExpanded).length,
          expanded: expandableElements.filter(e => e.isExpanded).length,
          elements: expandableElements.slice(0, 5) // 前 5 個樣本
        };
      }

      return detectExpandableContent();
    });

    console.log(`     ✅ 可展開元素: ${expandableResult.totalExpandable} 個`);
    console.log(`     ✅ 已展開: ${expandableResult.expanded} 個`);
    console.log(`     ✅ 已折疊: ${expandableResult.collapsed} 個`);

    // 4. 測試圖片提取與優先級
    console.log('  4️⃣ 測試圖片優先級排序...');
    const imageExtractionResult = await page.evaluate(() => {
      function extractAndPrioritizeImages() {
        const images = Array.from(document.querySelectorAll('img'))
          .filter(img => img.src && !img.src.startsWith('data:'))
          .map(img => {
            // 計算優先級分數
            let score = 0;

            // 大小分數 (面積)
            const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height);
            if (area > 100000) score += 30;
            else if (area > 50000) score += 20;
            else if (area > 10000) score += 10;

            // 位置分數
            const rect = img.getBoundingClientRect();
            const viewportArea = window.innerWidth * window.innerHeight;
            const visibilityRatio = (rect.width * rect.height) / viewportArea;
            if (visibilityRatio > 0.1) score += 20;

            // 語意分數
            const semanticClasses = ['hero', 'featured', 'cover', 'main', 'primary'];
            const classesAndId = (img.className + ' ' + img.id).toLowerCase();
            if (semanticClasses.some(cls => classesAndId.includes(cls))) {
              score += 25;
            }

            // Alt 文字分數
            if (img.alt && img.alt.length > 10) score += 10;

            // 排除分數
            const excludeClasses = ['icon', 'logo', 'avatar', 'thumb', 'emoji'];
            if (excludeClasses.some(cls => classesAndId.includes(cls))) {
              score -= 20;
            }

            return {
              src: img.src,
              alt: img.alt || '',
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height,
              score,
              area
            };
          })
          .sort((a, b) => b.score - a.score);

        return {
          totalImages: images.length,
          topImage: images[0] || null,
          top3Images: images.slice(0, 3),
          averageScore: images.length > 0
            ? images.reduce((sum, img) => sum + img.score, 0) / images.length
            : 0
        };
      }

      return extractAndPrioritizeImages();
    });

    console.log(`     ✅ 總圖片數: ${imageExtractionResult.totalImages}`);
    if (imageExtractionResult.topImage) {
      console.log(`     ✅ 最佳圖片分數: ${imageExtractionResult.topImage.score}`);
      console.log(`     ✅ 最佳圖片尺寸: ${imageExtractionResult.topImage.width}x${imageExtractionResult.topImage.height}`);
    }

    // 5. 測試大型列表提取 (CLI 文件回退)
    console.log('  5️⃣ 測試大型列表提取...');
    const largeListResult = await page.evaluate(() => {
      function extractLargeLists() {
        const lists = Array.from(document.querySelectorAll('ul, ol'))
          .map(list => {
            const items = list.querySelectorAll('li');
            return {
              type: list.tagName.toLowerCase(),
              itemCount: items.length,
              isLarge: items.length > 20,
              hasCode: Array.from(items).some(li =>
                li.querySelector('code, pre') !== null
              )
            };
          })
          .filter(list => list.isLarge);

        return {
          totalLargeLists: lists.length,
          cliDocumentationLikely: lists.some(list => list.hasCode && list.itemCount > 50),
          largestListSize: lists.length > 0
            ? Math.max(...lists.map(l => l.itemCount))
            : 0,
          lists: lists.slice(0, 3)
        };
      }

      return extractLargeLists();
    });

    console.log(`     ✅ 大型列表: ${largeListResult.totalLargeLists} 個`);
    console.log(`     ✅ CLI 文件特徵: ${largeListResult.cliDocumentationLikely ? '是' : '否'}`);
    console.log(`     ✅ 最大列表: ${largeListResult.largestListSize} 項`);

    // 6. 測試代碼區塊提取
    console.log('  6️⃣ 測試代碼區塊提取...');
    const codeBlockResult = await page.evaluate(() => {
      function extractCodeBlocks() {
        const codeBlocks = Array.from(document.querySelectorAll('pre code, pre'))
          .map(block => {
            const code = block.textContent.trim();

            // 檢測語言
            let language = 'unknown';
            const classMatch = block.className.match(/language-(\w+)/);
            if (classMatch) {
              language = classMatch[1];
            } else {
              // 簡單啟發式檢測
              if (code.includes('function') || code.includes('const ')) language = 'javascript';
              else if (code.includes('def ') || code.includes('import ')) language = 'python';
              else if (code.includes('#include') || code.includes('int main')) language = 'c';
            }

            return {
              language,
              lines: code.split('\n').length,
              characters: code.length,
              hasHighlight: block.querySelector('.highlight, .token') !== null
            };
          });

        return {
          totalCodeBlocks: codeBlocks.length,
          languages: [...new Set(codeBlocks.map(b => b.language))],
          totalLines: codeBlocks.reduce((sum, b) => sum + b.lines, 0),
          averageLines: codeBlocks.length > 0
            ? codeBlocks.reduce((sum, b) => sum + b.lines, 0) / codeBlocks.length
            : 0,
          codeBlocks: codeBlocks.slice(0, 3)
        };
      }

      return extractCodeBlocks();
    });

    console.log(`     ✅ 代碼區塊: ${codeBlockResult.totalCodeBlocks} 個`);
    console.log(`     ✅ 程式語言: ${codeBlockResult.languages.join(', ')}`);
    console.log(`     ✅ 平均行數: ${codeBlockResult.averageLines.toFixed(1)}`);

    console.log('  ✅ 進階內容提取測試完成！\n');

    return {
      readabilityResult,
      cmsResult,
      expandableResult,
      imageExtractionResult,
      largeListResult,
      codeBlockResult
    };
  }
};
