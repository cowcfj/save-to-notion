/**
 * Drive Client API & Storage Tests
 */

jest.mock('../../scripts/config/env.js', () => ({
  BUILD_ENV: {
    OAUTH_SERVER_URL: 'https://test-server.example.com',
  },
}));

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
  setLastKnownRemoteUpdatedAt,
} from '../../scripts/auth/driveClient.js';
import * as accountSession from '../../scripts/auth/accountSession.js';
import { DRIVE_SYNC_ERROR_CODES } from '../../scripts/config/extension/driveSyncErrorCodes.js';

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

    it('setDriveConnection 在 resetConflicts:false 時只更新連線欄位', async () => {
      await setDriveConnection(
        { email: 'keep-conflict@a.com', connectedAt: '2023-02-01' },
        { resetConflicts: false }
      );

      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        driveSyncConnectionEmail: 'keep-conflict@a.com',
        driveSyncConnectedAt: '2023-02-01',
      });
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
          driveSyncNeedsManualReview: false,
        })
      );
    });

    it('updateDriveSyncRunMetadata should clear needsManualReview on successful download', async () => {
      await updateDriveSyncRunMetadata({ type: 'download', success: true, remoteUpdatedAt: 'iso' });

      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          driveSyncLastRunType: 'download',
          driveSyncLastSuccessfulDownloadAt: '2023-01-01T00:00:00.000Z',
          driveSyncLastKnownRemoteUpdatedAt: 'iso',
          driveSyncNeedsManualReview: false,
        })
      );
    });

    it('updateDriveSyncRunMetadata should record error and set needsManualReview if conflict', async () => {
      await updateDriveSyncRunMetadata({
        type: 'upload',
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
      });
      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          driveSyncLastErrorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
          driveSyncNeedsManualReview: true,
        })
      );
    });

    it('updateDriveSyncRunMetadata should not set needsManualReview on non-conflict error', async () => {
      await updateDriveSyncRunMetadata({
        type: 'upload',
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED,
      });
      expect(mockStorageLocal.set).toHaveBeenCalledTimes(1);
      const payload = mockStorageLocal.set.mock.calls[0][0];
      expect(payload.driveSyncLastErrorCode).toBe(DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED);
      expect(payload).not.toHaveProperty('driveSyncNeedsManualReview');
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

  describe('setLastKnownRemoteUpdatedAt', () => {
    it('只寫入 LAST_KNOWN_REMOTE_UPDATED_AT，不觸及其他欄位', async () => {
      const setSpy = jest.fn().mockResolvedValue();
      globalThis.chrome = { storage: { local: { set: setSpy, get: jest.fn() } } };

      await setLastKnownRemoteUpdatedAt('2026-04-20T10:00:00Z');

      expect(setSpy).toHaveBeenCalledTimes(1);
      expect(setSpy).toHaveBeenCalledWith({
        driveSyncLastKnownRemoteUpdatedAt: '2026-04-20T10:00:00Z',
      });
    });

    it('可接受 null 以表示遠端已無 snapshot', async () => {
      const setSpy = jest.fn().mockResolvedValue();
      globalThis.chrome = { storage: { local: { set: setSpy, get: jest.fn() } } };

      await setLastKnownRemoteUpdatedAt(null);

      expect(setSpy).toHaveBeenCalledWith({
        driveSyncLastKnownRemoteUpdatedAt: null,
      });
    });
  });

  describe('OAuth Flow', () => {
    it('startDriveOAuthFlow should fetch authorizationUrl JSON and open tab', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?drive=1',
        }),
      });

      await startDriveOAuthFlow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-server.example.com/v1/account/drive/start-url',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?drive=1',
      });
    });

    it('startDriveOAuthFlow should throw when authorizationUrl is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await expect(startDriveOAuthFlow()).rejects.toThrow(
        'GET /account/drive/start-url failed: authorizationUrl missing'
      );
      expect(globalThis.chrome.tabs.create).not.toHaveBeenCalled();
    });
  });

  describe('API Endpoints', () => {
    describe('fetchDriveConnectionStatus', () => {
      it('returns true on 200', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            providerAccountEmail: 'a@a',
            connectedAt: '2023-01-01T00:00:00.000Z',
          }),
        });
        const res = await fetchDriveConnectionStatus();
        expect(res.connected).toBe(true);
        expect(res.email).toBe('a@a');
        expect(res.connectedAt).toBe('2023-01-01T00:00:00.000Z');
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
          json: async () => ({ has_snapshot: true, remote_updated_at: 'time' }),
        });
        const res = await fetchDriveSnapshotStatus();
        expect(res.exists).toBe(true);
        expect(res.updatedAt).toBe('time');
      });

      it('returns false on 404', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });
        const res = await fetchDriveSnapshotStatus();
        expect(res.exists).toBe(false);
      });

      it('defaults exists to false when backend omits has_snapshot and updatedAt', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({}),
        });

        const res = await fetchDriveSnapshotStatus();
        expect(res.exists).toBe(false);
        expect(res.updatedAt).toBeNull();
      });

      it('treats remote snapshot as existing when backend provides updatedAt', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ remote_updated_at: 'time' }),
        });

        const res = await fetchDriveSnapshotStatus();
        expect(res.exists).toBe(true);
        expect(res.updatedAt).toBe('time');
      });

      it('可解析 source_installation_id / source_profile_id', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            has_snapshot: true,
            remote_updated_at: 'time',
            source_installation_id: 'install-abc',
            source_profile_id: 'profile-xyz',
          }),
        });

        const res = await fetchDriveSnapshotStatus();
        expect(res.sourceInstallationId).toBe('install-abc');
        expect(res.sourceProfileId).toBe('profile-xyz');
      });

      it('缺少 source_installation_id 欄位時回傳 sourceInstallationId: null', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ has_snapshot: true }),
        });

        const res = await fetchDriveSnapshotStatus();
        expect(res.sourceInstallationId).toBeNull();
        expect(res.sourceProfileId).toBeNull();
      });

      it('404 時回傳 sourceInstallationId: null / sourceProfileId: null', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });

        const res = await fetchDriveSnapshotStatus();
        expect(res.sourceInstallationId).toBeNull();
        expect(res.sourceProfileId).toBeNull();
      });
    });

    describe('uploadDriveSnapshot', () => {
      it('returns success on ok with backend contract payload', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            metadata: {
              updated_at: 'x',
            },
          }),
        });
        const snapshot = { payload: 1 };
        const res = await uploadDriveSnapshot(snapshot);
        expect(res.success).toBe(true);
        expect(res.updatedAt).toBe('x');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-server.example.com/v1/account/drive/snapshot',
          expect.objectContaining({
            method: 'PUT',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({
              snapshot,
              force: false,
            }),
          })
        );
      });

      it('sends force in request body when true', async () => {
        mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
        const snapshot = { foo: 'bar' };
        await uploadDriveSnapshot(snapshot, true);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-server.example.com/v1/account/drive/snapshot',
          expect.objectContaining({
            body: JSON.stringify({
              snapshot,
              force: true,
            }),
          })
        );
      });

      it('returns conflict error gracefully on 409', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 409,
          json: async () => ({
            code: 'REMOTE_SNAPSHOT_NEWER',
            remote_updated_at: '2026-04-21T00:00:00.000Z',
          }),
        });
        const res = await uploadDriveSnapshot({});
        expect(res.success).toBe(false);
        expect(res.errorCode).toBe(DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER);
        expect(res.remoteUpdatedAt).toBe('2026-04-21T00:00:00.000Z');
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

      it('throws error with code NO_REMOTE_SNAPSHOT on 404', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });
        await expect(downloadDriveSnapshot()).rejects.toMatchObject({
          message: DRIVE_SYNC_ERROR_CODES.NO_REMOTE_SNAPSHOT,
          code: DRIVE_SYNC_ERROR_CODES.NO_REMOTE_SNAPSHOT,
        });
      });
    });

    describe('disconnectDrive', () => {
      it('resolves on OK and calls DELETE /drive/connection with auth headers', async () => {
        mockFetch.mockResolvedValue({ ok: true });
        await expect(disconnectDrive()).resolves.toBeUndefined();

        expect(mockFetch).toHaveBeenCalledWith(
          'https://test-server.example.com/v1/account/drive/connection',
          expect.objectContaining({
            method: 'DELETE',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            }),
          })
        );
      });

      it('throws on non-ok', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => '' });
        await expect(disconnectDrive()).rejects.toThrow();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/v1/account/drive/connection'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });
  });
});
