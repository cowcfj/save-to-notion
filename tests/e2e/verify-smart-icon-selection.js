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
  const SVG_ANY_SIZE = 999;

  const ICON_SELECTORS = [
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

  const FORMAT_SCORE_RULES = [
    {
      score: 1000,
      label: 'SVG',
      urlSuffixes: ['.svg'],
      urlFragments: ['image/svg'],
      typeFragments: ['svg'],
    },
    {
      score: 500,
      label: 'PNG',
      urlSuffixes: ['.png'],
      urlFragments: [],
      typeFragments: ['png'],
    },
    {
      score: 100,
      label: 'ICO',
      urlSuffixes: ['.ico'],
      urlFragments: [],
      typeFragments: ['ico'],
    },
    {
      score: 200,
      label: 'JPEG',
      urlSuffixes: ['.jpg', '.jpeg'],
      urlFragments: [],
      typeFragments: ['jpeg'],
    },
  ];

  const SIZE_SCORE_RULES = [
    {
      score: 500,
      matches: size => size === SVG_ANY_SIZE,
      label: () => 'any size - SVG',
    },
    {
      score: 300,
      matches: size => [size >= 180, size <= 256].every(Boolean),
      label: size => `ideal: ${size}x${size}`,
    },
    {
      score: 200,
      matches: size => size > 256,
      label: size => `large: ${size}x${size}`,
    },
    {
      score: 100,
      matches: size => size >= 120,
      label: size => `medium: ${size}x${size}`,
    },
    {
      score: 50,
      matches: size => size > 0,
      label: size => `small: ${size}x${size}`,
    },
  ];

  console.log('=== 智能 Icon 選擇測試 ===\n');
  runIconSelectionTest();

  function runIconSelectionTest() {
    const candidates = collectIconCandidates();

    console.log(`\n找到 ${candidates.length} 個候選 icons\n`);

    if (candidates.length === 0) {
      logMissingIconFallback();
      return;
    }

    console.log('=== 開始智能選擇 ===\n');
    const best = selectBestIcon(candidates);

    if (best) {
      logSuccessfulSelection(best);
    }

    console.log('\n=== 測試完成 ===');
  }

  function logMissingIconFallback() {
    console.log('⚠️ 沒有找到任何 icon 聲明');
    console.log(`將回退到: ${new URL('/favicon.ico', document.baseURI).href}`);
    console.log('\n=== 測試完成 ===');
  }

  function logSuccessfulSelection(best) {
    console.log('\n=== 測試結果 ===');
    console.log('✅ 成功！選擇了最佳 icon');
    console.log(`URL: ${best.url}`);
    console.log(`得分: ${best.score}`);

    console.log('\n預覽圖片：');
    const img = document.createElement('img');
    img.src = best.url;
    img.style.maxWidth = '128px';
    img.style.border = '2px solid #4CAF50';
    img.style.borderRadius = '8px';
    console.log(img);
  }

  function collectIconCandidates() {
    const candidates = [];

    console.log('🔍 搜索頁面中的 icons...\n');

    for (const selectorConfig of ICON_SELECTORS) {
      collectCandidatesForSelector(candidates, selectorConfig);
    }

    return candidates;
  }

  function collectCandidatesForSelector(candidates, selectorConfig) {
    const elements = document.querySelectorAll(selectorConfig.selector);
    console.log(`${selectorConfig.selector}: 找到 ${elements.length} 個`);

    for (const element of elements) {
      addIconCandidate(candidates, selectorConfig, element);
    }
  }

  function addIconCandidate(candidates, selectorConfig, element) {
    const iconUrl = element.getAttribute(selectorConfig.attr);
    if (!hasUsableIconUrl(iconUrl)) {
      return;
    }

    try {
      const candidate = createIconCandidate(selectorConfig, element, iconUrl);
      candidates.push(candidate);
      console.log(
        `  ✓ ${candidate.url.slice(0, 50)}... (${candidate.sizes || 'no size'}, ${
          candidate.type || 'no type'
        })`
      );
    } catch (error) {
      console.warn(`  ✗ 無法處理: ${iconUrl}`, error);
    }
  }

  function hasUsableIconUrl(iconUrl) {
    const trimmedUrl = iconUrl?.trim();
    if (!trimmedUrl) {
      return false;
    }

    return !iconUrl.startsWith('data:');
  }

  function createIconCandidate(selectorConfig, element, iconUrl) {
    const absoluteUrl = new URL(iconUrl, document.baseURI).href;
    const sizes = element.getAttribute('sizes') || '';
    const type = element.getAttribute('type') || '';

    return {
      url: absoluteUrl,
      priority: selectorConfig.priority,
      size: parseSizeString(sizes),
      type,
      iconType: selectorConfig.iconType,
      sizes,
      selector: selectorConfig.selector,
    };
  }

  function parseSizeString(sizeStr) {
    const normalizedSize = sizeStr?.trim().toLowerCase();
    if (!normalizedSize) {
      return 0;
    }

    if (normalizedSize === 'any') {
      return SVG_ANY_SIZE;
    }

    const explicitSize = parseExplicitSize(normalizedSize);
    if (explicitSize !== null) {
      return explicitSize;
    }

    return parseFirstSizeNumber(normalizedSize);
  }

  function parseExplicitSize(sizeStr) {
    const sizeParts = sizeStr.split('x');
    if (sizeParts.length !== 2) {
      return null;
    }

    if (sizeParts.some(part => !isFiniteSizePart(part))) {
      return null;
    }

    return Number.parseInt(sizeParts[0], 10);
  }

  function isFiniteSizePart(part) {
    if (!part) {
      return false;
    }

    return Number.isFinite(Number(part));
  }

  function parseFirstSizeNumber(sizeStr) {
    const numMatch = sizeStr.match(/\d+/);
    if (numMatch) {
      return Number.parseInt(numMatch[0], 10);
    }

    return 0;
  }

  function selectBestIcon(candidates) {
    console.log(`📊 從 ${candidates.length} 個候選中選擇最佳 icon...\n`);

    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      console.log('✓ 只有一個候選，默認選擇');
      return candidates[0];
    }

    const scored = scoreIconCandidates(candidates);
    const best = scored[0];
    logBestIcon(best);
    logOtherCandidates(scored);

    return best;
  }

  function scoreIconCandidates(candidates) {
    const scored = candidates.map(icon => ({ ...icon, score: scoreIcon(icon) }));
    scored.sort((itemA, itemB) => itemB.score - itemA.score);
    return scored;
  }

  function scoreIcon(icon) {
    const score =
      scoreIconFormat(icon) + scoreIconSize(icon) + scoreIconType(icon) + scoreIconPriority(icon);

    console.log(`  總分: ${score}\n`);
    return score;
  }

  function scoreIconFormat(icon) {
    const iconContext = {
      url: icon.url.toLowerCase(),
      type: icon.type,
    };
    const matchingRule = FORMAT_SCORE_RULES.find(rule => matchesIconFormatRule(rule, iconContext));

    if (!matchingRule) {
      return 0;
    }

    logIconScore(icon.url, matchingRule.score, matchingRule.label);
    return matchingRule.score;
  }

  function matchesIconFormatRule(rule, iconContext) {
    const matchResults = [
      includesAnySuffix(iconContext.url, rule.urlSuffixes),
      includesAnyFragment(iconContext.url, rule.urlFragments),
      includesAnyFragment(iconContext.type, rule.typeFragments),
    ];

    return matchResults.some(Boolean);
  }

  function includesAnySuffix(value, suffixes) {
    return suffixes.some(suffix => value.endsWith(suffix));
  }

  function includesAnyFragment(value, fragments) {
    return fragments.some(fragment => value.includes(fragment));
  }

  function scoreIconSize(icon) {
    const matchingRule = SIZE_SCORE_RULES.find(rule => rule.matches(icon.size || 0));
    if (!matchingRule) {
      return 0;
    }

    logIconScore(icon.url, matchingRule.score, matchingRule.label(icon.size));
    return matchingRule.score;
  }

  function scoreIconType(icon) {
    if (icon.iconType !== 'apple-touch') {
      return 0;
    }

    logIconScore(icon.url, 50, 'apple-touch');
    return 50;
  }

  function scoreIconPriority(icon) {
    return (10 - icon.priority) * 10;
  }

  function logIconScore(url, score, label) {
    console.log(`  ${url.slice(0, 50)}...: +${score} (${label})`);
  }

  function logBestIcon(best) {
    console.log(`✓ 最佳選擇: ${best.url}`);
    console.log(`  分數: ${best.score}`);
    console.log(`  尺寸: ${best.sizes || 'unknown'}`);
    console.log(`  類型: ${best.type || 'unknown'}`);
  }

  function logOtherCandidates(scored) {
    if (scored.length <= 1) {
      return;
    }

    console.log('\n其他候選:');
    scored.slice(1, 4).forEach((icon, idx) => {
      console.log(`  ${idx + 2}. ${icon.url.slice(0, 40)}... (${icon.score}分)`);
    });
    logRemainingCandidateCount(scored);
  }

  function logRemainingCandidateCount(scored) {
    if (scored.length <= 4) {
      return;
    }

    console.log(`  ... 還有 ${scored.length - 4} 個`);
  }
})();
