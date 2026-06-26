/**
 * @jest-environment jsdom
 */

import { TextEncoder, TextDecoder } from 'node:util';
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  buildUnifiedPageStateFromLocalStorage,
  buildDriveSnapshot,
} from '../../../scripts/sync/driveSnapshot.js';
import {
  computeDriveSnapshotHash,
} from '../../../scripts/sync/driveSnapshotHash.js';

let storageData;

function installChrome() {
  globalThis.chrome = {
    storage: {
      local: {
        get: jest.fn(async () => {
          return storageData;
        }),
      },
    },
  };
}

function installCrypto() {
  const mockHashBuffer = new Uint8Array(32).fill(7).buffer;
  const mockCrypto = {
    subtle: {
      digest: jest.fn(async () => mockHashBuffer),
    },
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  if (descriptor?.configurable !== false) {
    Object.defineProperty(globalThis, 'crypto', {
      value: mockCrypto,
      writable: true,
      configurable: true,
    });
    return;
  }
  globalThis.crypto = mockCrypto;
}

describe('Sync native ESM diagnostics', () => {
  beforeEach(() => {
    storageData = {};
    installChrome();
    installCrypto();
  });

  test('buildUnifiedPageStateFromLocalStorage aggregates mixed data formats correctly', async () => {
    storageData = {
      'page_https://example.com': {
        notion: { pageId: 'page-1', url: 'https://notion.so/page-1', title: 'Example' },
        highlights: [{ id: 'hl-1', text: 'hello' }],
      },
      'saved_https://example.com/legacy': {
        pageId: 'legacy-page',
        title: 'Legacy Title',
      },
      'highlights_https://example.com/legacy': [
        { id: 'hl-2', text: 'legacy hl' },
      ],
      'url_alias:https://example.com/alias': 'https://example.com',
    };

    const { pages, urlAliases } = await buildUnifiedPageStateFromLocalStorage();

    expect(pages.has('https://example.com')).toBe(true);
    expect(pages.get('https://example.com').notion.pageId).toBe('page-1');
    expect(pages.get('https://example.com').highlights).toEqual([{ id: 'hl-1', text: 'hello' }]);

    expect(pages.has('https://example.com/legacy')).toBe(true);
    expect(pages.get('https://example.com/legacy').notion.pageId).toBe('legacy-page');
    expect(pages.get('https://example.com/legacy').highlights).toEqual([{ id: 'hl-2', text: 'legacy hl' }]);

    expect(urlAliases.get('https://example.com/alias')).toBe('https://example.com');
  });

  test('buildDriveSnapshot serializes pages, formats snapshot items, and applies Alias Gate', async () => {
    const pages = new Map([
      [
        'https://example.com',
        {
          url: 'https://example.com',
          notion: { pageId: 'page-1', url: 'https://notion.so/page-1', title: 'Example', savedAt: 1000 },
          highlights: [{ id: 'hl-1', text: 'hello', color: 'yellow', timestamp: 2000 }],
        },
      ],
      [
        'https://example.com/empty',
        {
          url: 'https://example.com/empty',
          notion: null,
          highlights: [],
        },
      ],
    ]);

    const urlAliases = new Map([
      ['https://example.com/alias-ok', 'https://example.com'],
      ['https://example.com/alias-orphan', 'https://example.com/empty'], // target has no coverage data, will be filtered out
    ]);

    const snapshot = await buildDriveSnapshot(pages, urlAliases, {
      installationId: 'inst-1',
      profileId: 'prof-1',
    });

    expect(snapshot.metadata.snapshot_version).toBe(1);
    expect(snapshot.metadata.source_installation_id).toBe('inst-1');
    expect(snapshot.metadata.source_profile_id).toBe('prof-1');
    expect(snapshot.metadata.payload_hash).toBe('0707070707070707070707070707070707070707070707070707070707070707');

    expect(snapshot.payload.saved_states.length).toBe(1);
    expect(snapshot.payload.saved_states[0]).toEqual({
      page_key: 'https://example.com',
      notion_page_id: 'page-1',
      notion_url: 'https://notion.so/page-1',
      title: 'Example',
      saved_at: 1000,
      last_verified_at: null,
    });

    expect(snapshot.payload.highlights.length).toBe(1);
    expect(snapshot.payload.highlights[0]).toEqual({
      page_key: 'https://example.com',
      highlight_id: 'hl-1',
      text: 'hello',
      color: 'yellow',
      range_info: null,
      created_at: 2000,
      updated_at: null,
    });

    // Alias Gate check: alias-ok remains, alias-orphan is filtered
    expect(snapshot.payload.url_aliases).toEqual({
      'https://example.com/alias-ok': 'https://example.com',
    });
  });

  test('computeDriveSnapshotHash generates consistent lightweight length hash', () => {
    const snapshot = { payload: { data: 'test' } };
    const hash = computeDriveSnapshotHash(snapshot, '2026-06-26T12:00:00Z');
    expect(hash).toBe('27:2026-06-26T12:00:00Z');
  });
});
