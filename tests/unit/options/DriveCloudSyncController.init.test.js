/**
 * @jest-environment jsdom
 */

jest.mock('../../../pages/options/confirmDialog.js', () => ({
  confirmDialog: jest.fn().mockResolvedValue(true),
}));

import {
  initCloudSyncController,
  renderCloudSyncCard,
} from '../../../pages/options/DriveCloudSyncController.js';
import * as driveClient from '../../../scripts/auth/driveClient.js';
import { RUNTIME_ACTIONS } from '../../../scripts/config/shared/runtimeActions.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
import Logger from '../../../scripts/utils/Logger.js';
import { sanitizeApiError } from '../../../scripts/utils/ApiErrorSanitizer.js';
import { DRIVE_SYNC_ERROR_CODES } from '../../../scripts/config/extension/driveSyncErrorCodes.js';

import {
  flushAsyncWork,
  DEFAULT_DISCONNECTED_CONNECTION,
  DEFAULT_EMPTY_SNAPSHOT,
  REMOTE_CONNECTED_AT,
  REMOTE_SNAPSHOT_UPDATED_AT,
  setupCloudSyncDom,
  installChromeMock,
  setupConfirmDialogMock,
  spyOnDriveClientDefaults,
  getConfirmDialogMock,
} from './DriveCloudSyncController.shared.js';

