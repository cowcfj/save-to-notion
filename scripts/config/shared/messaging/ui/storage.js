export const STORAGE = {
  BACKUP_START: '正在備份數據...',
  BACKUP_SUCCESS: '數據備份成功！備份文件已下載。',
  BACKUP_FAILED: '備份失敗：',
  IMPORT_START: '正在匯入數據...',
  IMPORT_FAILED: '匯入失敗：',
  INVALID_BACKUP_FORMAT: '無效的備份文件格式',

  IMPORT_SELECT_MODE: '請選擇匯入模式：',
  IMPORT_MODE_HINT:
    '「新增 + 覆蓋衝突」會合併備份，並以備份資料覆蓋衝突項；「僅匯入新資料」最安全，不會改動任何現有標註；「全部覆蓋」會清除所有現有資料。',
  IMPORT_MODE_OVERWRITE_ALL: '全部覆蓋',
  IMPORT_MODE_NEW_ONLY: '僅匯入新資料',
  IMPORT_MODE_NEW_AND_OVERWRITE: '新增 + 覆蓋衝突',
  IMPORT_CANCEL: '取消',
  IMPORT_CANCELED: '已取消匯入。',
  IMPORT_SUCCESS: (newCount, overwriteCount, skipCount) =>
    `匯入完成！新增 ${newCount} 項、覆蓋 ${overwriteCount} 項、跳過 ${skipCount} 項相同資料。正在重新整理...`,
  IMPORT_NOTHING_TO_DO: '備份與本地資料一致，無需匯入。',
  IMPORT_NEW_ONLY_ALL_CONFLICTS: skipCount =>
    `僅新增模式下無新項可匯入，已跳過 ${skipCount} 項衝突。`,

  CLEANUP_EXECUTING: '正在執行數據優化...',
  UNIFIED_CLEANUP_SUCCESS: (keys, size) =>
    `數據優化完成！已清理 ${keys} 個項目，釋放 ${size} KB 空間`,
  CLEANUP_SUMMARY: (parts, spaceKB) => `可清理：${parts.join('、')}，預計釋放 ${spaceKB} KB`,
  NO_CLEANUP_NEEDED: '無可清理項目',
  CLEANUP_FAILED: errorMsg => `清理失敗：${errorMsg}`,

  HEALTH_CORRUPTED: count => `發現 ${count} 個損壞的數據項`,
  HEALTH_MIGRATION_LEFTOVERS: (count, size) => `${count} 個舊版格式升級殘留（${size} KB）`,
  HEALTH_LEGACY_SAVED: count => `${count} 個舊版網頁保存紀錄（重訪相關網頁時會自動升級）`,
  HEALTH_OK: '數據完整',

  USAGE_TOO_LARGE: size => `數據量過大 (${size} MB)，可能影響擴展性能，建議立即清理`,
  USAGE_LARGE: size => `數據量較大 (${size} MB)，建議清理不需要的標記數據以維持最佳性能`,
};
