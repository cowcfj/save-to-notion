/**
 * @jest-environment jsdom
 */

import {
  initCloudSyncController,
  setCloudSyncCardVisibility,
  renderCloudSyncCard,
  refreshCloudSyncCard,
} from '../../../options/DriveCloudSyncController.js';
import * as driveClient from '../../../scripts/auth/driveClient.js';
import { RUNTIME_ACTIONS } from '../../../scripts/config/runtimeActions.js';
import { UI_MESSAGES } from '../../../scripts/config/messages.js';
import Logger from '../../../scripts/utils/Logger.js';
import { ErrorHandler } from '../../../scripts/utils/ErrorHandler.js';
import { sanitizeApiError } from '../../../scripts/utils/securityUtils.js';
import { DRIVE_SYNC_ERROR_CODES } from '../../../scripts/config/extension/driveSyncErrorCodes.js';

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const getStorageString = (key, state) => (Object.hasOwn(state, key) ? { [key]: state[key] } : {});

const getStorageArray = (keys, state) => {
  const result = {};
  for (const key of keys) {
    if (Object.hasOwn(state, key)) {
      result[key] = state[key];
    }
  }
  return result;
};

const getStorageObject = (keysObj, state) => {
  const result = {};
  for (const [key, defaultVal] of Object.entries(keysObj)) {
    result[key] = Object.hasOwn(state, key) ? state[key] : defaultVal;
  }
  return result;
};

const getFromStorage = (keys, state) => {
  if (typeof keys === 'string') {
    return getStorageString(keys, state);
  }
  if (Array.isArray(keys)) {
    return getStorageArray(keys, state);
  }
  if (keys && typeof keys === 'object') {
    return getStorageObject(keys, state);
  }
  return { ...state };
};

