/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
};

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => ({
  normalizeUrl: jest.fn(url => String(url || '').replace(/#.*$/, '')),
}));

// Setup global chrome storage mock
let storageData = {};
globalThis.chrome = {
  storage: {
    local: {
      get: jest.fn(async (key) => {
        if (key === null) {
          return storageData;
        }
        return { [key]: storageData[key] };
      }),
      set: jest.fn(async (obj) => {
        Object.assign(storageData, obj);
      }),
      remove: jest.fn(async (keys) => {
        const keysArr = Array.isArray(keys) ? keys : [keys];
        keysArr.forEach(k => delete storageData[k]);
      }),
    },
  },
};

// Setup CSS Highlight API mock if missing in jsdom
if (!globalThis.CSS) {
  globalThis.CSS = {};
}
if (!('highlights' in globalThis.CSS)) {
  globalThis.CSS.highlights = new Map();
}

const { MigrationPhase, MigrationExecutor } = await import(
  '../../../scripts/legacy/MigrationExecutor.js'
);

describe('MigrationExecutor native ESM diagnostics', () => {
  let executor;
  let highlightManagerMock;

  beforeEach(() => {
    document.body.innerHTML = '';
    storageData = {};
    jest.clearAllMocks();

    executor = new MigrationExecutor();
    highlightManagerMock = {
      addHighlight: jest.fn(() => 'new-hl-id-123'),
      getCount: jest.fn(() => 1),
    };

    // Mock location using native history.pushState with relative path
    globalThis.history.pushState({}, '', '/article#intro');
  });

  test('needsMigration checks state and old highlights', async () => {
    // 1. If already completed, returns false
    storageData['seamless_migration_state_http://localhost/article'] = {
      phase: MigrationPhase.COMPLETED,
      timestamp: Date.now(),
    };
    expect(await executor.needsMigration()).toBe(false);

    // 2. If not completed, but no highlights, returns false
    storageData = {};
    expect(await executor.needsMigration()).toBe(false);

    // 3. If there are old highlights, returns true
    document.body.innerHTML = '<span class="simple-highlight">text</span>';
    expect(await executor.needsMigration()).toBe(true);
    expect(executor.getStatistics().oldHighlightsFound).toBe(1);
  });

  test('Migration steps - execute phase 1, phase 2, phase 3', async () => {
    document.body.innerHTML = `
      <div>
        Prefix
        <span class="simple-highlight" style="background-color: rgb(255, 243, 205);">
          migrated text
        </span>
        Suffix
      </div>
    `;

    // Step 1: Execute Migrate (starts at NOT_STARTED -> executePhase1)
    const res1 = await executor.migrate(highlightManagerMock);
    expect(res1.phase).toBe(MigrationPhase.PHASE_1_CREATED);
    expect(executor.getStatistics().newHighlightsCreated).toBe(1);

    const span = document.querySelector('.simple-highlight');
    expect(span.dataset.migrated).toBe('true');
    expect(span.dataset.newId).toBe('new-hl-id-123');
    expect(span.style.opacity).toBe('0');

    // Step 2: Phase 1 is done, next run of migrate will execute Phase 2 (which calls Phase 3 immediately)
    const res2 = await executor.migrate(highlightManagerMock);
    expect(res2.completed).toBe(true);
    expect(executor.getStatistics().removed).toBe(1);

    // The span is completely removed, its text merged into parent node
    expect(document.querySelector('.simple-highlight')).toBeNull();
    expect(document.body.textContent.trim().replace(/\s+/g, ' ')).toBe('Prefix migrated text Suffix');
  });

  test('rollback restores opacity and datasets of old spans', async () => {
    document.body.innerHTML = `
      <span class="simple-highlight" data-migrated="true" data-new-id="123" style="opacity: 0;">
        old highlight
      </span>
    `;

    const rollbackResult = await executor.rollback('test_rollback');
    expect(rollbackResult.rolledBack).toBe(true);

    const span = document.querySelector('.simple-highlight');
    expect(span.style.opacity).toBe('1');
    expect(span.dataset.migrated).toBeUndefined();
    expect(span.dataset.newId).toBeUndefined();
  });

  test('cleanup removes old seamless state entries and legacy markers', async () => {
    // Current url is http://localhost/article (normalized)
    const currentKey = 'seamless_migration_state_http://localhost/article';
    const otherKeyOld = 'seamless_migration_state_http://localhost/old-page';
    const otherKeyNew = 'seamless_migration_state_http://localhost/new-page';

    storageData[currentKey] = { phase: MigrationPhase.COMPLETED, timestamp: Date.now() };

    // Completed more than 7 days ago, should be removed
    storageData[otherKeyOld] = {
      phase: MigrationPhase.COMPLETED,
      timestamp: Date.now() - 10 * 24 * 60 * 60 * 1000,
    };

    // Completed recently, should not be removed
    storageData[otherKeyNew] = {
      phase: MigrationPhase.COMPLETED,
      timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
    };

    storageData['highlight_migration_status_old'] = 'done';

    await executor.cleanup();

    expect(storageData[currentKey]).toBeDefined();
    expect(storageData[otherKeyNew]).toBeDefined();
    expect(storageData[otherKeyOld]).toBeUndefined();
    expect(storageData['highlight_migration_status_old']).toBeUndefined();
  });
});
