/*
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/"}
 *
 * TabService verification and deletion confirmation tests
 */

import { jest } from '@jest/globals';
import { createTabService, mockLogger, resetTabServiceTestState } from './tabServiceTestHarness.js';

describe('TabService verification and deletion confirmation', () => {
  const TEST_URL = 'https://example.com';
  const NOTION_PAGE_ID = 'page-123';
  let service = null;

  beforeEach(() => {
    resetTabServiceTestState();
    service = createTabService();
  });

  describe('Automatic Verification', () => {
    const mockExpiredPageData = (overrides = {}) => {
      const expiredData = {
        notionPageId: NOTION_PAGE_ID,
        lastVerifiedAt: Date.now() - 70_000, // 超過 60s
        ...overrides,
      };
      service.getSavedPageData = jest.fn().mockResolvedValue(expiredData);
      return expiredData;
    };

    const mockExpiredPageVerification = pageExists => {
      mockExpiredPageData();
      service.checkPageExists = jest.fn().mockResolvedValue(pageExists);
    };

    it('should verify with Notion when cache is expired', async () => {
      mockExpiredPageVerification(true);

      await service.updateTabStatus(1, TEST_URL);

      expect(service.checkPageExists).toHaveBeenCalledWith(NOTION_PAGE_ID, 'test-api-key');
      expect(service.setSavedPageData).toHaveBeenCalledWith(
        TEST_URL,
        expect.objectContaining({ lastVerifiedAt: expect.any(Number) })
      );
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 1 });
    });

    it('should clear local state only after two consecutive false checks', async () => {
      mockExpiredPageVerification(false);

      await service.updateTabStatus(1, TEST_URL);
      expect(service.clearNotionStateWithRetry).not.toHaveBeenCalled();

      await service.updateTabStatus(1, TEST_URL);
      expect(service.clearNotionStateWithRetry).toHaveBeenCalledWith(
        TEST_URL,
        expect.objectContaining({ source: 'TabService._handleNotionVerificationResult' })
      );
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
    });

    it('should preserve saved badge and avoid re-arming deletion when cleanup is skipped', async () => {
      mockExpiredPageVerification(false);
      service.clearNotionStateWithRetry = jest.fn().mockImplementation(async (_url, options) => {
        if (options?.expectedPageId === NOTION_PAGE_ID) {
          return {
            cleared: false,
            skipped: true,
            reason: 'pageId_mismatch',
            attempts: 1,
            recovered: false,
          };
        }

        return {
          cleared: true,
          attempts: 1,
          recovered: false,
        };
      });

      await service.updateTabStatus(1, TEST_URL);
      await service.updateTabStatus(1, TEST_URL);

      expect(service.clearNotionStateWithRetry).toHaveBeenCalledWith(
        TEST_URL,
        expect.objectContaining({
          source: 'TabService._handleNotionVerificationResult',
          expectedPageId: NOTION_PAGE_ID,
        })
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[TabService] 清理已略過：本機 Notion 綁定已變更',
        expect.objectContaining({
          action: 'autoSyncLocalState',
          pageId: 'page',
          reason: 'pageId_mismatch',
          result: 'cleanup_skipped',
        })
      );
      expect(service.deletionPendingPages.has(NOTION_PAGE_ID)).toBe(false);
      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '✓', tabId: 1 });
    });

    it('should fallback to cached status if verification fails', async () => {
      mockExpiredPageData({ pageId: '123' });
      service.checkPageExists = jest.fn().mockRejectedValue(new Error('Notion API Error'));

      await service.updateTabStatus(1, TEST_URL);

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 1 });
      // 依然顯示勾勾
    });

    it('failed cleanup re-arms pending deletion and keeps a clear failure', async () => {
      mockExpiredPageVerification(false);
      const cleanupError = new Error('cleanup failed');
      service.clearNotionStateWithRetry = jest.fn().mockResolvedValue({
        cleared: false,
        attempts: 2,
        recovered: false,
        error: cleanupError,
      });

      await service.updateTabStatus(1, TEST_URL);
      await service.updateTabStatus(1, TEST_URL);

      expect(service.clearNotionStateWithRetry).toHaveBeenCalledWith(
        TEST_URL,
        expect.objectContaining({
          source: 'TabService._handleNotionVerificationResult',
          expectedPageId: NOTION_PAGE_ID,
        })
      );
      expect(service.deletionPendingPages.has(NOTION_PAGE_ID)).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[TabService] 自動驗證失敗，跳過並保留當前狀態',
        expect.objectContaining({ error: cleanupError })
      );
      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '✓', tabId: 1 });
    });

    it('existing remote page refreshes verification timestamp and clears pending state', async () => {
      const now = 1_700_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      mockExpiredPageVerification(true);
      service.consumeDeletionConfirmation(NOTION_PAGE_ID, false);

      await service.updateTabStatus(1, TEST_URL);

      expect(service.deletionPendingPages.has(NOTION_PAGE_ID)).toBe(false);
      expect(service.setSavedPageData).toHaveBeenCalledWith(
        TEST_URL,
        expect.objectContaining({
          notionPageId: NOTION_PAGE_ID,
          lastVerifiedAt: now,
        })
      );
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 1 });
    });

    it('getApiKey 返回 null 時不應清除 deletionPendingPages（OAuth 用戶迴歸）', async () => {
      // 情境：用戶使用 OAuth 模式，TabService.getApiKey 錯誤地返回 null
      // 預期行為：pending 狀態應被保留，不應被清除
      mockExpiredPageData();
      service.getApiKey = jest.fn().mockResolvedValue(null); // 模擬 OAuth 用戶取不到 key

      // 先模擬 checkPageStatus 已將此頁面標記為 pending
      service.consumeDeletionConfirmation(NOTION_PAGE_ID, false);

      // 執行背景的 tab 狀態更新（由 onActivated / onUpdated 觸發）
      await service.updateTabStatus(1, TEST_URL);

      // 關鍵斷言：getApiKey 返回 null 時，不應重置 deletionPendingPages
      expect(service.deletionPendingPages.has(NOTION_PAGE_ID)).toBe(true);
      // badge 應仍顯示已保存
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 1 });
      // 不應呼叫 checkPageExists（因為沒有 apiKey）
      expect(service.checkPageExists).not.toHaveBeenCalled();
    });

    it('should skip Verification if notionPageId is missing', async () => {
      mockExpiredPageData({ notionPageId: undefined }); // 故意缺少 notionPageId

      await service.updateTabStatus(1, TEST_URL);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('No notionPageId in savedData')
      );
      expect(service.checkPageExists).not.toHaveBeenCalled();
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 1 });
    });

    it('should mark as pending on first deletion check failure', async () => {
      mockExpiredPageVerification(false);
      // 不 mock consumeDeletionConfirmation，讓它真實回傳 { deletionPending: true }

      await service.updateTabStatus(1, TEST_URL);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('First deletion check failed'),
        expect.objectContaining({
          pageId: 'page',
          action: 'autoSyncLocalState',
        })
      );
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 1 });
    });
  });

  describe('remote page missing confirmation API', () => {
    // 與 TabService 中 DELETION_CONFIRMATION_WINDOW_MS 一致（5 分鐘）
    const WINDOW_MS = 5 * 60 * 1000;

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('confirmRemotePageMissing should treat expired pending deletion as a new first failure', () => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1000 + WINDOW_MS + 1); // 窗口過期 +1ms

      expect(service.confirmRemotePageMissing('page-1')).toEqual({
        shouldDelete: false,
        deletionPending: true,
      });

      expect(service.confirmRemotePageMissing('page-1')).toEqual({
        shouldDelete: false,
        deletionPending: true,
      });
    });

    it('resetRemotePageMissingState should clear pending deletion state', () => {
      expect(service.confirmRemotePageMissing('page-1')).toEqual({
        shouldDelete: false,
        deletionPending: true,
      });

      expect(service.resetRemotePageMissingState('page-1')).toEqual({
        shouldDelete: false,
        deletionPending: false,
      });

      expect(service.confirmRemotePageMissing('page-1')).toEqual({
        shouldDelete: false,
        deletionPending: true,
      });
    });

    it('confirmRemotePageMissing should delete only on a second false within the confirmation window', () => {
      jest.spyOn(Date, 'now').mockReturnValue(10_000);

      expect(service.confirmRemotePageMissing('page-1')).toEqual({
        shouldDelete: false,
        deletionPending: true,
      });

      expect(service.confirmRemotePageMissing('page-1')).toEqual({
        shouldDelete: true,
        deletionPending: false,
      });
    });

    it('should treat pending deletion state as volatile after service re-instantiation', () => {
      jest.spyOn(Date, 'now').mockReturnValue(30_000);

      expect(service.confirmRemotePageMissing('page-1')).toEqual({
        shouldDelete: false,
        deletionPending: true,
      });

      const restartedService = createTabService();

      expect(restartedService.confirmRemotePageMissing('page-1')).toEqual({
        shouldDelete: false,
        deletionPending: true,
      });
      expect(restartedService.deletionPendingPages.has('page-1')).toBe(true);

      expect(restartedService.confirmRemotePageMissing('page-1')).toEqual({
        shouldDelete: true,
        deletionPending: false,
      });
    });

    it('consumeDeletionConfirmation should remain backward compatible', () => {
      jest.spyOn(Date, 'now').mockReturnValue(20_000);

      expect(service.consumeDeletionConfirmation('page-1', false)).toEqual({
        shouldDelete: false,
        deletionPending: true,
      });

      expect(service.consumeDeletionConfirmation('page-1', null)).toEqual({
        shouldDelete: false,
        deletionPending: false,
      });
    });
  });
});
