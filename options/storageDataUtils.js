/**
 * storageDataUtils.js
 * 存儲數據的純邏輯工具函數（不含 DOM / UI 依賴）
 *
 * 包含：備份白名單、數據分析、使用量計算、清理邏輯、優化邏輯等。
 * 由 StorageManager.js 的 UI 控制器層呼叫。
 */

/* global chrome */

import Logger from '../scripts/utils/Logger.js';
import { URL_ALIAS_PREFIX } from '../scripts/config/constants.js';

// ─── 備份 ──────────────────────────────────────────────────────────────

/**
 * 備份白名單前綴 — 只有符合這些前綴的 key 才會被匯出備份。
 * ⚠️ 新增用戶數據 storage key 時，若前綴不在此清單中，請同步更新。
 */
export const BACKUP_ALLOWED_PREFIXES = [
  'page_', // Phase 3 統一格式（notion + highlights + metadata）
  'highlights_', // 舊格式標注（過渡期：尚未被讀時升級的數據）
  'saved_', // 舊格式保存狀態（過渡期）
  'url_alias:', // URL 正規化映射
];

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

// ─── 數據分析 ──────────────────────────────────────────────────────────

/**
 * 分析 storage 數據，生成完整的統計報告
 *
 * @param {object} data storage 完整快照
 * @returns {object} 統計報告
 */
export function analyzeData(data) {
  const report = {
    totalKeys: Object.keys(data).length,
    highlightPages: 0,
    totalHighlights: 0,
    configKeys: 0,
    migrationKeys: 0,
    migrationDataSize: 0,
    legacySavedKeys: 0,
    aliasKeys: 0, // 內部統計用，不在用戶報告中顯示
    corruptedData: [],
  };

  // Pass 1：收集所有 page_* 的 URL（用於避免與 highlights_* 重複計數）
  const pageUrls = new Set();
  for (const key of Object.keys(data)) {
    if (key.startsWith('page_')) {
      pageUrls.add(key.slice(5));
    }
  }

  // Pass 2：完整分析
  for (const [key, value] of Object.entries(data)) {
    _analyzeDataEntry(key, value, report, pageUrls);
  }

  return report;
}

/**
 * 輔助：分析單個數據項並更新報告
 *
 * @param {string} key 鍵名
 * @param {any} value 值
 * @param {object} report 分析報告
 * @param {Set<string>} pageUrls page_ 前綴的 URL 集合
 */
function _analyzeDataEntry(key, value, report, pageUrls) {
  if (key.startsWith('page_')) {
    _analyzePageData(key, value, report);
    return;
  }
  if (key.startsWith('highlights_')) {
    _analyzeHighlightData(key, value, report, pageUrls);
    return;
  }
  if (key.startsWith('saved_')) {
    report.legacySavedKeys++;
    return;
  }
  if (key.startsWith('url_alias:')) {
    report.aliasKeys++;
    return;
  }
  if (key.startsWith('config_') || key.includes('notion')) {
    report.configKeys++;
    return;
  }
  if (key.includes('migration') || key.includes('_v1_') || key.includes('_backup_')) {
    report.migrationKeys++;
    const size = new Blob([JSON.stringify({ [key]: value })]).size;
    report.migrationDataSize += size;
  }
}

/**
 * 輔助：分析 page_* 數據並更新報告
 *
 * @param {string} key 鍵名
 * @param {any} value 值
 * @param {object} report 分析報告
 */
function _analyzePageData(key, value, report) {
  report.highlightPages++;
  const hl = value?.highlights;
  if (Array.isArray(hl)) {
    report.totalHighlights += hl.length;
  }
  // 結構驗證
  if (
    !value ||
    typeof value !== 'object' ||
    (value.highlights !== undefined && !Array.isArray(value.highlights))
  ) {
    report.corruptedData.push(key);
  }
}

/**
 * 輔助：分析 highlights_* 數據並更新報告
 *
 * @param {string} key 鍵名
 * @param {any} value 值
 * @param {object} report 分析報告
 * @param {Set<string>} pageUrls page_ 前綴的 URL 集合
 */
