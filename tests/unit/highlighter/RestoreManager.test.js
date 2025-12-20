/**
 * RestoreManager 單元測試
 *
 * 測試標註恢復管理器的核心功能
 */

import { RestoreManager } from '../../../scripts/highlighter/core/RestoreManager.js';

describe('RestoreManager', () => {
  let mockManager = null;
  let mockToolbar = null;

  beforeEach(() => {
    // 重置 mock
    mockManager = {
      forceRestoreHighlights: jest.fn(),
    };
    mockToolbar = {
      hide: jest.fn(),
    };

    // Mock Logger
    global.Logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Mock setTimeout
    // Mock setTimeout
    // Review: Use legacy timers to avoid async/await issues
    jest.useFakeTimers({ legacyFakeTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('應該正確初始化屬性', () => {
      const restorer = new RestoreManager(mockManager, mockToolbar);

      expect(restorer.manager).toBe(mockManager);
      expect(restorer.toolbar).toBe(mockToolbar);
      expect(restorer.HIDE_TOOLBAR_DELAY_MS).toBe(500);
      expect(restorer.isRestored).toBe(false);
    });

    test('應該接受 toolbar 為 null', () => {
      const restorer = new RestoreManager(mockManager, null);

      expect(restorer.toolbar).toBeNull();
    });

    test('應該接受不傳 toolbar 參數', () => {
      const restorer = new RestoreManager(mockManager);

      expect(restorer.toolbar).toBeNull();
    });
  });

  describe('restore', () => {
    test('當 manager 未提供時應返回 false', async () => {
      const restorer = new RestoreManager(null, mockToolbar);

      const result = await restorer.restore();

      expect(result).toBe(false);
    });

    test('當 forceRestoreHighlights 不存在時應返回 false', async () => {
      const restorer = new RestoreManager({}, mockToolbar);

      const result = await restorer.restore();

      expect(result).toBe(false);
    });

    test('當恢復成功時應返回 true 並隱藏工具欄', async () => {
      mockManager.forceRestoreHighlights.mockResolvedValue(true);
      const restorer = new RestoreManager(mockManager, mockToolbar);

      const result = await restorer.restore();

      expect(result).toBe(true);
      expect(restorer.isRestored).toBe(true);

      // 快進 500ms
      jest.advanceTimersByTime(500);

      expect(mockToolbar.hide).toHaveBeenCalled();
    });

    test('當恢復失敗時應返回 false', async () => {
      mockManager.forceRestoreHighlights.mockResolvedValue(false);
      const restorer = new RestoreManager(mockManager, mockToolbar);

      const result = await restorer.restore();

      expect(result).toBe(false);
      expect(restorer.isRestored).toBe(false);
    });

    test('當恢復拋出異常時應返回 false', async () => {
      mockManager.forceRestoreHighlights.mockRejectedValue(new Error('Test error'));
      const restorer = new RestoreManager(mockManager, mockToolbar);

      const result = await restorer.restore();

      expect(result).toBe(false);
    });
  });

  describe('hideToolbarAfterRestore', () => {
    test('當 toolbar 不存在時不應拋出錯誤', () => {
      const restorer = new RestoreManager(mockManager, null);

      expect(() => restorer.hideToolbarAfterRestore()).not.toThrow();
    });

    test('當 toolbar.hide 不是函數時不應拋出錯誤', () => {
      const restorer = new RestoreManager(mockManager, {});

      expect(() => restorer.hideToolbarAfterRestore()).not.toThrow();
    });

    test('應該在 500ms 後呼叫 toolbar.hide', () => {
      const restorer = new RestoreManager(mockManager, mockToolbar);

      restorer.hideToolbarAfterRestore();

      expect(mockToolbar.hide).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500);

      expect(mockToolbar.hide).toHaveBeenCalledTimes(1);
    });

    test('當 hide 拋出錯誤時應該捕獲並記錄', () => {
      mockToolbar.hide.mockImplementation(() => {
        throw new Error('Hide error');
      });
      const restorer = new RestoreManager(mockManager, mockToolbar);

      restorer.hideToolbarAfterRestore();
      jest.advanceTimersByTime(500);

      // 不應拋出錯誤
      expect(mockToolbar.hide).toHaveBeenCalled();
    });
  });

  describe('hasRestored', () => {
    test('初始時應返回 false', () => {
      const restorer = new RestoreManager(mockManager, mockToolbar);

      expect(restorer.hasRestored()).toBe(false);
    });

    test('恢復成功後應返回 true', async () => {
      mockManager.forceRestoreHighlights.mockResolvedValue(true);
      const restorer = new RestoreManager(mockManager, mockToolbar);

      await restorer.restore();

      expect(restorer.hasRestored()).toBe(true);
    });
  });
});
