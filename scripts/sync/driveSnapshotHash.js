/**
 * 產生 Drive snapshot lightweight hash，供 dirty metadata 比對。
 *
 * @param {object} snapshot
 * @param {string | null | undefined} updatedAt
 * @returns {string}
 */
export function computeDriveSnapshotHash(snapshot, updatedAt) {
  return `${JSON.stringify(snapshot).length}:${updatedAt ?? ''}`;
}
