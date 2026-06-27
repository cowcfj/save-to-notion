/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

export const mockConfirmDialog = jest.fn().mockResolvedValue(true);

const DRIVE_SYNC_STORAGE_KEYS = {
  CONNECTION_EMAIL: 'driveSyncConnectionEmail',
  CONNECTED_AT: 'driveSyncConnectedAt',
  LAST_KNOWN_REMOTE_UPDATED_AT: 'driveSyncLastKnownRemoteUpdatedAt',
  LAST_SUCCESSFUL_UPLOAD_AT: 'driveSyncLastSuccessfulUploadAt',
  LAST_SUCCESSFUL_DOWNLOAD_AT: 'driveSyncLastSuccessfulDownloadAt',
  LAST_ERROR_CODE: 'driveSyncLastErrorCode',
  LAST_ERROR_AT: 'driveSyncLastErrorAt',
  LAST_RUN_AT: 'driveSyncLastRunAt',
  LAST_RUN_TYPE: 'driveSyncLastRunType',
  NEEDS_MANUAL_REVIEW: 'driveSyncNeedsManualReview',
  INSTALLATION_ID: 'driveSyncInstallationId',
  PROFILE_ID: 'driveSyncProfileId',
  FREQUENCY: 'driveSyncFrequency',
  DIRTY_REVISION: 'driveSyncDirtyRevision',
  LAST_UPLOADED_REVISION: 'driveSyncLastUploadedRevision',
  LAST_SNAPSHOT_HASH: 'driveSyncLastSnapshotHash',
  NEXT_ELIGIBLE_AT: 'driveSyncNextEligibleAt',
};

const DRIVE_SYNC_METADATA_FIELDS = [
  { key: DRIVE_SYNC_STORAGE_KEYS.CONNECTION_EMAIL, prop: 'connectionEmail', defaultValue: null },
  { key: DRIVE_SYNC_STORAGE_KEYS.CONNECTED_AT, prop: 'connectedAt', defaultValue: null },
  {
    key: DRIVE_SYNC_STORAGE_KEYS.LAST_KNOWN_REMOTE_UPDATED_AT,
    prop: 'lastKnownRemoteUpdatedAt',
    defaultValue: null,
  },
  {
    key: DRIVE_SYNC_STORAGE_KEYS.LAST_SUCCESSFUL_UPLOAD_AT,
    prop: 'lastSuccessfulUploadAt',
    defaultValue: null,
  },
  {
    key: DRIVE_SYNC_STORAGE_KEYS.LAST_SUCCESSFUL_DOWNLOAD_AT,
    prop: 'lastSuccessfulDownloadAt',
    defaultValue: null,
  },
  { key: DRIVE_SYNC_STORAGE_KEYS.LAST_ERROR_CODE, prop: 'lastErrorCode', defaultValue: null },
  { key: DRIVE_SYNC_STORAGE_KEYS.LAST_ERROR_AT, prop: 'lastErrorAt', defaultValue: null },
  { key: DRIVE_SYNC_STORAGE_KEYS.LAST_RUN_AT, prop: 'lastRunAt', defaultValue: null },
  { key: DRIVE_SYNC_STORAGE_KEYS.LAST_RUN_TYPE, prop: 'lastRunType', defaultValue: null },
  {
    key: DRIVE_SYNC_STORAGE_KEYS.NEEDS_MANUAL_REVIEW,
    prop: 'needsManualReview',
    defaultValue: false,
  },
  { key: DRIVE_SYNC_STORAGE_KEYS.INSTALLATION_ID, prop: 'installationId', defaultValue: null },
  { key: DRIVE_SYNC_STORAGE_KEYS.PROFILE_ID, prop: 'profileId', defaultValue: null },
  { key: DRIVE_SYNC_STORAGE_KEYS.FREQUENCY, prop: 'frequency', defaultValue: 'off' },
  { key: DRIVE_SYNC_STORAGE_KEYS.DIRTY_REVISION, prop: 'dirtyRevision', defaultValue: 0 },
  {
    key: DRIVE_SYNC_STORAGE_KEYS.LAST_UPLOADED_REVISION,
    prop: 'lastUploadedRevision',
    defaultValue: 0,
  },
  { key: DRIVE_SYNC_STORAGE_KEYS.LAST_SNAPSHOT_HASH, prop: 'lastSnapshotHash', defaultValue: null },
  { key: DRIVE_SYNC_STORAGE_KEYS.NEXT_ELIGIBLE_AT, prop: 'nextEligibleAt', defaultValue: null },
];

