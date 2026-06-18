/**
 * @jest-environment jsdom
 */

jest.mock('../../../pages/options/confirmDialog.js', () => ({
  confirmDialog: jest.fn().mockResolvedValue(true),
}));

import { initCloudSyncController } from '../../../pages/options/DriveCloudSyncController.js';
import * as driveClient from '../../../scripts/auth/driveClient.js';
import { RUNTIME_ACTIONS } from '../../../scripts/config/shared/runtimeActions.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
import Logger from '../../../scripts/utils/Logger.js';
import { sanitizeApiError } from '../../../scripts/utils/ApiErrorSanitizer.js';

import {
  flushAsyncWork,
  LOCAL_INSTALLATION_ID,
  CROSS_INSTALL_SNAPSHOT,
  setupCloudSyncDom,
  installChromeMock,
  setupConfirmDialogMock,
  spyOnDriveClientDefaults,
  getConfirmDialogMock,
} from './DriveCloudSyncController.shared.js';

describe('DriveCloudSyncController', () => {
  let mockSendMessage;
  let loggerErrorSpy;
  let loggerWarnSpy;

  beforeEach(() => {
    jest.useFakeTimers();
    setupCloudSyncDom();
    mockSendMessage = jest.fn().mockResolvedValue({ success: true });
    installChromeMock(mockSendMessage, {});
    loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => {});
    loggerWarnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    setupConfirmDialogMock();
    spyOnDriveClientDefaults();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete globalThis.chrome;
  });

  describe('Upload preflight cross-install confirm', () => {
    beforeEach(async () => {
      // 基礎連線狀態：已連線
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'user@test.dev',
        installationId: LOCAL_INSTALLATION_ID,
      });
      await initCloudSyncController(true);
    });

    it.each([
      {
        name: '偵測跨安裝且使用者取消時，不應送出 DRIVE_SYNC_MANUAL_UPLOAD',
        confirmResult: false,
        expectUpload: false,
      },
      {
        name: '偵測跨安裝且使用者確認時，應送出 DRIVE_SYNC_MANUAL_UPLOAD',
        confirmResult: true,
        expectUpload: true,
      },
    ])('$name', async ({ confirmResult, expectUpload }) => {
      expect.hasAssertions();
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({ ...CROSS_INSTALL_SNAPSHOT });
      getConfirmDialogMock().mockResolvedValueOnce(confirmResult);
      mockSendMessage.mockResolvedValueOnce({ success: true });

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      const uploadMessage = expect.objectContaining({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
      });
      if (expectUpload) {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
            force: false,
          })
        );
      } else {
        expect(mockSendMessage).not.toHaveBeenCalledWith(uploadMessage);
      }
    });

    it('metadata 缺 installation id 時 preflight 會先建立 identity 再判斷跨安裝', async () => {
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'user@test.dev',
        installationId: null,
      });
      driveClient.ensureDriveSyncIdentity.mockResolvedValue(LOCAL_INSTALLATION_ID);
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({ ...CROSS_INSTALL_SNAPSHOT });
      getConfirmDialogMock().mockResolvedValueOnce(false);

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(driveClient.ensureDriveSyncIdentity).toHaveBeenCalled();
      expect(getConfirmDialogMock()).toHaveBeenCalledWith({
        title: UI_MESSAGES.CLOUD_SYNC.CONFIRM_CROSS_INSTALL_UPLOAD_TITLE,
        message: UI_MESSAGES.CLOUD_SYNC.CONFIRM_CROSS_INSTALL_UPLOAD,
        confirmLabel: UI_MESSAGES.CLOUD_SYNC.CONFIRM_CROSS_INSTALL_UPLOAD_OK,
        cancelLabel: UI_MESSAGES.CLOUD_SYNC.CONFIRM_CROSS_INSTALL_UPLOAD_CANCEL,
        danger: true,
      });
      expect(mockSendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD })
      );
    });

    it('preflight 確認期間應先禁用按鈕，取消後恢復互動', async () => {
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({ ...CROSS_INSTALL_SNAPSHOT });

      const uploadBtn = document.querySelector('#drive-upload-button');
      const overlay = document.querySelector('#drive-loading-overlay');
      let isDisabledDuringConfirm = null;
      let isOverlayVisibleDuringConfirm = null;
      getConfirmDialogMock().mockImplementationOnce(() => {
        isDisabledDuringConfirm = uploadBtn.disabled;
        isOverlayVisibleDuringConfirm = !overlay.classList.contains('hidden');
        return Promise.resolve(false);
      });

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(mockSendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD })
      );
      expect(isDisabledDuringConfirm).toBe(true);
      expect(isOverlayVisibleDuringConfirm).toBe(true);
      expect(uploadBtn.disabled).toBe(false);
      expect(overlay.classList.contains('hidden')).toBe(true);
    });

    it('preflight 查詢失敗時，仍應送出 DRIVE_SYNC_MANUAL_UPLOAD（fail-open）', async () => {
      driveClient.fetchDriveSnapshotStatus.mockRejectedValueOnce(new Error('NETWORK_ERROR'));
      mockSendMessage.mockResolvedValueOnce({ success: true });

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[CloudSync] Upload preflight check failed, continuing upload',
        expect.any(Object)
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
          force: false,
        })
      );
    });

    it('identity 初始化失敗時應阻止 upload 並顯示錯誤', async () => {
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({ ...CROSS_INSTALL_SNAPSHOT });
      driveClient.ensureDriveSyncIdentity.mockRejectedValueOnce(new Error('IDENTITY_ERROR'));
      mockSendMessage.mockResolvedValueOnce({ success: true });

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        '[CloudSync] Drive Sync identity initialization failed',
        expect.objectContaining({
          error: sanitizeApiError(new Error('IDENTITY_ERROR'), 'drive_sync_identity_init'),
        })
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
      expect(mockSendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({
          action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
        })
      );
    });

    it('同一安裝 ID 時不顯示 confirm dialog，直接上傳', async () => {
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: 'time',
        size: null,
        sourceInstallationId: LOCAL_INSTALLATION_ID,
        sourceProfileId: null,
      });
      driveClient.ensureDriveSyncIdentity.mockResolvedValueOnce(LOCAL_INSTALLATION_ID);
      mockSendMessage.mockResolvedValueOnce({ success: true });

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      // confirm 只會被 download 的初始 setup 呼叫，不應有 CROSS_INSTALL 訊息
      expect(getConfirmDialogMock()).not.toHaveBeenCalledWith(
        expect.objectContaining({ message: UI_MESSAGES.CLOUD_SYNC.CONFIRM_CROSS_INSTALL_UPLOAD })
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD })
      );
    });
  });
});
