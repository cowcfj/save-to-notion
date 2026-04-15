/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = process.cwd();
const targetPath = path.join(projectRoot, 'scripts', 'config', 'env.js');
const templatePath = path.join(projectRoot, 'scripts', 'config', 'env.example.js');
const requiredBuildEnvExport = 'export const BUILD_ENV';

function failPostinstall(message, error) {
  const finalMessage = error ? `${message}\n${error.stack || error}` : message;
  throw new Error(finalMessage);
}

function assertBuildEnvExport(filePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const source = fs.readFileSync(filePath, 'utf8');
  if (!source.includes(requiredBuildEnvExport)) {
    failPostinstall(
      'scripts/config/env.js 缺少必要的 BUILD_ENV 匯出（export const BUILD_ENV），安裝已中止。'
    );
  }
}

if (fs.existsSync(targetPath)) {
  assertBuildEnvExport(targetPath);
  // 提醒開發者 OAuth 設定為空
  const content = fs.readFileSync(targetPath, 'utf8');
  if (content.includes("OAUTH_CLIENT_ID: ''") || content.includes('OAUTH_CLIENT_ID: ""')) {
    console.warn(
      '\u001B[33m⚠️  scripts/config/env.js 中 OAUTH_CLIENT_ID 尚未設定。' +
        '若需測試 OAuth，請參考 README.md 填入你的 Notion Client ID。\u001B[0m'
    );
  }
} else if (fs.existsSync(templatePath)) {
  try {
    fs.copyFileSync(templatePath, targetPath);
    assertBuildEnvExport(targetPath);
    console.info('已從 env.example.js 建立 scripts/config/env.js');
  } catch (error) {
    failPostinstall('建立 scripts/config/env.js 失敗，無法確認 BUILD_ENV 設定：', error);
  }
} else {
  failPostinstall(
    '找不到 env.example.js，無法建立 scripts/config/env.js 與 BUILD_ENV 設定，安裝已中止。'
  );
}