function _analyzeHighlightData(key, value, report, pageUrls) {
  const url = key.slice(11);
  if (!pageUrls.has(url)) {
    report.highlightPages++;
    const hl = Array.isArray(value) ? value : value?.highlights;
    if (Array.isArray(hl)) {
      report.totalHighlights += hl.length;
    }
  }
  // 結構驗證（不論是否重複計數，壞數據都要標記）
  if (!Array.isArray(value) && (!value || !Array.isArray(value.highlights))) {
    report.corruptedData.push(key);
  }
}

// ─── 使用量計算 ────────────────────────────────────────────────────────

/**
 * 從 chrome.storage.local 讀取並計算詳細使用量統計
 *
 * @returns {Promise<object>} 使用量統計結果
 */
export async function getStorageUsage() {
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
  const referenceSize = 100 * 1024 * 1024; // 100MB

  // 先收集 page_* 的 URL，避免與 highlights_* 重複計數
  const pageUrls = new Set();
  for (const key of Object.keys(data)) {
    if (key.startsWith('page_')) {
      pageUrls.add(key.slice(5));
    }
  }

  const counts = { pagesCount: 0, highlightsCount: 0, configCount: 0 };
  for (const [key, value] of Object.entries(data)) {
    _countStorageUsageEntry(key, value, counts, pageUrls);
  }

  const percentage = Math.min((sizeInBytes / referenceSize) * 100, 100).toFixed(1);

  return {
    used: sizeInBytes,
    percentage,
    usedMB: (sizeInBytes / (1024 * 1024)).toFixed(2),
    pages: counts.pagesCount,
    highlights: counts.highlightsCount,
    configs: counts.configCount,
    isUnlimited: true,
  };
}

/**
 * 輔助：計算單個數據項的空間使用量
 *
 * @param {string} key 鍵名
 * @param {any} value 值
 * @param {object} counts 統計物件
 * @param {Set<string>} pageUrls page_ 前綴的 URL 集合
 */
function _countStorageUsageEntry(key, value, counts, pageUrls) {
  if (key.startsWith('page_')) {
    counts.pagesCount++;
    const hl = value?.highlights;
    if (Array.isArray(hl)) {
      counts.highlightsCount += hl.length;
    }
  } else if (key.startsWith('highlights_')) {
    // 舊格式：只在無對應 page_* 時計入（避免重複計數）
    const url = key.slice(11);
    if (!pageUrls.has(url)) {
      counts.pagesCount++;
      if (Array.isArray(value)) {
        counts.highlightsCount += value.length;
      }
    }
  } else if (key.includes('notion') || key.startsWith('config_')) {
    counts.configCount++;
  }
}

// ─── 清理邏輯 ──────────────────────────────────────────────────────────

/**
 * 透過 chrome.runtime API 確認 Notion 頁面是否仍然存在
 *
 * @param {string} pageId Notion Page ID
 * @returns {Promise<boolean>} 頁面是否存在
 */
export async function checkNotionPageExists(pageId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkNotionPageExists',
      pageId,
    });
    return response?.exists === true;
  } catch (error) {
    Logger.error('Batch page check failed', { action: 'batch_check_existence', error });
    return true;
  }
}

/**
 * 分析單個頁面是否符合清理條件（Notion 頁面是否已刪除）
 *
 * @param {object} page 頁面物件 { key, url, data }
 * @param {object} plan 清理計劃（直接修改）
 * @returns {Promise<void>}
 */
export async function analyzePageForCleanup(page, plan) {
  try {
    const exists = await checkNotionPageExists(page.data.notionPageId);

    if (!exists) {
      const { key: savedKey, url } = page;
      const savedSize = new Blob([JSON.stringify({ [savedKey]: page.data })]).size;

      plan.items.push({
        key: savedKey,
        url,
        size: savedSize,
        reason: '無效殘留的保存狀態',
      });

      plan.spaceFreed += savedSize;
      plan.deletedPages++;
    }
  } catch (error) {
    Logger.error('Page existence check failed', {
      action: 'check_page_existence',
      url: page.url,
      error,
    });
  }
}

