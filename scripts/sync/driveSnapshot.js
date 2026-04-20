/**
 * driveSnapshot.js — Canonicalization、Serializer 與 Compatibility Mirror Apply
 *
 * 負責：
 * 1. buildUnifiedPageStateFromLocalStorage() — 從本地 storage 合併 mixed-format 資料
 * 2. buildDriveSnapshot() — 將 unified page state 序列化為後端 snapshot 格式
 * 3. applyDriveSnapshotToLocalStorage() — 下載後套用至本地，含 Compatibility Mirror
 *
 * 設計原則（MUST NOT 違反，Phase A Compatibility Mirror 策略）：
 * - upload 前 MUST NOT 修改本地 storage
 * - download 套用時，同步寫入 page_* / saved_* / highlights_* / url_alias:*
 * - 再移除本地有但 snapshot 無的白名單 keys（避免 stale legacy keys 復活）
 * - MUST NOT 觸碰 account* / notion* / driveSync* keys
 *
 * 合併規則（buildUnifiedPageStateFromLocalStorage）：
 * - 同 URL 有 page_* 時以 page_* 為主
 * - 若 page_* 缺 notion，而 saved_* 存在，補 notion
 * - 若 page_* 缺 highlights，而 highlights_* 存在，補 highlights
 * - 若只有 legacy keys（saved_* / highlights_*），也要納入 snapshot
 *
 * @see docs/plans/2026-04-20-google-drive-sync-frontend-phase-a-manual-sync-plan.md §3、§6 Step 3/5
 * @see .agents/.shared/knowledge/storage_schema.json §patterns
 */

/* global chrome */

import {
  PAGE_PREFIX,
  HIGHLIGHTS_PREFIX,
  SAVED_PREFIX,
  URL_ALIAS_PREFIX,
} from '../config/storageKeys.js';

// =============================================================================
// 白名單前綴（與 storageDataUtils.js 的 BACKUP_ALLOWED_PREFIXES 一致）
// =============================================================================

/** Phase A sync 白名單前綴 */
const SYNC_ALLOWED_PREFIXES = [PAGE_PREFIX, HIGHLIGHTS_PREFIX, SAVED_PREFIX, URL_ALIAS_PREFIX];

// =============================================================================
// 型別定義
// =============================================================================

/**
 * @typedef {object} HighlightItem
 * @property {string} id
 * @property {string} text
 * @property {string} color
 * @property {object} rangeInfo
 * @property {number} timestamp
 */

/**
 * @typedef {object} NotionMeta
 * @property {string} pageId
 * @property {string} url
 * @property {string} title
 * @property {number} savedAt
 * @property {number} [lastVerifiedAt]
 */

/**
 * @typedef {object} UnifiedPageState
 * @property {string} url - stable URL（storage key 中 page_ 後面的部分）
 * @property {NotionMeta | null} notion
 * @property {HighlightItem[]} highlights
 */

/**
 * @typedef {object} DriveSnapshotEntry
 * @property {object | null} saved_state - notion metadata（與後端契約一致）
 * @property {HighlightItem[]} highlights
 */

/**
 * @typedef {object} DriveSnapshotPayload
 * @property {Record<string, DriveSnapshotEntry>} pages - key 為 stable URL
 * @property {Record<string, string>} url_aliases - key 為 normalizedUrl，value 為 stableUrl
 * @property {string} snapshotCreatedAt - ISO 8601
 * @property {string} schemaVersion - 'v1'
 */

// =============================================================================
// 內部工具函數
// =============================================================================

/**
 * 判斷 page_* entry 是否符合最小合法結構
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function _isValidPageEntry(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 從 highlights_* value 中提取 highlights 陣列
 *
 * @param {unknown} value
 * @returns {HighlightItem[] | null}
 */
function _extractHighlights(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object' && Array.isArray(value.highlights)) {
    return value.highlights;
  }
  return null;
}

/**
 * 判斷 saved_* entry 是否有有效的 pageId
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function _isValidSavedEntry(value) {
  return Boolean(value) && typeof value === 'object' && Boolean(value.pageId || value.id);
}

/**
 * 將 saved_* legacy format 正規化為 NotionMeta
 *
 * @param {object} saved
 * @returns {NotionMeta}
 */
function _normalizeSavedState(saved) {
  return {
    pageId: saved.pageId ?? saved.id ?? '',
    url: saved.url ?? saved.notionUrl ?? '',
    title: saved.title ?? '',
    savedAt: Number(saved.savedAt ?? saved.timestamp ?? Date.now()),
    lastVerifiedAt: saved.lastVerifiedAt ? Number(saved.lastVerifiedAt) : undefined,
  };
}

// =============================================================================
// Step 3a 內部子函數（拆分 Cognitive Complexity）
// =============================================================================

/**
 * 處理 page_* keys，建立 canonical 頁面基礎
 *
 * @param {Record<string, unknown>} raw
 * @param {Map<string, UnifiedPageState>} pages
 */
