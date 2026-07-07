import { jest } from '@jest/globals';

import {
  expectActionResponseDeclares,
  expectResponseHasFields,
  loadMessageBusContract,
} from './messageBusContractTestUtils.js';

const DRIVE_SYNC_MANUAL_UPLOAD_CONTRACT_FIELDS = [
  'success',
  'error',
  'errorCode',
  'remoteUpdatedAt',
  'updatedAt',
];
const DRIVE_SYNC_MANUAL_DOWNLOAD_CONTRACT_FIELDS = ['success', 'error', 'writtenKeys'];
const DRIVE_SYNC_CONFLICT_RESPONSE_FIELDS = ['success'];
const DRIVE_SYNC_CONFLICT_PAYLOAD_FIELDS = ['conflictType', 'remoteUpdatedAt'];

const driveClientMockModule = {
  __esModule: true,
  uploadDriveSnapshot: jest.fn(),
  downloadDriveSnapshot: jest.fn(),
  getDriveSyncMetadata: jest.fn(),
  ensureDriveSyncIdentity: jest.fn(),
  updateDriveSyncRunMetadata: jest.fn(),
  setDriveFrequency: jest.fn(),
  clearDriveDirty: jest.fn(),
};

const driveSnapshotMockModule = {
  __esModule: true,
  buildUnifiedPageStateFromLocalStorage: jest.fn(),
  buildDriveSnapshot: jest.fn(),
  applyDriveSnapshotToLocalStorage: jest.fn(),
};

const driveAlarmSchedulerMockModule = {
  __esModule: true,
  setupDriveAlarm: jest.fn(),
};

if (process.env.NODE_OPTIONS?.includes('--experimental-vm-modules')) {
  jest.unstable_mockModule('../../../../scripts/auth/driveClient.js', () => driveClientMockModule);
  jest.unstable_mockModule(
    '../../../../scripts/sync/driveSnapshot.js',
    () => driveSnapshotMockModule
  );
  jest.unstable_mockModule(
    '../../../../scripts/background/handlers/driveAlarmScheduler.js',
    () => driveAlarmSchedulerMockModule
  );
} else {
  jest.mock('../../../../scripts/auth/driveClient.js', () => driveClientMockModule);
  jest.mock('../../../../scripts/sync/driveSnapshot.js', () => driveSnapshotMockModule);
  jest.mock(
    '../../../../scripts/background/handlers/driveAlarmScheduler.js',
    () => driveAlarmSchedulerMockModule
  );
}

let RUNTIME_ACTIONS;
let createDriveSyncHandlers;
let driveClient;
let driveSnapshot;
let Logger;
let DRIVE_SYNC_ERROR_CODES;

beforeAll(async () => {
  ({ RUNTIME_ACTIONS } = await import('../../../../scripts/config/shared/runtimeActions.js'));
  ({ createDriveSyncHandlers } =
    await import('../../../../scripts/background/handlers/driveSyncHandlers.js'));
  driveClient = await import('../../../../scripts/auth/driveClient.js');
  driveSnapshot = await import('../../../../scripts/sync/driveSnapshot.js');
  ({ default: Logger } = await import('../../../../scripts/utils/Logger.js'));
  ({ DRIVE_SYNC_ERROR_CODES } =
    await import('../../../../scripts/config/extension/driveSyncErrorCodes.js'));
});

function getConflictBroadcast(mockSendMessage) {
  return mockSendMessage.mock.calls.find(
    ([payload]) => payload?.action === RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT
  )?.[0];
}

