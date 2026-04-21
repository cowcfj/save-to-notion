/**
 * driveAutoSync.test.js — Phase B Auto Upload Orchestrator 單元測試
 *
 * 覆蓋 shouldRunAutoSync() 所有條件分支。
 */

import {
  shouldRunAutoSync,
  runAutoUpload,
} from '../../scripts/background/handlers/driveAutoSync.js';
import * as driveClient from '../../scripts/auth/driveClient.js';
import * as accountSession from '../../scripts/auth/accountSession.js';
import * as driveSnapshot from '../../scripts/sync/driveSnapshot.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/runtimeActions.js';
import Logger from '../../scripts/utils/Logger.js';

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
    lastKnownRemoteUpdatedAt: null,
    lastSuccessfulUploadAt: null,
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

describe('runAutoUpload()', () => {
  let mockSendMessage;

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue({});
    globalThis.chrome = {
      runtime: {
        sendMessage: mockSendMessage,
      },
    };

    jest.spyOn(Logger, 'info').mockImplementation(() => {});
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger, 'error').mockImplementation(() => {});
    jest.spyOn(Logger, 'success').mockImplementation(() => {});

    // 預設視為已登入；個別案例可覆寫
    jest.spyOn(accountSession, 'getAccountAccessToken').mockResolvedValue('fake-token');

    jest.spyOn(driveClient, 'getDriveSyncMetadata').mockResolvedValue(baseMetadata());
    jest.spyOn(driveClient, 'updateDriveSyncRunMetadata').mockResolvedValue();
    jest.spyOn(driveClient, 'clearDriveDirty').mockResolvedValue();
    jest
      .spyOn(driveClient, 'uploadDriveSnapshot')
      .mockResolvedValue({ success: true, updatedAt: '2026-04-21T00:00:00.000Z' });

    jest.spyOn(driveSnapshot, 'buildUnifiedPageStateFromLocalStorage').mockResolvedValue({
      pages: new Map(),
      urlAliases: new Map(),
    });
    jest.spyOn(driveSnapshot, 'buildDriveSnapshot').mockResolvedValue({
      metadata: { updated_at: 'x', item_counts: {} },
      payload: {},
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete globalThis.chrome;
  });

  it('bails out early if getDriveSyncMetadata throws', async () => {
    driveClient.getDriveSyncMetadata.mockRejectedValue(new Error('db read failed'));
    await runAutoUpload();
    expect(driveClient.uploadDriveSnapshot).not.toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('讀取 metadata 失敗'),
      expect.any(Object)
    );
  });

  it('bails out early if shouldRunAutoSync returns false', async () => {
    // metadata frequency is 'off'
    driveClient.getDriveSyncMetadata.mockResolvedValue(baseMetadata({ frequency: 'off' }));
    await runAutoUpload();
    expect(driveSnapshot.buildDriveSnapshot).not.toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('跳過自動同步'), {
      reason: 'frequency_off',
    });
  });

  it('broadcases conflict when REMOTE_SNAPSHOT_NEWER occurs', async () => {
    driveClient.uploadDriveSnapshot.mockResolvedValue({
      success: false,
      errorCode: 'REMOTE_SNAPSHOT_NEWER',
      remoteUpdatedAt: '2026-04-20T00:00:00.000Z',
    });

    await runAutoUpload();

    expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
      type: 'upload',
      success: false,
      errorCode: 'REMOTE_SNAPSHOT_NEWER',
      remoteUpdatedAt: '2026-04-20T00:00:00.000Z',
    });
    expect(mockSendMessage).toHaveBeenCalledWith({
      action: RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT,
      conflictType: 'REMOTE_SNAPSHOT_NEWER',
      remoteUpdatedAt: '2026-04-20T00:00:00.000Z',
    });
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: null,
        lastSuccessfulUploadAt: null,
      })
    );
  });

  it('skips DRIVE_SYNC_CONFLICT broadcast when remoteUpdatedAt is invalid', async () => {
    driveClient.uploadDriveSnapshot.mockResolvedValue({
      success: false,
      errorCode: 'REMOTE_SNAPSHOT_NEWER',
      remoteUpdatedAt: null,
    });

    await runAutoUpload();

    expect(mockSendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT })
    );
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('REMOTE_SNAPSHOT_NEWER without valid remoteUpdatedAt'),
      expect.any(Object)
    );
  });

  it('handles general upload failures gracefully', async () => {
    driveClient.uploadDriveSnapshot.mockResolvedValue({
      success: false,
      errorCode: 'RATE_LIMIT_EXCEEDED',
    });

    await runAutoUpload();

    expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
      type: 'upload',
      success: false,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      remoteUpdatedAt: undefined,
    });
    expect(mockSendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT })
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: null,
        lastSuccessfulUploadAt: null,
      })
    );
  });

  it('catches and logs exception during snapshot building', async () => {
    driveSnapshot.buildUnifiedPageStateFromLocalStorage.mockRejectedValue(new Error('build error'));

    await runAutoUpload();

    expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
      type: 'upload',
      success: false,
      errorCode: 'UPLOAD_FAILED',
    });
    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('自動上傳例外'),
      expect.any(Object)
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: null,
        lastSuccessfulUploadAt: null,
      })
    );
  });

  it('successfully uploads, clears dirty flag, and broadcasts status updated', async () => {
    driveClient.getDriveSyncMetadata.mockResolvedValueOnce(baseMetadata()).mockResolvedValueOnce(
      baseMetadata({
        lastKnownRemoteUpdatedAt: '2026-04-21T00:00:00.000Z',
        lastSuccessfulUploadAt: '2026-04-21T00:00:00.000Z',
      })
    );

    await runAutoUpload();

    expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
      type: 'upload',
      success: true,
      remoteUpdatedAt: '2026-04-21T00:00:00.000Z',
    });
    expect(driveClient.clearDriveDirty).toHaveBeenCalledWith({
      snapshotHash: expect.any(String),
      frequency: 'weekly',
    });
    expect(Logger.success).toHaveBeenCalledWith(
      expect.stringContaining('自動上傳成功'),
      expect.any(Object)
    );
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: '2026-04-21T00:00:00.000Z',
        lastSuccessfulUploadAt: '2026-04-21T00:00:00.000Z',
      })
    );
  });

  it('ignores background broadcast errors silently', async () => {
    mockSendMessage.mockRejectedValue(new Error('no receiver'));
    await runAutoUpload();
    // Should not throw
    expect(Logger.success).toHaveBeenCalled();
  });

  it('skips upload when account is logged out (resolved via getAccountAccessToken)', async () => {
    accountSession.getAccountAccessToken.mockResolvedValue(null);

    await runAutoUpload();

    expect(driveClient.uploadDriveSnapshot).not.toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('跳過自動同步'), {
      reason: 'account_not_logged_in',
    });
  });

  it('respects explicit isAccountLoggedIn context without calling getAccountAccessToken', async () => {
    await runAutoUpload({ isAccountLoggedIn: true });

    expect(accountSession.getAccountAccessToken).not.toHaveBeenCalled();
    expect(driveClient.uploadDriveSnapshot).toHaveBeenCalled();
  });
});
