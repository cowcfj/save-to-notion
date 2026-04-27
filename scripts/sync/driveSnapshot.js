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
 * - merge-upsert：寫入 remote keys，但保留本地有、remote 無的 sync keys
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
} from '../config/shared/storage.js';

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
 * @typedef {object} DriveSnapshotHighlightItem
 * @property {string} page_key
 * @property {string} highlight_id
 * @property {string} text
 * @property {string | null} [color]
 * @property {object | null} [range_info]
 * @property {number | string | null} [created_at]
 * @property {number | string | null} [updated_at]
 */

/**
 * @typedef {object} DriveSnapshotSavedStateItem
 * @property {string} page_key
 * @property {string | null} notion_page_id
 * @property {string | null} notion_url
 * @property {string | null} title
 * @property {number | string | null} saved_at
 * @property {number | string | null} [last_verified_at]
 */

/**
 * @typedef {object} DriveSnapshotDocument
 * @property {{
 *   snapshot_version: number,
 *   export_schema_version: number,
 *   updated_at: string,
 *   source_installation_id: string,
 *   source_profile_id: string,
 *   payload_hash: string,
 *   item_counts: { highlights: number, saved_states: number }
 * }} metadata
 * @property {{
 *   highlights: DriveSnapshotHighlightItem[],
 *   saved_states: DriveSnapshotSavedStateItem[],
 *   url_aliases?: Record<string, string>
 * }} payload
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

function _toFiniteNumber(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * 判斷 value 是否為 plain object（非 null、非陣列、非字串／其他原始型別）
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function _isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
    savedAt: _toFiniteNumber(saved.savedAt ?? saved.timestamp, Date.now()),
    lastVerifiedAt:
      saved.lastVerifiedAt == null ? undefined : _toFiniteNumber(saved.lastVerifiedAt),
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

// =============================================================================
// Alias Referential Integrity 工具函數（upload + download 共用）
// =============================================================================

/**
 * 判斷 alias 的 target（stableUrl）是否可被本地資料落地。
 *
 * 規則：alias 的 target 必須至少對應一個可落地資料來源。
 * 僅做集合查詢，不讀取遠端或 chrome.storage。
 *
 * @param {string} stableUrl - alias 指向的穩定 URL
 * @param {Set<string>} reachableUrls - 可落地 URL 集合
 * @returns {boolean}
 */
function _isAliasTargetReachable(stableUrl, reachableUrls) {
  return reachableUrls.has(stableUrl);
}

/**
 * 從 urlAliases Map 過濾出 target 可達的 alias，回傳新 Map。
 *
 * @param {Map<string, string>} urlAliases - normalizedUrl → stableUrl
 * @param {Set<string>} reachableUrls - 可落地 URL 集合
 * @returns {Map<string, string>} 僅含有效 alias 的新 Map
 */
function _filterValidUrlAliases(urlAliases, reachableUrls) {
  /** @type {Map<string, string>} */
  const valid = new Map();
  for (const [normalizedUrl, stableUrl] of urlAliases) {
    if (_isAliasTargetReachable(stableUrl, reachableUrls)) {
      valid.set(normalizedUrl, stableUrl);
    }
  }
  return valid;
}

async function _sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  return Array.from(hashArray)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 將 unified page state 序列化為後端要求的 Drive snapshot 格式。
 *
 * 過濾掉無任何有效資料的空頁面（無 notion 且無 highlights）。
 *
 * @param {Map<string, UnifiedPageState>} pages
 * @param {Map<string, string>} urlAliases
 * @param {{ installationId?: string | null; profileId?: string | null }} [identity]
 * @returns {Promise<DriveSnapshotDocument>}
 */
