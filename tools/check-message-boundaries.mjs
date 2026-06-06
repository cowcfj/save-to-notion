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

// 印出單一 bundle 的邊界檢查結果（PASS 或 FAIL 明細）
function reportBoundaryResult(relativePath, failures) {
  if (failures.length === 0) {
    console.log(`[PASS] ${relativePath} 邊界檢查通過。`);
    return;
  }
  console.error(`[FAIL] ${relativePath} 包含了禁用的 sentinel(s):`);
  failures.forEach((fail) => console.error(`  - "${fail}"`));
}

// 處理缺少 bundle 的情況：requireAll 模式視為失敗，否則 [WARN] 跳過
function reportMissingBundle(relativePath, requireAll) {
  if (requireAll) {
    console.error(`[FAIL] 缺少預期的 bundle，無法檢查邊界: ${relativePath}`);
    return false;
  }
  console.warn(`[WARN] 找不到檔案: ${relativePath}，跳過。`);
  return true;
}

// 檢查單一 bundle 是否守住訊息邊界；通過（或非 requireAll 模式下檔案不存在而跳過）回傳 true
function checkSingleBoundary(rootDir, relativePath, forbidden, requireAll) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    return reportMissingBundle(relativePath, requireAll);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const failures = forbidden.filter((sentinel) => content.includes(sentinel));
  reportBoundaryResult(relativePath, failures);
  return failures.length === 0;
}

// requireAll: 缺少任一預期 bundle 即視為失敗（CI 用，防止未 build 時 gate 空轉通過）
export function checkBoundaries(rootDir, { requireAll = false } = {}) {
  console.log('開始進行 Bundle 訊息邊界檢查 (check-message-boundaries)...');

  const results = Object.entries(BOUNDARY_RULES).map(([relativePath, rule]) =>
    checkSingleBoundary(rootDir, relativePath, rule.forbidden, requireAll),
  );

  return results.every(Boolean);
}

// 支援直接執行模式
if (process.argv[1] === __filename) {
  const args = process.argv.slice(2);
  const requireAll = args.includes('--require-all');
  const positionalRoot = args.find((arg) => !arg.startsWith('--'));
  const customRoot = positionalRoot ? path.resolve(process.cwd(), positionalRoot) : projectRoot;
  const success = checkBoundaries(customRoot, { requireAll });
  if (!success) {
    console.error('❌ Bundle 訊息邊界檢查失敗！');
    process.exit(1);
  } else {
    console.log('✅ Bundle 訊息邊界檢查成功！');
  }
}
