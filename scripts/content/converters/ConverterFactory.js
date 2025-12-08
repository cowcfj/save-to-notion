/**
 * ConverterFactory - 轉換器工廠
 *
 * 職責:
 * - 根據內容類型提供適當的轉換器實例
 * - 管理轉換器的單例
 */

import { domConverter } from './DomConverter.js';
/**
 * 轉換器工廠類
 * 負責根據輸入類型提供適當的轉換器實例
 */
class ConverterFactory {
  /**
   * 獲取轉換器
   * @param {string} [_type] - 內容類型 (已忽略，統一使用 DomConverter)
   * @returns {DomConverter} 轉換器實例
   */
  static getConverter(_type) {
    // 所有的內容現在都視為 DOM/HTML 處理
    // 即使源是 Markdown，ContentExtractor 也已將其提取為 HTML 格式
    return domConverter;
  }
}

const converterFactory = new ConverterFactory();

export { ConverterFactory, converterFactory };