/**
 * 掃描孤兒 highlights_ key：既無有效標注，也無對應的 saved_ 或 page_* 記錄
 * 這是唯一符合「應刪除」條件的孤兒資料
 *
 * @param {object} data  storage 完整快照
 * @param {object} plan  清理計劃（直接修改）
 */
export function collectOrphanHighlightItems(data, plan) {
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('highlights_')) {
      continue;
    }

    const url = key.replace('highlights_', '');

    // 1. 有效標注 → 保留
    const highlights = Array.isArray(value) ? value : value?.highlights;
    if (Array.isArray(highlights) && highlights.length > 0) {
      continue;
    }

    // 2. 有對應的 page_* 記錄 → 保留（Phase 3 格式已包含此數據）
    if (data[`page_${url}`]) {
      continue;
    }

    // 3. 有對應的 saved_ 記錄 → 保留（用戶只是保存網頁未做標注）
    if (data[`saved_${url}`]) {
      continue;
    }

    // 4. 孤兒 key → 加入清理計畫
    const size = new Blob([JSON.stringify({ [key]: value })]).size;
    plan.items.push({
      key,
      url,
      size,
      reason: '孤兒資料（無標注且未保存到 Notion）',
    });
    plan.spaceFreed += size;
    plan.orphanHighlights += 1;
  }
}

/**
 * 掃描孤兒 url_alias: key：目標 normUrl 已無對應的 page_* / highlights_* / saved_* 記錄
 * alias 孤兒計入 plan.items 和 plan.spaceFreed，但不計入 plan.orphanHighlights，
 * 因為 alias key 是內部實作細節，不在用戶可見的清理摘要中單獨列出。
 *
 * @param {object} data  storage 完整快照
 * @param {object} plan  清理計劃（直接修改）
 */
export function collectOrphanAliasItems(data, plan) {
  for (const [key, normUrl] of Object.entries(data)) {
    if (!key.startsWith(URL_ALIAS_PREFIX)) {
      continue;
    }

    // 防衛：alias value 必須是字串才能安全用於 key 查詢
    if (typeof normUrl !== 'string' || normUrl === '') {
      continue;
    }

    const pageKey = `page_${normUrl}`;
    const highlightsKey = `highlights_${normUrl}`;
    const savedKey = `saved_${normUrl}`;

    // alias value is the normUrl; check if target data still exists
    if (
      Object.hasOwn(data, pageKey) ||
      Object.hasOwn(data, highlightsKey) ||
      Object.hasOwn(data, savedKey)
    ) {
      continue;
    }

    // 孤兒 alias → 加入清理計畫
    const size = new Blob([JSON.stringify({ [key]: normUrl })]).size;
    plan.items.push({
      key,
      url: encodeURIComponent(normUrl),
      size,
      reason: '孤兒 URL 別名（目標頁面已無資料）',
    });
    plan.spaceFreed += size;
  }
}

// ─── 優化邏輯 ──────────────────────────────────────────────────────────

/**
 * 從 chrome.storage.local 讀取數據並生成優化計劃
 *
 * @returns {Promise<object>} 優化計劃
 */
export function generateOptimizationPlan() {
  return new Promise(resolve => {
    chrome.storage.local.get(null, data => {
      const plan = {
        canOptimize: false,
        originalSize: 0,
        optimizedSize: 0,
        spaceSaved: 0,
        optimizations: [],
        highlightPages: 0,
        totalHighlights: 0,
        keysToRemove: [],
        optimizedData: {},
      };

      const originalData = JSON.stringify(data);
      plan.originalSize = new Blob([originalData]).size;

      // 使用輔助函數分析數據結構
      _analyzeStructureForOptimization(data, plan);

      if (plan.highlightPages > 0 || plan.keysToRemove.length > 0) {
        const optimizedJson = JSON.stringify(plan.optimizedData);
        plan.optimizedSize = new Blob([optimizedJson]).size;
        plan.spaceSaved = plan.originalSize - plan.optimizedSize;
      }

      resolve(plan);
    });
  });
}

/**
 * 輔助：分析存儲數據結構並填充優化計劃
 *
 * @param {object} data 存儲數據
 * @param {object} plan 優化計劃
 */