export async function buildDriveSnapshot(pages, urlAliases, identity = {}) {
  /** @type {DriveSnapshotHighlightItem[]} */
  const highlights = [];
  /** @type {DriveSnapshotSavedStateItem[]} */
  const savedStates = [];

  for (const [url, state] of pages) {
    if (!state.notion && state.highlights.length === 0) {
      continue;
    }

    if (state.notion) {
      savedStates.push({
        page_key: url,
        notion_page_id: state.notion.pageId ?? null,
        notion_url: state.notion.url ?? null,
        title: state.notion.title ?? null,
        saved_at: state.notion.savedAt ?? null,
        last_verified_at: state.notion.lastVerifiedAt ?? null,
      });
    }

    for (const highlight of state.highlights) {
      highlights.push({
        page_key: url,
        highlight_id: String(highlight.id ?? ''),
        text: highlight.text ?? '',
        color: highlight.color ?? null,
        range_info:
          highlight.rangeInfo && typeof highlight.rangeInfo === 'object'
            ? highlight.rangeInfo
            : null,
        created_at: highlight.timestamp ?? null,
        updated_at: highlight.updatedAt ?? null,
      });
    }
  }

  /** @type {Record<string, string>} */
  const aliasRecord = {};

  // Upload 路徑 Alias Gate：僅允許 target 存在於本次 payload 的 alias 進入 snapshot。
  // reachableUrls 基於實際落地頁面集合（saved_states + highlights 的 page_key），
  // 而非全量 pages.keys()（後者含空頁面，不應被 alias 引用）。
  const reachableUrls = new Set([
    ...savedStates.map(state => state.page_key),
    ...highlights.map(hl => hl.page_key),
  ]);
  const filteredAliases = _filterValidUrlAliases(urlAliases, reachableUrls);
  for (const [normalizedUrl, stableUrl] of filteredAliases) {
    aliasRecord[normalizedUrl] = stableUrl;
  }

  const payload = {
    highlights,
    saved_states: savedStates,
    url_aliases: aliasRecord,
  };
  const payloadHash = await _sha256Hex(JSON.stringify(payload));
  const updatedAt = new Date().toISOString();

  return {
    metadata: {
      snapshot_version: 1,
      export_schema_version: 1,
      updated_at: updatedAt,
      source_installation_id: identity.installationId || 'unknown-installation',
      source_profile_id: identity.profileId || 'unknown-profile',
      payload_hash: payloadHash,
      item_counts: {
        highlights: highlights.length,
        saved_states: savedStates.length,
      },
    },
    payload,
  };
}

// =============================================================================
// Step 5 內部子函數
// =============================================================================

/**
 * 從 snapshot 的 payload.saved_states 建立要寫入的 storage key-value pairs
 *
 * @param {DriveSnapshotSavedStateItem[]} savedStates
 * @returns {{ now: number; pageStates: Map<string, { notion: object | null; highlights: HighlightItem[] }> }}
 */
function _buildSavedStateWriteEntries(savedStates) {
  const now = Date.now();
  /** @type {Map<string, { notion: object | null; highlights: HighlightItem[] }>} */
  const pageStates = new Map();

  for (const entry of savedStates) {
    if (!entry || typeof entry !== 'object' || !entry.page_key) {
      continue;
    }

    const pageState = pageStates.get(entry.page_key) ?? { notion: null, highlights: [] };
    pageState.notion = {
      pageId: entry.notion_page_id ?? '',
      url: entry.notion_url ?? '',
      title: entry.title ?? '',
      savedAt: _toFiniteNumber(entry.saved_at, now),
      lastVerifiedAt:
        entry.last_verified_at === undefined || entry.last_verified_at === null
          ? undefined
          : _toFiniteNumber(entry.last_verified_at),
    };
    pageStates.set(entry.page_key, pageState);
  }

  return { now, pageStates };
}

/**
 * 從 snapshot 的 payload.highlights 建立要寫入的 storage key-value pairs
 *
 * @param {DriveSnapshotHighlightItem[]} highlights
 * @param {Map<string, { notion: object | null; highlights: HighlightItem[] }>} pageStates
 */
function _mergeHighlightEntries(highlights, pageStates) {
  for (const item of highlights) {
    if (!item || typeof item !== 'object' || !item.page_key) {
      continue;
    }

    const pageState = pageStates.get(item.page_key) ?? { notion: null, highlights: [] };
    const highlight = {
      id: item.highlight_id,
      text: item.text,
      color: item.color ?? '',
      rangeInfo: item.range_info && typeof item.range_info === 'object' ? item.range_info : {},
      timestamp: _toFiniteNumber(item.created_at, Date.now()),
    };

    if (item.updated_at !== undefined) {
      const updatedAt = _toFiniteNumber(item.updated_at);
      if (updatedAt !== undefined) {
        highlight.updatedAt = updatedAt;
      }
    }

    pageState.highlights.push(highlight);
    pageStates.set(item.page_key, pageState);
  }
}

/**
 * 將 pageStates 寫回本地 canonical + compatibility mirror keys
 *
 * @param {Map<string, { notion: object | null; highlights: HighlightItem[] }>} pageStates
 * @param {number} now
 * @param {Record<string, unknown>} toWrite
 * @param {Set<string>} snapshotStorageKeys
 */
