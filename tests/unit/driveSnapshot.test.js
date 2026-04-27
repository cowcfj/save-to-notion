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
} from '../../scripts/config/shared/storage.js';

describe('Drive Snapshot Canonicalization & Serialization', () => {
  let mockStorageLocal;
  let originalCrypto;

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
    originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          digest: jest.fn().mockResolvedValue(new Uint8Array(32).fill(1).buffer),
        },
      },
    });
  });

  afterEach(() => {
    if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: originalCrypto,
      });
    } else {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: undefined,
      });
      delete globalThis.crypto;
    }
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
    it('should format snapshot as backend canonical envelope while preserving backup whitelist coverage', async () => {
      const pages = new Map([
        [
          'url1',
          {
            notion: {
              pageId: 'p1',
              url: 'https://example.com/1',
              title: 'Page 1',
              savedAt: 111,
              lastVerifiedAt: 222,
            },
            highlights: [],
          },
        ],
        [
          'url2',
          {
            notion: null,
            highlights: [{ id: 'hl1', text: 'Hello', color: 'yellow', rangeInfo: { start: 1 } }],
          },
        ],
        ['url-empty', { notion: null, highlights: [] }], // should be filtered out
      ]);

      const aliases = new Map([['norm1', 'url1']]);

      const snapshot = await buildDriveSnapshot(pages, aliases, {
        installationId: 'installation-123',
        profileId: 'profile-123',
      });

      expect(snapshot.metadata.snapshot_version).toBe(1);
      expect(snapshot.metadata.export_schema_version).toBe(1);
      expect(snapshot.metadata.updated_at).toBeDefined();
      expect(snapshot.metadata.source_installation_id).toBe('installation-123');
      expect(snapshot.metadata.source_profile_id).toBe('profile-123');
      expect(snapshot.metadata.item_counts).toEqual({
        highlights: 1,
        saved_states: 1,
      });

      expect(snapshot.payload.saved_states).toEqual([
        {
          page_key: 'url1',
          notion_page_id: 'p1',
          notion_url: 'https://example.com/1',
          title: 'Page 1',
          saved_at: 111,
          last_verified_at: 222,
        },
      ]);
      expect(snapshot.payload.highlights).toEqual([
        expect.objectContaining({
          page_key: 'url2',
          highlight_id: 'hl1',
          text: 'Hello',
        }),
      ]);
      expect(snapshot.payload.url_aliases).toEqual({
        norm1: 'url1',
      });
      expect(snapshot.metadata.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('applyDriveSnapshotToLocalStorage', () => {
    it('should apply valid snapshot, maintaining legacy keys and preserving local-only keys', async () => {
      const snapshot = {
        metadata: {
          snapshot_version: 1,
          export_schema_version: 1,
          updated_at: new Date().toISOString(),
          source_installation_id: 'installation-123',
          source_profile_id: 'profile-123',
          payload_hash: 'unused-in-test',
          item_counts: {
            highlights: 1,
            saved_states: 1,
          },
        },
        payload: {
          saved_states: [
            {
              page_key: 'url1',
              notion_page_id: 'p1',
              notion_url: 'https://p1',
              title: 'P1Title',
              saved_at: 123,
            },
          ],
          highlights: [
            {
              page_key: 'url2',
              highlight_id: 'hl2',
              text: 'hello',
              color: 'yellow',
              range_info: { start: 1 },
              created_at: 999,
            },
          ],
          url_aliases: {
            norm1: 'url1',
            '': 'empty-alias',
          },
        },
      };

      // Local storage has one non-sync key and one sync key that is absent from the
      // remote snapshot. Merge-upsert restore must preserve both.
      mockStorageLocal.get.mockResolvedValue({
        accountToken: 'secret',
        [`${PAGE_PREFIX}url_stale`]: { notion: {} },
        [`${HIGHLIGHTS_PREFIX}url_stale`]: [],
      });

      const result = await applyDriveSnapshotToLocalStorage(snapshot);

      expect(result.removedKeys).toEqual([]);
      expect(mockStorageLocal.remove).not.toHaveBeenCalled();

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

    it('should fallback highlight timestamp to Date.now when created_at is invalid', async () => {
      jest.useFakeTimers();
      const fixed = new Date('2024-06-15T12:00:00.000Z').getTime();
      jest.setSystemTime(fixed);

      try {
        const snapshot = {
          metadata: {
            updated_at: new Date().toISOString(),
          },
          payload: {
            saved_states: [],
            highlights: [
              {
                page_key: 'url-invalid-ts',
                highlight_id: 'hl-invalid',
                text: 'hello',
                color: 'yellow',
                range_info: {},
                created_at: 'not-a-number',
              },
            ],
            url_aliases: {},
          },
        };

        mockStorageLocal.get.mockResolvedValue({});

        await applyDriveSnapshotToLocalStorage(snapshot);

        const toWrite = mockStorageLocal.set.mock.calls[0][0];
        const ts = toWrite[`${HIGHLIGHTS_PREFIX}url-invalid-ts`][0].timestamp;
        expect(ts).toBe(fixed);
        expect(Number.isFinite(ts)).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should preserve local-only sync keys when remote snapshot is empty', async () => {
      const snapshot = {
        metadata: {
          updated_at: new Date().toISOString(),
        },
        payload: {
          saved_states: [],
          highlights: [],
          url_aliases: {},
        },
      };

      mockStorageLocal.get.mockResolvedValue({
        [`${PAGE_PREFIX}legacy-url`]: { notion: {} },
      });

      await applyDriveSnapshotToLocalStorage(snapshot);

      expect(mockStorageLocal.remove).not.toHaveBeenCalled();
      expect(mockStorageLocal.set).toHaveBeenCalledWith({});
    });

    it('should throw error on invalid snapshot', async () => {
      await expect(applyDriveSnapshotToLocalStorage(null)).rejects.toThrow('INVALID_SNAPSHOT');
      await expect(applyDriveSnapshotToLocalStorage({})).rejects.toThrow('INVALID_SNAPSHOT');
      await expect(applyDriveSnapshotToLocalStorage({ payload: null })).rejects.toThrow(
        'INVALID_SNAPSHOT'
      );
    });
  });

  describe('Alias Referential Integrity', () => {
    // ── Upload 路徑：buildDriveSnapshot ──────────────────────────────

    describe('buildDriveSnapshot — upload alias filter', () => {
      it('應排除 target 不存在於 pages 的孤兒 alias（不進 snapshot payload）', async () => {
        const pages = new Map([
          [
            'url1',
            {
              notion: { pageId: 'p1', url: '', title: '', savedAt: 1 },
              highlights: [],
            },
          ],
        ]);
        // norm1 → url1（有效）；normOrphan → url-orphan（沒有對應 page，孤兒）
        const aliases = new Map([
          ['norm1', 'url1'],
          ['normOrphan', 'url-orphan'],
        ]);

        const snapshot = await buildDriveSnapshot(pages, aliases, {});

        expect(snapshot.payload.url_aliases).toHaveProperty('norm1', 'url1');
        expect(snapshot.payload.url_aliases).not.toHaveProperty('normOrphan');
      });

      it('合法 alias 應保留（防回歸）', async () => {
        const pages = new Map([
          ['url1', { notion: { pageId: 'p1', url: '', title: '', savedAt: 1 }, highlights: [] }],
          ['url2', { notion: null, highlights: [{ id: 'hl1', text: 'hi' }] }],
        ]);
        const aliases = new Map([
          ['norm1', 'url1'],
          ['norm2', 'url2'],
        ]);

        const snapshot = await buildDriveSnapshot(pages, aliases, {});

        expect(snapshot.payload.url_aliases).toEqual({ norm1: 'url1', norm2: 'url2' });
      });

      it('pages 為空時，所有 alias 均應被過濾', async () => {
        const pages = new Map();
        const aliases = new Map([['normAnything', 'url-anything']]);

        const snapshot = await buildDriveSnapshot(pages, aliases, {});

        expect(snapshot.payload.url_aliases).toEqual({});
      });
    });

    // ── Download 路徑：applyDriveSnapshotToLocalStorage ─────────────

    describe('applyDriveSnapshotToLocalStorage — download alias prune', () => {
      it('snapshot 含孤兒 alias 時，不應寫入本地（toWrite 不含孤兒 alias）', async () => {
        const snapshot = {
          metadata: { updated_at: new Date().toISOString() },
          payload: {
            saved_states: [
              {
                page_key: 'url1',
                notion_page_id: 'p1',
                notion_url: '',
                title: '',
                saved_at: 1,
              },
            ],
            highlights: [],
            url_aliases: {
              norm1: 'url1', // 有效：url1 在 saved_states 中
              normOrphan: 'url-orphan', // 孤兒：url-orphan 不在 pageStates 中
            },
          },
        };

        mockStorageLocal.get.mockResolvedValue({});
        await applyDriveSnapshotToLocalStorage(snapshot);

        const toWrite = mockStorageLocal.set.mock.calls[0][0];
        expect(toWrite).toHaveProperty(`${URL_ALIAS_PREFIX}norm1`, 'url1');
        expect(toWrite).not.toHaveProperty(`${URL_ALIAS_PREFIX}normOrphan`);
      });

      it('本地已存在孤兒 alias 時，download 不應刪除本地既有 alias', async () => {
        const snapshot = {
          metadata: { updated_at: new Date().toISOString() },
          payload: {
            saved_states: [
              { page_key: 'url1', notion_page_id: 'p1', notion_url: '', title: '', saved_at: 1 },
            ],
            highlights: [],
            url_aliases: {
              normOrphan: 'url-orphan', // 孤兒：不寫入也不加進 snapshotStorageKeys
            },
          },
        };

        // 本地有一個舊孤兒 alias（應被 toRemove 清掉）
        mockStorageLocal.get.mockResolvedValue({
          [`${URL_ALIAS_PREFIX}normOrphan`]: 'url-orphan',
        });

        const result = await applyDriveSnapshotToLocalStorage(snapshot);

        expect(result.removedKeys).toEqual([]);
        expect(mockStorageLocal.remove).not.toHaveBeenCalled();
        const toWrite = mockStorageLocal.set.mock.calls[0][0];
        expect(toWrite).not.toHaveProperty(`${URL_ALIAS_PREFIX}normOrphan`);
      });

      it('合法 alias 在 download 時應保留（防回歸）', async () => {
        const snapshot = {
          metadata: { updated_at: new Date().toISOString() },
          payload: {
            saved_states: [
              { page_key: 'url1', notion_page_id: 'p1', notion_url: '', title: '', saved_at: 1 },
            ],
            highlights: [
              {
                page_key: 'url2',
                highlight_id: 'hl1',
                text: 'hi',
                color: '',
                range_info: {},
                created_at: 1,
              },
            ],
            url_aliases: {
              norm1: 'url1', // 有效：url1 在 saved_states 中
              norm2: 'url2', // 有效：url2 在 highlights 中
            },
          },
        };

        mockStorageLocal.get.mockResolvedValue({});
        await applyDriveSnapshotToLocalStorage(snapshot);

        const toWrite = mockStorageLocal.set.mock.calls[0][0];
        expect(toWrite).toHaveProperty(`${URL_ALIAS_PREFIX}norm1`, 'url1');
        expect(toWrite).toHaveProperty(`${URL_ALIAS_PREFIX}norm2`, 'url2');
      });

      it('非同步白名單 key（accountToken 等）不受 alias prune 影響', async () => {
        const snapshot = {
          metadata: { updated_at: new Date().toISOString() },
          payload: {
            saved_states: [],
            highlights: [],
            url_aliases: { orphan: 'no-match' },
          },
        };

        mockStorageLocal.get.mockResolvedValue({ accountToken: 'secret' });
        const result = await applyDriveSnapshotToLocalStorage(snapshot);

        expect(result.removedKeys).not.toContain('accountToken');
      });
    });
  });

  describe('getDriveSnapshotSummary', () => {
    it('should calculate counts correctly', () => {
      const summary = getDriveSnapshotSummary({
        metadata: {
          updated_at: '2020-01-01T00:00:00Z',
        },
        payload: {
          saved_states: [{ page_key: 'p1' }, { page_key: 'p2' }],
          highlights: [{ id: 1 }, { id: 2 }],
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
