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
 * @param {'off' | 'daily' | 'weekly' | 'monthly'} frequency
 * @returns {Promise<void>}
 */
export async function setupDriveAlarm(frequency) {
  await chrome.alarms.clear(DRIVE_AUTO_SYNC_ALARM);

  if (frequency === 'off') {
    return;
  }

  const periodInMinutes = FREQUENCY_PERIOD_MINUTES[frequency];
  await chrome.alarms.create(DRIVE_AUTO_SYNC_ALARM, {
    delayInMinutes: periodInMinutes,
    periodInMinutes,
  });
}