function _processPageEntries(raw, pages) {
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith(PAGE_PREFIX)) {
      continue;
    }

    const url = key.slice(PAGE_PREFIX.length);
    if (!url || !_isValidPageEntry(value)) {
      continue;
    }

    pages.set(url, {
      url,
      notion: value.notion ?? null,
      highlights: Array.isArray(value.highlights) ? value.highlights : [],
    });
  }
}

/**
 * 處理 saved_* keys，補充或新增缺 notion 的頁面
 *
 * @param {Record<string, unknown>} raw
 * @param {Map<string, UnifiedPageState>} pages
 */
function _processSavedEntries(raw, pages) {
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith(SAVED_PREFIX)) {
      continue;
    }

    const url = key.slice(SAVED_PREFIX.length);
    if (!url) {
      continue;
    }

    const existing = pages.get(url);
    const hasValidPageId = _isValidSavedEntry(value);

    if (existing) {
      if (!existing.notion && hasValidPageId) {
        existing.notion = _normalizeSavedState(value);
      }
    } else if (hasValidPageId) {
      pages.set(url, {
        url,
        notion: _normalizeSavedState(value),
        highlights: [],
      });
    }
  }
}

/**
 * 處理 highlights_* keys，補充或新增缺 highlights 的頁面
 *
 * @param {Record<string, unknown>} raw
 * @param {Map<string, UnifiedPageState>} pages
 */
function _processHighlightEntries(raw, pages) {
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith(HIGHLIGHTS_PREFIX)) {
      continue;
    }

    const url = key.slice(HIGHLIGHTS_PREFIX.length);
    if (!url) {
      continue;
    }

    const rawHighlights = _extractHighlights(value);
    if (!rawHighlights) {
      continue;
    }

    const existing = pages.get(url);

    if (existing) {
      if (existing.highlights.length === 0 && rawHighlights.length > 0) {
        existing.highlights = rawHighlights;
      }
    } else if (rawHighlights.length > 0) {
      pages.set(url, {
        url,
        notion: null,
        highlights: rawHighlights,
      });
    }
  }
}

/**
 * 收集 url_alias:* keys
 *
 * @param {Record<string, unknown>} raw
 * @param {Map<string, string>} urlAliases
 */
function _processAliasEntries(raw, urlAliases) {
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith(URL_ALIAS_PREFIX)) {
      continue;
    }
    if (typeof value !== 'string' || !value) {
      continue;
    }

    const normalizedUrl = key.slice(URL_ALIAS_PREFIX.length);
    if (normalizedUrl) {
      urlAliases.set(normalizedUrl, value);
    }
  }
}

// =============================================================================
// Step 3a：buildUnifiedPageStateFromLocalStorage（主入口）
// =============================================================================

/**
 * 從本地 chrome.storage.local 讀取所有頁面資料，合併為 unified page state。
 *
 * ⚠️ MUST NOT 修改本地 storage。
 *
 * @returns {Promise<{ pages: Map<string, UnifiedPageState>; urlAliases: Map<string, string> }>}
 */
export async function buildUnifiedPageStateFromLocalStorage() {
  const raw = await chrome.storage.local.get(null);

  /** @type {Map<string, UnifiedPageState>} */
  const pages = new Map();

  /** @type {Map<string, string>} normalizedUrl → stableUrl */
  const urlAliases = new Map();

  // 四個子函數，依優先順序處理各格式
  _processPageEntries(raw, pages);
  _processSavedEntries(raw, pages);
  _processHighlightEntries(raw, pages);
  _processAliasEntries(raw, urlAliases);

  return { pages, urlAliases };
}

// =============================================================================
// Step 3b：buildDriveSnapshot
// =============================================================================

/**
 * 將 unified page state 序列化為後端要求的 Drive snapshot 格式。
 *
 * 過濾掉無任何有效資料的空頁面（無 notion 且無 highlights）。
 *
 * @param {Map<string, UnifiedPageState>} pages
 * @param {Map<string, string>} urlAliases
 * @returns {DriveSnapshotPayload}
 */
export function buildDriveSnapshot(pages, urlAliases) {
  /** @type {Record<string, DriveSnapshotEntry>} */
  const snapshotPages = {};

  for (const [url, state] of pages) {
    if (!state.notion && state.highlights.length === 0) {
      continue;
    }

    snapshotPages[url] = {
      saved_state: state.notion ? { ...state.notion } : null,
      highlights: state.highlights,
    };
  }

  /** @type {Record<string, string>} */
  const aliasRecord = {};
  for (const [normalizedUrl, stableUrl] of urlAliases) {
    aliasRecord[normalizedUrl] = stableUrl;
  }

  return {
    schemaVersion: 'v1',
    snapshotCreatedAt: new Date().toISOString(),
    pages: snapshotPages,
    url_aliases: aliasRecord,
  };
}

// =============================================================================
// Step 5 內部子函數
// =============================================================================

