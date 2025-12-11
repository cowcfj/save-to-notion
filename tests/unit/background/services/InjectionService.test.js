const {
  InjectionService,
  isRestrictedInjectionUrl,
  isRecoverableInjectionError,
} = require('../../../../scripts/background/services/InjectionService');

// Mock chrome API
global.chrome = {
  scripting: {
    executeScript: jest.fn(),
  },
  runtime: {
    lastError: null,
  },
};

// Mock Logger
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('InjectionService', () => {
  let service = null;

  beforeEach(() => {
    service = new InjectionService({ logger: mockLogger });
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  describe('isRestrictedInjectionUrl', () => {
    it('should return true for chrome:// urls', () => {
      expect(isRestrictedInjectionUrl('chrome://extensions')).toBe(true);
    });

    it('should return true for webstore urls', () => {
      expect(isRestrictedInjectionUrl('https://chrome.google.com/webstore/detail/xyz')).toBe(true);
    });

    it('should return false for normal urls', () => {
      expect(isRestrictedInjectionUrl('https://example.com')).toBe(false);
    });

    it('should return true for empty url', () => {
      expect(isRestrictedInjectionUrl('')).toBe(true);
      expect(isRestrictedInjectionUrl(null)).toBe(true);
    });
  });

  describe('isRecoverableInjectionError', () => {
    it('should identify recoverable errors', () => {
      expect(isRecoverableInjectionError('Cannot access contents of page')).toBe(true);
      expect(isRecoverableInjectionError('The tab was closed')).toBe(true);
    });

    it('should identify non-recoverable errors', () => {
      expect(isRecoverableInjectionError('SyntaxError: unexpected token')).toBe(false);
      expect(isRecoverableInjectionError('Unknown error')).toBe(false);
    });
  });

  describe('injectAndExecute', () => {
    it('should inject files successfully', async () => {
      chrome.scripting.executeScript.mockImplementation((opts, verifyResult) => verifyResult([]));

      await service.injectAndExecute(1, ['file.js']);

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId: 1 },
          files: ['file.js'],
        }),
        expect.any(Function)
      );
    });

    it('should execute function successfully', async () => {
      chrome.scripting.executeScript.mockImplementation((opts, verifyResult) =>
        verifyResult([{ result: 'foo' }])
      );

      const func = () => 'foo';
      const result = await service.injectAndExecute(1, [], func, { returnResult: true });

      expect(result).toBe('foo');
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId: 1 },
          func,
        }),
        expect.any(Function)
      );
    });

    it('should handle injection errors', async () => {
      chrome.runtime.lastError = { message: 'Injection failed' };
      chrome.scripting.executeScript.mockImplementation((opts, cb) => cb());

      await expect(service.injectAndExecute(1, ['file.js'])).rejects.toThrow('Injection failed');
    });

    it('should resolve recoverable errors without throwing', async () => {
      chrome.runtime.lastError = { message: 'Cannot access contents of page' };
      chrome.scripting.executeScript.mockImplementation((opts, cb) => cb());

      await expect(service.injectAndExecute(1, ['file.js'])).resolves.toBeUndefined();
      // Default logErrors is true, recoverable error should log warn
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('injectHighlighter', () => {
    it('should inject highlighter bundle', async () => {
      chrome.scripting.executeScript.mockImplementation((opts, verifyResult) => verifyResult([]));

      // Mock window for the callback function (note: this is tricky since callback runs in node context for this test)
      // For this test, we just check executeScript is called with correct file

      // We skip testing the callback logic here since it relies on window/setTimeout which is hard to unit test in isolation without jsdom setup for 'func' execution context simulation
      // Integrating executeScript callback logic testing usually requires more complex mocking.
      // We will assume injectAndExecute covers the mechanism.

      await service.injectHighlighter(1);

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          files: ['dist/highlighter-v2.bundle.js'],
        }),
        expect.any(Function)
      );
    });
  });
});
