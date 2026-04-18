/**
 * storageDataUtils.js
 * 存儲數據的純邏輯工具函數（不含 DOM / UI 依賴）
 *
 * 包含：備份白名單、數據分析、使用量計算、清理邏輯、優化邏輯等。
 * 由 StorageManager.js 的 UI 控制器層呼叫。
 *
 * 主要入口函數：
 * - getStorageHealthReport() — 一次掃描，輸出使用量 + 健康度 + 清理計劃
 */

/* global chrome */

import {
  PAGE_PREFIX,
  HIGHLIGHTS_PREFIX,
  SAVED_PREFIX,
  URL_ALIAS_PREFIX,
} from '../scripts/config/storageKeys.js';

// ─── 備份 ──────────────────────────────────────────────────────────────

/**
 * 備份白名單前綴 — 只有符合這些前綴的 key 才會被匯出備份。
 * ⚠️ 新增用戶數據 storage key 時，若前綴不在此清單中，請同步更新。
 */
export const BACKUP_ALLOWED_PREFIXES = [
  PAGE_PREFIX, // Phase 3 統一格式（notion + highlights + metadata）
  HIGHLIGHTS_PREFIX, // 舊格式標注（過渡期：尚未被讀時升級的數據）
  SAVED_PREFIX, // 舊格式保存狀態（過渡期）
  URL_ALIAS_PREFIX, // URL 正規化映射
];

const REFERENCE_STORAGE_SIZE_BYTES = 100 * 1024 * 1024;

const CONFIG_PREFIX = 'config_';
const CONFIG_KEY_SUBSTR = 'notion';

function _isCorruptedPageEntry(value) {
  return (
    !value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.highlights)
  );
}

/**
 * 過濾備份數據，僅保留白名單前綴的 key
 *
 * @param {object} data 原始 storage 數據
 * @returns {object} 過濾後的備份數據
 */
export function sanitizeBackupData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(data).filter(([key]) =>
      BACKUP_ALLOWED_PREFIXES.some(prefix => key.startsWith(prefix))
    )
  );
}

/**
 * 讀取整個 chrome.storage.local 快照（Promise 化）
 *
 * @returns {Promise<object>}
 */
export function getAllLocalStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, result => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result);
    });
  });
}

// ─── 備份差異比對 ─────────────────────────────────────────────────────

/**
 * 深度比較兩個值是否相等（排序 key 後做 JSON 比較）
 * 僅用於備份 diff，不處理循環引用等邊界情況。
 *
 * @param {any} objA
 * @param {any} objB
 * @returns {boolean}
 */
function _deepEqual(objA, objB) {
  return JSON.stringify(_sortKeys(objA)) === JSON.stringify(_sortKeys(objB));
}

/**
 * 遞迴排序物件 key，消除 JSON.stringify 對 key 順序的敏感性
 * 僅支援 JSON-safe 型別（備份資料已於白名單中保證為 JSON-safe）
 *
 * @param {any} value
 * @returns {any}
 */
function _sortKeys(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(val => _sortKeys(val));
  }
  return Object.fromEntries(
    Object.entries(value)
      // eslint-disable-next-line unicorn/no-array-sort -- Object.entries() 會回傳新陣列，這裡改用 sort() 以相容較舊的 Chrome 版本。
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, val]) => [key, _sortKeys(val)])
  );
}

/**
 * 比對備份數據與本地數據，分類為新增/衝突/相同
 *
 * @param {object} backupData 已經過 sanitizeBackupData 過濾的備份數據
 * @param {object} localData 當前本地 storage 數據
 * @returns {{ newKeys: object, conflictKeys: object, skippedKeys: string[] }}
 */
export function diffBackupData(backupData, localData) {
  const result = { newKeys: {}, conflictKeys: {}, skippedKeys: [] };

  for (const [key, value] of Object.entries(backupData)) {
    if (!(key in localData)) {
      result.newKeys[key] = value;
    } else if (_deepEqual(localData[key], value)) {
      result.skippedKeys.push(key);
    } else {
      result.conflictKeys[key] = value;
    }
  }
  return result;
}

/**
 * 根據匯入模式產生實際執行計劃，將純資料決策與 UI orchestration 分離。
 *
 * @param {'overwrite-all'|'new-only'|'new-and-overwrite'} mode
 * @param {object} sanitizedData 已經過 sanitizeBackupData 過濾的備份數據
 * @param {object} localData 當前本地 storage 數據
 * @returns {{
 *   dataToWrite: object,
 *   keysToRemove: string[],
 *   effectiveNewCount: number,
 *   effectiveOverwriteCount: number,
 *   skipCount: number,
 *   hasWork: boolean,
 * }}
 */
