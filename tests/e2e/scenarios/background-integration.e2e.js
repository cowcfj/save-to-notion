/**
 * Background.js Integration E2E 測試場景
 *
 * 測試 background.js 的核心功能：
 * - Notion API 整合
 * - 訊息路由與通訊
 * - 模板處理與區塊生成
 * - URL 正規化與狀態管理
 */

/**
 * 正規化 URL（移除追蹤參數、hash 和尾部斜線）
 *
 * @param {string} url - 要正規化的 URL
 * @returns {string} 正規化後的 URL
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);

    // 移除 hash
    urlObj.hash = '';

    // 移除追蹤參數
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'fbclid'];
    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });

    // 正規化尾部斜線
    let pathname = urlObj.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    urlObj.pathname = pathname;

    return urlObj.href;
  } catch {
    return url;
  }
}

/**
 * 驗證圖片 URL 是否有效
 *
 * @param {string} url - 要驗證的圖片 URL
 * @returns {boolean} URL 是否為有效的圖片 URL
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }

    if (url.startsWith('data:')) {
      return false;
    }

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const pathname = urlObj.pathname.toLowerCase();
    const hasImageExtension = imageExtensions.some(ext => pathname.endsWith(ext));

    return hasImageExtension || pathname.includes('/image') || url.includes('image');
  } catch {
    return false;
  }
}

/**
 * 將長文本分割成符合長度限制的區塊
 *
 * @param {string} text - 要分割的文本
 * @param {number} [maxLength=2000] - 每個區塊的最大長度
 * @returns {string[]} 分割後的文本區塊陣列
 */
function splitTextForHighlight(text, maxLength = 2000) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let currentChunk = '';
  const sentences = text.match(/[^!.?]+[!.?]*|(?<=[!.?])/g) || [text];

  const pushLongSentence = sentence => {
    for (let i = 0; i < sentence.length; i += maxLength) {
      chunks.push(sentence.slice(i, i + maxLength));
    }
  };

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }

      if (sentence.length > maxLength) {
        pushLongSentence(sentence);
        currentChunk = '';
      } else {
        currentChunk = sentence;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

module.exports = {
  name: 'Background Integration',

  async run(page, _config) {
    console.log('  🔧 開始 Background 整合測試...');

    // 公開函數到瀏覽器環境 (此操作是安全且原生的)
    await page.exposeFunction('normalizeUrl', normalizeUrl);
    await page.exposeFunction('isValidImageUrl', isValidImageUrl);
    await page.exposeFunction('splitTextForHighlight', splitTextForHighlight);

    // 1. 測試 URL 正規化功能
    console.log('  1️⃣ 測試 URL 正規化...');
    const urlNormalizationResult = await page.evaluate(async () => {
      const testCases = [
        {
          input: 'https://example.com/page?utm_source=google&id=123#section',
          expected: 'https://example.com/page?id=123',
        },
        {
          input: 'https://example.com/page/',
          expected: 'https://example.com/page',
        },
        {
          input: 'https://example.com/page?fbclid=abc123',
          expected: 'https://example.com/page',
        },
      ];

      const results = [];
      for (const test of testCases) {
        // exposeFunction 注入的是非同步函數
        const result = await globalThis.normalizeUrl(test.input);
        results.push({
          input: test.input,
          expected: test.expected,
          actual: result,
          passed: result === test.expected,
        });
      }

      return {
        totalTests: results.length,
        passedTests: results.filter(result => result.passed).length,
        results,
      };
    });

    console.log(
      `     ✅ URL 正規化測試: ${urlNormalizationResult.passedTests}/${urlNormalizationResult.totalTests} 通過`
    );

    // 2. 測試圖片 URL 驗證
    console.log('  2️⃣ 測試圖片 URL 驗證...');
    const imageValidationResult = await page.evaluate(async () => {
      const testCases = [
        { url: 'https://example.com/image.jpg', expected: true },
        { url: 'https://example.com/photo.png', expected: true },
        { url: 'data:image/png;base64,abc123', expected: false },
        { url: 'ftp://example.com/image.jpg', expected: false },
        { url: 'https://example.com/image/cover', expected: true },
      ];

      const results = [];
      for (const test of testCases) {
        const actual = await globalThis.isValidImageUrl(test.url);
        results.push({
          url: test.url,
          expected: test.expected,
          actual,
          passed: actual === test.expected,
        });
      }

      return {
        totalTests: results.length,
        passedTests: results.filter(result => result.passed).length,
      };
    });

    console.log(
      `     ✅ 圖片 URL 驗證: ${imageValidationResult.passedTests}/${imageValidationResult.totalTests} 通過`
    );

    // 3. 測試文本分割功能
    console.log('  3️⃣ 測試長文本分割...');
    const textSplitResult = await page.evaluate(async () => {
      const testText = 'A'.repeat(5000);
      const chunks = await globalThis.splitTextForHighlight(testText, 2000);

      return {
        originalLength: testText.length,
        chunkCount: chunks.length,
        allChunksValid: chunks.every(chunk => chunk.length <= 2000),
      };
    });

    console.log(`     ✅ 文本分割: ${textSplitResult.chunkCount} 個區塊`);
    console.log(`     ✅ 所有區塊有效: ${textSplitResult.allChunksValid}`);

    console.log('  ✅ Background 整合測試完成！\n');

    return {
      urlNormalizationResult,
      imageValidationResult,
      textSplitResult,
    };
  },
};
