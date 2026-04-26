/**
 * driveAlarmScheduler.js — Drive Sync 排程管理
 *
 * 負責：
 * - 根據 driveSyncFrequency 設定/清除 chrome.alarms
 * - 固定 alarm name 為 DRIVE_AUTO_SYNC_ALARM
 * - 提供 setupDriveAlarm() 供背景初始化與頻率變更後呼叫
 *
 * 設計原則：
 * - alarm 週期以分鐘為單位，daily = 1440 min，weekly = 10080 min，monthly = 43200 min
 * - frequency = 'off' 時清除 alarm
 * - 不直接觸發 upload；alarm 觸發後由 driveAutoSync.js 的 orchestrator 判斷
 *
 * @see docs/plans/2026-04-20-google-drive-sync-frontend-phase-b-auto-sync-plan.md §6 Step 1
 */

/* global chrome */

/** 固定 alarm name，避免 magic string 漂移 */
export const DRIVE_AUTO_SYNC_ALARM = 'DRIVE_AUTO_SYNC_ALARM';

/** 各頻率對應的 alarm 間隔（分鐘） */
const FREQUENCY_PERIOD_MINUTES = {
  daily: 1440,
  weekly: 10_080,
  monthly: 43_200,
};

/**
 * 根據給定頻率設定或清除 Drive auto sync alarm。
 *
 * 'off' 時清除現有 alarm；未知頻率會拋錯以避免 chrome.alarms.create 收到
 * `periodInMinutes: undefined` 導致排程失效。
 *
 * @param {'off' | 'daily' | 'weekly' | 'monthly'} frequency
 * @param {{ initialDelayInMinutes?: number }} [options]
 * @returns {Promise<void>}
 * @throws {Error} 當 frequency 非 'off' 且不存在於 FREQUENCY_PERIOD_MINUTES 時
 */
export async function setupDriveAlarm(frequency, options = {}) {
  await chrome.alarms.clear(DRIVE_AUTO_SYNC_ALARM);

  if (frequency === 'off') {
    return;
  }

  const periodInMinutes = FREQUENCY_PERIOD_MINUTES[frequency];
  if (!Number.isFinite(periodInMinutes)) {
    throw new TypeError(
      `[driveAlarmScheduler] setupDriveAlarm received unknown frequency: ${frequency}`
    );
  }

  const resolvedInitialDelay =
    typeof options.initialDelayInMinutes === 'number'
      ? Math.max(0.5, options.initialDelayInMinutes)
      : periodInMinutes;

  await chrome.alarms.create(DRIVE_AUTO_SYNC_ALARM, {
    delayInMinutes: resolvedInitialDelay,
    periodInMinutes,
  });
}
