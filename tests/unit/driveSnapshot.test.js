/**
 * Drive Snapshot Canonicalization and Mirror Tests
 */

import {
  buildUnifiedPageStateFromLocalStorage,
  buildDriveSnapshot,
  applyDriveSnapshotToLocalStorage,
  getDriveSnapshotSummary,
} from '../../scripts/sync/driveSnapshot.js';
import {
  PAGE_PREFIX,
  HIGHLIGHTS_PREFIX,
  SAVED_PREFIX,
  URL_ALIAS_PREFIX,
} from '../../scripts/config/storageKeys.js';

describe('Drive Snapshot Canonicalization & Serialization', () => {
  let mockStorageLocal;

  beforeEach(() => {
    mockStorageLocal = {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    };
    globalThis.chrome = {
      storage: {
        local: mockStorageLocal,
      },
    };
  });

  describe('buildUnifiedPageStateFromLocalStorage', () => {
    it('should correctly unify page_*, saved_*, and highlights_*', async () => {
      mockStorageLocal.get.mockResolvedValue({
        // Full page entry
        [`${PAGE_PREFIX}url1`]: {
          notion: { pageId: 'page1', title: 'Test 1' },
          highlights: [{ id: 'hl1', text: 'h1' }],
        },
        // Legacy saved + legacy highlight (no page)
        [`${SAVED_PREFIX}url2`]: {
          pageId: 'page2',
          title: 'Legacy 2',
          savedAt: 1234,
        },
        [`${HIGHLIGHTS_PREFIX}url2`]: [{ id: 'hl2', text: 'h2' }],
        // Legacy saved (not normalized)
        [`${SAVED_PREFIX}url3`]: {
          id: 'page3',
          timestamp: 9999,
        },
        // Only highlights
        [`${HIGHLIGHTS_PREFIX}url4`]: { highlights: [{ id: 'hl4', text: 'h4' }] },
        // Highlight error handling (not an array)
        [`${HIGHLIGHTS_PREFIX}url5`]: 'not an array',
        // Empty URL
        [`${PAGE_PREFIX}`]: { notion: { pageId: 'empty' } },
        [`${SAVED_PREFIX}`]: { pageId: 'empty' },
        [`${HIGHLIGHTS_PREFIX}`]: [{ id: 'hl-empty' }],
        // Irrelevant
        irrelevantKey: 'ignore',
        // Alias
        [`${URL_ALIAS_PREFIX}norm1`]: 'url1',
        [`${URL_ALIAS_PREFIX}`]: 'empty-alias',
      });

      const { pages, urlAliases } = await buildUnifiedPageStateFromLocalStorage();

      const p1 = pages.get('url1');
      expect(p1.notion.pageId).toBe('page1');
      expect(p1.highlights).toHaveLength(1);

      const p2 = pages.get('url2');
      expect(p2.notion.pageId).toBe('page2');
      expect(p2.highlights).toHaveLength(1);

      const p3 = pages.get('url3');
      expect(p3.notion.pageId).toBe('page3');
      expect(p3.notion.savedAt).toBe(9999); // default extraction fallback

      const p4 = pages.get('url4');
      expect(p4.notion).toBeNull();
      expect(p4.highlights).toHaveLength(1);

      // Error case ignored
      expect(pages.has('url5')).toBe(false);
      // Empty URLs ignored
      expect(pages.has('')).toBe(false);

      expect(urlAliases.get('norm1')).toBe('url1');
      expect(urlAliases.has('')).toBe(false);
    });

    it('should ignore invalid entries gracefully', async () => {
      mockStorageLocal.get.mockResolvedValue({
        [`${PAGE_PREFIX}url1`]: null,
        [`${PAGE_PREFIX}url2`]: [], // Invalid page type
        [`${SAVED_PREFIX}url3`]: null,
        [`${SAVED_PREFIX}url4`]: { random: 'no page id' },
        [`${URL_ALIAS_PREFIX}norm2`]: null, // invalid alias payload
      });

      const { pages, urlAliases } = await buildUnifiedPageStateFromLocalStorage();
      expect(pages.size).toBe(0);
      expect(urlAliases.size).toBe(0);
    });
  });

  describe('buildDriveSnapshot', () => {
    it('should format snapshot filtering out empty pages', () => {
      const pages = new Map([
        ['url1', { notion: { pageId: 'p1' }, highlights: [] }],
        ['url2', { notion: null, highlights: [{ id: 'hl1' }] }],
        ['url-empty', { notion: null, highlights: [] }], // should be filtered out
      ]);

      const aliases = new Map([['norm1', 'url1']]);

      const snapshot = buildDriveSnapshot(pages, aliases);

      expect(snapshot.schemaVersion).toBe('v1');
      expect(snapshot.pages.url1).toBeDefined();
      expect(snapshot.pages.url2).toBeDefined();
      expect(snapshot.pages['url-empty']).toBeUndefined();
      expect(snapshot.url_aliases.norm1).toBe('url1');
      expect(snapshot.snapshotCreatedAt).toBeDefined();
    });
  });

  describe('applyDriveSnapshotToLocalStorage', () => {
    it('should apply valid snapshot, maintaining legacy keys and pruning stale ones', async () => {
      const snapshot = {
        schemaVersion: 'v1',
        snapshotCreatedAt: new Date().toISOString(),
        pages: {
          url1: {
            // Only legacy saved state
            saved_state: { pageId: 'p1', url: 'https://p1', title: 'P1Title', savedAt: 123 },
            highlights: [],
          },
          url2: {
            // Only highlights
            saved_state: null,
            highlights: [{ id: 'hl2' }],
          },
          // Missing URL handled robustly
          '': { saved_state: null, highlights: [] },
        },
        url_aliases: {
          norm1: 'url1',
          '': 'empty-alias',
        },
      };

      // Local storage has one valid extra key that should NOT be touched,
      // and one valid sync key that should be pruned because it's not in snapshot.
      mockStorageLocal.get.mockResolvedValue({
        accountToken: 'secret',
        [`${PAGE_PREFIX}url_stale`]: { notion: {} },
        [`${HIGHLIGHTS_PREFIX}url_stale`]: [],
      });

      const result = await applyDriveSnapshotToLocalStorage(snapshot);

      // Verify pruning
      expect(result.removedKeys).toEqual(
        expect.arrayContaining([`${PAGE_PREFIX}url_stale`, `${HIGHLIGHTS_PREFIX}url_stale`])
      );
      expect(result.removedKeys).not.toContain('accountToken');
      expect(mockStorageLocal.remove).toHaveBeenCalledWith(result.removedKeys);

      // Verify writing structure
      expect(mockStorageLocal.set).toHaveBeenCalledTimes(1);
      const toWrite = mockStorageLocal.set.mock.calls[0][0];

      // url1 should exist in page_ and saved_
      expect(toWrite[`${PAGE_PREFIX}url1`].notion.pageId).toBe('p1');
      expect(toWrite[`${PAGE_PREFIX}url1`].metadata.migratedFrom).toBe('drive_snapshot');
      expect(toWrite[`${SAVED_PREFIX}url1`].pageId).toBe('p1');
      expect(toWrite[`${HIGHLIGHTS_PREFIX}url1`]).toBeUndefined();

      // url2 should exist in page_ and highlights_
      expect(toWrite[`${PAGE_PREFIX}url2`].notion).toBeNull();
      expect(toWrite[`${PAGE_PREFIX}url2`].highlights).toHaveLength(1);
      expect(toWrite[`${HIGHLIGHTS_PREFIX}url2`]).toHaveLength(1);
      expect(toWrite[`${SAVED_PREFIX}url2`]).toBeUndefined();

      // Alias
      expect(toWrite[`${URL_ALIAS_PREFIX}norm1`]).toBe('url1');

      expect(result.writtenKeys.length).toBeGreaterThan(0);
    });

    it('should throw error on invalid snapshot', async () => {
      await expect(applyDriveSnapshotToLocalStorage(null)).rejects.toThrow('INVALID_SNAPSHOT');
      await expect(applyDriveSnapshotToLocalStorage({})).rejects.toThrow('INVALID_SNAPSHOT');
      await expect(applyDriveSnapshotToLocalStorage({ pages: null })).rejects.toThrow(
        'INVALID_SNAPSHOT'
      );
    });
  });

  describe('getDriveSnapshotSummary', () => {
    it('should calculate counts correctly', () => {
      const summary = getDriveSnapshotSummary({
        snapshotCreatedAt: '2020-01-01T00:00:00Z',
        pages: {
          p1: { highlights: [{ id: 1 }, { id: 2 }] },
          p2: { highlights: null },
        },
      });
      expect(summary.pageCount).toBe(2);
      expect(summary.highlightCount).toBe(2);
      expect(summary.snapshotCreatedAt).toBe('2020-01-01T00:00:00Z');
    });

    it('should handle null summary gracefully', () => {
      const summary = getDriveSnapshotSummary(null);
      expect(summary.pageCount).toBe(0);
      expect(summary.highlightCount).toBe(0);
    });
  });
});