describe('DriveCloudSyncController', () => {
  let mockSendMessage;
  let loggerErrorSpy;
  let loggerWarnSpy;
  let loggerInfoSpy;

  beforeEach(() => {
    jest.useFakeTimers();
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
        <p id="drive-source-warning" hidden></p>

        <select id="drive-frequency-select">
          <option value="off">Off</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Every 30 days</option>
        </select>
        <output id="drive-auto-sync-status" aria-live="polite">
          <span id="drive-auto-sync-status-text"></span>
        </output>

        <button id="drive-connect-button"></button>
        <button id="drive-upload-button"></button>
        <button id="drive-download-button"></button>
        <button id="drive-disconnect-button"></button>
        <button id="drive-conflict-download-button"></button>
        <button id="drive-conflict-force-upload-button"></button>
      </div>
    `;

    mockSendMessage = jest.fn().mockResolvedValue({ success: true });
    const storageState = {};

    globalThis.chrome = {
      runtime: {
        sendMessage: mockSendMessage,
      },
      storage: {
        local: {
          get: jest.fn().mockImplementation(async keys => getFromStorage(keys, storageState)),
          set: jest.fn().mockImplementation(async patch => {
            Object.assign(storageState, patch);
          }),
          remove: jest.fn().mockImplementation(async keys => {
            const keyList = Array.isArray(keys) ? keys : [keys];
            for (const key of keyList) {
              delete storageState[key];
            }
          }),
        },
      },
    };
    loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => {});
    loggerWarnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    loggerInfoSpy = jest.spyOn(Logger, 'info').mockImplementation(() => {});
    globalThis.confirm = jest.fn().mockReturnValue(true);

    jest.spyOn(driveClient, 'getDriveSyncMetadata');
    jest.spyOn(driveClient, 'startDriveOAuthFlow').mockResolvedValue();
    jest.spyOn(driveClient, 'disconnectDrive').mockResolvedValue();
    jest.spyOn(driveClient, 'clearDriveSyncMetadata').mockResolvedValue();
    jest.spyOn(driveClient, 'fetchDriveConnectionStatus').mockResolvedValue({
      connected: false,
      email: null,
      connectedAt: null,
    });
    jest.spyOn(driveClient, 'fetchDriveSnapshotStatus').mockResolvedValue({
      exists: false,
      updatedAt: null,
      size: null,
      sourceInstallationId: null,
      sourceProfileId: null,
    });
    jest.spyOn(driveClient, 'setDriveConnection');
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete globalThis.chrome;
    delete globalThis.confirm;
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
      expect(document.querySelector('#drive-last-upload-text').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.LAST_UPLOAD_PREFIX
      );
    });

    it('renders conflict state correctly', () => {
      // simulate conflict state
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        needsManualReview: true,
        lastErrorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
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
        lastErrorCode: DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED,
        lastErrorAt: '2023-01-02T00:00:00Z',
      });
      expect(document.querySelector('#drive-error-banner').style.display).toBe('');
      expect(document.querySelector('#drive-error-code').textContent).toContain(
        DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED
      );
      expect(document.querySelector('#drive-error-time').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.ERROR_TIME_PREFIX
      );
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
        lastErrorCode: DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED,
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

    it('lastSuccessfulUploadAt 為 null 但 lastKnownRemoteUpdatedAt 有值 → 顯示「雲端備份」', () => {
      renderCloudSyncCard({
        connectionEmail: 'cross-device@test.dev',
        lastSuccessfulUploadAt: null,
        lastKnownRemoteUpdatedAt: '2026-04-19T12:00:00Z',
      });
      const text = document.querySelector('#drive-last-upload-text').textContent;
      expect(text).toContain(UI_MESSAGES.CLOUD_SYNC.LAST_REMOTE_PREFIX);
      expect(text).not.toContain(UI_MESSAGES.CLOUD_SYNC.NEVER_UPLOADED);
      expect(text).not.toContain(UI_MESSAGES.CLOUD_SYNC.LAST_UPLOAD_PREFIX);
    });

    it('lastSuccessfulUploadAt 優先於 lastKnownRemoteUpdatedAt', () => {
      renderCloudSyncCard({
        connectionEmail: 'priority@test.dev',
        lastSuccessfulUploadAt: '2026-04-21T09:00:00Z',
        lastKnownRemoteUpdatedAt: '2026-04-19T12:00:00Z',
      });
      const text = document.querySelector('#drive-last-upload-text').textContent;
      expect(text).toContain(UI_MESSAGES.CLOUD_SYNC.LAST_UPLOAD_PREFIX);
      expect(text).not.toContain(UI_MESSAGES.CLOUD_SYNC.LAST_REMOTE_PREFIX);
    });

    it('兩者皆無 → 維持「尚未上載」', () => {
      renderCloudSyncCard({ connectionEmail: 'nothing@test.dev' });
      expect(document.querySelector('#drive-last-upload-text').textContent).toBe(
        UI_MESSAGES.CLOUD_SYNC.NEVER_UPLOADED
      );
    });

    it('renders frequency and auto sync status properly', () => {
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        frequency: 'daily',
        needsManualReview: true,
      });
      expect(document.querySelector('#drive-frequency-select').value).toBe('daily');
      expect(document.querySelector('#drive-auto-sync-status').style.display).toBe('');
      expect(document.querySelector('#drive-auto-sync-status-text').textContent).toBe(
        UI_MESSAGES.CLOUD_SYNC.AUTO_SYNC_NEEDS_REVIEW
      );

      // off status hides the container
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        frequency: 'off',
      });
      expect(document.querySelector('#drive-auto-sync-status').style.display).toBe('none');
    });

    it('hides auto sync status container when frequency is active but no review is needed', () => {
      // 先觸發 needsManualReview=true 使 container 顯示
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        frequency: 'weekly',
        needsManualReview: true,
      });
      expect(document.querySelector('#drive-auto-sync-status').style.display).toBe('');

      // 再切換到 needsManualReview=false：container 必須被隱藏，避免 margin-bottom 佔用空白
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        frequency: 'weekly',
        needsManualReview: false,
      });
      expect(document.querySelector('#drive-auto-sync-status').style.display).toBe('none');
      expect(document.querySelector('#drive-auto-sync-status-text').textContent).toBe('');
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
      expect(globalThis.confirm).toHaveBeenCalled();
    });

    it('shows an error when connect flow cannot start', async () => {
      driveClient.startDriveOAuthFlow.mockRejectedValue(new Error('popup blocked'));

      await initCloudSyncController(true);

      document.querySelector('#drive-connect-button').click();
      await flushAsyncWork();

      const safeMessage = sanitizeApiError(new Error('popup blocked'), 'drive_connect_start');
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        `${UI_MESSAGES.CLOUD_SYNC.CONNECT_FAILED_PREFIX}${ErrorHandler.formatUserMessage(safeMessage)}`
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
          email: 'pageshow@test.dev',
          connectedAt: '2026-04-20T00:00:00.000Z',
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
          connectedAt: '2026-04-20T00:00:00.000Z',
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

      expect(document.querySelector('#drive-error-banner').style.display).toBe('none');
      expect(document.querySelector('#drive-sync-status').textContent).toBe('');
      expect(document.querySelector('#drive-sync-status').className).toBe('status-message');
    });

    it('shows an error when upload receives no response from background', async () => {
      mockSendMessage.mockResolvedValueOnce(undefined);

      await initCloudSyncController(true);

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      const safeMessage = sanitizeApiError(
        new Error(UI_MESSAGES.CLOUD_SYNC.BG_NO_RESPONSE),
        'drive_sync_upload'
      );
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        `${UI_MESSAGES.CLOUD_SYNC.UPLOAD_FAILED_PREFIX}${ErrorHandler.formatUserMessage(safeMessage)}`
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
        error: DRIVE_SYNC_ERROR_CODES.NO_REMOTE_SNAPSHOT,
      });

      await initCloudSyncController(true);

      document.querySelector('#drive-download-button').click();
      await flushAsyncWork();

      const safeMessage = sanitizeApiError(
        new Error(DRIVE_SYNC_ERROR_CODES.NO_REMOTE_SNAPSHOT),
        'drive_sync_download'
      );
      expect(document.querySelector('#drive-sync-status').textContent).toContain(
        `${UI_MESSAGES.CLOUD_SYNC.DOWNLOAD_FAILED_PREFIX}${ErrorHandler.formatUserMessage(safeMessage)}`
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
      await flushAsyncWork();

      expect(driveClient.disconnectDrive).toHaveBeenCalled();
      expect(driveClient.clearDriveSyncMetadata).toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(loggerInfoSpy).not.toHaveBeenCalledWith('[CloudSync] Disconnect broadcast sent');
      expect(document.querySelector('#drive-state-disconnected').style.display).toBe('');
      expect(document.querySelector('#drive-state-connected').style.display).toBe('none');
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
      expect(document.querySelector('#drive-loading-overlay').style.display).toBe('none');
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

    it('shows loading overlay during initialization and hides it after completion', async () => {
      let resolveConnectionStatus;
      driveClient.fetchDriveConnectionStatus.mockImplementation(() => {
        return new Promise(resolve => {
          resolveConnectionStatus = resolve;
        });
      });

      const initPromise = initCloudSyncController(true);

      // Loading overlay should be displayed immediately
      expect(document.querySelector('#drive-loading-overlay').style.display).toBe('');
      expect(document.querySelector('#drive-loading-text').textContent).toBe(
        UI_MESSAGES.CLOUD_SYNC.LOADING_STATUS_SYNC
      );

      // Control buttons should be disabled during load
      expect(document.querySelector('#drive-connect-button').disabled).toBe(true);
      expect(document.querySelector('#drive-upload-button').disabled).toBe(true);

      // Resolve the mock promise to let initialization continue
      resolveConnectionStatus({
        connected: false,
        email: null,
        connectedAt: null,
      });

      await initPromise;

      // Loading overlay should be hidden after initialization completes
      expect(document.querySelector('#drive-loading-overlay').style.display).toBe('none');
      expect(document.querySelector('#drive-connect-button').disabled).toBe(false);
      expect(document.querySelector('#drive-upload-button').disabled).toBe(false);
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
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: false,
        updatedAt: null,
      });

      await initCloudSyncController(true);

      expect(driveClient.fetchDriveConnectionStatus).toHaveBeenCalled();
      expect(driveClient.setDriveConnection).toHaveBeenCalledWith(
        {
          email: 'remote@test.dev',
          connectedAt: '2026-04-20T00:00:00.000Z',
        },
        expect.objectContaining({ resetConflicts: false })
      );
      expect(document.querySelector('#drive-connected-email').textContent).toBe('remote@test.dev');
    });

    it('server 未回傳 connectedAt 時保留既有本地 connectedAt，避免以空值覆寫 metadata', async () => {
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: true,
        email: 'no-ts@test.dev',
        connectedAt: null,
      });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: false,
        updatedAt: null,
      });
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'no-ts@test.dev',
        connectedAt: '2026-04-18T08:30:00.000Z',
      });

      await initCloudSyncController(true);

      expect(driveClient.setDriveConnection).toHaveBeenCalledWith(
        {
          email: 'no-ts@test.dev',
          connectedAt: '2026-04-18T08:30:00.000Z',
        },
        expect.objectContaining({ resetConflicts: false })
      );
    });

    it('server 未回傳 connectedAt 且 email 不同時，不重用既有本地 connectedAt', async () => {
      jest.setSystemTime(new Date('2026-04-21T10:20:30.000Z'));
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: true,
        email: 'new-account@test.dev',
        connectedAt: null,
      });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: false,
        updatedAt: null,
      });
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'old-account@test.dev',
        connectedAt: '2026-04-18T08:30:00.000Z',
      });

      await initCloudSyncController(true);

      expect(driveClient.setDriveConnection).toHaveBeenCalledWith(
        {
          email: 'new-account@test.dev',
          connectedAt: '2026-04-21T10:20:30.000Z',
        },
        expect.objectContaining({ resetConflicts: false })
      );
    });

    it('reconnect 後查詢遠端 snapshot 並寫入 lastKnownRemoteUpdatedAt', async () => {
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: true,
        email: 'reconnect@test.dev',
        connectedAt: '2026-04-21T00:00:00Z',
      });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: '2026-04-20T09:30:00Z',
        size: 1024,
      });
      const setSnapshotSpy = jest
        .spyOn(driveClient, 'setLastKnownRemoteUpdatedAt')
        .mockResolvedValue();
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'reconnect@test.dev',
        lastKnownRemoteUpdatedAt: '2026-04-20T09:30:00Z',
      });

      await initCloudSyncController(true);

      expect(driveClient.fetchDriveSnapshotStatus).toHaveBeenCalled();
      expect(setSnapshotSpy).toHaveBeenCalledWith('2026-04-20T09:30:00Z');
      expect(document.querySelector('#drive-last-upload-text').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.LAST_REMOTE_PREFIX
      );
    });

    it('reconnect 時遠端無 snapshot → 顯示「尚未上載」且 lastKnownRemoteUpdatedAt 清為 null', async () => {
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: true,
        email: 'empty-remote@test.dev',
        connectedAt: '2026-04-21T00:00:00Z',
      });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: false,
        updatedAt: null,
        size: null,
      });
      const setSnapshotSpy = jest
        .spyOn(driveClient, 'setLastKnownRemoteUpdatedAt')
        .mockResolvedValue();
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'empty-remote@test.dev',
      });

      await initCloudSyncController(true);

      expect(setSnapshotSpy).toHaveBeenCalledWith(null);
      expect(document.querySelector('#drive-last-upload-text').textContent).toBe(
        UI_MESSAGES.CLOUD_SYNC.NEVER_UPLOADED
      );
    });

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
      expect(document.querySelector('#drive-state-connected').style.display).toBe('');
    });

    it('falls back to disconnected state when remote sync fails', async () => {
      driveClient.fetchDriveConnectionStatus.mockRejectedValue(new Error('TOKEN_EXPIRED'));
      driveClient.getDriveSyncMetadata.mockResolvedValue({ connectionEmail: null });

      await expect(initCloudSyncController(true)).resolves.toBeUndefined();

      expect(loggerErrorSpy).toHaveBeenCalledWith('[CloudSync] Drive connection sync failed', {
        action: 'syncRemoteDriveConnection',
        error: sanitizeApiError(new Error('TOKEN_EXPIRED'), 'drive_connection_sync'),
      });
      expect(document.querySelector('#drive-state-disconnected').style.display).toBe('');
      expect(document.querySelector('#drive-state-connected').style.display).toBe('none');
      expect(document.querySelector('#drive-state-conflict').style.display).toBe('none');
    });

    it('refreshes remote drive connection when window regains focus', async () => {
      driveClient.getDriveSyncMetadata.mockRestore();
      driveClient.setDriveConnection.mockRestore();

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
      await flushAsyncWork();

      expect(driveClient.fetchDriveConnectionStatus).toHaveBeenCalledTimes(2);

      const storedMetadata = await driveClient.getDriveSyncMetadata();
      expect(storedMetadata.connectionEmail).toBe('focus@test.dev');
      expect(storedMetadata.connectedAt).toBe('2026-04-20T00:00:00.000Z');
    });

    it('refreshes remote drive connection when page becomes visible again', async () => {
      driveClient.getDriveSyncMetadata.mockRestore();
      driveClient.setDriveConnection.mockRestore();

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

      const storedMetadata = await driveClient.getDriveSyncMetadata();
      expect(storedMetadata.connectionEmail).toBe('visible@test.dev');
      expect(storedMetadata.connectedAt).toBe('2026-04-20T00:00:00.000Z');
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
        updatedAt: '2026-04-20T09:30:00Z',
      });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: '2026-04-20T09:30:00Z',
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

      expect(document.querySelector('#drive-state-conflict').style.display).toBe('');
      expect(document.querySelector('#drive-state-connected').style.display).toBe('none');
    });

    it('focus 首次連線且本地缺少 connectedAt 時才 fallback 為目前時間', async () => {
      jest.setSystemTime(new Date('2026-04-22T10:00:00.000Z'));
      driveClient.getDriveSyncMetadata.mockRestore();
      driveClient.setDriveConnection.mockRestore();

      driveClient.fetchDriveConnectionStatus
        .mockResolvedValueOnce({
          connected: false,
          email: null,
          connectedAt: null,
        })
        .mockResolvedValueOnce({
          connected: true,
          email: 'first-connect@test.dev',
          connectedAt: null,
        });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: false,
        updatedAt: null,
        size: null,
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
      expect(driveClient.setDriveConnection).toHaveBeenCalledWith(
        {
          email: 'fresh@a.com',
          connectedAt: '2026-04-20T00:00:00.000Z',
        },
        expect.objectContaining({ resetConflicts: false })
      );
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

    it('syncRemote:true 時同時查詢 snapshot status 並恢復雲端備份顯示', async () => {
      driveClient.fetchDriveConnectionStatus.mockResolvedValue({
        connected: true,
        email: 'refresh@test.dev',
        connectedAt: '2026-04-21T00:00:00Z',
      });
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: '2026-04-20T09:30:00Z',
      });
      const setSnapshotSpy = jest
        .spyOn(driveClient, 'setLastKnownRemoteUpdatedAt')
        .mockResolvedValue();
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'refresh@test.dev',
        lastKnownRemoteUpdatedAt: '2026-04-20T09:30:00Z',
      });

      await refreshCloudSyncCard({ syncRemote: true });

      expect(setSnapshotSpy).toHaveBeenCalledWith('2026-04-20T09:30:00Z');
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
  describe('Source Warning (_updateSourceWarning via renderCloudSyncCard)', () => {
    it('sourceInstallationId 與 installationId 不同時顯示 warning', () => {
      renderCloudSyncCard(
        { connectionEmail: 'user@test.dev', installationId: 'local-id-001' },
        { snapshotStatus: { sourceInstallationId: 'remote-id-999' } }
      );
      const warning = document.querySelector('#drive-source-warning');
      expect(warning.hidden).toBe(false);
      expect(warning.textContent).toContain('⚠️');
    });

    it('sourceInstallationId === installationId 時隱藏 warning', () => {
      renderCloudSyncCard(
        { connectionEmail: 'user@test.dev', installationId: 'same-id' },
        { snapshotStatus: { sourceInstallationId: 'same-id' } }
      );
      expect(document.querySelector('#drive-source-warning').hidden).toBe(true);
    });

    it('sourceInstallationId 為 null 時隱藏 warning', () => {
      renderCloudSyncCard(
        { connectionEmail: 'user@test.dev', installationId: 'local-id-001' },
        { snapshotStatus: { sourceInstallationId: null } }
      );
      expect(document.querySelector('#drive-source-warning').hidden).toBe(true);
    });

    it('installationId 為 null 時隱藏 warning', () => {
      renderCloudSyncCard(
        { connectionEmail: 'user@test.dev', installationId: null },
        { snapshotStatus: { sourceInstallationId: 'remote-id-999' } }
      );
      expect(document.querySelector('#drive-source-warning').hidden).toBe(true);
    });

    it('disconnected 狀態時 warning 應隱藏', () => {
      // 先讓 warning 顯示
      renderCloudSyncCard(
        { connectionEmail: 'user@test.dev', installationId: 'local-id-001' },
        { snapshotStatus: { sourceInstallationId: 'remote-id-999' } }
      );
      expect(document.querySelector('#drive-source-warning').hidden).toBe(false);

      // 切換到 disconnected
      renderCloudSyncCard({ connectionEmail: null });
      expect(document.querySelector('#drive-source-warning').hidden).toBe(true);
    });
  });

  describe('Upload preflight cross-install confirm', () => {
    beforeEach(async () => {
      // 基礎連線狀態：已連線
      driveClient.getDriveSyncMetadata.mockResolvedValue({
        connectionEmail: 'user@test.dev',
        installationId: 'local-id-001',
      });
      await initCloudSyncController(true);
    });

    it('偵測跨安裝且使用者取消時，不應送出 DRIVE_SYNC_MANUAL_UPLOAD', async () => {
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: 'time',
        size: null,
        sourceInstallationId: 'remote-id-999',
        sourceProfileId: null,
      });
      globalThis.confirm.mockReturnValueOnce(false);

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(mockSendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD })
      );
    });

    it('preflight 確認期間應先禁用按鈕，取消後恢復互動', async () => {
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: 'time',
        size: null,
        sourceInstallationId: 'remote-id-999',
        sourceProfileId: null,
      });

      const uploadBtn = document.querySelector('#drive-upload-button');
      const overlay = document.querySelector('#drive-loading-overlay');
      let isDisabledDuringConfirm = null;
      let isOverlayVisibleDuringConfirm = null;
      globalThis.confirm.mockImplementationOnce(() => {
        isDisabledDuringConfirm = uploadBtn.disabled;
        isOverlayVisibleDuringConfirm = overlay.style.display === '';
        return false;
      });

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(mockSendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD })
      );
      expect(isDisabledDuringConfirm).toBe(true);
      expect(isOverlayVisibleDuringConfirm).toBe(true);
      expect(uploadBtn.disabled).toBe(false);
      expect(overlay.style.display).toBe('none');
    });

    it('偵測跨安裝且使用者確認時，應送出 DRIVE_SYNC_MANUAL_UPLOAD', async () => {
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: 'time',
        size: null,
        sourceInstallationId: 'remote-id-999',
        sourceProfileId: null,
      });
      globalThis.confirm.mockReturnValueOnce(true);
      mockSendMessage.mockResolvedValueOnce({ success: true });

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
          force: false,
        })
      );
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

    it('metadata 讀取失敗時應使用獨立 preflight context 記錄 warn', async () => {
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: 'time',
        size: null,
        sourceInstallationId: 'remote-id-999',
        sourceProfileId: null,
      });
      driveClient.getDriveSyncMetadata.mockRejectedValueOnce(new Error('METADATA_ERROR'));
      mockSendMessage.mockResolvedValueOnce({ success: true });

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[Security] Unrecognized API error sanitized (context: drive_upload_preflight_metadata'
        )
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[CloudSync] Upload preflight check failed, continuing upload',
        expect.objectContaining({
          error: sanitizeApiError(new Error('METADATA_ERROR'), 'drive_upload_preflight_metadata'),
        })
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD,
          force: false,
        })
      );
    });

    it('同一安裝 ID 時不顯示 confirm dialog，直接上傳', async () => {
      driveClient.fetchDriveSnapshotStatus.mockResolvedValueOnce({
        exists: true,
        updatedAt: 'time',
        size: null,
        sourceInstallationId: 'local-id-001',
        sourceProfileId: null,
      });
      mockSendMessage.mockResolvedValueOnce({ success: true });

      document.querySelector('#drive-upload-button').click();
      await flushAsyncWork();

      // confirm 只會被 download 的初始 setup 呼叫，不應有 CROSS_INSTALL 訊息
      expect(globalThis.confirm).not.toHaveBeenCalledWith(
        UI_MESSAGES.CLOUD_SYNC.CONFIRM_CROSS_INSTALL_UPLOAD
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD })
      );
    });
  });
});
