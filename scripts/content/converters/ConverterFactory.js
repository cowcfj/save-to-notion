/**
 * ConverterFactory - 轉換器工廠
 *
 * 職責:
 * - 根據內容類型提供適當的轉換器實例
 * - 管理轉換器的單例
 */

const { domConverter } = require('./DomConverter');
const { markdownConverter } = require('./MarkdownConverter');

class ConverterFactory {
  /**
   * 獲取轉換器實例
   * @param {string} type - 內容類型 ('markdown' | 'html' | 'dom')
   * @returns {Object} 轉換器實例 (具有 convert 方法)
   */
  getConverter(type) {
    switch (type?.toLowerCase()) {
      case 'markdown':
      case 'md':
        return markdownConverter;
      case 'html':
      case 'dom':
      default:
        return domConverter;
    }
  }
}

const converterFactory = new ConverterFactory();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ConverterFactory,
    converterFactory,
  };
}
