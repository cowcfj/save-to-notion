const sentinel = (label, value) => Object.freeze({ label, value });

export const SENTINELS = Object.freeze({
  SAVE_TARGET_LABEL: sentinel('Options / Sidepanel save-target label', '保存目標名稱（選填）'),
  SAVE_TARGET_NAME: sentinel('Options / Sidepanel save-target name', '保存目標名稱'),
  CLOUD_BACKUP_LABEL: sentinel('Options / Sidepanel cloud-backup label', '雲端備份：'),
  NO_HIGHLIGHTS: sentinel('Sidepanel empty-highlights copy', '此網頁尚無標註'),
  HIGHLIGHT_DELETED: sentinel('Highlighter / content toast copy', '標註已刪除'),
  TOOLBAR_CONTAINER: sentinel('Floating rail content UI copy', 'Save to Notion 工具列'),
  MISSING_TICKET: sentinel('Auth bridge missing-ticket copy', '登入失敗：缺少驗證票據'),
  SAVE_PAGE_LABEL: sentinel('Popup save-page label', '儲存頁面'),
  DOMPURIFY: sentinel('Content sanitizer dependency', 'DOMPurify'),
  SANITIZE_ARTICLE_HTML: sentinel('Content sanitizer pipeline', 'sanitizeArticleHtml'),
  HTML_SANITIZER: sentinel('Content sanitizer module', 'htmlSanitizer'),
  CONTENT_EXTRACTOR: sentinel('Content extraction pipeline', 'ContentExtractor'),
  READABILITY_ADAPTER: sentinel('Content readability adapter', 'ReadabilityAdapter'),
  PROFILE_MANAGER: sentinel('Options/profile management module', 'ProfileManager'),
  UI_MANAGER: sentinel('Options UI manager module', 'UIManager'),
  DATA_SOURCE_MANAGER: sentinel('Options data source manager module', 'DataSourceManager'),
  MIGRATION_TOOL: sentinel('Options migration tool module', 'MigrationTool'),
  OPTIONS_HTML: sentinel('Options page HTML path', 'pages/options/options.html'),
  OPTIONS_JS: sentinel('Options page script path', 'pages/options/options.js'),
});

export const AUTH_OPTIONS_ONLY_SENTINELS = Object.freeze([
  SENTINELS.SAVE_TARGET_NAME,
  SENTINELS.CLOUD_BACKUP_LABEL,
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesBoundedToken(content, value, boundaryChars) {
  const pattern = new RegExp(`(^|[^${boundaryChars}])${escapeRegExp(value)}(?![${boundaryChars}])`);
  return pattern.test(content);
}

export function matchesSentinel(content, { value }) {
  if (/^[A-Za-z_$][\w$]*$/.test(value)) {
    return matchesBoundedToken(content, value, 'A-Za-z0-9_$');
  }

  if (value.includes('/')) {
    return matchesBoundedToken(content, value, 'A-Za-z0-9_./:-');
  }

  return content.includes(value);
}
