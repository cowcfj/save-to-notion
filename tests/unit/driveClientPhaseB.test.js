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

    it('monthly 加 30 天', () => {
      const before = Date.now();
      const result = computeNextEligibleAt('monthly');
      const ts = Date.parse(result);
      expect(ts - before).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1000);
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

    it('第一次呼叫：revision 從 0 遞增為 1', async () => {
      // storage 初始為空（revision = 0）
      mockStorageLocal.get.mockResolvedValue({});
      await markDriveDirty();
      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION]: 1,
        })
      );
    });

    it('連續呼叫 N 次，revision 累加至 N（序列呼叫）', async () => {
      // 每次 get 回傳上一次 set 的內容（模擬序列認測）
      let storedRevision = 0;
      mockStorageLocal.get.mockImplementation(() =>
        Promise.resolve({ [DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION]: storedRevision })
      );
      mockStorageLocal.set.mockImplementation(data => {
        if (DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION in data) {
          storedRevision = data[DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION];
        }
        return Promise.resolve();
      });

      await markDriveDirty();
      await markDriveDirty();
      await markDriveDirty();

      expect(storedRevision).toBe(3);
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

    it('expectedDirtyRevision 未傳入（undefined）時，無條件清除 DIRTY = false（向下相容）', async () => {
      await clearDriveDirty({ snapshotHash: null, frequency: 'weekly' });
      const call = mockStorageLocal.set.mock.calls[0][0];
      expect(call[DRIVE_SYNC_STORAGE_KEYS.DIRTY]).toBe(false);
      // 不應呼叫 storage.get（無需比對 revision）
      expect(mockStorageLocal.get).not.toHaveBeenCalled();
    });

    it('expectedDirtyRevision 與 storage 一致時，DIRTY 被清除', async () => {
      // storage 中 revision = 3
      mockStorageLocal.get.mockResolvedValue({
        [DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION]: 3,
      });
      await clearDriveDirty({ snapshotHash: null, frequency: 'weekly', expectedDirtyRevision: 3 });
      const call = mockStorageLocal.set.mock.calls[0][0];
      expect(call[DRIVE_SYNC_STORAGE_KEYS.DIRTY]).toBe(false);
    });

    it('expectedDirtyRevision 與 storage 不一致時，DIRTY 保留 true（race condition 修正）', async () => {
      // storage 中 revision = 4（期間有新寫入）
      mockStorageLocal.get.mockResolvedValue({
        [DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION]: 4,
      });
      await clearDriveDirty({ snapshotHash: null, frequency: 'weekly', expectedDirtyRevision: 3 });
      const call = mockStorageLocal.set.mock.calls[0][0];
      // DIRTY 不應被寫入 patch（保留 true）
      expect(call[DRIVE_SYNC_STORAGE_KEYS.DIRTY]).toBeUndefined();
    });

    it('即使 revision 不一致，snapshotHash 與 nextEligibleAt 仍更新（避免 retry 風暴）', async () => {
      mockStorageLocal.get.mockResolvedValue({
        [DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION]: 5,
      });
      await clearDriveDirty({
        snapshotHash: 'xyz',
        frequency: 'daily',
        expectedDirtyRevision: 3,
      });
      const call = mockStorageLocal.set.mock.calls[0][0];
      expect(call[DRIVE_SYNC_STORAGE_KEYS.LAST_SNAPSHOT_HASH]).toBe('xyz');
      expect(Date.parse(call[DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT])).toBeGreaterThan(
        Date.now()
      );
    });
  });
});
