import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Sentinel 測試文案定義
const SENTINELS = {
  SAVE_TARGET_LABEL: '保存目標名稱（選填）', // Options / Sidepanel 專屬
  CLOUD_BACKUP_LABEL: '雲端備份：',           // Options / Sidepanel / Cloud 專屬
  NO_HIGHLIGHTS: '此網頁尚無標註',           // Sidepanel 專屬
  HIGHLIGHT_DELETED: '標註已刪除',           // Highlighter / Toast (Content/Popup 專屬)
  TOOLBAR_CONTAINER: 'Save to Notion 工具列', // Floating Rail (Content 專屬)
  MISSING_TICKET: '登入失敗：缺少驗證票據',    // Auth Bridge 專屬
  SAVE_PAGE_LABEL: '儲存頁面',               // Popup 專屬
};

// 每個 bundle 禁用的 sentinel 清單
const BOUNDARY_RULES = {
  'dist/content.bundle.js': {
    forbidden: [
      SENTINELS.SAVE_TARGET_LABEL,
      SENTINELS.CLOUD_BACKUP_LABEL,
      SENTINELS.NO_HIGHLIGHTS,
      SENTINELS.MISSING_TICKET,
    ],
  },
  'dist/scripts/background.js': {
    forbidden: [
      SENTINELS.SAVE_TARGET_LABEL,
      SENTINELS.CLOUD_BACKUP_LABEL,
      SENTINELS.NO_HIGHLIGHTS,
      SENTINELS.HIGHLIGHT_DELETED,
      SENTINELS.TOOLBAR_CONTAINER,
      SENTINELS.MISSING_TICKET,
    ],
  },
  'dist/migration-executor.js': {
    forbidden: [
      SENTINELS.SAVE_TARGET_LABEL,
      SENTINELS.CLOUD_BACKUP_LABEL,
      SENTINELS.NO_HIGHLIGHTS,
      SENTINELS.HIGHLIGHT_DELETED,
      SENTINELS.TOOLBAR_CONTAINER,
      SENTINELS.MISSING_TICKET,
      SENTINELS.SAVE_PAGE_LABEL,
    ],
  },
  'dist/preloader.js': {
    forbidden: [
      SENTINELS.SAVE_TARGET_LABEL,
      SENTINELS.CLOUD_BACKUP_LABEL,
      SENTINELS.NO_HIGHLIGHTS,
      SENTINELS.HIGHLIGHT_DELETED,
      SENTINELS.TOOLBAR_CONTAINER,
      SENTINELS.MISSING_TICKET,
      SENTINELS.SAVE_PAGE_LABEL,
    ],
  },
};

export function checkBoundaries(rootDir) {
  let hasFailed = false;
  console.log('開始進行 Bundle 訊息邊界檢查 (check-message-boundaries)...');

  for (const [relativePath, rule] of Object.entries(BOUNDARY_RULES)) {
    const filePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(filePath)) {
      console.warn(`[WARN] 找不到檔案: ${relativePath}，跳過。`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const failures = [];

    for (const sentinel of rule.forbidden) {
      if (content.includes(sentinel)) {
        failures.push(sentinel);
      }
    }

    if (failures.length > 0) {
      console.error(`[FAIL] ${relativePath} 包含了禁用的 sentinel(s):`);
      for (const fail of failures) {
        console.error(`  - "${fail}"`);
      }
      hasFailed = true;
    } else {
      console.log(`[PASS] ${relativePath} 邊界檢查通過。`);
    }
  }

  return !hasFailed;
}

// 支援直接執行模式
if (process.argv[1] === __filename) {
  const customRoot = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : projectRoot;
  const success = checkBoundaries(customRoot);
  if (!success) {
    console.error('❌ Bundle 訊息邊界檢查失敗！');
    process.exit(1);
  } else {
    console.log('✅ Bundle 訊息邊界檢查成功！');
  }
}
