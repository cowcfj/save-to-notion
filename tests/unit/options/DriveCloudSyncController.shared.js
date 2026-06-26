/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import * as confirmDialogModule from '../../../pages/options/confirmDialog.js';
import * as driveClient from '../../../scripts/auth/driveClient.js';

jest.mock('../../../pages/options/confirmDialog.js', () => ({
  confirmDialog: jest.fn().mockResolvedValue(true),
}));

export const getConfirmDialogMock = () => confirmDialogModule.confirmDialog;

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
  if (Object.prototype.toString.call(driveClient) === '[object Module]') {
    return;
  }
  jest.spyOn(driveClient, 'getDriveSyncMetadata');
  jest.spyOn(driveClient, 'ensureDriveSyncIdentity').mockResolvedValue('local-install');
  jest.spyOn(driveClient, 'startDriveOAuthFlow').mockResolvedValue();
  jest.spyOn(driveClient, 'disconnectDrive').mockResolvedValue();
  jest.spyOn(driveClient, 'clearDriveSyncMetadata').mockResolvedValue();
  jest.spyOn(driveClient, 'fetchDriveConnectionStatus').mockResolvedValue({
    ...DEFAULT_DISCONNECTED_CONNECTION,
  });
  jest.spyOn(driveClient, 'fetchDriveSnapshotStatus').mockResolvedValue({
    ...DEFAULT_EMPTY_SNAPSHOT,
  });
  jest.spyOn(driveClient, 'setDriveConnection');
}
