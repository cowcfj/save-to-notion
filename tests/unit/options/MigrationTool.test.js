/**
 * @jest-environment jsdom
 */
/* global document */
import { MigrationTool } from '../../../scripts/options/MigrationTool.js';
import { UIManager } from '../../../scripts/options/UIManager.js';
import { MigrationScanner } from '../../../scripts/options/MigrationScanner.js';

// Mock dependencies
jest.mock('../../../scripts/options/UIManager.js');
jest.mock('../../../scripts/options/MigrationScanner.js');

describe('MigrationTool', () => {
  let migrationTool = null;
  let mockUiManager = null;
  let mockScanner = null;

  beforeEach(() => {
    // DOM Setup
    document.body.innerHTML = `
      <button id="scan-legacy-button"></button>
      <div id="scan-status"></div>
      <div id="migration-list"></div>
      <button id="migrate-all-button"></button>
    `;

    mockUiManager = new UIManager();
    mockUiManager.showStatus = jest.fn();

    // Mock scanner instance
    mockScanner = {
      scanStorage: jest.fn(),
    };

    MigrationScanner.requestBatchMigration = jest.fn();

    MigrationScanner.mockImplementation(() => mockScanner);

    migrationTool = new MigrationTool(mockUiManager);
    migrationTool.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('scanForLegacyHighlights', () => {
    test('成功掃描並找到舊版標註', async () => {
      const mockResult = {
        needsMigration: true,
        legacyCount: 5,
        items: [
          { url: 'https://example.com', highlightCount: 3 },
          { url: 'https://test.com', highlightCount: 2 },
        ],
      };

      mockScanner.scanStorage.mockResolvedValueOnce(mockResult);

      await migrationTool.scanForLegacyHighlights();

      expect(mockScanner.scanStorage).toHaveBeenCalled();

      const scanStatus = document.getElementById('scan-status');
      expect(scanStatus.innerHTML).toContain('2 個頁面');
      expect(scanStatus.innerHTML).toContain('5 個舊版標記');
    });

    test('掃描未發現舊版標註', async () => {
      const mockResult = {
        needsMigration: false,
        legacyCount: 0,
        items: [],
      };

      mockScanner.scanStorage.mockResolvedValueOnce(mockResult);

      await migrationTool.scanForLegacyHighlights();

      const scanStatus = document.getElementById('scan-status');
      expect(scanStatus.textContent).toContain('未發現舊版格式');
    });

    test('處理掃描錯誤', async () => {
      mockScanner.scanStorage.mockRejectedValueOnce(new Error('Scan failed'));

      await migrationTool.scanForLegacyHighlights();

      const scanStatus = document.getElementById('scan-status');
      expect(scanStatus.textContent).toContain('掃描錯誤');
      expect(scanStatus.textContent).toContain('Scan failed');
    });
  });

  describe('performMigration', () => {
    beforeEach(() => {
      // Setup a scan result first
      migrationTool.scanResult = {
        needsMigration: true,
        items: [
          { url: 'https://example.com', highlightCount: 3 },
          { url: 'https://test.com', highlightCount: 2 },
        ],
      };
    });

    test('成功遷移所有頁面', async () => {
      const mockMigrationResult = {
        success: 2,
        failed: 0,
        errors: [],
      };

      MigrationScanner.requestBatchMigration.mockResolvedValueOnce(mockMigrationResult);

      await migrationTool.performMigration();

      expect(MigrationScanner.requestBatchMigration).toHaveBeenCalledWith(
        ['https://example.com', 'https://test.com'],
        expect.any(Function)
      );

      const scanStatus = document.getElementById('scan-status');
      expect(scanStatus.innerHTML).toContain('遷移成功');
      expect(scanStatus.innerHTML).toContain('2 個頁面');
    });

    test('部分遷移成功', async () => {
      const mockMigrationResult = {
        success: 1,
        failed: 1,
        errors: ['Failed to migrate https://test.com'],
      };

      MigrationScanner.requestBatchMigration.mockResolvedValueOnce(mockMigrationResult);

      await migrationTool.performMigration();

      const scanStatus = document.getElementById('scan-status');
      expect(scanStatus.innerHTML).toMatch(/遷移部分完成|部分完成/u);
      expect(scanStatus.innerHTML).toContain('成功: 1');
      expect(scanStatus.innerHTML).toContain('失敗: 1');
    });

    test('沒有掃描結果時不執行遷移', async () => {
      migrationTool.scanResult = null;

      await migrationTool.performMigration();

      expect(MigrationScanner.requestBatchMigration).not.toHaveBeenCalled();
    });
  });

  describe('renderMigrationList', () => {
    test('渲染遷移列表', () => {
      const items = [
        {
          url: 'https://very-long-example-url-to-test-truncation.com/path/to/page',
          highlightCount: 3,
        },
        { url: 'https://test.com', highlightCount: 2 },
      ];

      migrationTool.renderMigrationList(items);

      const migrationList = document.getElementById('migration-list');
      expect(migrationList.innerHTML).toContain('3 個標註');
      expect(migrationList.innerHTML).toContain('2 個標註');
      expect(migrationList.innerHTML).toContain('待遷移頁面');
    });

    test('空列表清空內容', () => {
      migrationTool.renderMigrationList([]);

      const migrationList = document.getElementById('migration-list');
      expect(migrationList.innerHTML).toBe('');
    });
  });

  describe('truncateUrl', () => {
    test('截斷過長的 URL', () => {
      const longUrl = 'https://example.com/very/long/path/to/some/resource/that/exceeds/the/limit';
      const truncated = MigrationTool.truncateUrl(longUrl, 60);

      expect(truncated.length).toBeLessThanOrEqual(60);
      expect(truncated).toContain('...');
    });

    test('保留短 URL 不變', () => {
      const shortUrl = 'https://example.com';
      const result = MigrationTool.truncateUrl(shortUrl, 60);

      expect(result).toBe(shortUrl);
    });
  });
});