export function buildImportExecutionPlan(mode, sanitizedData, localData) {
  const diff = diffBackupData(sanitizedData, localData);
  const newCount = Object.keys(diff.newKeys).length;
  const overwriteCount = Object.keys(diff.conflictKeys).length;

  let dataToWrite = {};
  let keysToRemove = [];
  let effectiveOverwriteCount = overwriteCount;
  let skipCount = diff.skippedKeys.length;

  switch (mode) {
    case 'overwrite-all': {
      dataToWrite = sanitizedData;
      keysToRemove = Object.keys(localData).filter(
        key =>
          BACKUP_ALLOWED_PREFIXES.some(prefix => key.startsWith(prefix)) && !(key in sanitizedData)
      );
      break;
    }
    case 'new-only': {
      dataToWrite = diff.newKeys;
      effectiveOverwriteCount = 0;
      skipCount += overwriteCount;
      break;
    }
    case 'new-and-overwrite': {
      dataToWrite = { ...diff.newKeys, ...diff.conflictKeys };
      break;
    }
    default: {
      throw new Error(`Unknown import mode: ${mode}`);
    }
  }

  return {
    dataToWrite,
    keysToRemove,
    effectiveNewCount: newCount,
    effectiveOverwriteCount,
    skipCount,
    hasWork: Object.keys(dataToWrite).length > 0 || keysToRemove.length > 0,
  };
}

// ─── 健康度報告（統一入口） ───────────────────────────────────────────

/**
 * 一次掃描，三個輸出：使用量統計 + 健康度 + 清理計劃
 *
 * 取代原本分散的 analyzeData() + getStorageUsage() + collectOrphanHighlightItems()
 * + collectOrphanAliasItems() + generateOptimizationPlan() 等多次讀取的設計。
 *
 * @returns {Promise<object>} 統一報告物件，包含：
 *   - used, usedMB, percentage, isUnlimited, pages, highlights, configs（使用量）
 *   - migrationKeys, migrationDataSize, legacySavedKeys, corruptedData（健康度）
 *   - cleanupPlan: { items, totalKeys, spaceFreed, summary }（清理計劃）
 */
export async function getStorageHealthReport() {
  const data = await getAllLocalStorage();

  const jsonString = JSON.stringify(data);
  const sizeInBytes = new Blob([jsonString]).size;

  // 預先收集 page_* 的 URL（供去重計數用）
  const pageUrls = new Set();
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith(PAGE_PREFIX) && !_isCorruptedPageEntry(value)) {
      pageUrls.add(key.slice(PAGE_PREFIX.length));
    }
  }

  const report = {
    // === 使用量統計 ===
    used: sizeInBytes,
    usedMB: (sizeInBytes / (1024 * 1024)).toFixed(2),
    percentage: Math.min((sizeInBytes / REFERENCE_STORAGE_SIZE_BYTES) * 100, 100).toFixed(1),
    isUnlimited: true,
    pages: 0,
    highlights: 0,
    configs: 0,

    // === 健康度 ===
    migrationKeys: 0,
    migrationDataSize: 0,
    legacySavedKeys: 0,
    corruptedData: [],

    // === 清理計劃 ===
    cleanupPlan: {
      items: [],
      totalKeys: 0,
      spaceFreed: 0,
      summary: {
        emptyRecords: 0, // 空 page_*（無標注且無 Notion 綁定）
        orphanRecords: 0, // 孤兒 highlights_* / url_alias:
        migrationLeftovers: 0, // 舊版升級殘留（migration / _v1_ / _backup_）
        corruptedRecords: 0, // 損壞數據（結構不合法）
      },
    },
  };

  // 單次遍歷：同時更新使用量計數、健康度、清理計劃
  for (const [key, value] of Object.entries(data)) {
    _analyzeHealthEntry(key, value, report, pageUrls, data);
  }

  report.cleanupPlan.totalKeys = report.cleanupPlan.items.length;
  return report;
}

/**
 * 輔助（路由器）：分派各類 key 到對應的分析子函數
 *
 * @param {string} key 鍵名
 * @param {any} value 值
 * @param {object} report 統一報告
 * @param {Set<string>} pageUrls page_* 前綴的 URL 集合
 * @param {object} data 完整 storage 快照（供孤兒檢查用）
 */
function _analyzeHealthEntry(key, value, report, pageUrls, data) {
  if (key.startsWith(PAGE_PREFIX)) {
    _analyzePageEntry(key, value, report);
  } else if (key.startsWith(HIGHLIGHTS_PREFIX)) {
    _analyzeHighlightsEntry(key, value, report, pageUrls, data);
  } else if (key.startsWith(SAVED_PREFIX)) {
    report.legacySavedKeys++;
  } else if (key.startsWith(URL_ALIAS_PREFIX)) {
    _analyzeAliasEntry(key, value, report, data);
  } else if (key.startsWith(CONFIG_PREFIX) || key.includes(CONFIG_KEY_SUBSTR)) {
    report.configs++;
  } else if (key.includes('migration') || key.includes('_v1_') || key.includes('_backup_')) {
    _analyzeMigrationEntry(key, value, report);
  }
}

/**
 * 輔助：分析 page_* 數據項
 *
 * @param {string} key 鍵名
 * @param {any} value 值
 * @param {object} report 統一報告
 */
