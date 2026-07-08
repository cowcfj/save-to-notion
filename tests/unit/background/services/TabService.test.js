/*
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/"}
 *
 * TabService constructor tests
 */

import { jest } from '@jest/globals';
import {
  createTabService,
  loadedTabServiceModules,
  mockInjectionService,
  mockLogger,
  resetTabServiceTestState,
} from './tabServiceTestHarness.js';

describe('TabService constructor', () => {
  let TabService = null;
  let Logger = null;
  let service = null;

  beforeEach(() => {
    ({ TabService, Logger } = loadedTabServiceModules);
    resetTabServiceTestState();
    service = createTabService();
  });

  describe('constructor', () => {
    it('should initialize with default options', async () => {
      const defaultService = new TabService();
      expect(defaultService.logger).toBe(Logger);
      expect(typeof defaultService.normalizeUrl).toBe('function');
      expect(typeof defaultService.getSavedPageData).toBe('function');

      // Call defaults to satisfy function coverage
      expect(defaultService.normalizeUrl('test')).toBe('test');
      expect(await defaultService.getSavedPageData()).toBeNull();
      expect(defaultService.isRestrictedUrl()).toBe(false);
      expect(defaultService.isRecoverableError()).toBe(false);
      expect(await defaultService.checkPageExists()).toBeNull();
      expect(await defaultService.getApiKey()).toBeNull();
      await expect(defaultService.clearPageState()).resolves.toBeUndefined();
      await expect(defaultService.setSavedPageData()).resolves.toBeUndefined();
    });

    it('should accept custom options', () => {
      expect(service.logger).toBe(mockLogger);
      expect(service.injectionService).toBe(mockInjectionService);
    });

    it('should forward options in fallback clearNotionStateWithRetry', async () => {
      const clearNotionState = jest
        .fn()
        .mockResolvedValue({ skipped: true, reason: 'pageId_mismatch' });
      const fallbackService = new TabService({ clearNotionState });
      const options = {
        source: 'TabService.test',
        expectedPageId: 'page-123',
      };

      const result = await fallbackService.clearNotionStateWithRetry(
        'https://example.com',
        options
      );

      expect(clearNotionState).toHaveBeenCalledWith('https://example.com', options);
      expect(result).toEqual({
        cleared: false,
        skipped: true,
        reason: 'pageId_mismatch',
        attempts: 1,
        recovered: false,
      });
    });

    it('should use the latest clearNotionState in fallback clearNotionStateWithRetry', async () => {
      const initialClearNotionState = jest.fn().mockResolvedValue({ cleared: true });
      const replacementClearNotionState = jest
        .fn()
        .mockResolvedValue({ skipped: true, reason: 'pageId_mismatch' });
      const fallbackService = new TabService({ clearNotionState: initialClearNotionState });
      const options = {
        source: 'TabService.test',
        expectedPageId: 'page-123',
      };

      fallbackService.clearNotionState = replacementClearNotionState;

      const result = await fallbackService.clearNotionStateWithRetry(
        'https://example.com',
        options
      );

      expect(initialClearNotionState).not.toHaveBeenCalled();
      expect(replacementClearNotionState).toHaveBeenCalledWith('https://example.com', options);
      expect(result).toEqual({
        cleared: false,
        skipped: true,
        reason: 'pageId_mismatch',
        attempts: 1,
        recovered: false,
      });
    });
  });
});
