/**
 * driveAutoSync.test.js — Phase B Auto Upload Orchestrator 單元測試
 *
 * 覆蓋 shouldRunAutoSync() 所有條件分支。
 */

import { shouldRunAutoSync } from '../../scripts/background/handlers/driveAutoSync.js';

/** 基礎合法 metadata（所有條件均滿足） */
function baseMetadata(overrides = {}) {
  return {
    connectionEmail: 'user@example.com',
    frequency: 'weekly',
    dirty: true,
    needsManualReview: false,
    nextEligibleAt: null,
    installationId: 'inst-1',
    profileId: 'profile-1',
    ...overrides,
  };
}

describe('shouldRunAutoSync()', () => {
  it('所有條件滿足時應執行', () => {
    const { shouldRun, reason } = shouldRunAutoSync(baseMetadata());
    expect(shouldRun).toBe(true);
    expect(reason).toBe('all_conditions_met');
  });

  it('account 未登入時跳過', () => {
    const { shouldRun, reason } = shouldRunAutoSync(baseMetadata(), { isAccountLoggedIn: false });
    expect(shouldRun).toBe(false);
    expect(reason).toBe('account_not_logged_in');
  });

  it('Drive 未連接（無 connectionEmail）時跳過', () => {
    const { shouldRun, reason } = shouldRunAutoSync(baseMetadata({ connectionEmail: null }));
    expect(shouldRun).toBe(false);
    expect(reason).toBe('drive_not_connected');
  });

  it('frequency = off 時跳過', () => {
    const { shouldRun, reason } = shouldRunAutoSync(baseMetadata({ frequency: 'off' }));
    expect(shouldRun).toBe(false);
    expect(reason).toBe('frequency_off');
  });

  it('daily frequency 且條件滿足時應執行', () => {
    const { shouldRun } = shouldRunAutoSync(baseMetadata({ frequency: 'daily' }));
    expect(shouldRun).toBe(true);
  });

  it('monthly frequency 且條件滿足時應執行', () => {
    const { shouldRun } = shouldRunAutoSync(baseMetadata({ frequency: 'monthly' }));
    expect(shouldRun).toBe(true);
  });

  it('dirty = false 時跳過', () => {
    const { shouldRun, reason } = shouldRunAutoSync(baseMetadata({ dirty: false }));
    expect(shouldRun).toBe(false);
    expect(reason).toBe('not_dirty');
  });

  it('needsManualReview = true 時跳過', () => {
    const { shouldRun, reason } = shouldRunAutoSync(baseMetadata({ needsManualReview: true }));
    expect(shouldRun).toBe(false);
    expect(reason).toBe('needs_manual_review');
  });

  it('nextEligibleAt 未到期時跳過', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { shouldRun, reason } = shouldRunAutoSync(baseMetadata({ nextEligibleAt: future }));
    expect(shouldRun).toBe(false);
    expect(reason).toBe('not_yet_eligible');
  });

  it('nextEligibleAt 已過期時應執行', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const { shouldRun } = shouldRunAutoSync(baseMetadata({ nextEligibleAt: past }));
    expect(shouldRun).toBe(true);
  });

  it('nextEligibleAt = null（首次或 off 轉回）時應執行', () => {
    const { shouldRun } = shouldRunAutoSync(baseMetadata({ nextEligibleAt: null }));
    expect(shouldRun).toBe(true);
  });
});
