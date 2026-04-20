/**
 * @jest-environment jsdom
 */

import {
  initCloudSyncController,
  setCloudSyncCardVisibility,
  renderCloudSyncCard,
  refreshCloudSyncCard,
} from '../../options/DriveCloudSyncController.js';
import * as driveClient from '../../scripts/auth/driveClient.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/runtimeActions.js';
import Logger from '../../scripts/utils/Logger.js';
import { sanitizeApiError } from '../../scripts/utils/securityUtils.js';

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(process.nextTick);
}

describe('DriveCloudSyncController', () => {
  let mockSendMessage;
  let loggerErrorSpy;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="cloud-sync-card">
        <div id="drive-state-disconnected"></div>
        <div id="drive-state-connected"></div>
        <div id="drive-state-conflict"></div>
        <div id="drive-error-banner">
          <div id="drive-error-code"></div>
          <div id="drive-error-time"></div>
        </div>
        <div id="drive-loading-overlay">
          <div id="drive-loading-text"></div>
        </div>
        <div id="drive-sync-status"></div>
        <div id="drive-connected-email"></div>
        <div id="drive-last-upload-text"></div>

        <button id="drive-connect-button"></button>
        <button id="drive-upload-button"></button>
        <button id="drive-download-button"></button>
        <button id="drive-disconnect-button"></button>
        <button id="drive-conflict-download-button"></button>
        <button id="drive-conflict-force-upload-button"></button>
      </div>
    `;

    mockSendMessage = jest.fn().mockResolvedValue({ success: true });
    globalThis.chrome = {
      runtime: {
        sendMessage: mockSendMessage,
      },
      storage: {
        local: {
          remove: jest.fn().mockResolvedValue(),
        },
      },
    };
    globalThis.Logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => {});
    globalThis.confirm = jest.fn().mockReturnValue(true);

    jest.spyOn(driveClient, 'getDriveSyncMetadata').mockResolvedValue({});
    jest.spyOn(driveClient, 'startDriveOAuthFlow').mockResolvedValue();
    jest.spyOn(driveClient, 'disconnectDrive').mockResolvedValue();
    jest.spyOn(driveClient, 'clearDriveSyncMetadata').mockResolvedValue();
    jest.spyOn(driveClient, 'fetchDriveConnectionStatus').mockResolvedValue({
      connected: false,
      email: null,
      connectedAt: null,
    });
    jest.spyOn(driveClient, 'setDriveConnection').mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setCloudSyncCardVisibility', () => {
    it('shows card if logged in', () => {
      setCloudSyncCardVisibility(true);
      expect(document.querySelector('#cloud-sync-card').style.display).toBe('');
    });

    it('hides card if logged out', () => {
      setCloudSyncCardVisibility(false);
      expect(document.querySelector('#cloud-sync-card').style.display).toBe('none');
    });
  });

  describe('renderCloudSyncCard', () => {
    it('renders disconnected state correctly', () => {
      renderCloudSyncCard({ connectionEmail: null });
      expect(document.querySelector('#drive-state-disconnected').style.display).toBe('');
      expect(document.querySelector('#drive-state-connected').style.display).toBe('none');
      expect(document.querySelector('#drive-state-conflict').style.display).toBe('none');
      expect(document.querySelector('#drive-error-banner').style.display).toBe('none');
    });

    it('renders connected state correctly without conflict', () => {
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        lastSuccessfulUploadAt: '2023-01-01T00:00:00Z',
        needsManualReview: false,
      });
      expect(document.querySelector('#drive-state-disconnected').style.display).toBe('none');
      expect(document.querySelector('#drive-state-connected').style.display).toBe('');
      expect(document.querySelector('#drive-state-conflict').style.display).toBe('none');

      expect(document.querySelector('#drive-connected-email').textContent).toBe('test@notion.so');
      expect(document.querySelector('#drive-last-upload-text').textContent).toContain('上次上載');
    });

    it('renders conflict state correctly', () => {
      // simulate conflict state
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        needsManualReview: true,
        lastErrorCode: 'REMOTE_SNAPSHOT_NEWER',
      });
      expect(document.querySelector('#drive-state-disconnected').style.display).toBe('none');
      expect(document.querySelector('#drive-state-connected').style.display).toBe('none');
      expect(document.querySelector('#drive-state-conflict').style.display).toBe('');

      // Error banner is hidden because REMOTE_SNAPSHOT_NEWER is considered conflict, not generic error
      expect(document.querySelector('#drive-error-banner').style.display).toBe('none');
    });

    it('renders other generic errors correctly', () => {
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        lastErrorCode: 'UPLOAD_FAILED',
        lastErrorAt: '2023-01-02T00:00:00Z',
      });
      expect(document.querySelector('#drive-error-banner').style.display).toBe('');
      expect(document.querySelector('#drive-error-code').textContent).toContain('UPLOAD_FAILED');
      expect(document.querySelector('#drive-error-time').textContent).toContain('發生時間');
    });

    it('falls back to raw timestamp when date formatting throws', () => {
      const toLocaleStringSpy = jest
        .spyOn(Date.prototype, 'toLocaleString')
        .mockImplementation(() => {
          throw new Error('format failed');
        });

      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        lastSuccessfulUploadAt: 'invalid-date-value',
        lastErrorCode: 'UPLOAD_FAILED',
        lastErrorAt: 'invalid-error-date',
      });

      expect(document.querySelector('#drive-last-upload-text').textContent).toContain(
        'invalid-date-value'
      );
      expect(document.querySelector('#drive-error-time').textContent).toContain(
        'invalid-error-date'
      );

      toLocaleStringSpy.mockRestore();
    });
  });

  describe('initCloudSyncController', () => {
    it('sets up all button listeners correctly', async () => {
      await initCloudSyncController(true);

      // Connect Button
      document.querySelector('#drive-connect-button').click();
      expect(driveClient.startDriveOAuthFlow).toHaveBeenCalled();

      // Upload Button
      document.querySelector('#drive-upload-button').click();
      await new Promise(process.nextTick);
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
        force: false,
      });

      // Download Button
      mockSendMessage.mockClear();
      document.querySelector('#drive-download-button').click();
      await new Promise(process.nextTick);
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD,
      });
      expect(globalThis.confirm).toHaveBeenCalled();
    });

    it('shows an error when connect flow cannot start', async () => {
      driveClient.startDriveOAuthFlow.mockRejectedValue(new Error('popup blocked'));

      await initCloudSyncController(true);

      document.querySelector('#drive-connect-button').click();
      await flushAsyncWork();

      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        '連接失敗：popup blocked'
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
    });

    it('clears sync status without generic error when upload detects newer remote snapshot', async () => {
      driveClient.getDriveSyncMetadata.mockResolvedValue({});
      mockSendMessage.mockResolvedValueOnce({
        success: false,
        errorCode: 'REMOTE_SNAPSHOT_NEWER',
      });

      await initCloudSyncController(true);

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(document.querySelector('#drive-error-banner').style.display).toBe('none');
      expect(document.querySelector('#drive-sync-status').textContent).toBe('');
      expect(document.querySelector('#drive-sync-status').className).toBe('status-message');
    });

    it('shows an error when upload receives no response from background', async () => {
      mockSendMessage.mockResolvedValueOnce(undefined);

      await initCloudSyncController(true);

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        '上載失敗：背景無回應'
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
      expect(document.querySelector('#drive-loading-overlay').style.display).toBe('none');
    });

    it('sanitizes upload errors before logging', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('unauthorized: API token is invalid'));

      await initCloudSyncController(true);

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(loggerErrorSpy).toHaveBeenCalledWith('[CloudSync] Upload failed', {
        error: sanitizeApiError(
          new Error('unauthorized: API token is invalid'),
          'drive_sync_upload'
        ),
      });
    });

    it('shows an error when download is rejected by background', async () => {
      mockSendMessage.mockResolvedValueOnce({
        success: false,
        error: 'NO_REMOTE_SNAPSHOT',
      });

      await initCloudSyncController(true);

      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();

      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        '還原失敗：NO_REMOTE_SNAPSHOT'
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
      expect(document.querySelector('#drive-loading-overlay').style.display).toBe('none');
    });

    it('sanitizes download errors before logging', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('unauthorized: API token is invalid'));

      await initCloudSyncController(true);

      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();

      expect(loggerErrorSpy).toHaveBeenCalledWith('[CloudSync] Download failed', {
        error: sanitizeApiError(
          new Error('unauthorized: API token is invalid'),
          'drive_sync_download'
        ),
      });
    });

    it('skips download when user cancels confirmation', async () => {
      globalThis.confirm.mockReturnValue(false);

      await initCloudSyncController(true);

      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();

      expect(mockSendMessage).not.toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD,
      });
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
      await Promise.resolve();
      await Promise.resolve();
      await new Promise(process.nextTick);

      expect(driveClient.disconnectDrive).toHaveBeenCalled();
      expect(driveClient.clearDriveSyncMetadata).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_CONNECTION_UPDATED,
        email: null,
        connectedAt: null,
      });
      expect(document.querySelector('#drive-state-disconnected').style.display).toBe('');
      expect(document.querySelector('#drive-state-connected').style.display).toBe('none');
    });

    it('shows an error when disconnect fails', async () => {
      driveClient.disconnectDrive.mockRejectedValue(new Error('network down'));

      await initCloudSyncController(true);

      document.querySelector('#drive-disconnect-button').click();
      await flushAsyncWork();

      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        '中斷連線失敗，請重試'
      );
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
      expect(document.querySelector('#drive-loading-overlay').style.display).toBe('none');
    });

    it('skips disconnect when user cancels confirmation', async () => {
      globalThis.confirm.mockReturnValue(false);

      await initCloudSyncController(true);

      document.querySelector('#drive-disconnect-button').click();
      await flushAsyncWork();

      expect(driveClient.disconnectDrive).not.toHaveBeenCalled();
    });

    it('bypasses interaction if not logged in', async () => {
      await initCloudSyncController(false);
      expect(document.querySelector('#cloud-sync-card').style.display).toBe('none');
      // Handlers not attached if not logged in initially (in actual implementation)
    });

    it('syncs remote drive connection on init', async () => {
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: true,
        email: 'remote@test.dev',
        connectedAt: '2026-04-20T00:00:00.000Z',
      });
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'remote@test.dev',
        connectedAt: '2026-04-20T00:00:00.000Z',
      });

      await initCloudSyncController(true);

      expect(driveClient.fetchDriveConnectionStatus).toHaveBeenCalled();
      expect(driveClient.setDriveConnection).toHaveBeenCalledWith({
        email: 'remote@test.dev',
        connectedAt: '2026-04-20T00:00:00.000Z',
      });
      expect(document.querySelector('#drive-connected-email').textContent).toBe('remote@test.dev');
    });

    it('falls back to disconnected state when remote sync fails', async () => {
      driveClient.fetchDriveConnectionStatus.mockRejectedValue(new Error('TOKEN_EXPIRED'));
      driveClient.getDriveSyncMetadata.mockResolvedValue({ connectionEmail: null });

      await expect(initCloudSyncController(true)).resolves.toBeUndefined();

      expect(document.querySelector('#drive-state-disconnected').style.display).toBe('');
      expect(document.querySelector('#drive-state-connected').style.display).toBe('none');
      expect(document.querySelector('#drive-state-conflict').style.display).toBe('none');
    });

    it('refreshes remote drive connection when window regains focus', async () => {
      driveClient.getDriveSyncMetadata
        .mockResolvedValueOnce({ connectionEmail: null })
        .mockResolvedValue({
          connectionEmail: 'focus@test.dev',
          connectedAt: '2026-04-20T00:00:00.000Z',
        });
      driveClient.fetchDriveConnectionStatus
        .mockResolvedValueOnce({
          connected: false,
          email: null,
          connectedAt: null,
        })
        .mockResolvedValueOnce({
          connected: true,
          email: 'focus@test.dev',
          connectedAt: '2026-04-20T00:00:00.000Z',
        });

      await initCloudSyncController(true);
      globalThis.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await new Promise(process.nextTick);

      expect(driveClient.fetchDriveConnectionStatus).toHaveBeenCalledTimes(2);
      expect(driveClient.setDriveConnection).toHaveBeenCalledWith({
        email: 'focus@test.dev',
        connectedAt: '2026-04-20T00:00:00.000Z',
      });
      expect(document.querySelector('#drive-connected-email').textContent).toBe('focus@test.dev');
    });

    it('refreshes remote drive connection when page becomes visible again', async () => {
      driveClient.getDriveSyncMetadata
        .mockResolvedValueOnce({ connectionEmail: null })
        .mockResolvedValue({
          connectionEmail: 'visible@test.dev',
          connectedAt: '2026-04-20T00:00:00.000Z',
        });
      driveClient.fetchDriveConnectionStatus
        .mockResolvedValueOnce({
          connected: false,
          email: null,
          connectedAt: null,
        })
        .mockResolvedValueOnce({
          connected: true,
          email: 'visible@test.dev',
          connectedAt: '2026-04-20T00:00:00.000Z',
        });

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });

      await initCloudSyncController(true);
      document.dispatchEvent(new Event('visibilitychange'));
      await flushAsyncWork();

      expect(driveClient.fetchDriveConnectionStatus).toHaveBeenCalledTimes(2);
      expect(driveClient.setDriveConnection).toHaveBeenCalledWith({
        email: 'visible@test.dev',
        connectedAt: '2026-04-20T00:00:00.000Z',
      });
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
      globalThis.confirm.mockReturnValueOnce(false);
      document.querySelector('#drive-conflict-force-upload-button').click();
      await flushAsyncWork();
      expect(mockSendMessage).not.toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
        force: true,
      });

      globalThis.confirm.mockReturnValueOnce(true);
      document.querySelector('#drive-conflict-force-upload-button').click();
      await flushAsyncWork();
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
        force: true,
      });
    });
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
        connectedAt: '2026-04-20T00:00:00.000Z',
      });
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'fresh@a.com',
        connectedAt: '2026-04-20T00:00:00.000Z',
      });

      await refreshCloudSyncCard({ syncRemote: true });

      expect(driveClient.fetchDriveConnectionStatus).toHaveBeenCalled();
      expect(driveClient.setDriveConnection).toHaveBeenCalledWith({
        email: 'fresh@a.com',
        connectedAt: '2026-04-20T00:00:00.000Z',
      });
      expect(document.querySelector('#drive-connected-email').textContent).toBe('fresh@a.com');
    });

    it('clears local metadata when remote state reports disconnected', async () => {
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: false,
        email: null,
        connectedAt: null,
      });
      driveClient.getDriveSyncMetadata.mockResolvedValue({ connectionEmail: null });

      await refreshCloudSyncCard({ syncRemote: true });

      expect(driveClient.clearDriveSyncMetadata).toHaveBeenCalled();
      expect(document.querySelector('#drive-state-disconnected').style.display).toBe('');
    });

    it('clears temporary success status message after timeout', async () => {
      jest.useFakeTimers();
      driveClient.getDriveSyncMetadata
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ connectionEmail: 'done@test.dev' });
      mockSendMessage.mockResolvedValueOnce({ success: true });

      await initCloudSyncController(true);

      document.querySelector('#drive-upload-button').click();
      await Promise.resolve();
      await Promise.resolve();

      expect(document.querySelector('#drive-sync-status').textContent).toContain('上載成功');

      await jest.advanceTimersByTimeAsync(4000);

      expect(document.querySelector('#drive-sync-status').textContent).toBe('');
      expect(document.querySelector('#drive-sync-status').className).toBe('status-message');
      jest.useRealTimers();
    });
  });
});
