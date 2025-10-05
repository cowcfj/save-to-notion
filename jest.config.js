module.exports = {
  // 測試環境
  testEnvironment: 'node',
  
  // 測試文件匹配模式
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // 覆蓋率收集
  collectCoverageFrom: [
    'scripts/**/*.js',
    '!scripts/**/*.test.js',
    '!scripts/**/*.spec.js',
    '!**/node_modules/**'
  ],
  
  // 覆蓋率門檻 (當前基準: 2.32%, 逐步提升)
  coverageThreshold: {
    global: {
      branches: 2,
      functions: 2,
      lines: 1.5,
      statements: 2
    }
  },
  
  // 覆蓋率報告格式
  coverageReporters: ['text', 'lcov', 'html'],
  
  // 忽略的路徑
  testPathIgnorePatterns: [
    '/node_modules/',
    '/archive/',
    '/internal/'
  ],
  
  // 轉換配置（如果需要）
  transform: {},
  
  // 詳細輸出
  verbose: true,
  
  // 模組名稱映射（用於模擬 Chrome API）
  moduleNameMapper: {
    '^chrome$': '<rootDir>/tests/mocks/chrome.js'
  }
};
