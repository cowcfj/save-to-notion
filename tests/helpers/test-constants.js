/**
 * 測試常數定義
 * 集中管理測試中使用的常數，避免 magic numbers 和 magic strings
 */

const TEST_CONSTANTS = {
  // 測試 URL
  URLS: {
    EXAMPLE: 'https://example.com',
    TEST: 'https://test.com',
    DEMO: 'https://demo.com',
    INVALID: 'invalid-url',
    LOCALHOST: 'http://localhost:3000',
  },

  // 錯誤消息
  ERROR_MESSAGES: {
    STORAGE_ACCESS_DENIED: 'Storage access denied',
    INVALID_PAGE_URL: 'Invalid pageUrl',
    CHROME_STORAGE_ERROR: 'Chrome Storage 錯誤',
    LOCALSTORAGE_ERROR: 'localStorage 錯誤',
    PERMISSION_DENIED: 'Permission denied',
    STORAGE_QUOTA_EXCEEDED: 'Storage quota exceeded',
    LOCALSTORAGE_QUOTA_EXCEEDED: 'localStorage quota exceeded',
    POST_CALLBACK_ERROR: 'Post-callback error',
    CONSOLE_ERROR: 'Console error',
    CANNOT_ADD_LISTENER: 'Cannot add listener',
    ERRORHANDLER_EXCEPTION: 'ErrorHandler 異常',
  },

  // 測試數據大小
  TEST_SIZES: {
    SMALL: 5,
    MEDIUM: 20,
    LARGE: 50, // 從 1000 減少到 50
    EXTRA_LARGE: 100, // 新增：用於特殊大數據測試
  },

  // Storage 鍵名模式
  STORAGE_KEYS: {
    HIGHLIGHTS_PREFIX: 'highlights_',
    SAVED_PREFIX: 'saved_',
    OTHER_PREFIX: 'other_key_',
  },

  // 測試數據
  TEST_DATA: {
    HIGHLIGHT: { text: 'test', color: 'yellow' },
    HIGHLIGHT_WITH_TIMESTAMP: { text: 'test', color: 'yellow', timestamp: Date.now() },
    INVALID_DATA_FORMAT: 'invalid_data_format',
  },

  // Chrome Extension 相關
  CHROME: {
    VERSION: '2.10.0',
    MANIFEST_VERSION: 3,
  },

  // 日誌前綴
  LOG_PREFIXES: {
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    DEBUG: '🐛',
    SUCCESS: '✅',
  },

  // 測試超時設置
  TIMEOUTS: {
    SHORT: 1000,
    MEDIUM: 5000,
    LONG: 10000,
  },

  // 常用的測試標籤
  TEST_TAGS: {
    UNIT: 'unit',
    INTEGRATION: 'integration',
    ERROR_HANDLING: 'error-handling',
    PERFORMANCE: 'performance',
  },
};

// 輔助函數：生成測試 URL
TEST_CONSTANTS.generateTestUrl = (domain = 'example', index = '') => {
  const suffix = index ? index.toString() : '';
  return `https://${domain}${suffix}.com`;
};

// 輔助函數：生成 Storage 鍵名
TEST_CONSTANTS.generateStorageKey = (type, url) => {
  const prefix = TEST_CONSTANTS.STORAGE_KEYS[`${type.toUpperCase()}_PREFIX`];
  return `${prefix}${url}`;
};

// 輔助函數：生成測試數據
TEST_CONSTANTS.generateTestData = (count = 1, type = 'HIGHLIGHT') => {
  const baseData = TEST_CONSTANTS.TEST_DATA[type];
  const data = [];

  for (let i = 0; i < count; i++) {
    data.push({
      ...baseData,
      text: `${baseData.text}${i > 0 ? i : ''}`,
    });
  }

  return data;
};

// 輔助函數：生成大數據集
TEST_CONSTANTS.generateLargeDataset = (size = TEST_CONSTANTS.TEST_SIZES.LARGE) => {
  const data = {};

  for (let i = 0; i < size; i++) {
    const url = TEST_CONSTANTS.generateTestUrl('example', i);
    const highlightKey = TEST_CONSTANTS.generateStorageKey('highlights', url);
    const otherKey = `${TEST_CONSTANTS.STORAGE_KEYS.OTHER_PREFIX}${i}`;

    data[highlightKey] = TEST_CONSTANTS.generateTestData(1);
    data[otherKey] = `value${i}`;
  }

  return data;
};

module.exports = TEST_CONSTANTS;
