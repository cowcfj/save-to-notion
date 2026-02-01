/**
 * ErrorHandler.formatUserMessage 測試套件
 */
/* eslint-env jest */

import { ErrorHandler } from '../../../scripts/utils/ErrorHandler';
import { ERROR_MESSAGES } from '../../../scripts/config/constants';

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
    global.Logger = mockLogger;

    // 確保 jest.resetModules() 之後重新加載，或者直接控制 mock
    jest.spyOn(ErrorHandler, 'logger', 'get').mockReturnValue(mockLogger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('即使 debugEnabled 為 true，也應返回友善訊息以防止資訊洩漏', () => {
    mockLogger.debugEnabled = true;
    const technicalError = 'No tab with id: 123';
    expect(ErrorHandler.formatUserMessage(technicalError)).toBe(
      ERROR_MESSAGES.PATTERNS['No tab with id']
    );
  });

  test('當為未知錯誤且 debugEnabled 為 true 時，應返回預設友善訊息', () => {
    mockLogger.debugEnabled = true;
    const secretError = 'Database connection failed with password: confirm_password';
    expect(ErrorHandler.formatUserMessage(secretError)).toBe(ERROR_MESSAGES.DEFAULT);
  });

  test('當為已知錯誤模式且 debugEnabled 為 false 時，應返回友善訊息', () => {
    mockLogger.debugEnabled = false;

    // 測試 "No tab with id"
    expect(ErrorHandler.formatUserMessage('No tab with id: 456')).toBe(
      ERROR_MESSAGES.PATTERNS['No tab with id']
    );

    // 測試 "API Key"
    expect(ErrorHandler.formatUserMessage('Notion API Key is missing')).toBe(
      ERROR_MESSAGES.PATTERNS['API Key']
    );
  });

  test('當為未知錯誤且 debugEnabled 為 false 時，應返回預設友善訊息', () => {
    mockLogger.debugEnabled = false;
    expect(ErrorHandler.formatUserMessage('Some cryptic internal system error')).toBe(
      ERROR_MESSAGES.DEFAULT
    );
  });

  test('應處理 Error 物件輸入', () => {
    mockLogger.debugEnabled = false;
    const error = new Error('No tab with id: 789');
    expect(ErrorHandler.formatUserMessage(error)).toBe(ERROR_MESSAGES.PATTERNS['No tab with id']);
  });

  test('應不分大小寫匹配模式', () => {
    mockLogger.debugEnabled = false;
    expect(ErrorHandler.formatUserMessage('NO TAB WITH ID: 999')).toBe(
      ERROR_MESSAGES.PATTERNS['No tab with id']
    );
  });
});
