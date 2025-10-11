module.exports = {
  // 測試環境 - 使用 jsdom 環境來支持 DOM 測試
  testEnvironment: 'jsdom',

  // 測試設置文件
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // 測試文件匹配模式
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // 覆蓋率收集
  collectCoverageFrom: [
    'scripts/**/*.js',
    'tests/helpers/utils.testable.js',  // 包含測試版本的 utils.js
    'tests/helpers/background-utils.testable.js',  // 包含 background.js 純函數
    'tests/helpers/highlighter-v2.testable.js',  // 包含測試版本的 highlighter-v2.js
    'tests/helpers/content.testable.js',  // 包含測試版本的 content.js
    'tests/helpers/content-extraction.testable.js',  // 包含 content.js 內容提取函數
    '!scripts/**/*.test.js',
    '!scripts/**/*.spec.js',
    '!**/node_modules/**'
  ],

  // 覆蓋率門檻 (當前基準: 20.67%, 逐步提升)
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 20,
      lines: 18,
      statements: 20
    }
  },

  // 覆蓋率報告格式
  coverageReporters: ['text', 'lcov', 'html'],

  // 忽略的路徑
  testPathIgnorePatterns: [
    '/node_modules/',
    '/archive/',
    '/internal/',
    '/tests/manual/' // 手動測試放在此目錄，不應在 CI 或常規測試中執行
  ],

  // 轉換配置（如果需要）
  transform: {},

  // 詳細輸出
  verbose: true,

  // 模組名稱映射（用於模擬 Chrome API）
  moduleNameMapper: {
    '^chrome$': '<rootDir>/tests/mocks/chrome.js'
  },

  // 防止測試掛起
  forceExit: true,
  detectOpenHandles: true,

  // 增加超時時間（30秒）
  testTimeout: 30000
};
