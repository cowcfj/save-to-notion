import { DRIVE_SYNC_ERROR_CODES } from '../../../scripts/config/driveSyncErrorCodes.js';

describe('driveSyncErrorCodes', () => {
  test('each value equals its key', () => {
    for (const [key, value] of Object.entries(DRIVE_SYNC_ERROR_CODES)) {
      expect(value).toBe(key);
    }
  });

  test('object is frozen', () => {
    expect(Object.isFrozen(DRIVE_SYNC_ERROR_CODES)).toBe(true);
  });

  test('contains all known core codes', () => {
    expect(DRIVE_SYNC_ERROR_CODES).toHaveProperty('REMOTE_SNAPSHOT_NEWER');
    expect(DRIVE_SYNC_ERROR_CODES).toHaveProperty('UPLOAD_FAILED');
    expect(DRIVE_SYNC_ERROR_CODES).toHaveProperty('DOWNLOAD_FAILED');
    expect(DRIVE_SYNC_ERROR_CODES).toHaveProperty('NO_REMOTE_SNAPSHOT');
    expect(DRIVE_SYNC_ERROR_CODES).toHaveProperty('UNKNOWN');
  });

  test('has exactly 5 codes', () => {
    expect(Object.keys(DRIVE_SYNC_ERROR_CODES)).toHaveLength(5);
  });
});
