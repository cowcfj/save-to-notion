/* global chrome */
import Logger from './Logger.js'; // Default export
import { LogSanitizer } from './LogSanitizer.js';

export class LogExporter {
  /**
   * 導出偵錯日誌
   * @param {Object} options
   * @param {string} options.format - 'json' | 'text' (目前主要支援 json)
   * @returns {Object} { filename, content, mimeType, count }
   */
  static exportLogs({ format = 'json' } = {}) {
    // 1. 獲取原始日誌
    const buffer = Logger.getBuffer();
    if (!buffer) {
      throw new Error('LogBuffer not initialized (are you in Background context?)');
    }

    const rawLogs = buffer.getAll();
    const count = rawLogs.length;

    // 2. 脫敏處理
    const safeLogs = LogSanitizer.sanitize(rawLogs);

    // 3. 格式化輸出
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'json') {
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        extensionVersion: chrome.runtime.getManifest().version,
        userAgent: navigator.userAgent,
        logCount: count,
        logs: safeLogs,
      };

      content = JSON.stringify(exportData, null, 2);
      filename = `notion-debug-${timestamp}.json`;
      mimeType = 'application/json';
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }

    return {
      filename,
      content,
      mimeType,
      count,
    };
  }
}
