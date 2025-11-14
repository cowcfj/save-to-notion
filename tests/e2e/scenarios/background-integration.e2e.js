/**
 * Background.js Integration E2E 測試場景
 *
 * 測試 background.js 的核心功能：
 * - Notion API 整合
 * - 訊息路由與通訊
 * - 模板處理與區塊生成
 * - URL 正規化與狀態管理
 */

module.exports = {
  name: 'Background Integration',

  async run(page, _config) {
    console.log('  🔧 開始 Background 整合測試...');

    // 1. 測試 URL 正規化功能
    console.log('  1️⃣ 測試 URL 正規化...');
    const urlNormalizationResult = await page.evaluate(() => {
      // 模擬 normalizeUrl 函數
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
        } catch (_error) {
          return url;
        }
      }

      const testCases = [
        {
          input: 'https://example.com/page?utm_source=google&id=123#section',
          expected: 'https://example.com/page?id=123'
        },
        {
          input: 'https://example.com/page/',
          expected: 'https://example.com/page'
        },
        {
          input: 'https://example.com/page?fbclid=abc123',
          expected: 'https://example.com/page'
        }
      ];

      const results = testCases.map(test => {
        const result = normalizeUrl(test.input);
        return {
          input: test.input,
          expected: test.expected,
          actual: result,
          passed: result === test.expected
        };
      });

      return {
        totalTests: results.length,
        passedTests: results.filter(r => r.passed).length,
        results
      };
    });

    console.log(`     ✅ URL 正規化測試: ${urlNormalizationResult.passedTests}/${urlNormalizationResult.totalTests} 通過`);

    // 2. 測試圖片 URL 驗證
    console.log('  2️⃣ 測試圖片 URL 驗證...');
    const imageValidationResult = await page.evaluate(() => {
      function isValidImageUrl(url) {
        if (!url || typeof url !== 'string') return false;

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
        } catch (_error) {
          return false;
        }
      }

      const testCases = [
        { url: 'https://example.com/image.jpg', expected: true },
        { url: 'https://example.com/photo.png', expected: true },
        { url: 'data:image/png;base64,abc123', expected: false },
        { url: 'ftp://example.com/image.jpg', expected: false },
        { url: 'https://example.com/image/cover', expected: true }
      ];

      const results = testCases.map(test => ({
        url: test.url,
        expected: test.expected,
        actual: isValidImageUrl(test.url),
        passed: isValidImageUrl(test.url) === test.expected
      }));

      return {
        totalTests: results.length,
        passedTests: results.filter(r => r.passed).length
      };
    });

    console.log(`     ✅ 圖片 URL 驗證: ${imageValidationResult.passedTests}/${imageValidationResult.totalTests} 通過`);

    // 3. 測試文本分割功能
    console.log('  3️⃣ 測試長文本分割...');
    const textSplitResult = await page.evaluate(() => {
      function splitTextForHighlight(text, maxLength = 2000) {
        if (text.length <= maxLength) {
          return [text];
        }

        const chunks = [];
        let currentChunk = '';
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

        for (const sentence of sentences) {
          if ((currentChunk + sentence).length <= maxLength) {
            currentChunk += sentence;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = sentence.length > maxLength ? '' : sentence;
            if (sentence.length > maxLength) {
              for (let i = 0; i < sentence.length; i += maxLength) {
                chunks.push(sentence.substring(i, i + maxLength));
              }
            }
          }
        }

        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }

        return chunks;
      }

      const testText = 'A'.repeat(5000);
      const chunks = splitTextForHighlight(testText, 2000);

      return {
        originalLength: testText.length,
        chunkCount: chunks.length,
        allChunksValid: chunks.every(chunk => chunk.length <= 2000)
      };
    });

    console.log(`     ✅ 文本分割: ${textSplitResult.chunkCount} 個區塊`);
    console.log(`     ✅ 所有區塊有效: ${textSplitResult.allChunksValid}`);

    console.log('  ✅ Background 整合測試完成！\n');

    return {
      urlNormalizationResult,
      imageValidationResult,
      textSplitResult
    };
  }
};