function _analyzePageEntry(key, value, report) {
  const plan = report.cleanupPlan;

  // 結構破損 → 加入清理計劃
  const isCorrupted = _isCorruptedPageEntry(value);

  if (isCorrupted) {
    report.corruptedData.push(key);
    const size = new Blob([JSON.stringify({ [key]: value })]).size;
    plan.items.push({ key, size, reason: '損壞的頁面數據' });
    plan.spaceFreed += size;
    plan.summary.corruptedRecords++;
    return;
  }

  const hl = value.highlights;
  const hasHighlights = Array.isArray(hl) && hl.length > 0;
  const hasNotion = Boolean(value?.notion?.pageId);

  report.pages++;
  if (Array.isArray(hl)) {
    report.highlights += hl.length;
  }

  // 空 page_*（無標注且無 Notion 綁定）→ 加入清理計劃
  if (!hasHighlights && !hasNotion) {
    const size = new Blob([JSON.stringify({ [key]: value })]).size;
    plan.items.push({ key, size, reason: '空記錄（無標注且無保存）' });
    plan.spaceFreed += size;
    plan.summary.emptyRecords++;
  }
}

/**
 * 輔助：分析 highlights_* 數據項
 *
 * @param {string} key 鍵名
 * @param {any} value 值
 * @param {object} report 統一報告
 * @param {Set<string>} pageUrls page_* 前綴的 URL 集合
 * @param {object} data 完整 storage 快照
 */
function _analyzeHighlightsEntry(key, value, report, pageUrls, data) {
  const plan = report.cleanupPlan;
  const url = key.slice(HIGHLIGHTS_PREFIX.length);

  // 結構破損 → 加入清理計劃
  const isValid = Array.isArray(value) || (value && Array.isArray(value.highlights));
  if (!isValid) {
    report.corruptedData.push(key);
    const size = new Blob([JSON.stringify({ [key]: value })]).size;
    plan.items.push({ key, url, size, reason: '損壞的標注數據' });
    plan.spaceFreed += size;
    plan.summary.corruptedRecords++;
    return;
  }

  // 使用量計數（僅在無對應 page_* 時計入，避免重複）
  if (!pageUrls.has(url)) {
    report.pages++;
    const hl = Array.isArray(value) ? value : value.highlights;
    report.highlights += hl.length;
  }

  // 孤兒 highlights_*（既無有效標注，也無對應記錄）→ 加入清理計劃
  const highlights = Array.isArray(value) ? value : value.highlights;
  const hasHighlights = Array.isArray(highlights) && highlights.length > 0;
  const hasSaved = Object.hasOwn(data, `${SAVED_PREFIX}${url}`);
  const hasPage = pageUrls.has(url);

  if (!hasHighlights && !hasSaved && !hasPage) {
    const size = new Blob([JSON.stringify({ [key]: value })]).size;
    plan.items.push({ key, url, size, reason: '孤兒資料（無標注且無對應記錄）' });
    plan.spaceFreed += size;
    plan.summary.orphanRecords++;
  }
}

/**
 * 輔助：分析 url_alias: 數據項
 *
 * @param {string} key 鍵名
 * @param {any} normUrl 目標正規化 URL
 * @param {object} report 統一報告
 * @param {object} data 完整 storage 快照
 */
function _analyzeAliasEntry(key, normUrl, report, data) {
  const plan = report.cleanupPlan;

  if (typeof normUrl !== 'string' || normUrl === '') {
    const rawUrl = normUrl === '' ? key : String(normUrl ?? key);
    const size = new Blob([JSON.stringify({ [key]: normUrl })]).size;
    plan.items.push({
      key,
      url: encodeURIComponent(rawUrl),
      size,
      reason: '無效的 URL 別名',
    });
    plan.spaceFreed += size;
    plan.summary.orphanRecords++;
    return;
  }

  const hasTarget =
    Object.hasOwn(data, `${PAGE_PREFIX}${normUrl}`) ||
    Object.hasOwn(data, `${HIGHLIGHTS_PREFIX}${normUrl}`) ||
    Object.hasOwn(data, `${SAVED_PREFIX}${normUrl}`);

  if (!hasTarget) {
    const size = new Blob([JSON.stringify({ [key]: normUrl })]).size;
    plan.items.push({ key, url: encodeURIComponent(normUrl), size, reason: '孤兒 URL 別名' });
    plan.spaceFreed += size;
    plan.summary.orphanRecords++;
  }
}

/**
 * 輔助：分析舊版升級殘留數據項
 *
 * @param {string} key 鍵名
 * @param {any} value 值
 * @param {object} report 統一報告
 */
function _analyzeMigrationEntry(key, value, report) {
  report.migrationKeys++;
  const size = new Blob([JSON.stringify({ [key]: value })]).size;
  report.migrationDataSize += size;

  const plan = report.cleanupPlan;
  plan.items.push({ key, size, reason: '舊版格式升級殘留' });
  plan.spaceFreed += size;
  plan.summary.migrationLeftovers++;
}
