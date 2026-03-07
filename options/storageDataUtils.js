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
} from '../scripts/config/constants.js';

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
  const data = await new Promise((resolve, reject) => {
    chrome.storage.local.get(null, result => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result);
    });
  });

  const jsonString = JSON.stringify(data);
  const sizeInBytes = new Blob([jsonString]).size;

  // 預先收集 page_* 的 URL（供去重計數用）
  const pageUrls = new Set();
  for (const key of Object.keys(data)) {
    if (key.startsWith(PAGE_PREFIX)) {
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
  const isCorrupted =
    !value ||
    typeof value !== 'object' ||
    (value.highlights !== undefined && !Array.isArray(value.highlights));

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
