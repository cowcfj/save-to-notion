/**
 * driveClientPhaseB.test.js — Phase B 新增 helpers 單元測試
 *
 * 覆蓋：
 * - computeNextEligibleAt()
 * - setDriveFrequency()
 * - markDriveDirty()
 * - clearDriveDirty()
 * - DRIVE_SYNC_FREQUENCIES
 *
 * 遵循 driveClient.test.js 的 mock 模式（beforeEach 覆蓋 chrome.storage.local）
 */

/* global jest */

import {
  computeNextEligibleAt,
  setDriveFrequency,
  markDriveDirty,
  clearDriveDirty,
  DRIVE_SYNC_FREQUENCIES,
  DRIVE_SYNC_STORAGE_KEYS,
} from '../../scripts/auth/driveClient.js';

describe('Phase B — driveClient helpers', () => {
  let mockStorageLocal;

  beforeEach(() => {
    mockStorageLocal = {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    globalThis.chrome = {
      runtime: { id: 'test-ext-id' },
      storage: { local: mockStorageLocal },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('DRIVE_SYNC_FREQUENCIES', () => {
    it('包含四個合法頻率值', () => {
      expect(DRIVE_SYNC_FREQUENCIES).toContain('off');
      expect(DRIVE_SYNC_FREQUENCIES).toContain('daily');
      expect(DRIVE_SYNC_FREQUENCIES).toContain('weekly');
      expect(DRIVE_SYNC_FREQUENCIES).toContain('monthly');
    });
  });

  describe('computeNextEligibleAt()', () => {
    it('daily 加 1 天', () => {
      const before = Date.now();
      const result = computeNextEligibleAt('daily');
      const ts = Date.parse(result);
      expect(ts - before).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
      expect(ts - before).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    });

    it('weekly 加 7 天', () => {
      const before = Date.now();
      const result = computeNextEligibleAt('weekly');
      const ts = Date.parse(result);
      expect(ts - before).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
    });

    it('monthly 加至少 28 天', () => {
      const before = Date.now();
      const result = computeNextEligibleAt('monthly');
      const ts = Date.parse(result);
      expect(ts - before).toBeGreaterThanOrEqual(28 * 24 * 60 * 60 * 1000);
    });

    it('回傳值為合法 ISO 8601 字串', () => {
      const result = computeNextEligibleAt('weekly');
      expect(typeof result).toBe('string');
      expect(Date.parse(result)).not.toBeNaN();
    });
  });

  describe('setDriveFrequency()', () => {
    it('frequency = off 時 nextEligibleAt 寫 null', async () => {
      await setDriveFrequency('off');
      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [DRIVE_SYNC_STORAGE_KEYS.FREQUENCY]: 'off',
          [DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT]: null,
        })
      );
    });

    it('frequency = weekly 時 nextEligibleAt 為未來時間', async () => {
      await setDriveFrequency('weekly');
      const call = mockStorageLocal.set.mock.calls[0][0];
      const ts = Date.parse(call[DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT]);
      expect(ts).toBeGreaterThan(Date.now());
    });

    it('frequency = daily 時 FREQUENCY key 正確寫入', async () => {
      await setDriveFrequency('daily');
      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({ [DRIVE_SYNC_STORAGE_KEYS.FREQUENCY]: 'daily' })
      );
    });
  });

  describe('markDriveDirty()', () => {
    it('設定 driveSyncDirty = true', async () => {
      await markDriveDirty();
      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [DRIVE_SYNC_STORAGE_KEYS.DIRTY]: true,
        })
      );
    });
  });

  describe('clearDriveDirty()', () => {
    it('清除 dirty，更新 hash 和 nextEligibleAt', async () => {
      await clearDriveDirty({ snapshotHash: 'abc123', frequency: 'weekly' });
      const call = mockStorageLocal.set.mock.calls[0][0];
      expect(call[DRIVE_SYNC_STORAGE_KEYS.DIRTY]).toBe(false);
      expect(call[DRIVE_SYNC_STORAGE_KEYS.LAST_SNAPSHOT_HASH]).toBe('abc123');
      expect(Date.parse(call[DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT])).toBeGreaterThan(
        Date.now()
      );
    });

    it('frequency = off 時 nextEligibleAt 寫 null', async () => {
      await clearDriveDirty({ snapshotHash: null, frequency: 'off' });
      const call = mockStorageLocal.set.mock.calls[0][0];
      expect(call[DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT]).toBeNull();
    });

    it('snapshotHash = null 時仍成功', async () => {
      await clearDriveDirty({ snapshotHash: null, frequency: 'monthly' });
      const call = mockStorageLocal.set.mock.calls[0][0];
      expect(call[DRIVE_SYNC_STORAGE_KEYS.LAST_SNAPSHOT_HASH]).toBeNull();
    });
  });
});