function _buildPageWriteEntries(pageStates, now, toWrite, snapshotStorageKeys) {
  for (const [url, state] of pageStates) {
    if (!url) {
      continue;
    }

    const pageKey = `${PAGE_PREFIX}${url}`;
    toWrite[pageKey] = {
      notion: state.notion,
      highlights: state.highlights,
      metadata: {
        createdAt: now,
        lastUpdated: now,
        migratedFrom: 'drive_snapshot',
      },
    };
    snapshotStorageKeys.add(pageKey);

    if (state.notion) {
      const savedKey = `${SAVED_PREFIX}${url}`;
      toWrite[savedKey] = {
        pageId: state.notion.pageId,
        url: state.notion.url,
        title: state.notion.title,
        savedAt: state.notion.savedAt,
        lastVerifiedAt: state.notion.lastVerifiedAt,
      };
      snapshotStorageKeys.add(savedKey);
    }

    if (state.highlights.length > 0) {
      const hlKey = `${HIGHLIGHTS_PREFIX}${url}`;
      toWrite[hlKey] = state.highlights;
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
 * @param {Map<string, { notion: object | null; highlights: HighlightItem[] }>} pageStates
 */
function _buildAliasWriteEntries(urlAliases, toWrite, snapshotStorageKeys, pageStates) {
  if (!_isPlainObject(urlAliases)) {
    return;
  }

  // Download 路徑 Alias Prune：二次驗證 alias target 是否存在於本次 pageStates。
  // 僅寫入有效 alias；無效 alias 不加入 snapshotStorageKeys，
  // 使其能被後續 toRemove 邏輯清除（若本地已存在舊孤兒 alias）。
  const reachableUrls = new Set(pageStates.keys());

  for (const [normalizedUrl, stableUrl] of Object.entries(urlAliases)) {
    if (!normalizedUrl || typeof stableUrl !== 'string') {
      continue;
    }
    if (!_isAliasTargetReachable(stableUrl, reachableUrls)) {
      // 孤兒 alias：不寫入，不加入 snapshotStorageKeys，讓 toRemove 可清除本地舊 alias
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
 * @param {DriveSnapshotDocument} snapshot - 遠端下載的原始 snapshot
 * @returns {Promise<{ writtenKeys: string[]; removedKeys: string[] }>}
 */
export async function applyDriveSnapshotToLocalStorage(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.payload) {
    throw new Error('INVALID_SNAPSHOT: snapshot 缺少 payload 欄位');
  }

  /** @type {Record<string, unknown>} */
  const toWrite = {};

  /** @type {Set<string>} */
  const snapshotStorageKeys = new Set();

  const { now, pageStates } = _buildSavedStateWriteEntries(
    Array.isArray(snapshot.payload.saved_states) ? snapshot.payload.saved_states : []
  );
  _mergeHighlightEntries(
    Array.isArray(snapshot.payload.highlights) ? snapshot.payload.highlights : [],
    pageStates
  );
  _buildPageWriteEntries(pageStates, now, toWrite, snapshotStorageKeys);
  _buildAliasWriteEntries(
    snapshot.payload.url_aliases ?? {},
    toWrite,
    snapshotStorageKeys,
    pageStates
  );

  const toRemove = [];

  await _commitSnapshotWrite(toWrite, toRemove);

  return {
    writtenKeys: Object.keys(toWrite),
    removedKeys: toRemove,
  };
}

/**
 * 在 chrome.storage.local 上執行 remove → set，set 失敗時嘗試 rollback。
 *
 * @param {Record<string, unknown>} toWrite
 * @param {string[]} toRemove
 */
async function _commitSnapshotWrite(toWrite, toRemove) {
  /** @type {Record<string, unknown>} */
  const backup = {};

  if (toRemove.length > 0) {
    const current = await chrome.storage.local.get(toRemove);
    for (const key of toRemove) {
      if (current[key] !== undefined) {
        backup[key] = current[key];
      }
    }
    await chrome.storage.local.remove(toRemove);
  }

  try {
    await chrome.storage.local.set(toWrite);
  } catch (error) {
    if (Object.keys(backup).length > 0) {
      try {
        await chrome.storage.local.set(backup);
      } catch {
        // 回滾失敗時不遮蔽原始錯誤；呼叫方會透過外層 errorCode 追蹤
      }
    }
    const wrapped = new Error(
      `APPLY_INCOMPLETE: ${error instanceof Error ? error.message : String(error)}`
    );
    wrapped.code = 'APPLY_INCOMPLETE';
    wrapped.cause = error;
    throw wrapped;
  }
}

// =============================================================================
// 工具函數（供外部讀取 snapshot 摘要）
// =============================================================================

/**
 * 取得遠端 snapshot 的摘要資訊（顯示給使用者確認用）。
 *
 * @param {DriveSnapshotDocument} snapshot
 * @returns {{ pageCount: number; highlightCount: number; snapshotCreatedAt: string | null }}
 */
export function getDriveSnapshotSummary(snapshot) {
  if (!snapshot?.payload) {
    return { pageCount: 0, highlightCount: 0, snapshotCreatedAt: null };
  }

  const savedStates = Array.isArray(snapshot.payload.saved_states)
    ? snapshot.payload.saved_states
    : [];
  const highlights = Array.isArray(snapshot.payload.highlights) ? snapshot.payload.highlights : [];
  const pageKeys = new Set();

  for (const item of savedStates) {
    if (item?.page_key) {
      pageKeys.add(item.page_key);
    }
  }
  for (const item of highlights) {
    if (item?.page_key) {
      pageKeys.add(item.page_key);
    }
  }

  return {
    pageCount: pageKeys.size,
    highlightCount: highlights.length,
    snapshotCreatedAt: snapshot.metadata?.updated_at ?? null,
  };
}
