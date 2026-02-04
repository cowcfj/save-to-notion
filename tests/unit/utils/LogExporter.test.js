/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { LogExporter } from '../../../scripts/utils/LogExporter.js';
import Logger from '../../../scripts/utils/Logger.js';

// Mock Logger
jest.mock('../../../scripts/utils/Logger.js');

describe('LogExporter', () => {
  let mockBuffer = null;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup Mock Buffer
    mockBuffer = {
      getAll: jest.fn(),
    };

    // Default Logger behavior
    Logger.getBuffer.mockReturnValue(mockBuffer);

    // Mock Chrome API
    globalThis.chrome = {
      runtime: {
        getManifest: jest.fn().mockReturnValue({ version: '1.2.3' }),
      },
    };

    // Mock Navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'TestUserAgent' },
      writable: true,
    });
  });

  afterEach(() => {
    globalThis.navigator = originalNavigator;
    delete globalThis.chrome;
  });

  test('should export logs correctly in JSON format', () => {
    const mockLogs = [
      { timestamp: '2024-01-01T10:00:00.000Z', level: 'info', message: 'test log 1' },
      { timestamp: '2024-01-01T10:01:00.000Z', level: 'error', message: 'test log 2' },
    ];
    mockBuffer.getAll.mockReturnValue(mockLogs);

    const result = LogExporter.exportLogs();

    expect(result.count).toBe(2);
    expect(result.mimeType).toBe('application/json');
    expect(result.filename).toMatch(/notion-debug-\d{8}-\d{6}\.json/);

    const parsedContent = JSON.parse(result.content);
    expect(parsedContent).toEqual({
      version: '1.0',
      exportedAt: expect.any(String),
      extensionVersion: '1.2.3',
      userAgent: 'TestUserAgent',
      logCount: 2,
      logs: mockLogs,
    });
  });

  test('should handle empty buffer', () => {
    mockBuffer.getAll.mockReturnValue([]);

    const result = LogExporter.exportLogs();

    expect(result.count).toBe(0);
    const parsedContent = JSON.parse(result.content);
    expect(parsedContent.logs).toEqual([]);
  });

  test('should throw error if buffer is not initialized', () => {
    Logger.getBuffer.mockReturnValue(null);

    expect(() => {
      LogExporter.exportLogs();
    }).toThrow('LogBuffer not initialized');
  });

  test('should handle JSON serialization errors gracefully', () => {
    // Create a circular structure that bypasses the sanitizer (simulating improper state)
    // In reality, logs should be sanitized before buffer, but this tests the fail-safe in Exporter
    const circular = { id: 1 };
    circular.self = circular;

    const mockLogs = [circular];
    mockBuffer.getAll.mockReturnValue(mockLogs);

    // Suppress console.error for this test as we expect it
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      // 避免空函數
      return args;
    });

    const result = LogExporter.exportLogs();

    expect(consoleSpy).toHaveBeenCalledWith('Log serialization failed:', expect.any(Error));
    expect(result.filename).toMatch(/notion-debug-error-\d{8}-\d{6}\.json/);

    const parsedContent = JSON.parse(result.content);
    expect(parsedContent.error).toBe('Log_Serialization_Failed');
    expect(parsedContent.message).toBeDefined();

    consoleSpy.mockRestore();
  });

  test('should validate filename format (YYYYMMDD-HHmmss)', () => {
    mockBuffer.getAll.mockReturnValue([]);
    const result = LogExporter.exportLogs();

    // Check if filename contains digits-digits
    // The timestamp format is YYYYMMDD-HHmmss -> 8 digits - 6 digits
    const filenameTimestampPart = result.filename.match(/notion-debug-(.*)\.json/)[1];
    expect(filenameTimestampPart).toMatch(/^\d{8}-\d{6}$/);
  });

  test('should throw error for unsupported formats', () => {
    mockBuffer.getAll.mockReturnValue([]);

    expect(() => {
      LogExporter.exportLogs({ format: 'text' });
    }).toThrow('Unsupported format: text');
  });
});
