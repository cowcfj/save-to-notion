/**
 * MigrationExecutor Unit Tests
 *
 * Tests for migration executor static methods and pure logic
 */

import { MigrationExecutor, MigrationPhase } from '../../../scripts/legacy/MigrationExecutor';

// Mock Logger
jest.mock('../../../scripts/utils/Logger', () => ({
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock color utils
jest.mock('../../../scripts/highlighter/utils/color', () => ({
  convertBgColorToName: jest.fn(bgColor => {
    const colorMap = {
      'rgb(255, 243, 205)': 'yellow',
      '#fff3cd': 'yellow',
      'rgb(212, 237, 218)': 'green',
      '#d4edda': 'green',
    };
    return colorMap[bgColor] || 'yellow';
  }),
}));

// Mock urlUtils
jest.mock('../../../scripts/utils/urlUtils', () => ({
  normalizeUrl: jest.fn(url => url),
}));

describe('MigrationExecutor', () => {
  describe('MigrationPhase', () => {
    it('should define all migration phases', () => {
      expect(MigrationPhase.NOT_STARTED).toBe('not_started');
      expect(MigrationPhase.PHASE_1_CREATED).toBe('phase_1');
      expect(MigrationPhase.PHASE_2_VERIFIED).toBe('phase_2');
      expect(MigrationPhase.COMPLETED).toBe('completed');
      expect(MigrationPhase.FAILED).toBe('failed');
    });
  });

  describe('constructor', () => {
    let executor;

    beforeEach(() => {
      executor = new MigrationExecutor();
    });

    it('should initialize statistics', () => {
      expect(executor.statistics).toEqual({
        oldHighlightsFound: 0,
        newHighlightsCreated: 0,
        verified: 0,
        removed: 0,
        failed: 0,
      });
    });

    it('should set correct storage keys', () => {
      expect(executor.storageKey).toBe('seamless_migration_state');
      expect(executor.migrationKey).toBe('highlight_migration_status');
    });
  });

  describe('checkBrowserSupport', () => {
    const originalCSS = global.CSS;

    afterEach(() => {
      global.CSS = originalCSS;
    });

    it('should return true when CSS Highlight API is supported', () => {
      global.CSS = { highlights: {} };
      expect(MigrationExecutor.checkBrowserSupport()).toBe(true);
    });

    it('should return false when CSS.highlights is missing', () => {
      global.CSS = {};
      expect(MigrationExecutor.checkBrowserSupport()).toBe(false);
    });
  });

  describe('convertColorToName', () => {
    it('should convert yellow RGB to yellow', () => {
      const result = MigrationExecutor.convertColorToName('rgb(255, 243, 205)');
      expect(result).toBe('yellow');
    });

    it('should convert yellow HEX to yellow', () => {
      const result = MigrationExecutor.convertColorToName('#fff3cd');
      expect(result).toBe('yellow');
    });

    it('should convert green RGB to green', () => {
      const result = MigrationExecutor.convertColorToName('rgb(212, 237, 218)');
      expect(result).toBe('green');
    });

    it('should convert green HEX to green', () => {
      const result = MigrationExecutor.convertColorToName('#d4edda');
      expect(result).toBe('green');
    });

    it('should return yellow for unknown colors', () => {
      const result = MigrationExecutor.convertColorToName('rgb(0, 0, 0)');
      expect(result).toBe('yellow');
    });
  });

  describe('getStatistics', () => {
    let executor;

    beforeEach(() => {
      global.CSS = { highlights: {} };
      executor = new MigrationExecutor();
    });

    afterEach(() => {
      delete global.CSS;
    });

    it('should return statistics object', () => {
      executor.statistics.oldHighlightsFound = 5;
      executor.statistics.newHighlightsCreated = 4;
      executor.statistics.verified = 3;
      executor.statistics.removed = 2;
      executor.statistics.failed = 1;

      const stats = executor.getStatistics();

      expect(stats.oldHighlightsFound).toBe(5);
      expect(stats.newHighlightsCreated).toBe(4);
      expect(stats.verified).toBe(3);
      expect(stats.removed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.supportsCSSHighlight).toBe(true);
    });

    it('should report CSS Highlight API support status', () => {
      global.CSS = {};
      const stats = executor.getStatistics();
      expect(stats.supportsCSSHighlight).toBe(false);
    });
  });
});
