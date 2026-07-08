/**
 * driveAlarmScheduler.test.js — Phase B Alarm Scheduler 單元測試
 *
 * 遵循專案 chrome mock 模式：在 beforeEach 覆蓋 chrome.alarms
 */

/* global jest */

import {
  setupDriveAlarm,
  DRIVE_AUTO_SYNC_ALARM,
} from '../../scripts/background/handlers/driveAlarmScheduler.js';

describe('DRIVE_AUTO_SYNC_ALARM', () => {
  it('常量值為固定字串', () => {
    expect(typeof DRIVE_AUTO_SYNC_ALARM).toBe('string');
    expect(DRIVE_AUTO_SYNC_ALARM.length).toBeGreaterThan(0);
  });
});

describe('setupDriveAlarm()', () => {
  let mockAlarmsCreate;
  let mockAlarmsClear;

  beforeEach(() => {
    mockAlarmsCreate = jest.fn().mockResolvedValue(undefined);
    mockAlarmsClear = jest.fn().mockResolvedValue(true);

    globalThis.chrome = {
      ...globalThis.chrome,
      alarms: {
        create: mockAlarmsCreate,
        clear: mockAlarmsClear,
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete globalThis.chrome;
  });

  it('frequency = off 時只清除 alarm，不建立', async () => {
    await setupDriveAlarm('off');
    expect(mockAlarmsClear).toHaveBeenCalledWith(DRIVE_AUTO_SYNC_ALARM);
    expect(mockAlarmsCreate).not.toHaveBeenCalled();
  });

  it('frequency = daily 建立 periodInMinutes = 1440', async () => {
    await setupDriveAlarm('daily');
    expect(mockAlarmsCreate).toHaveBeenCalledWith(
      DRIVE_AUTO_SYNC_ALARM,
      expect.objectContaining({ periodInMinutes: 1440 })
    );
  });

  it('frequency = weekly 建立 periodInMinutes = 10080', async () => {
    await setupDriveAlarm('weekly');
    expect(mockAlarmsCreate).toHaveBeenCalledWith(
      DRIVE_AUTO_SYNC_ALARM,
      expect.objectContaining({ periodInMinutes: 10_080 })
    );
  });

  it('frequency = monthly 建立 periodInMinutes = 43200', async () => {
    await setupDriveAlarm('monthly');
    expect(mockAlarmsCreate).toHaveBeenCalledWith(
      DRIVE_AUTO_SYNC_ALARM,
      expect.objectContaining({ periodInMinutes: 43_200 })
    );
  });

  it('每次呼叫都先清除舊 alarm（含 off）', async () => {
    await setupDriveAlarm('weekly');
    expect(mockAlarmsClear).toHaveBeenCalledWith(DRIVE_AUTO_SYNC_ALARM);
  });

  it('alarm 建立時 delayInMinutes === periodInMinutes（一致排程）', async () => {
    await setupDriveAlarm('weekly');
    const call = mockAlarmsCreate.mock.calls[0][1];
    expect(call.delayInMinutes).toBe(call.periodInMinutes);
  });

  it('提供 initialDelayInMinutes 時，delayInMinutes 使用指定值', async () => {
    await setupDriveAlarm('daily', { initialDelayInMinutes: 5 });

    expect(mockAlarmsCreate).toHaveBeenCalledWith(
      DRIVE_AUTO_SYNC_ALARM,
      expect.objectContaining({
        delayInMinutes: 5,
        periodInMinutes: 1440,
      })
    );
  });

  it('initialDelayInMinutes 小於 0.5 時，clamp 到 0.5', async () => {
    await setupDriveAlarm('daily', { initialDelayInMinutes: 0.1 });

    expect(mockAlarmsCreate).toHaveBeenCalledWith(
      DRIVE_AUTO_SYNC_ALARM,
      expect.objectContaining({
        delayInMinutes: 0.5,
        periodInMinutes: 1440,
      })
    );
  });

  it('initialDelayInMinutes = NaN 時，退回 periodInMinutes', async () => {
    await setupDriveAlarm('daily', { initialDelayInMinutes: Number.NaN });

    expect(mockAlarmsCreate).toHaveBeenCalledWith(
      DRIVE_AUTO_SYNC_ALARM,
      expect.objectContaining({
        delayInMinutes: 1440,
        periodInMinutes: 1440,
      })
    );
  });
});
