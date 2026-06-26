import { describe, expect, jest, test } from '@jest/globals';
import { HIGHLIGHTER_MESSAGES } from '../../../scripts/config/messages/highlighterMessages.js';
import { HIGHLIGHTER_ACTIONS } from '../../../scripts/config/runtimeActions/highlighterActions.js';
import {
  ARTICLE_SELECTORS,
  CONTENT_QUALITY,
  DOM_STABILITY,
  FEATURED_IMAGE_SELECTORS,
  IMAGE_LIMITS,
  IMAGE_SRC_ATTRIBUTES,
  IMAGE_VALIDATION_CONFIG,
  NEXTJS_CONFIG,
  TEXT_PROCESSING,
} from '../../../scripts/config/shared/content.js';
import { deepFreeze } from '../../../scripts/config/shared/deepFreeze.js';
import {
  createSaveStatusResponse,
  isSavedStatusResponse,
  SAVE_STATUS_KINDS,
} from '../../../scripts/config/shared/saveStatus.js';
import {
  AUTH_LOCAL_KEYS,
  HIGHLIGHTS_PREFIX,
  mergeDataSourceConfig,
  SAVED_PREFIX,
  SYNC_CONFIG_KEYS,
} from '../../../scripts/config/shared/storage.js';
import { TOOLBAR_ICONS } from '../../../scripts/config/contentSafe/toolbarIcons.js';
import * as SHARED_INDEX from '../../../scripts/config/shared/index.js';
import { TECHNICAL_TERM_RULES, GROUP_PROGRAMMING } from '../../../scripts/config/shared/technicalTerms.js';

