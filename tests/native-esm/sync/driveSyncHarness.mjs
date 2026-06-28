import { installChromeRuntime, installCryptoRandomUUID } from '../utils/rootUtilsHarness.mjs';

export function installDriveChrome(options = {}) {
  const runtime = installChromeRuntime(options);
  const crypto = installCryptoRandomUUID(options.installationId ?? 'drive-native-installation-id');
  return { ...runtime, crypto };
}

export function baseDriveMetadata(overrides = {}) {
  return {
    connectionEmail: 'user@example.com',
    connectedAt: '2026-06-28T00:00:00.000Z',
    lastKnownRemoteUpdatedAt: '2026-06-28T01:00:00.000Z',
    lastSuccessfulUploadAt: null,
    lastSuccessfulDownloadAt: null,
    lastErrorCode: null,
    lastErrorAt: null,
    lastRunAt: null,
    lastRunType: null,
    needsManualReview: false,
    installationId: 'drive-native-installation-id',
    profileId: 'drive-profile-id',
    frequency: 'daily',
    dirtyRevision: 7,
    lastUploadedRevision: 3,
    lastSnapshotHash: null,
    nextEligibleAt: null,
    ...overrides,
  };
}
