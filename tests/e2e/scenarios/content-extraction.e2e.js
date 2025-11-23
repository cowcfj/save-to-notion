/**
 * Content Extraction E2E 測試場景
 *
 * 測試內容提取功能在真實網頁上的表現
 */

module.exports = {
  name: 'Content Extraction',

  async run(page, config) {
    console.log('  📄 開始內容提取測試...');

    // 1. 導航到測試頁面
    console.log('  1️⃣ 導航到測試頁面...');
    await page.goto(config.testPages.mdn, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // 2. 測試基礎內容提取
    console.log('  2️⃣ 提取頁面基礎內容...');
    const basicContent = await page.evaluate(() => {
      const title = document.title;
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .map(p => p.textContent.trim())
        .filter(text => text.length > 0);

      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .map(h => ({
          level: parseInt(h.tagName[1]),
          text: h.textContent.trim()
        }));

      return {
        title,
        paragraphCount: paragraphs.length,
        headingCount: headings.length,
        firstParagraph: paragraphs[0]?.substring(0, 100),
        headings: headings.slice(0, 5)
      };
    });

    console.log(`     ✅ 標題: ${basicContent.title}`);
    console.log(`     ✅ 找到 ${basicContent.paragraphCount} 個段落`);
    console.log(`     ✅ 找到 ${basicContent.headingCount} 個標題`);

    // 3. 測試圖片提取
    console.log('  3️⃣ 提取頁面圖片...');
    const imageData = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'))
        .map(img => ({
          src: img.src,
          alt: img.alt,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          isVisible: img.offsetParent !== null
        }))
        .filter(img => img.src && !img.src.includes('data:image'));

      return {
        totalImages: images.length,
        visibleImages: images.filter(img => img.isVisible).length,
        images: images.slice(0, 3)
      };
    });

    console.log(`     ✅ 找到 ${imageData.totalImages} 張圖片`);
    console.log(`     ✅ 其中 ${imageData.visibleImages} 張可見`);

    // 4. 測試列表提取
    console.log('  4️⃣ 提取列表內容...');
    const listData = await page.evaluate(() => {
      const lists = Array.from(document.querySelectorAll('ul, ol'))
        .map(list => ({
          type: list.tagName.toLowerCase(),
          itemCount: list.querySelectorAll('li').length,
          items: Array.from(list.querySelectorAll('li'))
            .slice(0, 3)
            .map(li => li.textContent.trim())
        }));

      return {
        totalLists: lists.length,
        lists: lists.slice(0, 3)
      };
    });

    console.log(`     ✅ 找到 ${listData.totalLists} 個列表`);

    // 5. 測試代碼區塊提取
    console.log('  5️⃣ 提取代碼區塊...');
    const codeData = await page.evaluate(() => {
      const codeBlocks = Array.from(document.querySelectorAll('pre code, pre'))
        .map(block => {
          const code = block.textContent.trim();
          return {
            language: block.className.match(/language-(\w+)/)?.[1] || 'unknown',
            lines: code.split('\n').length,
            preview: code.substring(0, 100)
          };
        });

      return {
        totalCodeBlocks: codeBlocks.length,
        codeBlocks: codeBlocks.slice(0, 3)
      };
    });

    console.log(`     ✅ 找到 ${codeData.totalCodeBlocks} 個代碼區塊`);

    // 6. 測試結構化內容提取
    console.log('  6️⃣ 提取結構化內容...');
    const structuredContent = await page.evaluate(() => {
      // 模擬 Notion 區塊結構
      const blocks = [];

      // 標題區塊
      document.querySelectorAll('h1, h2, h3').forEach(heading => {
        blocks.push({
          type: `heading_${heading.tagName[1]}`,
          content: heading.textContent.trim()
        });
      });

      // 段落區塊
      document.querySelectorAll('article p, main p').forEach((p, index) => {
        if (index < 5) { // 限制數量
          blocks.push({
            type: 'paragraph',
            content: p.textContent.trim()
          });
        }
      });

      // 列表區塊
      document.querySelectorAll('ul, ol').forEach((list, index) => {
        if (index < 3) {
          const items = Array.from(list.querySelectorAll('li'))
            .map(li => li.textContent.trim());
          blocks.push({
            type: list.tagName === 'UL' ? 'bulleted_list' : 'numbered_list',
            items
          });
        }
      });

      return {
        totalBlocks: blocks.length,
        blockTypes: [...new Set(blocks.map(b => b.type))],
        blocks: blocks.slice(0, 10)
      };
    });

    console.log(`     ✅ 生成 ${structuredContent.totalBlocks} 個結構化區塊`);
    console.log(`     ✅ 區塊類型: ${structuredContent.blockTypes.join(', ')}`);

    // 7. 測試 Meta 數據提取
    console.log('  7️⃣ 提取 Meta 數據...');
    const metaData = await page.evaluate(() => {
      const getMeta = (name) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta?.content || null;
      };

      return {
        title: document.title,
        description: getMeta('description') || getMeta('og:description'),
        image: getMeta('og:image') || getMeta('twitter:image'),
        author: getMeta('author'),
        url: window.location.href,
        favicon: document.querySelector('link[rel*="icon"]')?.href
      };
    });

    console.log(`     ✅ 描述: ${metaData.description?.substring(0, 50)}...`);
    console.log(`     ✅ 封面圖: ${metaData.image ? '已找到' : '未找到'}`);
    console.log(`     ✅ Favicon: ${metaData.favicon ? '已找到' : '未找到'}`);

    console.log('  ✅ 內容提取測試完成！\n');

    return {
      basicContent,
      imageData,
      listData,
      codeData,
      structuredContent,
      metaData
    };
  }
};