const ALL_DRIVE_SYNC_KEYS = Object.values(DRIVE_SYNC_STORAGE_KEYS);
const DRIVE_SYNC_CLEAR_KEYS = ALL_DRIVE_SYNC_KEYS.filter(
  key => key !== DRIVE_SYNC_STORAGE_KEYS.INSTALLATION_ID
);

const readDriveSyncMetadataFromStorage = async () => {
  const data = await chrome.storage.local.get(ALL_DRIVE_SYNC_KEYS);
  const metadata = {};
  for (const item of DRIVE_SYNC_METADATA_FIELDS) {
    const value = data[item.key];
    metadata[item.prop] = value !== undefined && value !== null ? value : item.defaultValue;
  }
  return metadata;
};

const setDriveConnectionInStorage = async (connection, options = {}) => {
  const patch = {
    [DRIVE_SYNC_STORAGE_KEYS.CONNECTION_EMAIL]: connection.email,
    [DRIVE_SYNC_STORAGE_KEYS.CONNECTED_AT]: connection.connectedAt,
  };
  if (options.resetConflicts !== false) {
    patch[DRIVE_SYNC_STORAGE_KEYS.NEEDS_MANUAL_REVIEW] = false;
  }
  await chrome.storage.local.set(patch);
};

const clearDriveSyncMetadataFromStorage = async () => {
  await chrome.storage.local.remove(DRIVE_SYNC_CLEAR_KEYS);
};

const setLastKnownRemoteUpdatedAtInStorage = async updatedAt => {
  await chrome.storage.local.set({
    [DRIVE_SYNC_STORAGE_KEYS.LAST_KNOWN_REMOTE_UPDATED_AT]: updatedAt,
  });
};

export const mockDriveClientModule = {
  DRIVE_SYNC_STORAGE_KEYS,
  DRIVE_SYNC_FREQUENCIES: ['off', 'daily', 'weekly', 'monthly'],
  ALL_DRIVE_SYNC_KEYS,
  startDriveOAuthFlow: jest.fn(),
  getDriveSyncMetadata: jest.fn(),
  ensureDriveSyncIdentity: jest.fn(),
  setDriveConnection: jest.fn(),
  clearDriveSyncMetadata: jest.fn(),
  updateDriveSyncRunMetadata: jest.fn(),
  clearDriveSyncConflict: jest.fn(),
  setLastKnownRemoteUpdatedAt: jest.fn(),
  fetchDriveConnectionStatus: jest.fn(),
  fetchDriveSnapshotStatus: jest.fn(),
  uploadDriveSnapshot: jest.fn(),
  downloadDriveSnapshot: jest.fn(),
  disconnectDrive: jest.fn(),
  setDriveFrequency: jest.fn(),
  markDriveDirty: jest.fn(),
  clearDriveDirty: jest.fn(),
  computeNextEligibleAt: jest.fn(),
  writeDriveAutoSyncTelemetry: jest.fn(),
};

jest.unstable_mockModule('../../../pages/options/confirmDialog.js', () => ({
  confirmDialog: mockConfirmDialog,
}));

jest.unstable_mockModule('../../../scripts/auth/driveClient.js', () => mockDriveClientModule);

jest.mock('../../../pages/options/confirmDialog.js', () => ({
  confirmDialog: mockConfirmDialog,
}));

jest.mock('../../../scripts/auth/driveClient.js', () => mockDriveClientModule);

export const getConfirmDialogMock = () => mockConfirmDialog;

export async function flushAsyncWork() {
  // Let Jest flush queued Promise callbacks without advancing delayed status timers.
  await jest.advanceTimersByTimeAsync(0);
}

const getStorageString = (key, state) => (Object.hasOwn(state, key) ? { [key]: state[key] } : {});

const getStorageArray = (keys, state) => {
  const result = {};
  for (const key of keys) {
    if (Object.hasOwn(state, key)) {
      result[key] = state[key];
    }
  }
  return result;
};

const getStorageObject = (keysObj, state) => {
  const result = {};
  for (const [key, defaultVal] of Object.entries(keysObj)) {
    result[key] = Object.hasOwn(state, key) ? state[key] : defaultVal;
  }
  return result;
};

const getFromStorage = (keys, state) => {
  if (typeof keys === 'string') {
    return getStorageString(keys, state);
  }
  if (Array.isArray(keys)) {
    return getStorageArray(keys, state);
  }
  if (keys && typeof keys === 'object') {
    return getStorageObject(keys, state);
  }
  return { ...state };
};

