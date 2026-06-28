/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
import Logger from '../../../scripts/utils/Logger.js';
import { sanitizeApiError } from '../../../scripts/utils/ApiErrorSanitizer.js';

import {
  flushAsyncWork,
  DEFAULT_DISCONNECTED_CONNECTION,
  REMOTE_CONNECTED_AT,
  REMOTE_SNAPSHOT_UPDATED_AT,
  setupCloudSyncDom,
  installChromeMock,
  setupConfirmDialogMock,
  spyOnDriveClientDefaults,
} from './DriveCloudSyncController.shared.js';

let refreshCloudSyncCard;
let initCloudSyncController;
let driveClient;

describe('DriveCloudSyncController', () => {
  let mockSendMessage;
  let loggerErrorSpy;

  beforeAll(async () => {
    const controllerModule = await import('../../../pages/options/DriveCloudSyncController.js');
    refreshCloudSyncCard = controllerModule.refreshCloudSyncCard;
    initCloudSyncController = controllerModule.initCloudSyncController;
    driveClient = await import('../../../scripts/auth/driveClient.js');
  });

  beforeEach(() => {
    jest.useFakeTimers();
    setupCloudSyncDom();
    mockSendMessage = jest.fn().mockResolvedValue({ success: true });
    installChromeMock(mockSendMessage, {});
    loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => {});
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    setupConfirmDialogMock();
    spyOnDriveClientDefaults();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete globalThis.chrome;
  });

  describe('refreshCloudSyncCard', () => {
    it('fetches metadata and re-renders', async () => {
      driveClient.getDriveSyncMetadata.mockResolvedValue({ connectionEmail: 'mock@a.com' });
      await refreshCloudSyncCard();
      expect(document.querySelector('#drive-connected-email').textContent).toBe('mock@a.com');
    });

    it('can sync remote connection state before rendering', async () => {
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: true,
        email: 'fresh@a.com',
        connectedAt: REMOTE_CONNECTED_AT,
      });
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'fresh@a.com',
        connectedAt: REMOTE_CONNECTED_AT,
      });

      await refreshCloudSyncCard({ syncRemote: true });

      expect(driveClient.fetchDriveConnectionStatus).toHaveBeenCalled();
      expect(driveClient.setDriveConnection).toHaveBeenCalledWith(
        {
          email: 'fresh@a.com',
          connectedAt: REMOTE_CONNECTED_AT,
        },
        expect.objectContaining({ resetConflicts: false })
      );
      expect(document.querySelector('#drive-connected-email').textContent).toBe('fresh@a.com');
    });

    it('surfaces identity initialization failure separately during remote connection sync', async () => {
      const identityError = new Error('IDENTITY_ERROR');
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: true,
        email: 'fresh@a.com',
        connectedAt: REMOTE_CONNECTED_AT,
      });
      driveClient.ensureDriveSyncIdentity.mockRejectedValueOnce(identityError);
      driveClient.getDriveSyncMetadata.mockResolvedValue({ connectionEmail: null });

      await refreshCloudSyncCard({ syncRemote: true });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        '[CloudSync] Drive Sync identity initialization failed during connection sync',
        expect.objectContaining({
          action: 'syncRemoteDriveConnection',
          error: sanitizeApiError(identityError, 'drive_connection_identity_init'),
        })
      );
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.SYNC_FAILED_PREFIX
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
      expect(driveClient.setDriveConnection).not.toHaveBeenCalled();
    });

    it('clears local metadata when remote state reports disconnected', async () => {
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        ...DEFAULT_DISCONNECTED_CONNECTION,
      });
      driveClient.getDriveSyncMetadata.mockResolvedValue({ connectionEmail: null });

      await refreshCloudSyncCard({ syncRemote: true });

      expect(driveClient.clearDriveSyncMetadata).toHaveBeenCalled();
      expect(document.querySelector('#drive-state-disconnected').classList.contains('hidden')).toBe(
        false
      );
    });

    it('syncRemote:true 時同時查詢 snapshot status 並恢復雲端備份顯示', async () => {
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: true,
        email: 'refresh@test.dev',
        connectedAt: '2026-04-21T00:00:00Z',
      });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: REMOTE_SNAPSHOT_UPDATED_AT,
      });
      const setSnapshotSpy = jest
        .spyOn(driveClient, 'setLastKnownRemoteUpdatedAt')
        .mockResolvedValue();
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'refresh@test.dev',
        lastKnownRemoteUpdatedAt: REMOTE_SNAPSHOT_UPDATED_AT,
      });

      await refreshCloudSyncCard({ syncRemote: true });

      expect(setSnapshotSpy).toHaveBeenCalledWith(REMOTE_SNAPSHOT_UPDATED_AT);
      expect(document.querySelector('#drive-last-upload-text').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.LAST_REMOTE_PREFIX
      );
    });

    it('clears temporary success status message after timeout', async () => {
      driveClient.getDriveSyncMetadata
        .mockResolvedValueOnce({})
        .mockResolvedValue({ connectionEmail: 'done@test.dev' });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValue({
        exists: false,
        updatedAt: null,
        size: null,
        sourceInstallationId: null,
        sourceProfileId: null,
      });
      mockSendMessage.mockResolvedValueOnce({ success: true });

      await initCloudSyncController(true);

      document.querySelector('#drive-upload-button').click();
      // 等待 preflight + sendMessage 完成
      await flushAsyncWork();

      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.UPLOAD_SUCCESS
      );

      await jest.advanceTimersByTimeAsync(4000);

      expect(document.querySelector('#drive-sync-status').textContent).toBe('');
      expect(document.querySelector('#drive-sync-status').className).toBe('status-message');
    });

    it('clears prior status timeout before scheduling a new one', async () => {
      driveClient.getDriveSyncMetadata
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ connectionEmail: 'done@test.dev' });
      mockSendMessage.mockResolvedValueOnce({ success: true });

      await initCloudSyncController(true);

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.UPLOAD_SUCCESS
      );

      document.querySelector('#drive-disconnect-button').click();
      await flushAsyncWork();
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.DISCONNECT_SUCCESS
      );

      await jest.advanceTimersByTimeAsync(3999);
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.DISCONNECT_SUCCESS
      );

      await jest.advanceTimersByTimeAsync(1);
      expect(document.querySelector('#drive-sync-status').textContent).toBe('');
    });
  });
});
