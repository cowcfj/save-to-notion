/**
 * LogExportValidator 單元測試
 *
 * 測試 scripts/utils/LogExportValidator.js 的所有功能
 * - 日誌導出安全驗證
 */

import { validateLogExportData } from '../../../scripts/utils/LogExportValidator.js';

describe('LogExportValidator', () => {
  describe('validateLogExportData', () => {
    test('有效的導出數據應通過驗證', () => {
      const validData = {
        filename: 'debug_logs_2023.json',
        content: '{"logs":[]}',
        mimeType: 'application/json',
      };
      expect(() => validateLogExportData(validData)).not.toThrow();
    });

    test('缺少數據對象應拋出錯誤', () => {
      expect(() => validateLogExportData(null)).toThrow('missing data object');
      expect(() => validateLogExportData()).toThrow('missing data object');
    });

    test('無效的文件名應拋出錯誤', () => {
      const invalidFilenames = [
        '../passwd', // Path traversal
        'logs.txt', // 錯誤的副檔名
        'logs.json.exe', // 雙重副檔名
        'logs;rm -rf', // Shell 注入字元
        '', // 空值
        null,
      ];
      invalidFilenames.forEach(filename => {
        expect(() =>
          validateLogExportData({
            filename,
            content: '{}',
            mimeType: 'application/json',
          })
        ).toThrow('Invalid filename format');
      });
    });

    test('非字串內容應拋出錯誤', () => {
      const invalidContent = {
        filename: 'logs.json',
        content: null, // 非字串
        mimeType: 'application/json',
      };
      expect(() => validateLogExportData(invalidContent)).toThrow('Invalid content type');
    });

    test('錯誤的 MIME 類型應拋出錯誤', () => {
      const invalidMime = {
        filename: 'logs.json',
        content: '{}',
        mimeType: 'text/plain', // 錯誤的 MIME
      };
      expect(() => validateLogExportData(invalidMime)).toThrow('Invalid MIME type');
    });
  });
});
