import { computeDriveSnapshotHash } from '../../scripts/sync/driveSnapshotHash.js';

describe('computeDriveSnapshotHash()', () => {
  it('應以 snapshot JSON 長度與 updatedAt 組成 lightweight hash', () => {
    const snapshot = {
      metadata: { updated_at: '2026-04-21T00:00:00.000Z' },
      payload: { saved_states: [{ page_key: 'https://example.com' }], highlights: [] },
    };

    expect(computeDriveSnapshotHash(snapshot, '2026-04-21T01:02:03.000Z')).toBe(
      `${JSON.stringify(snapshot).length}:2026-04-21T01:02:03.000Z`
    );
  });

  it('updatedAt 缺省時應保留空字串尾段', () => {
    expect(computeDriveSnapshotHash({ payload: {} }, null)).toBe(
      `${JSON.stringify({ payload: {} }).length}:`
    );
  });
});
