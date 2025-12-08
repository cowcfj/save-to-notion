/**
 * patterns.js 配置模組測試
 * 驗證所有導出的正則表達式和模式配置
 */

const {
  LIST_PREFIX_PATTERNS,
  BULLET_PATTERNS,
  IMAGE_ATTRIBUTES,
  IMAGE_EXTENSIONS,
  IMAGE_PATH_PATTERNS,
  EXCLUDE_PATTERNS,
  HTTP_PROTOCOL_REGEX,
  DATA_PROTOCOL_REGEX,
  BLOB_PROTOCOL_REGEX,
  TECHNICAL_TERMS,
  PLACEHOLDER_KEYWORDS,
} = require('../../../scripts/config/patterns');

describe('配置模組 - patterns.js', () => {
  describe('列表處理模式', () => {
    test('LIST_PREFIX_PATTERNS 應包含必要模式', () => {
      expect(LIST_PREFIX_PATTERNS.bulletPrefix).toBeInstanceOf(RegExp);
      expect(LIST_PREFIX_PATTERNS.multipleSpaces).toBeInstanceOf(RegExp);
      expect(LIST_PREFIX_PATTERNS.emptyLine).toBeInstanceOf(RegExp);
    });

    test('BULLET_PATTERNS 應包含項目符號模式', () => {
      expect(BULLET_PATTERNS.bulletChar).toBeInstanceOf(RegExp);
      expect(BULLET_PATTERNS.numbered).toBeInstanceOf(RegExp);
    });
  });

  describe('圖片屬性與模式', () => {
    test('IMAGE_ATTRIBUTES 應為字串陣列', () => {
      expect(Array.isArray(IMAGE_ATTRIBUTES)).toBe(true);
      expect(IMAGE_ATTRIBUTES.length).toBeGreaterThan(0);
      expect(IMAGE_ATTRIBUTES).toContain('src');
      expect(IMAGE_ATTRIBUTES).toContain('data-src');
    });

    test('IMAGE_EXTENSIONS 應為正則表達式', () => {
      expect(IMAGE_EXTENSIONS).toBeInstanceOf(RegExp);
      expect(IMAGE_EXTENSIONS.test('image.jpg')).toBe(true);
      expect(IMAGE_EXTENSIONS.test('image.png')).toBe(true);
      expect(IMAGE_EXTENSIONS.test('script.js')).toBe(false);
    });

    test('IMAGE_PATH_PATTERNS 應為正則表達式陣列', () => {
      expect(Array.isArray(IMAGE_PATH_PATTERNS)).toBe(true);
      expect(IMAGE_PATH_PATTERNS.length).toBeGreaterThan(0);
      IMAGE_PATH_PATTERNS.forEach(pattern => {
        expect(pattern).toBeInstanceOf(RegExp);
      });
    });

    test('EXCLUDE_PATTERNS 應為正則表達式陣列', () => {
      expect(Array.isArray(EXCLUDE_PATTERNS)).toBe(true);
      expect(EXCLUDE_PATTERNS.length).toBeGreaterThan(0);
      EXCLUDE_PATTERNS.forEach(pattern => {
        expect(pattern).toBeInstanceOf(RegExp);
      });
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

  describe('關鍵詞列表', () => {
    test('TECHNICAL_TERMS 應為字串陣列', () => {
      expect(Array.isArray(TECHNICAL_TERMS)).toBe(true);
      expect(TECHNICAL_TERMS.length).toBeGreaterThan(0);
      expect(TECHNICAL_TERMS).toContain('function');
      expect(TECHNICAL_TERMS).toContain('api');
    });

    test('PLACEHOLDER_KEYWORDS 應為字串陣列', () => {
      expect(Array.isArray(PLACEHOLDER_KEYWORDS)).toBe(true);
      expect(PLACEHOLDER_KEYWORDS.length).toBeGreaterThan(0);
      expect(PLACEHOLDER_KEYWORDS).toContain('placeholder');
      expect(PLACEHOLDER_KEYWORDS).toContain('loading');
    });
  });
});
