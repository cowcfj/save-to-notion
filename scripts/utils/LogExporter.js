/* global chrome */
import Logger from './Logger.js'; // Default export

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
    // 注意：Logger 已在寫入緩衝區時進行即時脫敏 (Sanitize-on-Write)
    // 因此這裡取得的日誌已經是安全的，無需再次脫敏。
    const safeLogs = rawLogs;

    // 3. 格式化輸出
    // 格式化為: YYYYMMDD-HHmmss
    const nowISO = new Date().toISOString();
    const timestamp = `${nowISO.slice(0, 10).replace(/-/g, '')}-${nowISO
      .slice(11, 19)
      .replace(/:/g, '')}`;
    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'json') {
      const exportData = {
        version: '1.0',
        exportedAt: nowISO,
        extensionVersion: chrome.runtime.getManifest().version,
        userAgent: navigator.userAgent,
        logCount: count,
        logs: safeLogs,
      };

      try {
        content = JSON.stringify(exportData, null, 2);
      } catch (error) {
        console.error('Log serialization failed:', error);
        // Fallback: Create a minimal valid JSON with error details
        const errorReport = {
          error: 'Log_Serialization_Failed',
          message: 'Unable to serialize logs due to invalid content (e.g. circular references).',
          originalError: error.message,
          exportedAt: exportData.exportedAt,
          extensionVersion: exportData.extensionVersion,
        };
        content = JSON.stringify(errorReport, null, 2);
        // Adjust filename to indicate error
        filename = `notion-debug-error-${timestamp}.json`;
      }

      if (!filename) {
        filename = `notion-debug-${timestamp}.json`;
      }
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
