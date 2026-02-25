module.exports = {
  // 測試環境 - 使用 jsdom 環境來支持 DOM 測試
  testEnvironment: 'jsdom',

  // 預設置文件（在模組載入前執行，用於全局 mock）
  setupFiles: ['<rootDir>/tests/presetup.js'],

  // 測試設置文件（在模組載入後執行）
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // 測試文件匹配模式
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // 覆蓋率收集
  collectCoverageFrom: [
    'scripts/**/*.js',
    'options/**/*.js',
    'popup/**/*.js', // 新增 popup 目錄
    'sidepanel/**/*.js', // 新增 sidepanel 目錄
    '!scripts/**/*.test.js',
    '!scripts/**/*.spec.js',
    '!**/node_modules/**'
  ],

  // 覆蓋率門檼 (已根據目前測試結果大幅提升)
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // 覆蓋率報告格式
  coverageReporters: ['text', 'lcov', 'html', 'json'],

  // 忽略的路徑
  testPathIgnorePatterns: [
    '/node_modules/',
    '/archive/',
    '/internal/',
    '/tests/manual/', // 手動測試放在此目錄，不應在 CI 或常規測試中執行
    '/tests/e2e/', // e2e 測試單獨執行，不進入單元測試與覆蓋率
    '/tests/e2e/oauth-end-to-end.test.js' // OAuth 功能尚未實作，暫時排除測試
  ],
  // 忽略模組路徑以避免 Jest Haste Map 命名衝突（重複的 package.json）
  modulePathIgnorePatterns: ['<rootDir>/releases/'],

  // 轉換配置（如果需要）
  transform: {
    '^.+\\.[tj]sx?$': 'babel-jest',
  },

  // 轉換 node_modules 中的 ES 模組
  transformIgnorePatterns: [
    'node_modules/(?!(jsdom|@exodus|html-encoding-sniffer|@notionhq|parse5|@babel|@jest|jest-environment-jsdom|whatwg-url|tr46|webidl-conversions|data-urls|decimal.js|punycode|entities|nwsapi|saxes|cssstyle|rrweb-cssom|symbol-tree)/)'
  ],

  // 模組名稱映射（用於模擬 Chrome API）
  moduleNameMapper: {
    '^chrome$': '<rootDir>/tests/mocks/chrome.js'
  },

  // 防止測試掛起
  forceExit: true,
  detectOpenHandles: true,

  // 增加超時時間（30秒）
  testTimeout: 30000,

  // Node.js 20.x 性能優化設置
  maxWorkers: 4, // 略微提高以便利用更多核心
  maxConcurrency: 5,  // 略微提高並發測試數量

  // 減少不必要的 mock 清理以提升性能
  clearMocks: false, // 改為手動清理特定測試
  resetMocks: false,  // 改為手動重置特定測試
  restoreMocks: false, // 改為手動恢復特定測試

  // 性能優化
  bail: false, // 不在第一個失敗時停止，繼續執行所有測試
  verbose: false // 關閉詳細輸出以提升速度
};