const UNKNOWN_USER_FACING_ERROR_MESSAGE = '發生未知錯誤，請稍後再試';
const BACKGROUND_NO_RESPONSE_USER_FACING_MESSAGE = '背景無回應';

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

  describe('initCloudSyncController', () => {
    it('sets up all button listeners correctly', async () => {
      await initCloudSyncController(true);

      // Connect Button
      document.querySelector('#drive-connect-button').click();
      expect(driveClient.startDriveOAuthFlow).toHaveBeenCalled();

      // Upload Button
      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
        force: false,
      });

      // Download Button
      mockSendMessage.mockClear();
      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD,
      });
      expect(getConfirmDialogMock()).toHaveBeenCalled();
    });

    it('download confirmation includes cloud snapshot time and source device summary', async () => {
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'restore@test.dev',
        installationId: 'local-install',
      });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValue({
        exists: true,
        updatedAt: '2026-04-20T09:30:00.000Z',
        size: 10,
        sourceInstallationId: 'remote-install',
        sourceProfileId: 'profile-1',
      });

      await initCloudSyncController(true);

      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();

      expect(getConfirmDialogMock()).toHaveBeenCalledWith(
        expect.objectContaining({
          title: UI_MESSAGES.CLOUD_SYNC.CONFIRM_DOWNLOAD_TITLE,
          message: expect.stringContaining('雲端備份時間：'),
          confirmLabel: UI_MESSAGES.CLOUD_SYNC.CONFIRM_DOWNLOAD_OK,
          cancelLabel: UI_MESSAGES.CLOUD_SYNC.CONFIRM_DOWNLOAD_CANCEL,
          danger: true,
        })
      );
      expect(getConfirmDialogMock()).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('來源裝置：其他裝置'),
        })
      );
    });

    it('download confirmation ensures local identity before resolving same-device source', async () => {
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'restore@test.dev',
      });
      driveClient.ensureDriveSyncIdentity.mockResolvedValue('remote-install');
      driveClient.fetchDriveSnapshotStatus.mockResolvedValue({
        exists: true,
        updatedAt: '2026-04-20T09:30:00.000Z',
        size: 10,
        sourceInstallationId: 'remote-install',
        sourceProfileId: 'profile-1',
      });

      await initCloudSyncController(true);

      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();

      expect(driveClient.ensureDriveSyncIdentity).toHaveBeenCalled();
      expect(getConfirmDialogMock()).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('來源裝置：此裝置'),
        })
      );
    });

    it('download confirmation falls back to unknown summary when status preflight fails', async () => {
      driveClient.fetchDriveSnapshotStatus.mockRejectedValue(new Error('status failed'));

      await initCloudSyncController(true);

      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();

      expect(getConfirmDialogMock()).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('雲端備份時間：未知'),
        })
      );
      expect(getConfirmDialogMock()).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('來源裝置：未知來源'),
        })
      );
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD,
      });
    });

    it('download confirmation falls back to unknown source when identity initialization fails', async () => {
      const identityError = new Error('IDENTITY_ERROR');
      driveClient.fetchDriveSnapshotStatus.mockResolvedValue({
        exists: true,
        updatedAt: '2026-04-20T09:30:00.000Z',
        size: 10,
        sourceInstallationId: 'remote-install',
        sourceProfileId: 'profile-1',
      });
      driveClient.ensureDriveSyncIdentity.mockRejectedValueOnce(identityError);

      await initCloudSyncController(true);

      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[CloudSync] Download identity initialization failed, continuing with unknown source',
        expect.objectContaining({
          error: sanitizeApiError(identityError, 'drive_download_identity_init'),
        })
      );
      expect(getConfirmDialogMock()).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('來源裝置：未知來源'),
        })
      );
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD,
      });
    });

    it('disables download actions while building the download confirmation summary', async () => {
      let resolveSnapshotStatus;
      const pendingSnapshotStatus = new Promise(resolve => {
        resolveSnapshotStatus = resolve;
      });
      driveClient.fetchDriveSnapshotStatus.mockImplementationOnce(() => pendingSnapshotStatus);

      await initCloudSyncController(true);

      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();

      expect(document.querySelector('#drive-loading-overlay').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-loading-text').textContent).toBe(
        UI_MESSAGES.CLOUD_SYNC.LOADING_STATUS_SYNC
      );
      expect(document.querySelector('#drive-download-button').disabled).toBe(true);
      expect(document.querySelector('#drive-conflict-download-button').disabled).toBe(true);

      resolveSnapshotStatus({
        ...DEFAULT_EMPTY_SNAPSHOT,
      });
      await flushAsyncWork();

      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD,
      });
    });

    it('shows an error when connect flow cannot start', async () => {
      driveClient.startDriveOAuthFlow.mockRejectedValue(new Error('popup blocked'));

      await initCloudSyncController(true);

      document.querySelector('#drive-connect-button').click();
      await flushAsyncWork();

      const safeMessage = sanitizeApiError(new Error('popup blocked'), 'drive_connect_start');
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        `${UI_MESSAGES.CLOUD_SYNC.CONNECT_FAILED_PREFIX}${UNKNOWN_USER_FACING_ERROR_MESSAGE}`
      );
      expect(document.querySelector('#drive-sync-status').textContent).not.toContain(
        'popup blocked'
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
      expect(loggerErrorSpy).toHaveBeenCalledWith('[CloudSync] Drive connect start failed', {
        error: safeMessage,
      });
    });

    it('does not trigger return sync on initial pageshow when not restored from bfcache', async () => {
      await initCloudSyncController(true);
      driveClient.fetchDriveConnectionStatus.mockClear();

      const pageshowEvent = new Event('pageshow');
      Object.defineProperty(pageshowEvent, 'persisted', {
        configurable: true,
        value: false,
      });

      globalThis.dispatchEvent(pageshowEvent);
      await flushAsyncWork();

      expect(driveClient.fetchDriveConnectionStatus).not.toHaveBeenCalled();
    });

    it('refreshes remote drive connection on pageshow only when restored from bfcache', async () => {
      driveClient.getDriveSyncMetadata
        .mockResolvedValueOnce({ connectionEmail: null })
        .mockResolvedValue({
          connectionEmail: 'pageshow@test.dev',
          connectedAt: REMOTE_CONNECTED_AT,
        });
      driveClient.fetchDriveConnectionStatus
        .mockResolvedValueOnce({ ...DEFAULT_DISCONNECTED_CONNECTION })
        .mockResolvedValueOnce({
          connected: true,
          email: 'pageshow@test.dev',
          connectedAt: REMOTE_CONNECTED_AT,
        });

      await initCloudSyncController(true);

      const pageshowEvent = new Event('pageshow');
      Object.defineProperty(pageshowEvent, 'persisted', {
        configurable: true,
        value: true,
      });

      globalThis.dispatchEvent(pageshowEvent);
      await flushAsyncWork();

      expect(driveClient.fetchDriveConnectionStatus).toHaveBeenCalledTimes(2);
      expect(driveClient.setDriveConnection).toHaveBeenCalledWith(
        {
          email: 'pageshow@test.dev',
          connectedAt: REMOTE_CONNECTED_AT,
        },
        expect.objectContaining({ resetConflicts: false })
      );
    });

    it('clears sync status without generic error when upload detects newer remote snapshot', async () => {
      driveClient.getDriveSyncMetadata.mockResolvedValue({});
      mockSendMessage.mockResolvedValueOnce({
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
      });

      await initCloudSyncController(true);

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(document.querySelector('#drive-error-banner').classList.contains('hidden')).toBe(true);
      expect(document.querySelector('#drive-sync-status').textContent).toBe('');
      expect(document.querySelector('#drive-sync-status').className).toBe('status-message');
    });

    it('shows an error when upload receives no response from background', async () => {
      mockSendMessage.mockResolvedValueOnce(undefined);

      await initCloudSyncController(true);

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        `${UI_MESSAGES.CLOUD_SYNC.UPLOAD_FAILED_PREFIX}${BACKGROUND_NO_RESPONSE_USER_FACING_MESSAGE}`
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
      expect(document.querySelector('#drive-loading-overlay').classList.contains('hidden')).toBe(
        true
      );
    });

    it.each([
      {
        name: 'upload',
        buttonSelector: '#drive-upload-button',
        logMessage: '[CloudSync] Upload failed',
        errorContext: 'drive_sync_upload',
      },
      {
        name: 'download',
        buttonSelector: '#drive-download-button',
        logMessage: '[CloudSync] Download failed',
        errorContext: 'drive_sync_download',
      },
    ])(
      'sanitizes $name errors before logging',
      async ({ buttonSelector, logMessage, errorContext }) => {
        expect.hasAssertions();
        mockSendMessage.mockRejectedValueOnce(new Error('unauthorized: API token is invalid'));

        await initCloudSyncController(true);

        document.querySelector(buttonSelector).click();
        await flushAsyncWork();

        expect(loggerErrorSpy).toHaveBeenCalledWith(logMessage, {
          error: sanitizeApiError(new Error('unauthorized: API token is invalid'), errorContext),
        });
      }
    );

    it('shows an error when download is rejected by background', async () => {
      mockSendMessage.mockResolvedValueOnce({
        success: false,
        error: DRIVE_SYNC_ERROR_CODES.NO_REMOTE_SNAPSHOT,
      });

      await initCloudSyncController(true);

      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();

      const safeMessage = sanitizeApiError(
        new Error(DRIVE_SYNC_ERROR_CODES.NO_REMOTE_SNAPSHOT),
        'drive_sync_download'
      );
      expect(safeMessage).toBe('UNKNOWN_ERROR');
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        `${UI_MESSAGES.CLOUD_SYNC.DOWNLOAD_FAILED_PREFIX}發生未知錯誤，請稍後再試`
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
      expect(document.querySelector('#drive-loading-overlay').classList.contains('hidden')).toBe(
        true
      );
    });

    it('skips download when user cancels confirmation', async () => {
      getConfirmDialogMock().mockResolvedValue(false);

      await initCloudSyncController(true);

      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();

      expect(mockSendMessage).not.toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD,
      });
      expect(document.querySelector('#drive-loading-overlay').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-download-button').disabled).toBe(false);
    });

    it('disconnect button should revoke remote connection, clear local metadata, and render disconnected state', async () => {
      driveClient.getDriveSyncMetadata
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ connectionEmail: null });

      await initCloudSyncController(true);

      renderCloudSyncCard({
        connectionEmail: 'connected@test.dev',
        connectedAt: '2026-04-20T00:00:00.000Z',
      });

      document.querySelector('#drive-disconnect-button').click();
      await flushAsyncWork();

      expect(driveClient.disconnectDrive).toHaveBeenCalled();
      expect(driveClient.clearDriveSyncMetadata).toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(document.querySelector('#drive-state-disconnected').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-state-connected').classList.contains('hidden')).toBe(
        true
      );
    });

    it('disconnect 成功後應顯示成功狀態並收起 loading overlay', async () => {
      driveClient.getDriveSyncMetadata
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ connectionEmail: null });

      await initCloudSyncController(true);

      document.querySelector('#drive-disconnect-button').click();
      await flushAsyncWork();

      expect(driveClient.disconnectDrive).toHaveBeenCalled();
      expect(driveClient.clearDriveSyncMetadata).toHaveBeenCalled();
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.DISCONNECT_SUCCESS
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('success');
      expect(document.querySelector('#drive-loading-overlay').classList.contains('hidden')).toBe(
        true
      );
    });

    it('shows an error when disconnect fails', async () => {
      driveClient.disconnectDrive.mockRejectedValue(new Error('network down'));

      await initCloudSyncController(true);

      document.querySelector('#drive-disconnect-button').click();
      await flushAsyncWork();

      expect(loggerErrorSpy).toHaveBeenCalledWith('[CloudSync] Disconnect failed', {
        error: sanitizeApiError(new Error('network down'), 'drive_disconnect'),
      });
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.DISCONNECT_FAILED
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
      expect(document.querySelector('#drive-loading-overlay').classList.contains('hidden')).toBe(
        true
      );
    });

    it('shows an error when disconnect confirmation cannot open', async () => {
      getConfirmDialogMock().mockRejectedValueOnce(new Error('dialog crashed'));

      await initCloudSyncController(true);

      document.querySelector('#drive-disconnect-button').click();
      await flushAsyncWork();

      expect(driveClient.disconnectDrive).not.toHaveBeenCalled();
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.DISCONNECT_FAILED
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
    });

    it('skips disconnect when user cancels confirmation', async () => {
      getConfirmDialogMock().mockResolvedValue(false);

      await initCloudSyncController(true);

      document.querySelector('#drive-disconnect-button').click();
      await flushAsyncWork();

      expect(driveClient.disconnectDrive).not.toHaveBeenCalled();
    });

    it('bypasses interaction if not logged in', async () => {
      await initCloudSyncController(false);
      expect(document.querySelector('#cloud-sync-card').classList.contains('hidden')).toBe(false);
      expect(document.querySelector('#drive-state-logged-out').classList.contains('hidden')).toBe(
        false
      );
      // Handlers not attached if not logged in initially (in actual implementation)
    });

    it('shows loading overlay during initialization and hides it after completion', async () => {
      let resolveConnectionStatus;
      driveClient.fetchDriveConnectionStatus.mockImplementation(() => {
        return new Promise(resolve => {
          resolveConnectionStatus = resolve;
        });
      });

      const initPromise = initCloudSyncController(true);

      // Loading overlay should be displayed immediately
      expect(document.querySelector('#drive-loading-overlay').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-loading-text').textContent).toBe(
        UI_MESSAGES.CLOUD_SYNC.LOADING_STATUS_SYNC
      );

      // Control buttons should be disabled during load
      expect(document.querySelector('#drive-connect-button').disabled).toBe(true);
      expect(document.querySelector('#drive-upload-button').disabled).toBe(true);

      // Resolve the mock promise to let initialization continue
      resolveConnectionStatus({ ...DEFAULT_DISCONNECTED_CONNECTION });

      await initPromise;

      // Loading overlay should be hidden after initialization completes
      expect(document.querySelector('#drive-loading-overlay').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-connect-button').disabled).toBe(false);
      expect(document.querySelector('#drive-upload-button').disabled).toBe(false);
    });

    it.each([
      {
        name: 'syncs remote drive connection on init',
        remoteStatus: {
          connected: true,
          email: 'remote@test.dev',
          connectedAt: REMOTE_CONNECTED_AT,
        },
        localMetadata: {
          connectionEmail: 'remote@test.dev',
          connectedAt: REMOTE_CONNECTED_AT,
        },
        expectedConnection: {
          email: 'remote@test.dev',
          connectedAt: REMOTE_CONNECTED_AT,
        },
        renderedEmail: 'remote@test.dev',
      },
      {
        name: 'server 未回傳 connectedAt 時保留既有本地 connectedAt，避免以空值覆寫 metadata',
        remoteStatus: {
          connected: true,
          email: 'no-ts@test.dev',
          connectedAt: null,
        },
        localMetadata: {
          connectionEmail: 'no-ts@test.dev',
          connectedAt: '2026-04-18T08:30:00.000Z',
        },
        expectedConnection: {
          email: 'no-ts@test.dev',
          connectedAt: '2026-04-18T08:30:00.000Z',
        },
      },
      {
        name: 'server 未回傳 connectedAt 且 email 不同時，不重用既有本地 connectedAt',
        now: '2026-04-21T10:20:30.000Z',
        remoteStatus: {
          connected: true,
          email: 'new-account@test.dev',
          connectedAt: null,
        },
        localMetadata: {
          connectionEmail: 'old-account@test.dev',
          connectedAt: '2026-04-18T08:30:00.000Z',
        },
        expectedConnection: {
          email: 'new-account@test.dev',
          connectedAt: '2026-04-21T10:20:30.000Z',
        },
      },
    ])('$name', async ({ now, remoteStatus, localMetadata, expectedConnection, renderedEmail }) => {
      expect.hasAssertions();
      if (now) {
        jest.setSystemTime(new Date(now));
      }
      driveClient.fetchDriveConnectionStatus.mockResolvedValue(remoteStatus);
      driveClient.getDriveSyncMetadata.mockResolvedValue(localMetadata);

      await initCloudSyncController(true);

      expect(driveClient.fetchDriveConnectionStatus).toHaveBeenCalled();
      expect(driveClient.setDriveConnection).toHaveBeenCalledWith(
        expectedConnection,
        expect.objectContaining({ resetConflicts: false })
      );
      if (renderedEmail) {
        expect(document.querySelector('#drive-connected-email').textContent).toBe(renderedEmail);
      }
    });

    it.each([
      {
        name: 'reconnect 後查詢遠端 snapshot 並寫入 lastKnownRemoteUpdatedAt',
        email: 'reconnect@test.dev',
        snapshotStatus: {
          exists: true,
          updatedAt: REMOTE_SNAPSHOT_UPDATED_AT,
          size: 1024,
        },
        localMetadata: {
          connectionEmail: 'reconnect@test.dev',
          lastKnownRemoteUpdatedAt: REMOTE_SNAPSHOT_UPDATED_AT,
        },
        expectedSnapshotWrite: REMOTE_SNAPSHOT_UPDATED_AT,
        expectedLastUploadText: UI_MESSAGES.CLOUD_SYNC.LAST_REMOTE_PREFIX,
        lastUploadTextMatcher: 'toContain',
      },
      {
        name: 'reconnect 時遠端無 snapshot → 顯示「尚未上載」且 lastKnownRemoteUpdatedAt 清為 null',
        email: 'empty-remote@test.dev',
        snapshotStatus: {
          exists: false,
          updatedAt: null,
          size: null,
        },
        localMetadata: {
          connectionEmail: 'empty-remote@test.dev',
        },
        expectedSnapshotWrite: null,
        expectedLastUploadText: UI_MESSAGES.CLOUD_SYNC.NEVER_UPLOADED,
        lastUploadTextMatcher: 'toBe',
      },
    ])(
      '$name',
      async ({
        email,
        snapshotStatus,
        localMetadata,
        expectedSnapshotWrite,
        expectedLastUploadText,
        lastUploadTextMatcher,
      }) => {
        expect.hasAssertions();
        driveClient.fetchDriveConnectionStatus.mockResolvedValue({
          connected: true,
          email,
          connectedAt: '2026-04-21T00:00:00Z',
        });
        driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce(snapshotStatus);
        const setSnapshotSpy = jest
          .spyOn(driveClient, 'setLastKnownRemoteUpdatedAt')
          .mockResolvedValue();
        driveClient.getDriveSyncMetadata.mockResolvedValue(localMetadata);

        await initCloudSyncController(true);

        const lastUploadText = document.querySelector('#drive-last-upload-text').textContent;
        expect(driveClient.fetchDriveSnapshotStatus).toHaveBeenCalled();
        expect(setSnapshotSpy).toHaveBeenCalledWith(expectedSnapshotWrite);
        if (lastUploadTextMatcher === 'toContain') {
          expect(lastUploadText).toContain(expectedLastUploadText);
        } else {
          expect(lastUploadText).toBe(expectedLastUploadText);
        }
      }
    );

    it('snapshot status 查詢失敗時不阻擋連線，且記錄 warn', async () => {
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: true,
        email: 'warn-path@test.dev',
        connectedAt: '2026-04-21T00:00:00Z',
      });
      driveClient.fetchDriveSnapshotStatus.mockRejectedValueOnce(new Error('TOKEN_EXPIRED'));
      const setSnapshotSpy = jest
        .spyOn(driveClient, 'setLastKnownRemoteUpdatedAt')
        .mockResolvedValue();
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'warn-path@test.dev',
      });

      await initCloudSyncController(true);

      expect(setSnapshotSpy).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[CloudSync] Snapshot status sync skipped',
        expect.objectContaining({
          error: expect.anything(),
        })
      );
      // 連線仍然成功
      expect(document.querySelector('#drive-connected-email').textContent).toBe(
        'warn-path@test.dev'
      );
      // 未 throw
      expect(document.querySelector('#drive-state-connected').classList.contains('hidden')).toBe(
        false
      );
    });

    it('falls back to disconnected state when remote sync fails', async () => {
      driveClient.fetchDriveConnectionStatus.mockRejectedValue(new Error('TOKEN_EXPIRED'));
      driveClient.getDriveSyncMetadata.mockResolvedValue({ connectionEmail: null });

      await expect(initCloudSyncController(true)).resolves.toBeUndefined();

      expect(loggerErrorSpy).toHaveBeenCalledWith('[CloudSync] Drive connection sync failed', {
        action: 'syncRemoteDriveConnection',
        error: sanitizeApiError(new Error('TOKEN_EXPIRED'), 'drive_connection_sync'),
      });
      expect(document.querySelector('#drive-state-disconnected').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-state-connected').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-state-conflict').classList.contains('hidden')).toBe(
        true
      );
    });

    it('initCloudSyncController 傳入 transientAuthError=true 時不應誤顯示已連線狀態', async () => {
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: true,
        email: 'stale@notion.so',
        connectedAt: '2026-04-20T00:00:00.000Z',
      });
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'stale@notion.so',
        connectedAt: '2026-04-20T00:00:00.000Z',
      });

      await initCloudSyncController(true, { transientAuthError: true });

      expect(document.querySelector('#drive-state-connected').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-state-disconnected').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-sync-status').textContent).toContain('臨時登入失效');
      expect(driveClient.fetchDriveConnectionStatus).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'refreshes remote drive connection when window regains focus',
        eventTarget: globalThis,
        eventName: 'focus',
        email: 'focus@test.dev',
      },
      {
        name: 'refreshes remote drive connection when page becomes visible again',
        eventTarget: document,
        eventName: 'visibilitychange',
        email: 'visible@test.dev',
        visibilityState: 'visible',
      },
    ])('$name', async ({ eventTarget, eventName, email, visibilityState }) => {
      expect.hasAssertions();
      driveClient.getDriveSyncMetadata.mockRestore();
      driveClient.setDriveConnection.mockRestore();

      driveClient.fetchDriveConnectionStatus
        .mockResolvedValueOnce({ ...DEFAULT_DISCONNECTED_CONNECTION })
        .mockResolvedValueOnce({
          connected: true,
          email,
          connectedAt: REMOTE_CONNECTED_AT,
        });

      if (visibilityState) {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: visibilityState,
        });
      }

      await initCloudSyncController(true);
      eventTarget.dispatchEvent(new Event(eventName));
      await flushAsyncWork();

      expect(driveClient.fetchDriveConnectionStatus).toHaveBeenCalledTimes(2);

      const storedMetadata = await driveClient.getDriveSyncMetadata();
      expect(storedMetadata.connectionEmail).toBe(email);
      expect(storedMetadata.connectedAt).toBe(REMOTE_CONNECTED_AT);
    });

    it('focus 觸發的 snapshot status 同步 MUST NOT 清除 needsManualReview / lastErrorCode', async () => {
      driveClient.getDriveSyncMetadata.mockRestore();
      driveClient.setDriveConnection.mockRestore();

      await chrome.storage.local.set({
        driveSyncConnectionEmail: 'conflict-safe@test.dev',
        driveSyncConnectedAt: '2026-04-19T11:00:00Z',
        driveSyncNeedsManualReview: true,
        driveSyncLastErrorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
      });

      driveClient.fetchDriveConnectionStatus
        .mockResolvedValueOnce({
          connected: true,
          email: 'conflict-safe@test.dev',
          connectedAt: null,
        })
        .mockResolvedValueOnce({
          connected: true,
          email: 'conflict-safe@test.dev',
          connectedAt: null,
        });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: REMOTE_SNAPSHOT_UPDATED_AT,
      });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: REMOTE_SNAPSHOT_UPDATED_AT,
      });

      await initCloudSyncController(true);

      globalThis.dispatchEvent(new Event('focus'));
      await flushAsyncWork();

      expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
        expect.objectContaining({
          driveSyncNeedsManualReview: false,
        })
      );

      const storedMetadata = await driveClient.getDriveSyncMetadata();
      expect(storedMetadata.needsManualReview).toBe(true);
      expect(storedMetadata.lastErrorCode).toBe(DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER);
      expect(storedMetadata.connectedAt).toBe('2026-04-19T11:00:00Z');

      expect(document.querySelector('#drive-state-conflict').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-state-connected').classList.contains('hidden')).toBe(
        true
      );
    });

    it('focus 首次連線且本地缺少 connectedAt 時才 fallback 為目前時間', async () => {
      jest.setSystemTime(new Date('2026-04-22T10:00:00.000Z'));
      driveClient.getDriveSyncMetadata.mockRestore();
      driveClient.setDriveConnection.mockRestore();

      driveClient.fetchDriveConnectionStatus
        .mockResolvedValueOnce({ ...DEFAULT_DISCONNECTED_CONNECTION })
        .mockResolvedValueOnce({
          connected: true,
          email: 'first-connect@test.dev',
          connectedAt: null,
        });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        ...DEFAULT_EMPTY_SNAPSHOT,
      });

      await initCloudSyncController(true);

      globalThis.dispatchEvent(new Event('focus'));
      await flushAsyncWork();

      const storedMetadata = await driveClient.getDriveSyncMetadata();
      expect(storedMetadata.connectionEmail).toBe('first-connect@test.dev');
      expect(storedMetadata.connectedAt).toBe('2026-04-22T10:00:00.000Z');
      expect(storedMetadata.needsManualReview).toBe(false);
    });

    it('uses conflict action buttons for download and force upload flows', async () => {
      await initCloudSyncController(true);

      mockSendMessage.mockClear();
      document.querySelector('#drive-conflict-download-button').click();
      await flushAsyncWork();
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD,
      });

      mockSendMessage.mockClear();
      getConfirmDialogMock().mockResolvedValueOnce(false);
      document.querySelector('#drive-conflict-force-upload-button').click();
      await flushAsyncWork();
      expect(mockSendMessage).not.toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
        force: true,
      });

      getConfirmDialogMock().mockResolvedValueOnce(true);
      document.querySelector('#drive-conflict-force-upload-button').click();
      await flushAsyncWork();
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
        force: true,
      });
    });

    it('shows an error when force upload confirmation cannot open', async () => {
      getConfirmDialogMock().mockRejectedValueOnce(new Error('dialog crashed'));

      await initCloudSyncController(true);

      document.querySelector('#drive-conflict-force-upload-button').click();
      await flushAsyncWork();

      expect(mockSendMessage).not.toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
        force: true,
      });
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        `${UI_MESSAGES.CLOUD_SYNC.UPLOAD_FAILED_PREFIX}${UNKNOWN_USER_FACING_ERROR_MESSAGE}`
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
    });
  });
});
