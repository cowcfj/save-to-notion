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
    let executor = null;

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
    let executor = null;

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

describe('MigrationExecutor Extended', () => {
  let executor = null;
  let mockChrome = null;
  let mockHighlightManager = null;

  beforeEach(() => {
    // Mock Chrome Storage API
    mockChrome = {
      storage: {
        local: {
          get: jest.fn(() => Promise.resolve({})),
          set: jest.fn(() => Promise.resolve()),
          remove: jest.fn(() => Promise.resolve()),
        },
      },
    };
    global.chrome = mockChrome;

    // Mock CSS Highlight API support
    global.CSS = { highlights: {} };

    // Mock HighlightManager
    mockHighlightManager = {
      addHighlight: jest.fn(() => 'mock-highlight-id'),
      getCount: jest.fn(() => 3),
    };

    // Note: window.location is already mocked by jsdom
    // The normalizeUrl mock handles URL normalization

    executor = new MigrationExecutor();
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    delete global.CSS;
  });

  describe('getMigrationState', () => {
    test('無狀態時應返回 NOT_STARTED', async () => {
      const state = await executor.getMigrationState();

      expect(state.phase).toBe(MigrationPhase.NOT_STARTED);
    });

    test('有狀態時應正確返回', async () => {
      const savedState = {
        phase: MigrationPhase.PHASE_1_CREATED,
        timestamp: Date.now(),
      };

      // jsdom 的預設 URL 是 http://localhost/
      mockChrome.storage.local.get.mockResolvedValue({
        'seamless_migration_state_http://localhost/': savedState,
      });

      const state = await executor.getMigrationState();

      expect(state.phase).toBe(MigrationPhase.PHASE_1_CREATED);
    });

    test('錯誤時應返回預設狀態', async () => {
      mockChrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const state = await executor.getMigrationState();

      expect(state.phase).toBe(MigrationPhase.NOT_STARTED);
    });
  });

  describe('updateMigrationState', () => {
    test('應正確保存狀態', async () => {
      await executor.updateMigrationState(MigrationPhase.PHASE_1_CREATED, { test: true });

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    test('錯誤時應記錄日誌', async () => {
      mockChrome.storage.local.set.mockRejectedValue(new Error('Save error'));

      await executor.updateMigrationState(MigrationPhase.COMPLETED);

      // 應該不拋出錯誤
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('needsMigration', () => {
    test('頁面無舊標註時應返回 false', async () => {
      const result = await executor.needsMigration();

      expect(result).toBe(false);
    });

    test('頁面有舊標註時應返回 true', async () => {
      document.body.innerHTML = '<span class="simple-highlight">test</span>';

      const result = await executor.needsMigration();

      expect(result).toBe(true);
      expect(executor.statistics.oldHighlightsFound).toBe(1);
    });

    test('已完成遷移時應返回 false', async () => {
      // jsdom 的預設 URL 是 http://localhost/
      mockChrome.storage.local.get.mockResolvedValue({
        'seamless_migration_state_http://localhost/': {
          phase: MigrationPhase.COMPLETED,
        },
      });

      document.body.innerHTML = '<span class="simple-highlight">test</span>';

      const result = await executor.needsMigration();

      expect(result).toBe(false);
    });
  });

  describe('migrate', () => {
    test('瀏覽器不支持時應跳過', async () => {
      global.CSS = {};

      const result = await executor.migrate(mockHighlightManager);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('browser_not_supported');
    });

    test('已完成時應返回 completed', async () => {
      // jsdom 的預設 URL 是 http://localhost/
      mockChrome.storage.local.get.mockResolvedValue({
        'seamless_migration_state_http://localhost/': {
          phase: MigrationPhase.COMPLETED,
        },
      });

      const result = await executor.migrate(mockHighlightManager);

      expect(result.completed).toBe(true);
    });

    test('超過最大重試次數應停止', async () => {
      // jsdom 的預設 URL 是 http://localhost/
      mockChrome.storage.local.get.mockResolvedValue({
        'seamless_migration_state_http://localhost/': {
          phase: MigrationPhase.FAILED,
          metadata: { retryCount: 3 },
        },
      });

      const result = await executor.migrate(mockHighlightManager);

      expect(result.error).toContain('max retries');
    });
  });

  describe('executePhase1', () => {
    test('無舊標註時應標記為完成', async () => {
      const result = await executor.executePhase1(mockHighlightManager);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('no_old_highlights');
    });

    test('有舊標註時應創建新標註', async () => {
      document.body.innerHTML = `
        <span class="simple-highlight" style="background-color: rgb(255, 243, 205);">
          Test highlight
        </span>
      `;

      const result = await executor.executePhase1(mockHighlightManager);

      expect(result.phase).toBe(MigrationPhase.PHASE_1_CREATED);
      expect(executor.statistics.oldHighlightsFound).toBe(1);
      expect(mockHighlightManager.addHighlight).toHaveBeenCalled();
    });
  });

  describe('executePhase2', () => {
    test('新標註未恢復時應回滾', async () => {
      document.body.innerHTML = '<span class="simple-highlight" data-migrated="true">Test</span>';
      executor.statistics.oldHighlightsFound = 1;
      mockHighlightManager.getCount.mockReturnValue(0);

      const result = await executor.executePhase2(mockHighlightManager);

      expect(result.rolledBack).toBe(true);
      expect(result.reason).toBe('verification_failed');
    });

    test('驗證成功時應進入 Phase 3', async () => {
      document.body.innerHTML = '<span class="simple-highlight" data-migrated="true">Test</span>';
      mockHighlightManager.getCount.mockReturnValue(1);

      const result = await executor.executePhase2(mockHighlightManager);

      expect(result.completed).toBe(true);
    });
  });

  describe('executePhase3', () => {
    test('應移除所有已遷移的 span', async () => {
      document.body.innerHTML = `
        <div id="container">
          <span class="simple-highlight" data-migrated="true">Test 1</span>
          <span class="simple-highlight" data-migrated="true">Test 2</span>
        </div>
      `;

      const result = await executor.executePhase3(mockHighlightManager);

      expect(result.completed).toBe(true);
      expect(executor.statistics.removed).toBe(2);
    });
  });

  describe('convertSpanToRange', () => {
    test('應正確轉換 span 為新標註', () => {
      document.body.innerHTML = `
        <span class="simple-highlight" style="background-color: rgb(255, 243, 205);">
          Test highlight
        </span>
      `;

      const span = document.querySelector('.simple-highlight');
      const result = MigrationExecutor.convertSpanToRange(span, mockHighlightManager);

      expect(result).not.toBeNull();
      expect(result.id).toBe('mock-highlight-id');
      expect(span.getAttribute('data-migrated')).toBe('true');
      expect(span.style.opacity).toBe('0');
    });

    test('添加標註失敗時應返回 null', () => {
      document.body.innerHTML = '<span class="simple-highlight">Test</span>';
      mockHighlightManager.addHighlight.mockReturnValue(null);

      const span = document.querySelector('.simple-highlight');
      const result = MigrationExecutor.convertSpanToRange(span, mockHighlightManager);

      expect(result).toBeNull();
    });
  });

  describe('removeOldSpan', () => {
    test('應正確移除 span 並保留內容', () => {
      document.body.innerHTML = '<div id="container"><span class="test">Hello</span> World</div>';

      const span = document.querySelector('.test');
      MigrationExecutor.removeOldSpan(span);

      const container = document.getElementById('container');
      expect(container.innerHTML).toBe('Hello World');
    });
  });

  describe('rollback', () => {
    test('應恢復舊標註的可見性', async () => {
      document.body.innerHTML = `
        <span class="simple-highlight" data-migrated="true" style="opacity: 0;">Test</span>
      `;

      const result = await executor.rollback('test_reason');

      expect(result.rolledBack).toBe(true);

      const span = document.querySelector('.simple-highlight');
      expect(span.style.opacity).toBe('1');
      expect(span.hasAttribute('data-migrated')).toBe(false);
    });
  });

  describe('cleanup', () => {
    test('應清理過期的遷移數據', async () => {
      const oldTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1000;

      mockChrome.storage.local.get.mockResolvedValue({
        'seamless_migration_state_https://oldpage.com': {
          phase: MigrationPhase.COMPLETED,
          timestamp: oldTimestamp,
        },
        highlight_migration_status_test: {},
      });

      await executor.cleanup();

      expect(mockChrome.storage.local.remove).toHaveBeenCalled();
    });

    test('錯誤時應不拋出異常', async () => {
      mockChrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      await expect(executor.cleanup()).resolves.not.toThrow();
    });
  });
});
