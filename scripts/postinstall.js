/* eslint-disable no-console */

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const targetPath = path.join(projectRoot, 'scripts', 'config', 'env', 'build.js');
const templatePath = path.join(projectRoot, 'scripts', 'config', 'env', 'build.example.js');
const requiredBuildEnvironmentExport = 'export const BUILD_ENV';

function failPostinstall(message, error) {
  const finalMessage = error ? `${message}\n${error.stack || error}` : message;
  throw new Error(finalMessage);
}

function assertBuildEnvironmentExport(filePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const source = fs.readFileSync(filePath, 'utf8');
  if (!source.includes(requiredBuildEnvironmentExport)) {
    failPostinstall(
      'scripts/config/env/build.js 缺少必要的 BUILD_ENV 匯出（export const BUILD_ENV），安裝已中止。'
    );
  }
}

function getBuildEnvironmentPropertyValue(source, propertyName) {
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith(propertyName)) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (key !== propertyName) {
      continue;
    }

    return line
      .slice(separatorIndex + 1)
      .replace(/,$/, '')
      .trim();
  }

  return null;
}

if (fs.existsSync(targetPath)) {
  assertBuildEnvironmentExport(targetPath);
  // 提醒開發者 OAuth 設定為空
  const content = fs.readFileSync(targetPath, 'utf8');
  const oauthClientIdValue = getBuildEnvironmentPropertyValue(content, 'OAUTH_CLIENT_ID');
  if ([null, "''", '""'].includes(oauthClientIdValue)) {
    console.warn(
      '\u{1B}[33m⚠️  scripts/config/env/build.js 中 OAUTH_CLIENT_ID 尚未設定。' +
        '若需測試 OAuth，請參考 README.md 填入你的 Notion Client ID。\u{1B}[0m'
    );
  }
} else if (fs.existsSync(templatePath)) {
  try {
    fs.copyFileSync(templatePath, targetPath);
    assertBuildEnvironmentExport(targetPath);
    console.info('已從 scripts/config/env/build.example.js 建立 scripts/config/env/build.js');
  } catch (error) {
    failPostinstall('建立 scripts/config/env/build.js 失敗，無法確認 BUILD_ENV 設定：', error);
  }
} else {
  failPostinstall(
    '找不到 scripts/config/env/build.example.js，無法建立 scripts/config/env/build.js 與 BUILD_ENV 設定，安裝已中止。'
  );
}
