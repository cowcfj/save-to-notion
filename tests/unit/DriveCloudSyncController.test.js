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

describe('DriveCloudSyncController', () => {
  let mockSendMessage;

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
    globalThis.confirm = jest.fn().mockReturnValue(true);

    jest.spyOn(driveClient, 'getDriveSyncMetadata').mockResolvedValue({});
    jest.spyOn(driveClient, 'startDriveOAuthFlow').mockResolvedValue();
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
      expect(document.querySelector('#drive-last-upload-text').textContent).toContain('上次上傳');
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
  });
});
