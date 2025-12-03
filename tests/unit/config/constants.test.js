/**
 * constants.js 配置模組測試
 * 驗證所有導出的常量值、類型和結構正確性
 */

const {
  IMAGE_VALIDATION_CONSTANTS,
  IMAGE_VALIDATION_CONFIG,
  HTTP_PROTOCOL_REGEX,
  DATA_PROTOCOL_REGEX,
  BLOB_PROTOCOL_REGEX,
  CONTENT_QUALITY,
  NOTION_API,
  LOG_LEVELS,
  TEXT_PROCESSING,
} = require('../../../scripts/config/constants');

describe('配置模組 - constants.js', () => {
  describe('IMAGE_VALIDATION_CONSTANTS', () => {
    test('應導出所有必要的常量', () => {
      expect(IMAGE_VALIDATION_CONSTANTS).toBeDefined();
      expect(IMAGE_VALIDATION_CONSTANTS.MAX_URL_LENGTH).toBe(1500);
      expect(IMAGE_VALIDATION_CONSTANTS.MAX_QUERY_PARAMS).toBe(10);
      expect(IMAGE_VALIDATION_CONSTANTS.SRCSET_WIDTH_MULTIPLIER).toBe(1000);
      expect(IMAGE_VALIDATION_CONSTANTS.MAX_BACKGROUND_URL_LENGTH).toBe(2000);
    });

    test('常量應為正整數', () => {
      Object.values(IMAGE_VALIDATION_CONSTANTS).forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
        expect(Number.isInteger(value)).toBe(true);
      });
    });
  });

  describe('IMAGE_VALIDATION_CONFIG', () => {
    test('應導出配置對象', () => {
      expect(IMAGE_VALIDATION_CONFIG).toBeDefined();
      expect(typeof IMAGE_VALIDATION_CONFIG).toBe('object');
    });

    test('應包含正確的數值配置', () => {
      expect(IMAGE_VALIDATION_CONFIG.MAX_URL_LENGTH).toBe(2000);
      expect(IMAGE_VALIDATION_CONFIG.MAX_CACHE_SIZE).toBe(500);
      expect(IMAGE_VALIDATION_CONFIG.CACHE_TTL).toBe(30 * 60 * 1000);
    });

    test('應包含協議列表', () => {
      expect(Array.isArray(IMAGE_VALIDATION_CONFIG.SUPPORTED_PROTOCOLS)).toBe(true);
      expect(IMAGE_VALIDATION_CONFIG.SUPPORTED_PROTOCOLS).toContain('http:');
      expect(IMAGE_VALIDATION_CONFIG.SUPPORTED_PROTOCOLS).toContain('https:');
    });

    test('應包含正則表達式', () => {
      expect(IMAGE_VALIDATION_CONFIG.IMAGE_EXTENSIONS).toBeInstanceOf(RegExp);
    });

    test('應包含路徑模式陣列', () => {
      expect(Array.isArray(IMAGE_VALIDATION_CONFIG.IMAGE_PATH_PATTERNS)).toBe(true);
      expect(IMAGE_VALIDATION_CONFIG.IMAGE_PATH_PATTERNS.length).toBeGreaterThan(0);
      IMAGE_VALIDATION_CONFIG.IMAGE_PATH_PATTERNS.forEach(pattern => {
        expect(pattern).toBeInstanceOf(RegExp);
      });
    });

    test('應包含排除模式陣列', () => {
      expect(Array.isArray(IMAGE_VALIDATION_CONFIG.EXCLUDE_PATTERNS)).toBe(true);
      expect(IMAGE_VALIDATION_CONFIG.EXCLUDE_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  describe('協議正則表達式', () => {
    test('HTTP_PROTOCOL_REGEX 應匹配 HTTP/HTTPS URL', () => {
      expect(HTTP_PROTOCOL_REGEX.test('http://example.com')).toBe(true);
      expect(HTTP_PROTOCOL_REGEX.test('https://example.com')).toBe(true);
      expect(HTTP_PROTOCOL_REGEX.test('ftp://example.com')).toBe(false);
    });

    test('DATA_PROTOCOL_REGEX 應匹配 data URL', () => {
      expect(DATA_PROTOCOL_REGEX.test('data:image/png;base64,abc')).toBe(true);
      expect(DATA_PROTOCOL_REGEX.test('data:image/jpeg;base64,xyz')).toBe(true);
      expect(DATA_PROTOCOL_REGEX.test('data:text/plain,hello')).toBe(false);
    });

    test('BLOB_PROTOCOL_REGEX 應匹配 blob URL', () => {
      expect(BLOB_PROTOCOL_REGEX.test('blob:https://example.com/123')).toBe(true);
      expect(BLOB_PROTOCOL_REGEX.test('https://example.com')).toBe(false);
    });
  });

  describe('CONTENT_QUALITY', () => {
    test('應導出內容質量評估常量', () => {
      expect(CONTENT_QUALITY).toBeDefined();
      expect(CONTENT_QUALITY.MIN_CONTENT_LENGTH).toBe(250);
      expect(CONTENT_QUALITY.MAX_LINK_DENSITY).toBe(0.3);
      expect(CONTENT_QUALITY.LIST_EXCEPTION_THRESHOLD).toBe(8);
    });

    test('常量應為合理值', () => {
      expect(CONTENT_QUALITY.MIN_CONTENT_LENGTH).toBeGreaterThan(0);
      expect(CONTENT_QUALITY.MAX_LINK_DENSITY).toBeGreaterThan(0);
      expect(CONTENT_QUALITY.MAX_LINK_DENSITY).toBeLessThan(1);
      expect(Number.isInteger(CONTENT_QUALITY.LIST_EXCEPTION_THRESHOLD)).toBe(true);
    });
  });

  describe('NOTION_API', () => {
    test('應導出 Notion API 配置', () => {
      expect(NOTION_API).toBeDefined();
      expect(NOTION_API.VERSION).toBe('2025-09-03');
      expect(NOTION_API.BASE_URL).toBe('https://api.notion.com/v1');
    });

    test('應包含批次處理配置', () => {
      expect(NOTION_API.BLOCKS_PER_BATCH).toBe(100);
      expect(NOTION_API.DELAY_BETWEEN_BATCHES).toBe(350);
    });

    test('應包含重試配置', () => {
      expect(NOTION_API.MAX_RETRIES).toBe(3);
      expect(NOTION_API.BASE_RETRY_DELAY).toBe(800);
    });

    test('配置值應為合理範圍', () => {
      expect(NOTION_API.BLOCKS_PER_BATCH).toBeGreaterThan(0);
      expect(NOTION_API.DELAY_BETWEEN_BATCHES).toBeGreaterThan(0);
      expect(NOTION_API.MAX_RETRIES).toBeGreaterThan(0);
    });
  });

  describe('LOG_LEVELS', () => {
    test('應導出日誌級別定義', () => {
      expect(LOG_LEVELS).toBeDefined();
      expect(LOG_LEVELS.DEBUG).toBe(0);
      expect(LOG_LEVELS.LOG).toBe(1);
      expect(LOG_LEVELS.INFO).toBe(2);
      expect(LOG_LEVELS.WARN).toBe(3);
      expect(LOG_LEVELS.ERROR).toBe(4);
    });

    test('日誌級別應遞增', () => {
      expect(LOG_LEVELS.DEBUG).toBeLessThan(LOG_LEVELS.LOG);
      expect(LOG_LEVELS.LOG).toBeLessThan(LOG_LEVELS.INFO);
      expect(LOG_LEVELS.INFO).toBeLessThan(LOG_LEVELS.WARN);
      expect(LOG_LEVELS.WARN).toBeLessThan(LOG_LEVELS.ERROR);
    });
  });

  describe('TEXT_PROCESSING', () => {
    test('應導出文本處理配置', () => {
      expect(TEXT_PROCESSING).toBeDefined();
      expect(TEXT_PROCESSING.MAX_RICH_TEXT_LENGTH).toBe(2000);
      expect(TEXT_PROCESSING.MIN_SPLIT_RATIO).toBe(0.5);
    });

    test('配置值應在合理範圍', () => {
      expect(TEXT_PROCESSING.MAX_RICH_TEXT_LENGTH).toBeGreaterThan(0);
      expect(TEXT_PROCESSING.MIN_SPLIT_RATIO).toBeGreaterThan(0);
      expect(TEXT_PROCESSING.MIN_SPLIT_RATIO).toBeLessThanOrEqual(1);
    });
  });

  describe('常量不可變性', () => {
    test('導出的對象應可凍結（防止意外修改）', () => {
      // 注意：這個測試只是記錄當前行為，配置對象目前未凍結
      // 未來可以考慮使用 Object.freeze() 增強安全性
      expect(typeof IMAGE_VALIDATION_CONSTANTS).toBe('object');
      expect(typeof CONTENT_QUALITY).toBe('object');
      expect(typeof NOTION_API).toBe('object');
    });
  });
});