/**
 * 從 snapshot 的 pages 建立要寫入的 storage key-value pairs
 *
 * @param {Record<string, DriveSnapshotEntry>} snapshotPages
 * @param {Record<string, unknown>} toWrite
 * @param {Set<string>} snapshotStorageKeys
 */
function _buildPageWriteEntries(snapshotPages, toWrite, snapshotStorageKeys) {
  const now = Date.now();

  for (const [url, entry] of Object.entries(snapshotPages)) {
    if (!url || typeof entry !== 'object') {
      continue;
    }

    const highlights = Array.isArray(entry.highlights) ? entry.highlights : [];
    const savedState = entry.saved_state ?? null;

    const pageKey = `${PAGE_PREFIX}${url}`;
    toWrite[pageKey] = {
      notion: savedState,
      highlights,
      metadata: {
        createdAt: now,
        lastUpdated: now,
        migratedFrom: 'drive_snapshot',
      },
    };
    snapshotStorageKeys.add(pageKey);

    if (savedState) {
      const savedKey = `${SAVED_PREFIX}${url}`;
      toWrite[savedKey] = {
        pageId: savedState.pageId,
        url: savedState.url,
        title: savedState.title,
        savedAt: savedState.savedAt,
        lastVerifiedAt: savedState.lastVerifiedAt,
      };
      snapshotStorageKeys.add(savedKey);
    }

    if (highlights.length > 0) {
      const hlKey = `${HIGHLIGHTS_PREFIX}${url}`;
      toWrite[hlKey] = highlights;
      snapshotStorageKeys.add(hlKey);
    }
  }
}

/**
 * 從 snapshot 的 url_aliases 建立要寫入的 storage key-value pairs
 *
 * @param {Record<string, string>} urlAliases
 * @param {Record<string, unknown>} toWrite
 * @param {Set<string>} snapshotStorageKeys
 */
function _buildAliasWriteEntries(urlAliases, toWrite, snapshotStorageKeys) {
  for (const [normalizedUrl, stableUrl] of Object.entries(urlAliases)) {
    if (!normalizedUrl || typeof stableUrl !== 'string') {
      continue;
    }
    const aliasKey = `${URL_ALIAS_PREFIX}${normalizedUrl}`;
    toWrite[aliasKey] = stableUrl;
    snapshotStorageKeys.add(aliasKey);
  }
}

// =============================================================================
// Step 5：applyDriveSnapshotToLocalStorage（Compatibility Mirror Apply）
// =============================================================================

/**
 * 將遠端 snapshot 套用至本地 storage（Compatibility Mirror 策略）。
 *
 * @param {DriveSnapshotPayload} snapshot - 遠端下載的原始 snapshot
 * @returns {Promise<{ writtenKeys: string[]; removedKeys: string[] }>}
 */
export async function applyDriveSnapshotToLocalStorage(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.pages) {
    throw new Error('INVALID_SNAPSHOT: snapshot 缺少 pages 欄位');
  }

  const rawLocal = await chrome.storage.local.get(null);
  const localSyncKeys = Object.keys(rawLocal).filter(key =>
    SYNC_ALLOWED_PREFIXES.some(prefix => key.startsWith(prefix))
  );

  /** @type {Record<string, unknown>} */
  const toWrite = {};

  /** @type {Set<string>} */
  const snapshotStorageKeys = new Set();

  _buildPageWriteEntries(snapshot.pages ?? {}, toWrite, snapshotStorageKeys);
  _buildAliasWriteEntries(snapshot.url_aliases ?? {}, toWrite, snapshotStorageKeys);

  const toRemove = localSyncKeys.filter(key => !snapshotStorageKeys.has(key));

  if (Object.keys(toWrite).length > 0) {
    await chrome.storage.local.set(toWrite);
  }
  if (toRemove.length > 0) {
    await chrome.storage.local.remove(toRemove);
  }

  return {
    writtenKeys: Object.keys(toWrite),
    removedKeys: toRemove,
  };
}

// =============================================================================
// 工具函數（供外部讀取 snapshot 摘要）
// =============================================================================

/**
 * 取得遠端 snapshot 的摘要資訊（顯示給使用者確認用）。
 *
 * @param {DriveSnapshotPayload} snapshot
 * @returns {{ pageCount: number; highlightCount: number; snapshotCreatedAt: string | null }}
 */
export function getDriveSnapshotSummary(snapshot) {
  if (!snapshot?.pages) {
    return { pageCount: 0, highlightCount: 0, snapshotCreatedAt: null };
  }

  let pageCount = 0;
  let highlightCount = 0;

  for (const entry of Object.values(snapshot.pages)) {
    pageCount++;
    if (Array.isArray(entry.highlights)) {
      highlightCount += entry.highlights.length;
    }
  }

  return {
    pageCount,
    highlightCount,
    snapshotCreatedAt: snapshot.snapshotCreatedAt ?? null,
  };
}
