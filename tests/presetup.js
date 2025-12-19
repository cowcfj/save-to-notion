/**
 * Jest 測試環境預設置
 * 配置必須在模組載入前設定的全局 mocks
 *
 * 注意：此檔案在 setupFiles 中配置，確保在所有模組載入前執行
 * 使用 jest.fn() 以支持測試中的 mockReturnValue() 等方法
 */

// Mock ImageUtils (用於依賴 window.ImageUtils 的模組)
// 這個 mock 必須在任何模組載入前設定，否則解構會失敗
global.ImageUtils = {
  extractImageSrc: jest.fn(img => img?.getAttribute?.('src') || img?.src || null),
  cleanImageUrl: jest.fn(url => url),
  isValidImageUrl: jest.fn(() => true),
  isNotionCompatibleImageUrl: jest.fn(() => true),
  extractBestUrlFromSrcset: jest.fn(() => null),
  generateImageCacheKey: jest.fn(url => url),
  extractFromSrcset: jest.fn(() => null),
  extractFromAttributes: jest.fn(() => null),
  extractFromPicture: jest.fn(() => null),
  extractFromBackgroundImage: jest.fn(() => null),
  extractFromNoscript: jest.fn(() => null),
};

// 同時設定 window.ImageUtils（對於 jsdom 環境）
if (typeof window !== 'undefined') {
  window.ImageUtils = global.ImageUtils;
}

// Mock Logger (基本實現，在 setup.js 中會被更完整的版本覆蓋)
global.Logger = {
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// 同時設定 window.Logger
if (typeof window !== 'undefined') {
  window.Logger = global.Logger;
}