describe('config native ESM diagnostics', () => {
  test('deepFreeze recursively freezes objects and function metadata', () => {
    const formatter = () => 'ok';
    formatter.meta = { label: 'format' };
    const target = {
      nested: { enabled: true },
      formatter,
    };

    const frozen = deepFreeze(target);

    expect(frozen).toBe(target);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.nested)).toBe(true);
    expect(Object.isFrozen(frozen.formatter)).toBe(true);
    expect(Object.isFrozen(frozen.formatter.meta)).toBe(true);
    expect(deepFreeze('copy')).toBe('copy');
  });

  test('highlighter messages remain frozen and keep function-valued builders', () => {
    expect(Object.isFrozen(HIGHLIGHTER_MESSAGES)).toBe(true);
    expect(Object.isFrozen(HIGHLIGHTER_MESSAGES.FLOATING_RAIL)).toBe(true);
    expect(HIGHLIGHTER_MESSAGES.FLOATING_RAIL.SAVE_LABEL).toBe('保存網頁');
    expect(HIGHLIGHTER_MESSAGES.TOOLBAR.COLOR_PICKER_TITLE('黃')).toBe('黃色標註');
    expect(HIGHLIGHTER_MESSAGES.TOOLBAR.COLOR_PICKER_ARIA_LABEL('藍')).toBe('選擇藍色標註');
  });

  test('highlighter actions expose stable frozen runtime values', () => {
    expect(Object.isFrozen(HIGHLIGHTER_ACTIONS)).toBe(true);
    expect(HIGHLIGHTER_ACTIONS.SYNC_HIGHLIGHTS).toBe('syncHighlights');
    expect(HIGHLIGHTER_ACTIONS.UPDATE_HIGHLIGHTS).toBe('UPDATE_HIGHLIGHTS');
    expect(HIGHLIGHTER_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT).toBe(
      'ACTIVATE_FLOATING_RAIL_HIGHLIGHT'
    );
  });

  test('storage keys and data source merge semantics stay stable', () => {
    expect(SYNC_CONFIG_KEYS).toContain('floatingRailEnabled');
    expect(AUTH_LOCAL_KEYS).toContain('notionOAuthToken');
    expect(SAVED_PREFIX).toBe('saved_');
    expect(HIGHLIGHTS_PREFIX).toBe('highlights_');

    expect(
      mergeDataSourceConfig(
        { notionDataSourceId: 'local-id' },
        {
          notionDataSourceId: 'sync-id',
          notionDatabaseId: 'sync-db',
          notionDataSourceType: 'database',
        }
      )
    ).toEqual({
      notionDataSourceId: 'local-id',
      notionDatabaseId: 'sync-db',
      notionDataSourceType: 'database',
    });
  });

  test('save status helpers normalize state and preserve canonical fields', () => {
    const hadLogger = Object.hasOwn(globalThis, 'Logger');
    const originalLogger = globalThis.Logger;
    const warn = jest.fn();
    globalThis.Logger = { warn };

    try {
      expect(isSavedStatusResponse({ deletionPending: true, wasDeleted: true })).toBe(true);
      expect(isSavedStatusResponse({ wasDeleted: true })).toBe(false);
      expect(isSavedStatusResponse({ statusKind: SAVE_STATUS_KINDS.SAVED })).toBe(true);
      expect(isSavedStatusResponse({ isSaved: 1 })).toBe(true);

      const response = createSaveStatusResponse({
        statusKind: 'unknown_kind',
        stableUrl: 'https://example.com',
        extra: { customFlag: 'preserved', statusKind: 'saved' },
      });

      expect(response).toEqual(
        expect.objectContaining({
          success: false,
          statusKind: SAVE_STATUS_KINDS.ERROR,
          isSaved: false,
          canSave: false,
          canSyncHighlights: false,
          stableUrl: 'https://example.com',
          error: 'unknown_status_kind',
          customFlag: 'preserved',
        })
      );
      expect(warn).toHaveBeenCalledWith('unknown status kind', {
        operation: 'createSaveStatusResponse',
        reason: 'unknown_status_kind',
        statusKind: 'unknown_kind',
      });
    } finally {
      if (hadLogger) {
        globalThis.Logger = originalLogger;
      } else {
        delete globalThis.Logger;
      }
    }
  });

  test('content extraction constants expose stable selector and limit cohorts', () => {
    expect(NEXTJS_CONFIG.MAX_JSON_SIZE).toBe(2 * 1024 * 1024);
    expect(FEATURED_IMAGE_SELECTORS).toContain('article img:first-of-type');
    expect(IMAGE_SRC_ATTRIBUTES).toEqual(
      expect.arrayContaining(['src', 'data-src', 'data-lazy-src'])
    );
    expect(ARTICLE_SELECTORS).toContain('article');
    expect(IMAGE_VALIDATION_CONFIG.SUPPORTED_PROTOCOLS).toContain('https:');
    expect(IMAGE_LIMITS.MAX_MAIN_CONTENT_IMAGES).toBe(6);
    expect(DOM_STABILITY.THRESHOLD_MS).toBe(150);
    expect(CONTENT_QUALITY.DEFAULT_PAGE_TITLE).toBe('未命名頁面');
    expect(TEXT_PROCESSING.MAX_RICH_TEXT_LENGTH).toBe(2000);
  });

  test('contentSafe toolbar icons are frozen and contain basic svg data', () => {
    expect(Object.isFrozen(TOOLBAR_ICONS)).toBe(true);
    expect(TOOLBAR_ICONS.SUCCESS).toContain('<svg');
    expect(TOOLBAR_ICONS.ERROR).toContain('<svg');
  });

  test('shared index aggregates other sub-config exports correctly', () => {
    expect(SHARED_INDEX.SAVE_STATUS_KINDS).toBeDefined();
    expect(SHARED_INDEX.createSaveStatusResponse).toBeDefined();
  });

  test('technicalTerms rule definitions map group and type correctly', () => {
    expect(TECHNICAL_TERM_RULES.length).toBeGreaterThan(0);
    const first = TECHNICAL_TERM_RULES[0];
    expect(first.type).toBeDefined();
    expect(first.group).toBeDefined();
    expect(TECHNICAL_TERM_RULES.some(r => r.group === GROUP_PROGRAMMING)).toBe(true);
  });
});
