/**
 * ErrorHandler.formatUserMessage 測試套件
 */
/* eslint-env jest */

import { ErrorHandler } from '../../../scripts/utils/ErrorHandler.js';
import { ERROR_MESSAGES } from '../../../scripts/config/messages.js';

describe('ErrorHandler.formatUserMessage', () => {
  let mockLogger = null;

  beforeEach(() => {
    mockLogger = {
      debugEnabled: false,
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
    };
    globalThis.Logger = mockLogger;

    // 確保 jest.resetModules() 之後重新加載，或者直接控制 mock
    jest.spyOn(ErrorHandler, 'logger', 'get').mockReturnValue(mockLogger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('精確匹配標準化的 Error Code 應返回友善訊息', () => {
    mockLogger.debugEnabled = true;
    // 現在只進行精確匹配，錯誤應先經過 sanitizeApiError 標準化
    expect(ErrorHandler.formatUserMessage('No tab with id')).toBe(
      ERROR_MESSAGES.PATTERNS['No tab with id']
    );
  });

  test('當為未知錯誤且 debugEnabled 為 true 時，應返回預設友善訊息', () => {
    mockLogger.debugEnabled = true;
    const secretError = 'Database connection failed with password: confirm_password';
    expect(ErrorHandler.formatUserMessage(secretError)).toBe(ERROR_MESSAGES.DEFAULT);
  });

  test('多個標準化 Error Code 應正確匹配', () => {
    mockLogger.debugEnabled = false;

    // 測試精確匹配 "No tab with id"（完全等於 PATTERNS 的 key）
    expect(ErrorHandler.formatUserMessage('No tab with id')).toBe(
      ERROR_MESSAGES.PATTERNS['No tab with id']
    );

    // 測試精確匹配 "API Key"
    expect(ErrorHandler.formatUserMessage('API Key')).toBe(ERROR_MESSAGES.PATTERNS['API Key']);

    // 測試精確匹配 "rate limit"
    expect(ErrorHandler.formatUserMessage('rate limit')).toBe(
      ERROR_MESSAGES.PATTERNS['rate limit']
    );
  });

  test('當為未知錯誤且 debugEnabled 為 false 時，應返回預設友善訊息', () => {
    mockLogger.debugEnabled = false;
    expect(ErrorHandler.formatUserMessage('Some cryptic internal system error')).toBe(
      ERROR_MESSAGES.DEFAULT
    );
  });

  test('應防禦性處理原始 Error 物件輸入', () => {
    mockLogger.debugEnabled = false;
    // 測試 formatUserMessage 對原始 Error 物件的防禦性處理
    // 注意：正規流程應先經過 sanitizeApiError 標準化，此測試驗證直接傳入 Error 物件時的容錯機制
    const error = new Error('Network error');
    expect(ErrorHandler.formatUserMessage(error)).toBe(ERROR_MESSAGES.PATTERNS['Network error']);
  });

  test('非精確匹配的訊息應返回預設錯誤（不再支援模糊匹配）', () => {
    mockLogger.debugEnabled = false;
    // 舊的模糊匹配邏輯已移除，非精確匹配的訊息會返回預設錯誤
    expect(ErrorHandler.formatUserMessage('NO TAB WITH ID: 999')).toBe(ERROR_MESSAGES.DEFAULT);
    expect(ErrorHandler.formatUserMessage('api key is missing')).toBe(ERROR_MESSAGES.DEFAULT);
  });

  describe('XSS 防護 (安全渲染策略)', () => {
    test('包含中文的惡意字串應保持原樣 (由 UI 層負責轉義)', () => {
      const malicious = '發生錯誤<script>alert("XSS")</script>';
      const result = ErrorHandler.formatUserMessage(malicious);
      // 驗證 ErrorHandler 不進行轉義，而是由這裡的 expect 確認它“未被轉義”
      // 實際的安全防護由 textContent 在 UI 層完成
      expect(result).toBe(malicious);
    });

    test('包含中文的 img onerror 攻擊應保持原樣 (由 UI 層負責轉義)', () => {
      const malicious = '請稍後再試<img src=x onerror=alert(1)>';
      const result = ErrorHandler.formatUserMessage(malicious);
      expect(result).toBe(malicious);
    });

    test('純中文字串應保持不變', () => {
      const chinese = '這是一段中文錯誤訊息';
      const result = ErrorHandler.formatUserMessage(chinese);
      expect(result).toBe(chinese);
    });

    test('含特殊字符的中文訊息應保持不變', () => {
      const withSpecialChars = '錯誤: "a" & "b"';
      const result = ErrorHandler.formatUserMessage(withSpecialChars);
      expect(result).toBe(withSpecialChars);
    });
  });
});
