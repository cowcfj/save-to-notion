/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

// 模擬依賴
jest.mock('../../../scripts/utils/LogBuffer.js');
jest.mock('../../../scripts/utils/LogSanitizer.js');

describe('Logger (Background Context)', () => {
  let Logger = null;
  let LogBufferMock = null;
  let LogSanitizerMock = null;
  let mockBufferInstance = null;

  beforeEach(() => {
    jest.resetModules();

    // Mock Chrome API
    global.chrome = {
      runtime: {
        id: 'test-id',
        getManifest: () => ({ version_name: '1.0.0-dev' }),
        sendMessage: jest.fn(),
      },
      storage: {
        sync: {
          get: jest.fn((keys, cb) => {
            const data = {};
            cb(data);
          }),
        },
        onChanged: {
          addListener: jest.fn(),
        },
      },
    };

    // Setup Mock LogBuffer
    mockBufferInstance = {
      push: jest.fn(),
      getAll: jest.fn(),
    };

    // Import mocked modules so we can retrieve the mocks
    const LogBufferModule = require('../../../scripts/utils/LogBuffer.js');
    LogBufferMock =
      LogBufferModule.LogBuffer || LogBufferModule.default?.LogBuffer || LogBufferModule;
    if (LogBufferMock.mockImplementation) {
      LogBufferMock.mockImplementation(() => mockBufferInstance);
    }

    const LogSanitizerModule = require('../../../scripts/utils/LogSanitizer.js');
    LogSanitizerMock =
      LogSanitizerModule.LogSanitizer ||
      LogSanitizerModule.default?.LogSanitizer ||
      LogSanitizerModule;
    LogSanitizerMock.sanitizeEntry = jest.fn((msg, ctx) => ({
      message: `SANITIZED_${msg}`,
      context: ctx,
    }));

    // Load Logger
    // Note: In node environment, window is undefined, so isBackground should be true
    const LoggerModule = require('../../../scripts/utils/Logger.js');
    Logger = LoggerModule.default;
  });

  afterEach(() => {
    delete global.chrome;
    delete global.Logger;
  });

  test('should initialize LogBuffer in background context', () => {
    // Access internal state indirectly or trigger initialization
    // Trigger initDebugState
    expect(LogBufferMock).toHaveBeenCalled();
  });

  test('should sanitize logs before writing to buffer', () => {
    const sensitiveMsg = 'secret_token';
    const context = { user: 'admin' };

    Logger.info(sensitiveMsg, context);

    // Verify sanitizeEntry was called
    expect(LogSanitizerMock.sanitizeEntry).toHaveBeenCalledWith(sensitiveMsg, context);

    // Verify sanitized data was pushed to buffer
    expect(mockBufferInstance.push).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `SANITIZED_${sensitiveMsg}`,
        context,
        level: 'info',
        source: 'background',
      })
    );
  });

  test('should handle non-string messages in sanitization', () => {
    const objMsg = { error: 'failed' };
    Logger.error(objMsg);

    expect(LogSanitizerMock.sanitizeEntry).toHaveBeenCalledWith(String(objMsg), expect.anything());
  });

  test('should capture all arguments when first arg is object', () => {
    const msg = 'test multi args';
    const firstArg = { foo: 'bar' };
    const secondArg = 'extra data';
    const thirdArg = 123;

    Logger.info(msg, firstArg, secondArg, thirdArg);

    // Previously, secondArg and thirdArg would be lost.
    // We expect them to be in context.details
    expect(LogSanitizerMock.sanitizeEntry).toHaveBeenCalledWith(
      msg,
      expect.objectContaining({
        foo: 'bar',
        details: [secondArg, thirdArg],
      })
    );
  });
});
