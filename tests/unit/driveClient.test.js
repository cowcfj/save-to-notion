/**
 * Drive Client API & Storage Tests
 */

import {
  ALL_DRIVE_SYNC_KEYS,
  startDriveOAuthFlow,
  getDriveSyncMetadata,
  setDriveConnection,
  clearDriveSyncMetadata,
  updateDriveSyncRunMetadata,
  clearDriveSyncConflict,
  fetchDriveConnectionStatus,
  fetchDriveSnapshotStatus,
  uploadDriveSnapshot,
  downloadDriveSnapshot,
  disconnectDrive,
} from '../../scripts/auth/driveClient.js';
import * as accountSession from '../../scripts/auth/accountSession.js';

describe('Drive Client API', () => {
  let mockStorageLocal;
  let mockFetch;

  beforeEach(() => {
    mockStorageLocal = {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    };
    globalThis.chrome = {
      runtime: { id: 'test-ext-id' },
      tabs: { create: jest.fn() },
      storage: { local: mockStorageLocal },
    };

    mockFetch = jest.fn();
    globalThis.fetch = mockFetch;

    jest.spyOn(accountSession, 'buildAccountAuthHeaders').mockResolvedValue({
      Authorization: 'Bearer test-token',
    });

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2023-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Storage Helpers', () => {
    it('getDriveSyncMetadata should parse storage correctly', async () => {
      mockStorageLocal.get.mockResolvedValue({
        driveSyncConnectionEmail: 'test@example.com',
        driveSyncNeedsManualReview: true,
      });

      const metadata = await getDriveSyncMetadata();
      expect(metadata.connectionEmail).toBe('test@example.com');
      expect(metadata.needsManualReview).toBe(true);
      expect(mockStorageLocal.get).toHaveBeenCalledWith(ALL_DRIVE_SYNC_KEYS);
    });

    it('setDriveConnection should save initial connected state', async () => {
      await setDriveConnection({ email: 'hello@a.com', connectedAt: '2023-01-01' });
      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          driveSyncConnectionEmail: 'hello@a.com',
          driveSyncNeedsManualReview: false,
        })
      );
    });

    it('clearDriveSyncMetadata should remove all sync keys', async () => {
      await clearDriveSyncMetadata();
      expect(mockStorageLocal.remove).toHaveBeenCalledWith(ALL_DRIVE_SYNC_KEYS);
    });

    it('updateDriveSyncRunMetadata should record success metrics', async () => {
      await updateDriveSyncRunMetadata({ type: 'upload', success: true, remoteUpdatedAt: 'iso' });
      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          driveSyncLastRunType: 'upload',
          driveSyncLastErrorAt: null,
          driveSyncLastErrorCode: null,
          driveSyncLastSuccessfulUploadAt: '2023-01-01T00:00:00.000Z',
          driveSyncLastKnownRemoteUpdatedAt: 'iso',
        })
      );
    });

    it('updateDriveSyncRunMetadata should record error and set needsManualReview if conflict', async () => {
      await updateDriveSyncRunMetadata({
        type: 'upload',
        success: false,
        errorCode: 'REMOTE_SNAPSHOT_NEWER',
      });
      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          driveSyncLastErrorCode: 'REMOTE_SNAPSHOT_NEWER',
          driveSyncNeedsManualReview: true,
        })
      );
    });

    it('clearDriveSyncConflict should unset error', async () => {
      await clearDriveSyncConflict();
      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          driveSyncNeedsManualReview: false,
          driveSyncLastErrorCode: null,
        })
      );
    });
  });

  describe('OAuth Flow', () => {
    it('startDriveOAuthFlow should open tab', () => {
      startDriveOAuthFlow();
      expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('/drive/start?ext_id=test-ext-id&callback_mode=bridge'),
      });
    });
  });

  describe('API Endpoints', () => {
    describe('fetchDriveConnectionStatus', () => {
      it('returns true on 200', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ email: 'a@a' }),
        });
        const res = await fetchDriveConnectionStatus();
        expect(res.connected).toBe(true);
        expect(res.email).toBe('a@a');
      });

      it('returns false on 404', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });
        const res = await fetchDriveConnectionStatus();
        expect(res.connected).toBe(false);
      });

      it('throws on 500', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'err' });
        await expect(fetchDriveConnectionStatus()).rejects.toThrow(
          'GET /drive/connection failed: 500'
        );
      });
    });

    describe('fetchDriveSnapshotStatus', () => {
      it('returns status on 200', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ updatedAt: 'time' }),
        });
        const res = await fetchDriveSnapshotStatus();
        expect(res.exists).toBe(true);
      });

      it('returns false on 404', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });
        const res = await fetchDriveSnapshotStatus();
        expect(res.exists).toBe(false);
      });
    });

    describe('uploadDriveSnapshot', () => {
      it('returns success on ok', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ updatedAt: 'x' }),
        });
        const res = await uploadDriveSnapshot({ payload: 1 });
        expect(res.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.not.stringContaining('?force=true'),
          expect.any(Object)
        );
      });

      it('adds force flag if true', async () => {
        mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
        await uploadDriveSnapshot({}, true);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('?force=true'),
          expect.any(Object)
        );
      });

      it('returns conflict error gracefully on 409', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 409,
          json: async () => ({ code: 'REMOTE_SNAPSHOT_NEWER' }),
        });
        const res = await uploadDriveSnapshot({});
        expect(res.success).toBe(false);
        expect(res.errorCode).toBe('REMOTE_SNAPSHOT_NEWER');
      });

      it('throws error on 500', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'err' });
        await expect(uploadDriveSnapshot({})).rejects.toThrow();
      });
    });

    describe('downloadDriveSnapshot', () => {
      it('returns JSON on 200', async () => {
        mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 1 }) });
        const res = await downloadDriveSnapshot();
        expect(res.id).toBe(1);
      });

      it('throws NO_REMOTE_SNAPSHOT on 404', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });
        await expect(downloadDriveSnapshot()).rejects.toThrow('NO_REMOTE_SNAPSHOT');
      });
    });

    describe('disconnectDrive', () => {
      it('resolves on OK', async () => {
        mockFetch.mockResolvedValue({ ok: true });
        await expect(disconnectDrive()).resolves.toBeUndefined();
      });

      it('throws on non-ok', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => '' });
        await expect(disconnectDrive()).rejects.toThrow();
      });
    });
  });
});
