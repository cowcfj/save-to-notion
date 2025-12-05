/**
 * ConverterFactory - 轉換器工廠
 *
 * 職責:
 * - 根據內容類型提供適當的轉換器實例
 * - 管理轉換器的單例
 */

import { domConverter } from './DomConverter.js';
import { markdownConverter } from './MarkdownConverter.js';

class ConverterFactory {
  /**
   * 獲取轉換器實例
   * @param {string} type - 內容類型 ('markdown' | 'html' | 'dom')
   * @returns {Object} 轉換器實例 (具有 convert 方法)
   */
  static getConverter(type) {
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

export { ConverterFactory, converterFactory };
