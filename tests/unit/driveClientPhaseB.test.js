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

let computeNextEligibleAt;
let setDriveFrequency;
let markDriveDirty;
let clearDriveDirty;
let writeDriveAutoSyncTelemetry;
let DRIVE_SYNC_FREQUENCIES;
let DRIVE_SYNC_STORAGE_KEYS;
let Logger;

beforeAll(async () => {
  ({
    computeNextEligibleAt,
    setDriveFrequency,
    markDriveDirty,
    clearDriveDirty,
    writeDriveAutoSyncTelemetry,
    DRIVE_SYNC_FREQUENCIES,
    DRIVE_SYNC_STORAGE_KEYS,
  } = await import('../../scripts/auth/driveClient.js'));
  ({ default: Logger } = await import('../../scripts/utils/Logger.js'));
});

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
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-20T10:00:00.000Z'));
    });

    it('daily 加 1 天', () => {
      expect(computeNextEligibleAt('daily')).toBe('2026-04-21T10:00:00.000Z');
    });

    it('weekly 加 7 天', () => {
      expect(computeNextEligibleAt('weekly')).toBe('2026-04-27T10:00:00.000Z');
    });

    it('monthly 加 30 天', () => {
      expect(computeNextEligibleAt('monthly')).toBe('2026-05-20T10:00:00.000Z');
    });

    it('回傳值為合法 ISO 8601 字串', () => {
      const result = computeNextEligibleAt('weekly');
      expect(typeof result).toBe('string');
      expect(Date.parse(result)).not.toBeNaN();
    });
  });

  describe('setDriveFrequency()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-20T10:00:00.000Z'));
    });

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
      expect(call[DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT]).toBe('2026-04-27T10:00:00.000Z');
    });

    it('frequency = daily 時 FREQUENCY key 正確寫入', async () => {
      await setDriveFrequency('daily');
      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({ [DRIVE_SYNC_STORAGE_KEYS.FREQUENCY]: 'daily' })
      );
    });

    it('invalid frequency writes off, clears nextEligibleAt, and warns', async () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => {});

      await setDriveFrequency('hourly');

      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        [DRIVE_SYNC_STORAGE_KEYS.FREQUENCY]: 'off',
        [DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT]: null,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        '[driveClient] setDriveFrequency received invalid frequency, fallback to off',
        { frequency: 'hourly' }
      );
    });
  });

  describe('markDriveDirty()', () => {
    it('只寫入 DIRTY_REVISION（單一 writer，不碰其他 dirty 相關 key）', async () => {
      await markDriveDirty();
      expect(mockStorageLocal.set).toHaveBeenCalledTimes(1);
      const call = mockStorageLocal.set.mock.calls[0][0];
      expect(Object.keys(call)).toEqual([DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION]);
    });

    it('第一次呼叫：revision 從 0 遞增為 1', async () => {
      mockStorageLocal.get.mockResolvedValue({});
      await markDriveDirty();
      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION]: 1,
        })
      );
    });

    it('連續呼叫 N 次，revision 累加至 N（序列呼叫）', async () => {
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
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-20T10:00:00.000Z'));
    });

    it('更新 snapshotHash 與 nextEligibleAt', async () => {
      await clearDriveDirty({ snapshotHash: 'abc123', frequency: 'weekly' });
      const call = mockStorageLocal.set.mock.calls[0][0];
      expect(call[DRIVE_SYNC_STORAGE_KEYS.LAST_SNAPSHOT_HASH]).toBe('abc123');
      expect(call[DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT]).toBe('2026-04-27T10:00:00.000Z');
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

    it('expectedDirtyRevision 未傳入時，不更新 LAST_UPLOADED_REVISION（手動 upload 路徑）', async () => {
      await clearDriveDirty({ snapshotHash: null, frequency: 'weekly' });
      const call = mockStorageLocal.set.mock.calls[0][0];
      expect(call[DRIVE_SYNC_STORAGE_KEYS.LAST_UPLOADED_REVISION]).toBeUndefined();
      expect(mockStorageLocal.get).not.toHaveBeenCalled();
    });

    it('expectedDirtyRevision 傳入時，LAST_UPLOADED_REVISION 寫入為該值', async () => {
      await clearDriveDirty({
        snapshotHash: null,
        frequency: 'weekly',
        expectedDirtyRevision: 3,
      });
      const call = mockStorageLocal.set.mock.calls[0][0];
      expect(call[DRIVE_SYNC_STORAGE_KEYS.LAST_UPLOADED_REVISION]).toBe(3);
      expect(mockStorageLocal.get).not.toHaveBeenCalled();
    });

    it('不寫入任何舊 DIRTY flag key（schema 已移除）', async () => {
      await clearDriveDirty({
        snapshotHash: 'xyz',
        frequency: 'daily',
        expectedDirtyRevision: 3,
      });
      const call = mockStorageLocal.set.mock.calls[0][0];
      expect(Object.keys(call)).not.toContain('driveSyncDirty');
    });

    it('race scenario: markDriveDirty 與 clearDriveDirty 寫不同 key，不會互相覆蓋', async () => {
      await markDriveDirty();
      await clearDriveDirty({
        snapshotHash: 'hash',
        frequency: 'weekly',
        expectedDirtyRevision: 1,
      });

      const markCall = mockStorageLocal.set.mock.calls[0][0];
      const clearCall = mockStorageLocal.set.mock.calls[1][0];

      expect(markCall).toHaveProperty(DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION);
      expect(markCall).not.toHaveProperty(DRIVE_SYNC_STORAGE_KEYS.LAST_UPLOADED_REVISION);

      expect(clearCall).toHaveProperty(DRIVE_SYNC_STORAGE_KEYS.LAST_UPLOADED_REVISION);
      expect(clearCall).not.toHaveProperty(DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION);
    });
  });

  describe('writeDriveAutoSyncTelemetry()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-20T10:00:00.000Z'));
    });

    it('decision=run clears stale skip reason', async () => {
      await writeDriveAutoSyncTelemetry({ decision: 'run' });

      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        [DRIVE_SYNC_STORAGE_KEYS.LAST_AUTO_SYNC_DECISION]: 'run',
        [DRIVE_SYNC_STORAGE_KEYS.LAST_AUTO_SYNC_DECISION_AT]: '2026-04-20T10:00:00.000Z',
        [DRIVE_SYNC_STORAGE_KEYS.LAST_AUTO_SYNC_SKIP_REASON]: null,
      });
    });

    it('decision=skip records skip reason and optional alarm timestamp', async () => {
      await writeDriveAutoSyncTelemetry({
        decision: 'skip',
        skipReason: 'not_dirty',
        decisionAt: '2026-04-20T10:01:00.000Z',
        alarmFiredAt: '2026-04-20T10:00:30.000Z',
      });

      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        [DRIVE_SYNC_STORAGE_KEYS.LAST_AUTO_SYNC_DECISION]: 'skip',
        [DRIVE_SYNC_STORAGE_KEYS.LAST_AUTO_SYNC_DECISION_AT]: '2026-04-20T10:01:00.000Z',
        [DRIVE_SYNC_STORAGE_KEYS.LAST_AUTO_SYNC_SKIP_REASON]: 'not_dirty',
        [DRIVE_SYNC_STORAGE_KEYS.LAST_ALARM_FIRED_AT]: '2026-04-20T10:00:30.000Z',
      });
    });
  });
});
