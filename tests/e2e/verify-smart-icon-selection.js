/**
 * 智能 Icon 選擇功能驗證腳本
 *
 * 用途：在瀏覽器控制台中測試智能 Icon 選擇是否正常工作
 *
 * 使用方法：
 * 1. 在 Chrome 中打開測試網站（如 Reddit, GitHub, Dev.to）
 * 2. 打開開發者工具（F12）
 * 3. 將此腳本複製到控制台執行
 * 4. 查看輸出，驗證是否選擇了最佳 icon
 */

(function () {
  console.log('=== 智能 Icon 選擇測試 ===\n');

  // 輔助函數：解析尺寸字符串
  function parseSizeString(sizeStr) {
    if (!sizeStr || !sizeStr.trim()) {
      return 0;
    }

    if (sizeStr.toLowerCase() === 'any') {
      return 999; // SVG
    }

    // eslint-disable-next-line sonarjs/slow-regex
    const match = sizeStr.match(/(\d+)x(\d+)/i);
    if (match) {
      return Number.parseInt(match[1]);
    }

    const numMatch = sizeStr.match(/\d+/);
    if (numMatch) {
      return Number.parseInt(numMatch[0]);
    }

    return 0;
  }

  // 智能選擇函數
  function selectBestIcon(candidates) {
    console.log(`📊 從 ${candidates.length} 個候選中選擇最佳 icon...\n`);

    if (candidates.length === 0) {
      return null;
    }
    if (candidates.length === 1) {
      console.log('✓ 只有一個候選，默認選擇');
      return candidates[0];
    }

    const scored = candidates.map(icon => {
      let score = 0;
      const url = icon.url.toLowerCase();

      // 1. 格式評分
      if (url.endsWith('.svg') || url.includes('image/svg') || icon.type.includes('svg')) {
        score += 1000;
        console.log(`  ${icon.url.slice(0, 50)}...: +1000 (SVG)`);
      } else if (url.endsWith('.png') || icon.type.includes('png')) {
        score += 500;
        console.log(`  ${icon.url.slice(0, 50)}...: +500 (PNG)`);
      } else if (url.endsWith('.ico') || icon.type.includes('ico')) {
        score += 100;
        console.log(`  ${icon.url.slice(0, 50)}...: +100 (ICO)`);
      } else if (url.endsWith('.jpg') || url.endsWith('.jpeg') || icon.type.includes('jpeg')) {
        score += 200;
        console.log(`  ${icon.url.slice(0, 50)}...: +200 (JPEG)`);
      }

      // 2. 尺寸評分
      const size = icon.size || 0;
      if (size === 999) {
        score += 500;
        console.log(`  ${icon.url.slice(0, 50)}...: +500 (any size - SVG)`);
      } else if (size >= 180 && size <= 256) {
        score += 300;
        console.log(`  ${icon.url.slice(0, 50)}...: +300 (ideal: ${size}x${size})`);
      } else if (size > 256) {
        score += 200;
        console.log(`  ${icon.url.slice(0, 50)}...: +200 (large: ${size}x${size})`);
      } else if (size >= 120) {
        score += 100;
        console.log(`  ${icon.url.slice(0, 50)}...: +100 (medium: ${size}x${size})`);
      } else if (size > 0) {
        score += 50;
        console.log(`  ${icon.url.slice(0, 50)}...: +50 (small: ${size}x${size})`);
      }

      // 3. 類型評分
      if (icon.iconType === 'apple-touch') {
        score += 50;
        console.log(`  ${icon.url.slice(0, 50)}...: +50 (apple-touch)`);
      }

      // 4. 優先級評分
      score += (10 - icon.priority) * 10;

      console.log(`  總分: ${score}\n`);
      return { ...icon, score };
    });

    scored.sort((itemA, itemB) => itemB.score - itemA.score);

    const best = scored[0];
    console.log(`✓ 最佳選擇: ${best.url}`);
    console.log(`  分數: ${best.score}`);
    console.log(`  尺寸: ${best.sizes || 'unknown'}`);
    console.log(`  類型: ${best.type || 'unknown'}`);

    if (scored.length > 1) {
      console.log('\n其他候選:');
      scored.slice(1, 4).forEach((icon, idx) => {
        console.log(`  ${idx + 2}. ${icon.url.slice(0, 40)}... (${icon.score}分)`);
      });
      if (scored.length > 4) {
        console.log(`  ... 還有 ${scored.length - 4} 個`);
      }
    }

    return best;
  }

  // 收集當前頁面的所有 icons
  const iconSelectors = [
    {
      selector: 'link[rel="apple-touch-icon"]',
      attr: 'href',
      priority: 1,
      iconType: 'apple-touch',
    },
    {
      selector: 'link[rel="apple-touch-icon-precomposed"]',
      attr: 'href',
      priority: 2,
      iconType: 'apple-touch',
    },
    { selector: 'link[rel="icon"]', attr: 'href', priority: 3, iconType: 'standard' },
    { selector: 'link[rel="shortcut icon"]', attr: 'href', priority: 4, iconType: 'standard' },
  ];

  const candidates = [];

  console.log('🔍 搜索頁面中的 icons...\n');

  for (const { selector, attr, priority, iconType } of iconSelectors) {
    const elements = document.querySelectorAll(selector);
    console.log(`${selector}: 找到 ${elements.length} 個`);

    for (const element of elements) {
      const iconUrl = element.getAttribute(attr);
      if (iconUrl?.trim() && !iconUrl.startsWith('data:')) {
        try {
          const absoluteUrl = new URL(iconUrl, document.baseURI).href;
          const sizes = element.getAttribute('sizes') || '';
          const type = element.getAttribute('type') || '';
          const size = parseSizeString(sizes);

          candidates.push({
            url: absoluteUrl,
            priority,
            size,
            type,
            iconType,
            sizes,
            selector,
          });

          console.log(
            `  ✓ ${absoluteUrl.slice(0, 50)}... (${sizes || 'no size'}, ${type || 'no type'})`
          );
        } catch (error) {
          console.warn(`  ✗ 無法處理: ${iconUrl}`, error);
        }
      }
    }
  }

  console.log(`\n找到 ${candidates.length} 個候選 icons\n`);

  if (candidates.length === 0) {
    console.log('⚠️ 沒有找到任何 icon 聲明');
    console.log(`將回退到: ${new URL('/favicon.ico', document.baseURI).href}`);
  } else {
    console.log('=== 開始智能選擇 ===\n');
    const best = selectBestIcon(candidates);

    if (best) {
      console.log('\n=== 測試結果 ===');
      console.log('✅ 成功！選擇了最佳 icon');
      console.log(`URL: ${best.url}`);
      console.log(`得分: ${best.score}`);

      // 顯示圖片預覽
      console.log('\n預覽圖片：');
      const img = document.createElement('img');
      img.src = best.url;
      img.style.maxWidth = '128px';
      img.style.border = '2px solid #4CAF50';
      img.style.borderRadius = '8px';
      console.log(img);
    }
  }

  console.log('\n=== 測試完成 ===');
})();
