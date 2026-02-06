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
      { level: 'info', message: 'test log 1' },
      { level: 'error', message: 'test log 2' },
    ];
    mockBuffer.getAll.mockReturnValue(mockLogs);

    const result = LogExporter.exportLogs();

    expect(result.count).toBe(2);
    expect(result.mimeType).toBe('application/json');
    expect(result.filename).toBe('notion-debug.json');

    const parsedContent = JSON.parse(result.content);
    expect(parsedContent).toEqual({
      version: '1.0',
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
    const circular = { id: 1 };
    circular.self = circular;

    const mockLogs = [circular];
    mockBuffer.getAll.mockReturnValue(mockLogs);

    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      return args;
    });

    const result = LogExporter.exportLogs();

    expect(consoleSpy).toHaveBeenCalledWith('Log serialization failed:', expect.any(Error));
    expect(result.filename).toBe('notion-debug-error.json');

    const parsedContent = JSON.parse(result.content);
    expect(parsedContent.error).toBe('Log_Serialization_Failed');
    expect(parsedContent.message).toBeDefined();

    consoleSpy.mockRestore();
  });

  test('should use fixed filename format', () => {
    mockBuffer.getAll.mockReturnValue([]);
    const result = LogExporter.exportLogs();

    expect(result.filename).toBe('notion-debug.json');
  });

  test('should throw error for unsupported formats', () => {
    mockBuffer.getAll.mockReturnValue([]);

    expect(() => {
      LogExporter.exportLogs({ format: 'text' });
    }).toThrow('Unsupported format: text');
  });
});
