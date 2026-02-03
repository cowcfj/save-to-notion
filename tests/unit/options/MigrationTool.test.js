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
    // DOM Setup - 匹配 options.html 中的結構
    document.body.innerHTML = `
      <button id="migration-scan-button"></button>
      <div id="scan-status"></div>
      <div id="migration-list" style="display: none">
        <div class="list-header">
          <label><input type="checkbox" id="migration-select-all" /> 全選</label>
          <span id="migration-selected-count">0 項</span>
        </div>
        <div id="migration-items" class="list-body"></div>
        <div class="list-actions">
          <button id="migration-execute-button" class="btn-primary" disabled>遷移</button>
          <button id="migration-delete-button" class="btn-danger" disabled>刪除</button>
        </div>
      </div>
      <div id="migration-progress" style="display: none">
        <div class="progress-bar">
          <div id="migration-progress-bar" class="progress-fill"></div>
        </div>
        <span id="migration-progress-text">0%</span>
      </div>
      <div id="migration-result"></div>
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

      const scanStatus = document.querySelector('#scan-status');
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

      const scanStatus = document.querySelector('#scan-status');
      expect(scanStatus.textContent).toContain('未發現舊版格式');
    });

    test('處理掃描錯誤', async () => {
      mockScanner.scanStorage.mockRejectedValueOnce(new Error('Scan failed'));

      await migrationTool.scanForLegacyHighlights();

      const scanStatus = document.querySelector('#scan-status');
      expect(scanStatus.textContent).toContain('掃描錯誤');
      expect(scanStatus.textContent).toContain('發生未知錯誤，請稍後再試');
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

      // 新版代碼將項目渲染到 #migration-items
      const migrationItems = document.querySelector('#migration-items');
      expect(migrationItems.innerHTML).toContain('3 個標註');
      expect(migrationItems.innerHTML).toContain('2 個標註');
      // 新版列表項目應包含 checkbox
      expect(migrationItems.innerHTML).toContain('type="checkbox"');
    });

    test('空列表顯示空狀態', () => {
      migrationTool.renderMigrationList([]);

      const migrationItems = document.querySelector('#migration-items');
      expect(migrationItems.innerHTML).toContain('沒有找到舊版數據');
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

describe('MigrationTool Extended', () => {
  let migrationTool = null;
  let mockUiManager = null;
  let mockScanner = null;

  beforeEach(() => {
    document.body.innerHTML = `
      <button id="migration-scan-button"></button>
      <div id="scan-status"></div>
      <div id="migration-list" style="display: none">
        <div class="list-header">
          <label><input type="checkbox" id="migration-select-all" /> 全選</label>
          <span id="migration-selected-count">0 項</span>
        </div>
        <div id="migration-items" class="list-body"></div>
        <div class="list-actions">
          <button id="migration-execute-button" class="btn-primary" disabled>遷移</button>
          <button id="migration-delete-button" class="btn-danger" disabled>刪除</button>
        </div>
      </div>
      <div id="migration-progress" style="display: none">
        <div class="progress-bar">
          <div id="migration-progress-bar" class="progress-fill"></div>
        </div>
        <span id="migration-progress-text">0%</span>
      </div>
      <div id="migration-result"></div>
    `;

    mockUiManager = new UIManager();
    mockUiManager.showStatus = jest.fn();

    mockScanner = { scanStorage: jest.fn() };
    MigrationScanner.requestBatchMigration = jest.fn();
    MigrationScanner.mockImplementation(() => mockScanner);

    migrationTool = new MigrationTool(mockUiManager);
    migrationTool.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('init extended', () => {
    test('應初始化所有元素', () => {
      expect(migrationTool.elements.scanButton).toBeTruthy();
      expect(migrationTool.elements.migrationList).toBeTruthy();
      expect(migrationTool.elements.executeButton).toBeTruthy();
    });

    test('應設置事件監聽器', () => {
      const scanButton = document.querySelector('#migration-scan-button');
      expect(scanButton).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    test('空掃描結果應正確處理', async () => {
      mockScanner.scanStorage.mockResolvedValueOnce({
        needsMigration: false,
        legacyCount: 0,
        items: [],
      });

      await migrationTool.scanForLegacyHighlights();

      const migrationList = document.querySelector('#migration-list');
      expect(migrationList.style.display).toBe('none');
    });

    test('多次渲染應清除舊內容', () => {
      const items1 = [{ url: 'https://first.com', highlightCount: 1 }];
      const items2 = [{ url: 'https://second.com', highlightCount: 2 }];

      migrationTool.renderMigrationList(items1);
      migrationTool.renderMigrationList(items2);

      const migrationItems = document.querySelector('#migration-items');
      expect(migrationItems.innerHTML).not.toContain('first.com');
      expect(migrationItems.innerHTML).toContain('second.com');
    });

    test('大量項目渲染測試', () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        url: `https://example${i}.com`,
        highlightCount: i + 1,
      }));

      migrationTool.renderMigrationList(items);

      const migrationItems = document.querySelector('#migration-items');
      expect(migrationItems.innerHTML).toContain('example0.com');
      expect(migrationItems.innerHTML).toContain('example19.com');
    });
  });

  describe('truncateUrl extended', () => {
    test('應處理空 URL', () => {
      const result = MigrationTool.truncateUrl('', 60);
      expect(result).toBe('');
    });

    test('應處理臨界長度', () => {
      const url = 'a'.repeat(60);
      const result = MigrationTool.truncateUrl(url, 60);
      expect(result).toHaveLength(60);
    });
  });
});