describe('driveSyncHandlers message_bus.json response contracts', () => {
  let handlers;
  let mockSendMessage;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSendMessage = jest.fn().mockResolvedValue({});
    globalThis.chrome = {
      runtime: {
        sendMessage: mockSendMessage,
      },
    };
    globalThis.Logger = {
      debug: jest.fn(),
      start: jest.fn(),
      ready: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    };

    driveClient.uploadDriveSnapshot.mockResolvedValue({
      success: true,
      updatedAt: '2026-04-21T01:02:03.000Z',
    });
    driveClient.downloadDriveSnapshot.mockResolvedValue({
      metadata: { updated_at: '2026-04-21T01:02:03.000Z' },
      payload: { highlights: [], saved_states: [] },
    });
    driveClient.getDriveSyncMetadata.mockResolvedValue({
      installationId: 'installation-123',
      profileId: 'profile-123',
      frequency: 'daily',
      dirtyRevision: 7,
      lastKnownRemoteUpdatedAt: '2026-04-20T00:00:00.000Z',
      lastSuccessfulUploadAt: null,
    });
    driveClient.updateDriveSyncRunMetadata.mockResolvedValue();
    driveClient.clearDriveDirty.mockResolvedValue();
    driveClient.ensureDriveSyncIdentity.mockResolvedValue('installation-123');

    driveSnapshot.buildUnifiedPageStateFromLocalStorage.mockResolvedValue({
      pages: new Map(),
      urlAliases: new Map(),
    });
    driveSnapshot.buildDriveSnapshot.mockResolvedValue({
      metadata: {
        updated_at: '2026-04-21T01:02:03.000Z',
        item_counts: { highlights: 0, saved_states: 0 },
      },
      payload: { highlights: [], saved_states: [], url_aliases: {} },
    });
    driveSnapshot.applyDriveSnapshotToLocalStorage.mockResolvedValue({
      writtenKeys: ['a', 'b'],
      removedKeys: ['c'],
    });

    jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger, 'error').mockImplementation(() => {});

    handlers = createDriveSyncHandlers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete globalThis.chrome;
    delete globalThis.Logger;
  });

  test('manual upload conflict response and broadcast match contract fields', async () => {
    driveClient.uploadDriveSnapshot.mockResolvedValue({
      success: false,
      errorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
      message: 'Remote snapshot is newer',
      remoteUpdatedAt: '2026-04-21T01:02:03.000Z',
    });

    const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({});
    const conflictBroadcast = getConflictBroadcast(mockSendMessage);
    const messageBus = loadMessageBusContract();

    expectActionResponseDeclares(
      'driveSync',
      'DRIVE_SYNC_MANUAL_UPLOAD',
      DRIVE_SYNC_MANUAL_UPLOAD_CONTRACT_FIELDS
    );
    expectActionResponseDeclares(
      'driveSync',
      'DRIVE_SYNC_CONFLICT',
      DRIVE_SYNC_CONFLICT_RESPONSE_FIELDS
    );
    expectResponseHasFields(result, ['success', 'errorCode', 'remoteUpdatedAt']);
    for (const field of DRIVE_SYNC_CONFLICT_PAYLOAD_FIELDS) {
      expect(messageBus.actions.driveSync.DRIVE_SYNC_CONFLICT.payload).toHaveProperty(field);
    }
    expect(conflictBroadcast).toEqual(
      expect.objectContaining({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT,
        conflictType: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
        remoteUpdatedAt: '2026-04-21T01:02:03.000Z',
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
        remoteUpdatedAt: '2026-04-21T01:02:03.000Z',
      })
    );
  });

  test('forced manual upload success response matches contract fields', async () => {
    const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({ force: true });

    expectActionResponseDeclares(
      'driveSync',
      'DRIVE_SYNC_MANUAL_UPLOAD',
      DRIVE_SYNC_MANUAL_UPLOAD_CONTRACT_FIELDS
    );
    expectResponseHasFields(result, ['success', 'updatedAt']);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        updatedAt: '2026-04-21T01:02:03.000Z',
      })
    );
  });

  test('manual download success response matches contract fields', async () => {
    const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD]({});

    expectActionResponseDeclares(
      'driveSync',
      'DRIVE_SYNC_MANUAL_DOWNLOAD',
      DRIVE_SYNC_MANUAL_DOWNLOAD_CONTRACT_FIELDS
    );
    expectResponseHasFields(result, ['success', 'writtenKeys']);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        writtenKeys: 2,
      })
    );
  });
});
