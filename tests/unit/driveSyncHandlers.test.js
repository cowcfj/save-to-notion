/**
 * Drive Sync Background Handlers Tests
 */

import { RUNTIME_ACTIONS } from '../../scripts/config/runtimeActions.js';
import { createDriveSyncHandlers } from '../../scripts/background/handlers/driveSyncHandlers.js';
import * as driveClient from '../../scripts/auth/driveClient.js';
import * as driveSnapshot from '../../scripts/sync/driveSnapshot.js';
import Logger from '../../scripts/utils/Logger.js';

describe('Drive Sync Handlers', () => {
  let handlers;
  let mockSendMessage;

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue({});
    globalThis.chrome = {
      runtime: {
        sendMessage: mockSendMessage,
      },
    };
    globalThis.Logger = {
      debug: jest.fn(),
      start: jest.fn(),
      ready: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    };

    jest
      .spyOn(driveClient, 'uploadDriveSnapshot')
      .mockResolvedValue({ success: true, updatedAt: 'x' });
    jest.spyOn(driveClient, 'downloadDriveSnapshot').mockResolvedValue({
      metadata: { updated_at: 'y' },
      payload: { highlights: [], saved_states: [] },
    });
    jest.spyOn(driveClient, 'getDriveSyncMetadata').mockResolvedValue({
      installationId: 'installation-123',
      profileId: 'profile-123',
      lastKnownRemoteUpdatedAt: null,
      lastSuccessfulUploadAt: null,
    });
    jest.spyOn(driveClient, 'updateDriveSyncRunMetadata').mockResolvedValue();
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});

    jest.spyOn(driveSnapshot, 'buildUnifiedPageStateFromLocalStorage').mockResolvedValue({
      pages: new Map(),
      urlAliases: new Map(),
    });
    jest.spyOn(driveSnapshot, 'buildDriveSnapshot').mockResolvedValue({
      metadata: {
        updated_at: 'x',
        item_counts: { highlights: 0, saved_states: 0 },
      },
      payload: { highlights: [], saved_states: [], url_aliases: {} },
    });
    jest.spyOn(driveSnapshot, 'applyDriveSnapshotToLocalStorage').mockResolvedValue({
      writtenKeys: ['a', 'b'],
      removedKeys: ['c'],
    });

    handlers = createDriveSyncHandlers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete globalThis.chrome;
    delete globalThis.Logger;
  });

  describe('handleManualUpload', () => {
    it('should upload successfully and broadcast', async () => {
      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({ force: false });

      expect(driveSnapshot.buildUnifiedPageStateFromLocalStorage).toHaveBeenCalled();
      expect(driveSnapshot.buildDriveSnapshot).toHaveBeenCalled();
      expect(driveClient.uploadDriveSnapshot).toHaveBeenCalledWith(
        {
          metadata: {
            updated_at: 'x',
            item_counts: { highlights: 0, saved_states: 0 },
          },
          payload: { highlights: [], saved_states: [], url_aliases: {} },
        },
        false
      );

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'upload',
        success: true,
        remoteUpdatedAt: 'x',
      });

      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: null,
        lastSuccessfulUploadAt: null,
      });

      expect(result.success).toBe(true);
    });

    it('should handle conflict gracefully', async () => {
      driveClient.uploadDriveSnapshot.mockResolvedValue({
        success: false,
        errorCode: 'REMOTE_SNAPSHOT_NEWER',
        message: 'Remote snapshot is newer',
        remoteUpdatedAt: '2026-04-21T01:02:03.000Z',
      });

      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({});

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'upload',
        success: false,
        errorCode: 'REMOTE_SNAPSHOT_NEWER',
      });

      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: null,
        lastSuccessfulUploadAt: null,
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT,
        conflictType: 'REMOTE_SNAPSHOT_NEWER',
        remoteUpdatedAt: '2026-04-21T01:02:03.000Z',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('REMOTE_SNAPSHOT_NEWER');
    });

    it('should persist failed upload metadata and broadcast when snapshot build throws', async () => {
      driveSnapshot.buildUnifiedPageStateFromLocalStorage.mockRejectedValue(
        new Error('build failed')
      );

      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({});

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'upload',
        success: false,
        errorCode: 'UPLOAD_FAILED',
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: null,
        lastSuccessfulUploadAt: null,
      });
      expect(result).toEqual({
        success: false,
        error: 'build failed',
      });
    });
  });

  describe('handleManualDownload', () => {
    it('should download and apply successfully', async () => {
      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD]({});

      expect(driveClient.downloadDriveSnapshot).toHaveBeenCalled();
      expect(driveSnapshot.applyDriveSnapshotToLocalStorage).toHaveBeenCalledWith({
        metadata: { updated_at: 'y' },
        payload: { highlights: [], saved_states: [] },
      });

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'download',
        success: true,
        remoteUpdatedAt: 'y',
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: null,
        lastSuccessfulUploadAt: null,
      });

      expect(result.success).toBe(true);
      expect(result.writtenKeys).toBe(2); // Since mock returns ['a', 'b']
    });

    it('should catch download errors and broadcast', async () => {
      driveClient.downloadDriveSnapshot.mockRejectedValue(new Error('NO_REMOTE_SNAPSHOT'));

      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD]({});

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'download',
        success: false,
        errorCode: 'NO_REMOTE_SNAPSHOT',
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: null,
        lastSuccessfulUploadAt: null,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_REMOTE_SNAPSHOT');
    });

    it('should persist failed download metadata and broadcast when apply throws', async () => {
      driveSnapshot.applyDriveSnapshotToLocalStorage.mockRejectedValue(new Error('apply failed'));

      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD]({});

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'download',
        success: false,
        errorCode: 'DOWNLOAD_FAILED',
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: null,
        lastSuccessfulUploadAt: null,
      });
      expect(result).toEqual({
        success: false,
        error: 'apply failed',
      });
    });
  });

  describe('handler map boundaries', () => {
    it('should not expose DRIVE_SYNC_CONFLICT as a background request handler', () => {
      expect(handlers[RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT]).toBeUndefined();
    });
  });
});
