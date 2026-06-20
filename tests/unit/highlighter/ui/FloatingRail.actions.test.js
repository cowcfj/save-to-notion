/**
 * FloatingRail actions unit tests.
 */

import {
  FloatingRail,
  UI_MESSAGES,
  ErrorHandler,
  sanitizeApiError,
  Logger,
  checkPageStatus,
  savePageFromRail,
  syncHighlights,
  openSidePanel,
  playLaunchAnimation,
  playFireworkAnimation,
  playFailAnimation,
  setupFloatingRailTestEnvironment,
  teardownFloatingRailTestEnvironment,
} from './FloatingRail.shared.js';

describe('FloatingRail actions', () => {
  let manager;

  beforeEach(() => {
    manager = setupFloatingRailTestEnvironment();
  });

  afterEach(() => {
    teardownFloatingRailTestEnvironment();
  });

  describe('save/sync action', () => {
    test('未保存頁面應呼叫 savePageFromRail', async () => {
      savePageFromRail.mockResolvedValue({ success: true });
      checkPageStatus.mockResolvedValue({ isSaved: false, canSave: true });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      expect(savePageFromRail).toHaveBeenCalled();
    });

    test('已保存頁面應呼叫 syncHighlights', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockResolvedValue({ success: true });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      expect(syncHighlights).toHaveBeenCalled();
    });

    test('保存成功應播放 launch → firework 動畫', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: false, canSave: true });
      savePageFromRail.mockResolvedValue({ success: true });

      const rail = new FloatingRail(manager);
      await rail.initialize();

      await rail._handleSaveSync();

      expect(playLaunchAnimation).toHaveBeenCalledWith(rail.elements.saveBtn);
      expect(playFireworkAnimation).toHaveBeenCalledWith(rail.elements.saveBtn);
      expect(playFailAnimation).not.toHaveBeenCalled();
    });

    test('保存失敗應播放 launch → fail 動畫', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: false, canSave: true });
      savePageFromRail.mockRejectedValue(new Error('network error'));

      const rail = new FloatingRail(manager);
      await rail.initialize();

      await rail._handleSaveSync();

      expect(playLaunchAnimation).toHaveBeenCalledWith(rail.elements.saveBtn);
      const errorTooltip = rail.container.querySelector('.rail-error-tooltip');
      expect(playFailAnimation).toHaveBeenCalledWith(
        rail.elements.saveBtn,
        errorTooltip,
        ErrorHandler.formatUserMessage(
          sanitizeApiError(new Error('network error'), 'rail_save_sync')
        )
      );
      expect(playFireworkAnimation).not.toHaveBeenCalled();
    });

    test.each([
      {
        name: 'syncHighlights 拋錯時警告 log 的 operation 必須是 syncHighlights',
        pageStatus: { isSaved: true, canSave: false },
        rejectRuntime: () => syncHighlights.mockRejectedValue(new Error('sync network error')),
        operation: 'syncHighlights',
      },
      {
        name: 'savePageFromRail 拋錯時警告 log 的 operation 必須是 savePageFromRail',
        pageStatus: { isSaved: false, canSave: true },
        rejectRuntime: () => savePageFromRail.mockRejectedValue(new Error('save network error')),
        operation: 'savePageFromRail',
      },
    ])('$name', async ({ pageStatus, rejectRuntime, operation }) => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      checkPageStatus.mockResolvedValue(pageStatus);
      rejectRuntime();

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 保存/同步失敗',
        expect.objectContaining({
          action: '_handleSaveSync',
          operation,
        })
      );
    });

    test('syncHighlights 回 success:false + errorCode UNAUTHORIZED → playFailAnimation', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockResolvedValue({ success: false, errorCode: 'UNAUTHORIZED', error: 'err' });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      const errorTooltip = rail.container.querySelector('.rail-error-tooltip');
      expect(playFailAnimation).toHaveBeenCalledWith(rail.elements.saveBtn, errorTooltip);
      expect(playFireworkAnimation).not.toHaveBeenCalled();
    });

    test.each([
      {
        name: 'syncHighlights 回 success:false + HIGHLIGHT_SECTION_DELETE_INCOMPLETE → 當成功（playFireworkAnimation）',
        response: {
          success: false,
          errorCode: 'HIGHLIGHT_SECTION_DELETE_INCOMPLETE',
          error: 'partial',
        },
      },
      {
        name: 'syncHighlights 回 success:true → playFireworkAnimation（既有行為）',
        response: { success: true },
      },
    ])('$name', async ({ response }) => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockResolvedValue(response);

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      expect(playFireworkAnimation).toHaveBeenCalledWith(rail.elements.saveBtn);
      expect(playFailAnimation).not.toHaveBeenCalled();
    });

    test.each([
      {
        name: 'PAGE_DELETED 錯誤應播放 fail 動畫並觸發 _refreshPageStatus',
        errorCode: 'PAGE_DELETED',
        failMessage: UI_MESSAGES.POPUP.DELETED_PAGE,
        shouldRefreshPageStatus: true,
      },
      {
        name: 'PAGE_DELETION_PENDING 錯誤應播放 fail 動畫且不觸發 _refreshPageStatus',
        errorCode: 'PAGE_DELETION_PENDING',
        failMessage: UI_MESSAGES.POPUP.DELETION_PENDING,
        shouldRefreshPageStatus: false,
      },
      {
        name: '一般錯誤應播放預設 fail 動畫且不觸發 _refreshPageStatus',
        errorCode: 'SOME_UNKNOWN_ERROR',
        failMessage: undefined,
        shouldRefreshPageStatus: false,
      },
    ])('$name', async ({ errorCode, failMessage, shouldRefreshPageStatus }) => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockResolvedValue({ success: false, errorCode });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      const refreshSpy = jest.spyOn(rail, '_refreshPageStatus');

      await rail._handleSaveSync();

      const errorTooltip = rail.container.querySelector('.rail-error-tooltip');
      const expectedFailArgs = [rail.elements.saveBtn, errorTooltip];
      if (failMessage !== undefined) {
        expectedFailArgs.push(failMessage);
      }

      expect(playFailAnimation).toHaveBeenCalledWith(...expectedFailArgs);
      if (shouldRefreshPageStatus) {
        expect(refreshSpy).toHaveBeenCalledTimes(1);
      } else {
        expect(refreshSpy).not.toHaveBeenCalled();
      }
      expect(playFireworkAnimation).not.toHaveBeenCalled();
    });

    test('syncHighlights 拋出可格式化錯誤時，fail 動畫應顯示友善訊息', async () => {
      checkPageStatus.mockResolvedValue({ isSaved: true, canSave: false });
      syncHighlights.mockRejectedValue({
        code: 'NETWORK_ERROR',
        message: 'network error',
      });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleSaveSync();

      const errorTooltip = rail.container.querySelector('.rail-error-tooltip');
      expect(playFailAnimation).toHaveBeenCalledWith(
        rail.elements.saveBtn,
        errorTooltip,
        ErrorHandler.formatUserMessage(
          sanitizeApiError({ code: 'NETWORK_ERROR', message: 'network error' }, 'rail_save_sync')
        )
      );
    });
  });

  describe('manage action', () => {
    test('應呼叫 openSidePanel', async () => {
      openSidePanel.mockResolvedValue({ success: true });

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleManage();

      expect(openSidePanel).toHaveBeenCalled();
    });

    test('openSidePanel 失敗時應記錄警告', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
      openSidePanel.mockRejectedValue(new Error('panel failed'));

      const rail = new FloatingRail(manager);
      await rail.initialize();
      await rail._handleManage();

      expect(warnSpy).toHaveBeenCalledWith(
        '[FloatingRail] 開啟 Side Panel 失敗',
        expect.objectContaining({
          action: '_handleManage',
          operation: 'openSidePanel',
        })
      );
    });
  });
});
