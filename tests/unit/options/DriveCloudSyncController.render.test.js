/**
 * @jest-environment jsdom
 */

jest.mock('../../../pages/options/confirmDialog.js', () => ({
  confirmDialog: jest.fn().mockResolvedValue(true),
}));

import {
  setCloudSyncCardVisibility,
  renderCloudSyncCard,
  initCloudSyncController,
} from '../../../pages/options/DriveCloudSyncController.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
import Logger from '../../../scripts/utils/Logger.js';
import { DRIVE_SYNC_ERROR_CODES } from '../../../scripts/config/extension/driveSyncErrorCodes.js';

import {
  LOCAL_INSTALLATION_ID,
  REMOTE_INSTALLATION_ID,
  setupCloudSyncDom,
  installChromeMock,
  setupConfirmDialogMock,
  spyOnDriveClientDefaults,
} from './DriveCloudSyncController.shared.js';

describe('DriveCloudSyncController', () => {
  let mockSendMessage;

  beforeEach(() => {
    jest.useFakeTimers();
    setupCloudSyncDom();
    mockSendMessage = jest.fn().mockResolvedValue({ success: true });
    installChromeMock(mockSendMessage, {});
    jest.spyOn(Logger, 'error').mockImplementation(() => {});
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    setupConfirmDialogMock();
    spyOnDriveClientDefaults();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete globalThis.chrome;
  });

  describe('setCloudSyncCardVisibility', () => {
    it('shows card if logged in', () => {
      setCloudSyncCardVisibility(true);
      expect(document.querySelector('#cloud-sync-card').classList.contains('hidden')).toBe(false);
    });

    it('hides card if logged out', () => {
      setCloudSyncCardVisibility(false);
      expect(document.querySelector('#cloud-sync-card').classList.contains('hidden')).toBe(true);
    });
  });

  describe('logged-out state', () => {
    it('未登入時應顯示提示狀態而不是隱藏整張卡片', async () => {
      await initCloudSyncController(false);

      expect(document.querySelector('#cloud-sync-card').classList.contains('hidden')).toBe(false);
      expect(document.querySelector('#drive-state-logged-out').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-state-disconnected').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-state-connected').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-state-conflict').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-loading-overlay').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-login-prompt-button').disabled).toBe(true);
    });
  });

  describe('renderCloudSyncCard', () => {
    it('renders disconnected state correctly', () => {
      renderCloudSyncCard({ connectionEmail: null });
      expect(document.querySelector('#drive-state-disconnected').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-state-connected').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-state-conflict').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-error-banner').classList.contains('hidden')).toBe(true);
    });

    it('renders connected state correctly without conflict', () => {
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        lastSuccessfulUploadAt: '2023-01-01T00:00:00Z',
        needsManualReview: false,
      });
      expect(document.querySelector('#drive-state-disconnected').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-state-connected').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-state-conflict').classList.contains('hidden')).toBe(
        true
      );

      expect(document.querySelector('#drive-connected-email').textContent).toBe('test@notion.so');
      expect(document.querySelector('#drive-last-upload-text').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.LAST_UPLOAD_PREFIX
      );
      expect(document.querySelector('#drive-last-upload-text').textContent).toContain('（');
      expect(document.querySelector('#drive-last-upload-text').textContent).toContain('）');
    });

    it('transientAuthError=true 時應優先顯示暫時登入失效並停用操作按鈕', () => {
      renderCloudSyncCard(
        {
          connectionEmail: 'stale@notion.so',
          needsManualReview: false,
        },
        {
          transientAuthError: true,
        }
      );

      expect(document.querySelector('#drive-state-disconnected').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-state-connected').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-sync-status').textContent).toContain('臨時登入失效');
      expect(document.querySelector('#drive-sync-status').textContent).toContain('重新登入');
      expect(document.querySelector('#drive-sync-status').className).toContain('error');
      expect(document.querySelector('#drive-upload-button').disabled).toBe(true);
      expect(document.querySelector('#drive-download-button').disabled).toBe(true);
      expect(document.querySelector('#drive-disconnect-button').disabled).toBe(true);
      expect(document.querySelector('#drive-connect-button').disabled).toBe(true);
    });

    it('renders conflict state correctly', () => {
      // simulate conflict state
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        needsManualReview: true,
        lastErrorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
      });
      expect(document.querySelector('#drive-state-disconnected').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-state-connected').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-state-conflict').classList.contains('hidden')).toBe(
        false
      );

      // Error banner is hidden because REMOTE_SNAPSHOT_NEWER is considered conflict, not generic error
      expect(document.querySelector('#drive-error-banner').classList.contains('hidden')).toBe(true);
    });

    it('conflict state 應在 #drive-conflict-remote-time 顯示帶 prefix 的格式化遠端時間', () => {
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        needsManualReview: true,
        lastErrorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
        lastKnownRemoteUpdatedAt: '2026-05-20T08:00:00Z',
      });

      const remoteTimeText = document.querySelector('#drive-conflict-remote-time').textContent;
      expect(remoteTimeText).toContain(UI_MESSAGES.CLOUD_SYNC.CONFLICT_REMOTE_PREFIX);
      expect(remoteTimeText).toContain('（');
      expect(remoteTimeText).toContain('）');
    });

    it('conflict state 缺 lastKnownRemoteUpdatedAt 時 #drive-conflict-remote-time 應為空字串', () => {
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        needsManualReview: true,
        lastErrorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
      });

      expect(document.querySelector('#drive-conflict-remote-time').textContent).toBe('');
    });

    it('從 conflict 切回 connected 時 #drive-conflict-remote-time 應被清空避免 stale 文字殘留', () => {
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        needsManualReview: true,
        lastErrorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
        lastKnownRemoteUpdatedAt: '2026-05-20T08:00:00Z',
      });
      expect(document.querySelector('#drive-conflict-remote-time').textContent).not.toBe('');

      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        needsManualReview: false,
        lastSuccessfulUploadAt: '2026-05-21T09:00:00Z',
      });
      expect(document.querySelector('#drive-conflict-remote-time').textContent).toBe('');
    });

    it('renders other generic errors correctly', () => {
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        lastErrorCode: DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED,
        lastErrorAt: '2023-01-02T00:00:00Z',
      });
      expect(document.querySelector('#drive-error-banner').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-error-code').textContent).toContain(
        DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED
      );
      expect(document.querySelector('#drive-error-time').textContent).toContain(
        UI_MESSAGES.CLOUD_SYNC.ERROR_TIME_PREFIX
      );
    });

    it('falls back to raw timestamp when date formatting throws', () => {
      const toLocaleStringSpy = jest
        .spyOn(Date.prototype, 'toLocaleString')
        .mockImplementation(() => {
          throw new Error('format failed');
        });

      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        lastSuccessfulUploadAt: 'invalid-date-value',
        lastErrorCode: DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED,
        lastErrorAt: 'invalid-error-date',
      });

      expect(document.querySelector('#drive-last-upload-text').textContent).toContain(
        'invalid-date-value'
      );
      expect(document.querySelector('#drive-error-time').textContent).toContain(
        'invalid-error-date'
      );

      toLocaleStringSpy.mockRestore();
    });

    it('valid timestamp display includes a local timezone label', () => {
      renderCloudSyncCard({
        connectionEmail: 'timezone@test.dev',
        lastKnownRemoteUpdatedAt: '2026-04-19T12:00:00.000Z',
      });

      const text = document.querySelector('#drive-last-upload-text').textContent;
      expect(text).toContain('雲端備份：');
      expect(text).toContain('（');
      expect(text).toContain('）');
    });

    it.each([
      {
        name: 'lastSuccessfulUploadAt 為 null 但 lastKnownRemoteUpdatedAt 有值 → 顯示「雲端備份」',
        metadata: {
          connectionEmail: 'cross-device@test.dev',
          lastSuccessfulUploadAt: null,
          lastKnownRemoteUpdatedAt: '2026-04-19T12:00:00Z',
        },
        expectedText: [UI_MESSAGES.CLOUD_SYNC.LAST_REMOTE_PREFIX],
        absentText: [
          UI_MESSAGES.CLOUD_SYNC.NEVER_UPLOADED,
          UI_MESSAGES.CLOUD_SYNC.LAST_UPLOAD_PREFIX,
        ],
      },
      {
        name: 'lastSuccessfulUploadAt 優先於 lastKnownRemoteUpdatedAt',
        metadata: {
          connectionEmail: 'priority@test.dev',
          lastSuccessfulUploadAt: '2026-04-21T09:00:00Z',
          lastKnownRemoteUpdatedAt: '2026-04-19T12:00:00Z',
        },
        expectedText: [UI_MESSAGES.CLOUD_SYNC.LAST_UPLOAD_PREFIX],
        absentText: [UI_MESSAGES.CLOUD_SYNC.LAST_REMOTE_PREFIX],
      },
    ])('$name', ({ metadata, expectedText, absentText }) => {
      expect.hasAssertions();
      renderCloudSyncCard(metadata);

      const text = document.querySelector('#drive-last-upload-text').textContent;
      for (const expected of expectedText) {
        expect(text).toContain(expected);
      }
      for (const absent of absentText) {
        expect(text).not.toContain(absent);
      }
    });

    it('兩者皆無 → 維持「尚未上載」', () => {
      renderCloudSyncCard({ connectionEmail: 'nothing@test.dev' });
      expect(document.querySelector('#drive-last-upload-text').textContent).toBe(
        UI_MESSAGES.CLOUD_SYNC.NEVER_UPLOADED
      );
    });

    it('renders frequency and auto sync status properly', () => {
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        frequency: 'daily',
        needsManualReview: true,
      });
      expect(document.querySelector('#drive-frequency-select').value).toBe('daily');
      expect(document.querySelector('#drive-auto-sync-status').classList.contains('hidden')).toBe(
        false
      );
      expect(document.querySelector('#drive-auto-sync-status-text').textContent).toBe(
        UI_MESSAGES.CLOUD_SYNC.AUTO_SYNC_NEEDS_REVIEW
      );

      // off status hides the container
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        frequency: 'off',
      });
      expect(document.querySelector('#drive-auto-sync-status').classList.contains('hidden')).toBe(
        true
      );
    });

    it('hides auto sync status container when frequency is active but no review is needed', () => {
      // 先觸發 needsManualReview=true 使 container 顯示
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        frequency: 'weekly',
        needsManualReview: true,
      });
      expect(document.querySelector('#drive-auto-sync-status').classList.contains('hidden')).toBe(
        false
      );

      // 再切換到 needsManualReview=false：container 必須被隱藏，避免 margin-bottom 佔用空白
      renderCloudSyncCard({
        connectionEmail: 'test@notion.so',
        frequency: 'weekly',
        needsManualReview: false,
      });
      expect(document.querySelector('#drive-auto-sync-status').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#drive-auto-sync-status-text').textContent).toBe('');
    });
  });

  describe('Source Warning (_updateSourceWarning via renderCloudSyncCard)', () => {
    it('sourceInstallationId 與 installationId 不同時顯示 warning', () => {
      renderCloudSyncCard(
        { connectionEmail: 'user@test.dev', installationId: LOCAL_INSTALLATION_ID },
        { snapshotStatus: { sourceInstallationId: REMOTE_INSTALLATION_ID } }
      );
      const warning = document.querySelector('#drive-source-warning');
      expect(warning.hidden).toBe(false);
      expect(warning.textContent).toContain('⚠️');
    });

    it('sourceInstallationId === installationId 時隱藏 warning', () => {
      renderCloudSyncCard(
        { connectionEmail: 'user@test.dev', installationId: 'same-id' },
        { snapshotStatus: { sourceInstallationId: 'same-id' } }
      );
      expect(document.querySelector('#drive-source-warning').hidden).toBe(true);
    });

    it('sourceInstallationId 為 null 時隱藏 warning', () => {
      renderCloudSyncCard(
        { connectionEmail: 'user@test.dev', installationId: LOCAL_INSTALLATION_ID },
        { snapshotStatus: { sourceInstallationId: null } }
      );
      expect(document.querySelector('#drive-source-warning').hidden).toBe(true);
    });

    it('installationId 為 null 時隱藏 warning', () => {
      renderCloudSyncCard(
        { connectionEmail: 'user@test.dev', installationId: null },
        { snapshotStatus: { sourceInstallationId: REMOTE_INSTALLATION_ID } }
      );
      expect(document.querySelector('#drive-source-warning').hidden).toBe(true);
    });

    it('disconnected 狀態時 warning 應隱藏', () => {
      // 先讓 warning 顯示
      renderCloudSyncCard(
        { connectionEmail: 'user@test.dev', installationId: LOCAL_INSTALLATION_ID },
        { snapshotStatus: { sourceInstallationId: REMOTE_INSTALLATION_ID } }
      );
      expect(document.querySelector('#drive-source-warning').hidden).toBe(false);

      // 切換到 disconnected
      renderCloudSyncCard({ connectionEmail: null });
      expect(document.querySelector('#drive-source-warning').hidden).toBe(true);
    });
  });
});