function _analyzeStructureForOptimization(data, plan) {
  const stats = {
    migrationDataSize: 0,
    migrationKeysCount: 0,
    emptyHighlightKeys: 0,
    emptyHighlightSize: 0,
  };

  for (const [key, value] of Object.entries(data)) {
    processOptimizationEntry(key, value, plan, stats);
  }

  if (stats.migrationDataSize > 1024) {
    const sizeKB = (stats.migrationDataSize / 1024).toFixed(1);
    plan.optimizations.push(`清理遷移數據（${stats.migrationKeysCount} 項，${sizeKB} KB）`);
    plan.canOptimize = true;
  }

  if (stats.emptyHighlightKeys > 0) {
    const sizeKB = (stats.emptyHighlightSize / 1024).toFixed(1);
    plan.optimizations.push(`移除空標註紀錄（${stats.emptyHighlightKeys} 項，${sizeKB} KB）`);
    plan.canOptimize = true;
  }

  const hasFragmentation = Object.keys(data).some(key => {
    // 舊格式 highlights_* 結構破損
    if (key.startsWith('highlights_') && (!data[key] || !Array.isArray(data[key]))) {
      return true;
    }
    // Phase 3 page_* highlights 欄位結構破損
    if (
      key.startsWith('page_') &&
      data[key]?.highlights !== undefined &&
      !Array.isArray(data[key].highlights)
    ) {
      return true;
    }
    return false;
  });

  if (hasFragmentation) {
    plan.optimizations.push('修復數據碎片');
    plan.canOptimize = true;
  }
}

/**
 * 導出：處理單個數據項的優化分析
 * (測試用導出，內部實作請透過 generateOptimizationPlan 呼叫)
 *
 * @param {string} key 鍵名
 * @param {any} value 值
 * @param {object} plan 計劃
 * @param {object} stats 統計
 */
export function processOptimizationEntry(key, value, plan, stats) {
  if (key.includes('migration') || key.includes('_v1_') || key.includes('_backup_')) {
    stats.migrationKeysCount++;
    const size = new Blob([JSON.stringify({ [key]: value })]).size;
    stats.migrationDataSize += size;
    plan.keysToRemove.push(key);
    return;
  }

  if (key.startsWith('page_')) {
    _processPageOptimization(key, value, plan, stats);
    return;
  }

  if (key.startsWith('highlights_')) {
    _processHighlightOptimization(key, value, plan, stats);
  } else {
    plan.optimizedData[key] = value;
  }
}

/**
 * 輔助：處理 page_* 數據項的優化分析
 *
 * @param {string} key 鍵名
 * @param {any} value 值
 * @param {object} plan 計劃
 * @param {object} stats 統計
 */
function _processPageOptimization(key, value, plan, stats) {
  // Phase 3 統一格式：有標注或有 Notion 綁定 → 保留
  const hl = value?.highlights;
  const hasHighlights = Array.isArray(hl) && hl.length > 0;
  const hasNotion = Boolean(value?.notion?.pageId);

  if (hasHighlights || hasNotion) {
    plan.highlightPages++;
    if (hasHighlights) {
      plan.totalHighlights += hl.length;
    }
    plan.optimizedData[key] = value;
  } else {
    // 空的 page_* key（無標注且無 Notion 綁定）→ 可清理
    stats.emptyHighlightKeys++;
    stats.emptyHighlightSize += new Blob([JSON.stringify({ [key]: value })]).size;
    plan.keysToRemove.push(key);
  }
}

/**
 * 輔助：處理 highlights_* 數據項的優化分析
 *
 * @param {string} key 鍵名
 * @param {any} value 值
 * @param {object} plan 計劃
 * @param {object} stats 統計
 */
function _processHighlightOptimization(key, value, plan, stats) {
  const highlightsArray = Array.isArray(value) ? value : value?.highlights;
  if (Array.isArray(highlightsArray) && highlightsArray.length > 0) {
    plan.highlightPages++;
    plan.totalHighlights += highlightsArray.length;
    plan.optimizedData[key] = value;
  } else {
    stats.emptyHighlightKeys++;
    stats.emptyHighlightSize += new Blob([JSON.stringify({ [key]: value })]).size;
    plan.keysToRemove.push(key);
  }
}