export const DEFAULT_DISCONNECTED_CONNECTION = {
  connected: false,
  email: null,
  connectedAt: null,
};

export const DEFAULT_EMPTY_SNAPSHOT = {
  exists: false,
  updatedAt: null,
  size: null,
  sourceInstallationId: null,
  sourceProfileId: null,
};

export const REMOTE_CONNECTED_AT = '2026-04-20T00:00:00.000Z';
export const REMOTE_SNAPSHOT_UPDATED_AT = '2026-04-20T09:30:00Z';
export const LOCAL_INSTALLATION_ID = 'local-id-001';
export const REMOTE_INSTALLATION_ID = 'remote-id-999';

export const CROSS_INSTALL_SNAPSHOT = {
  exists: true,
  updatedAt: 'time',
  size: null,
  sourceInstallationId: REMOTE_INSTALLATION_ID,
  sourceProfileId: null,
};

export function setupCloudSyncDom() {
  document.body.innerHTML = `
    <div id="cloud-sync-card">
      <div id="drive-state-logged-out"></div>
      <div id="drive-state-disconnected"></div>
      <div id="drive-state-connected"></div>
      <div id="drive-state-conflict">
        <p id="drive-conflict-remote-time"></p>
      </div>
      <div id="drive-error-banner">
        <div id="drive-error-code"></div>
        <div id="drive-error-time"></div>
      </div>
      <div id="drive-loading-overlay">
        <div id="drive-loading-text"></div>
      </div>
      <div id="drive-sync-status"></div>
      <div id="drive-connected-email"></div>
      <div id="drive-last-upload-text"></div>
      <p id="drive-source-warning" hidden></p>

      <select id="drive-frequency-select">
        <option value="off">Off</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Every 30 days</option>
      </select>
      <output id="drive-auto-sync-status" aria-live="polite">
        <span id="drive-auto-sync-status-text"></span>
      </output>

      <button id="drive-connect-button"></button>
      <button id="drive-login-prompt-button"></button>
      <button id="drive-upload-button"></button>
      <button id="drive-download-button"></button>
      <button id="drive-disconnect-button"></button>
      <button id="drive-conflict-download-button"></button>
      <button id="drive-conflict-force-upload-button"></button>
    </div>
  `;
}

export function installChromeMock(sendMessage, storageState) {
  globalThis.chrome = {
    runtime: {
      sendMessage,
    },
    storage: {
      local: {
        get: jest.fn().mockImplementation(async keys => getFromStorage(keys, storageState)),
        set: jest.fn().mockImplementation(async patch => {
          Object.assign(storageState, patch);
        }),
        remove: jest.fn().mockImplementation(async keys => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const key of keyList) {
            delete storageState[key];
          }
        }),
      },
    },
  };
}

export function setupConfirmDialogMock() {
  const confirmDialogMock = getConfirmDialogMock();
  if (typeof confirmDialogMock?.mockReset !== 'function') {
    return;
  }
  confirmDialogMock.mockReset();
  confirmDialogMock.mockResolvedValue(true);
}

export function spyOnDriveClientDefaults() {
  for (const mockFn of Object.values(mockDriveClientModule)) {
    if (typeof mockFn?.mockReset === 'function') {
      mockFn.mockReset();
    }
  }
  restoreDriveClientStorageDefaults();
  mockDriveClientModule.ensureDriveSyncIdentity.mockResolvedValue('local-install');
  mockDriveClientModule.startDriveOAuthFlow.mockResolvedValue();
  mockDriveClientModule.disconnectDrive.mockResolvedValue();
  mockDriveClientModule.fetchDriveConnectionStatus.mockResolvedValue({
    ...DEFAULT_DISCONNECTED_CONNECTION,
  });
  mockDriveClientModule.fetchDriveSnapshotStatus.mockResolvedValue({
    ...DEFAULT_EMPTY_SNAPSHOT,
  });
}

export function restoreDriveClientStorageDefaults() {
  mockDriveClientModule.getDriveSyncMetadata.mockImplementation(readDriveSyncMetadataFromStorage);
  mockDriveClientModule.setDriveConnection.mockImplementation(setDriveConnectionInStorage);
  mockDriveClientModule.clearDriveSyncMetadata.mockImplementation(
    clearDriveSyncMetadataFromStorage
  );
  mockDriveClientModule.setLastKnownRemoteUpdatedAt.mockImplementation(
    setLastKnownRemoteUpdatedAtInStorage
  );
}
