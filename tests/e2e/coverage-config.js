/**
 * E2E 測試覆蓋率配置
 *
 * 配置 Puppeteer Coverage API 和 Istanbul 整合
 */

module.exports = {
  // Puppeteer 配置
  puppeteer: {
    headless: true, // 在 CI 環境使用 headless mode
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ],
    // Chrome 擴展加載配置
    extensionPath: '.', // 擴展根目錄（已包含 manifest.json）
  },

  // 覆蓋率收集配置
  coverage: {
    // 需要收集覆蓋率的文件模式
    include: [
      'scripts/**/*.js',
      '!scripts/**/*.test.js',
      '!scripts/**/*.spec.js'
    ],

    // 排除的文件
    exclude: [
      'scripts/utils/htmlToNotionConverter.js', // 頁面注入腳本
      'scripts/utils/pageComplexityDetector.js'  // ESM 模組
    ],

    // 覆蓋率報告格式
    reporters: ['text', 'json', 'lcov', 'html'],

    // 覆蓋率輸出目錄
    dir: 'coverage/e2e',

    // 合併後的覆蓋率輸出
    mergedDir: 'coverage/merged'
  },

  // Istanbul 配置
  istanbul: {
    // 報告配置
    reportConfig: {
      'text-summary': {},
      'json': { file: 'coverage-final.json' },
      'lcov': { file: 'lcov.info' },
      'html': {}
    }
  },

  // E2E 測試場景配置
  testScenarios: [
    {
      name: 'Highlighter Workflow',
      file: 'tests/e2e/scenarios/highlighter.e2e.js',
      timeout: 60000,
      enabled: true
    },
    {
      name: 'Content Extraction',
      file: 'tests/e2e/scenarios/content-extraction.e2e.js',
      timeout: 30000,
      enabled: true
    },
    {
      name: 'Background Integration',
      file: 'tests/e2e/scenarios/background-integration.e2e.js',
      timeout: 30000,
      enabled: true
    },
    {
      name: 'Content Extraction Advanced',
      file: 'tests/e2e/scenarios/content-extraction-advanced.e2e.js',
      timeout: 60000,
      enabled: true
    },
    {
      name: 'Notion Integration',
      file: 'tests/e2e/scenarios/notion-integration.e2e.js',
      timeout: 60000,
      enabled: false // 需要真實 Notion API token
    }
  ],

  // 測試頁面 URLs
  testPages: {
    mdn: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
    wordpress: 'https://wordpress.org/news/', // 示例 WordPress 頁面
    simple: 'https://example.com'
  }
};
