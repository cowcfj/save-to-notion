/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testFilePath = fileURLToPath(import.meta.url);
const testDir = path.dirname(testFilePath);
const rootDir = path.resolve(testDir, '../../../..');

describe('tools/package-extension.sh regressions', () => {
  let packageScript;
  let popupHtml;
  let sidepanelHtml;
  let canonicalAuthHtmlExists;
  let canonicalAuthHtmlPath;

  beforeAll(() => {
    packageScript = fs.readFileSync(path.join(rootDir, 'tools/package-extension.sh'), 'utf8');
    popupHtml = fs.readFileSync(path.join(rootDir, 'pages/popup/popup.html'), 'utf8');
    sidepanelHtml = fs.readFileSync(path.join(rootDir, 'pages/sidepanel/sidepanel.html'), 'utf8');
    canonicalAuthHtmlPath = path.relative(rootDir, path.join(rootDir, 'pages/auth/auth.html'));
    canonicalAuthHtmlExists = fs.existsSync(path.join(rootDir, canonicalAuthHtmlPath));
  });

  test('release package 應打包 dist bundle 而非 scripts 原始碼', () => {
    expect(packageScript).toContain('cp -a dist "$RM_DIR/"');
    expect(packageScript).not.toContain('cp -a scripts "$RM_DIR/"');
    expect(packageScript).not.toContain('rsync');
  });

  test('page HTML 應載入 dist/pages bundle entry', () => {
    const moduleScript = src =>
      new RegExp(
        String.raw`<script\b(?=[^>]*\bsrc="${src}")(?=[^>]*\btype="module")[^>]*></script>`
      );

    expect(popupHtml).toMatch(moduleScript('../../dist/pages/popup.js'));
    expect(sidepanelHtml).toMatch(moduleScript('../../dist/pages/sidepanel.js'));
  });

  test('release package 的 ES module 驗證應覆蓋 canonical auth callback page', () => {
    const verificationBlock = packageScript.slice(packageScript.indexOf('const htmlDirs = fs'));

    expect(verificationBlock).toContain("path.join(pkgDir, 'pages')");
    expect(verificationBlock).toContain("path.join('pages', entry.name)");
    expect(verificationBlock).toContain('path.join(dirPath, file)');
    expect(packageScript).not.toContain('cp -a auth.html');
    expect(verificationBlock).not.toContain("['auth.html']");
    expect(packageScript).toContain("find \"$RM_DIR/dist/pages\" -name 'auth-redirect.js' -delete");
    expect(canonicalAuthHtmlPath).toBe('pages/auth/auth.html');
    expect(canonicalAuthHtmlExists).toBe(true);
  });

  test('打包流程應清理所有 .DS_Store', () => {
    expect(packageScript).toContain('find "$RM_DIR" -name \'.DS_Store\'');
  });

  test('每次打包前應先移除既有 zip，避免舊檔案殘留在 archive 內', () => {
    expect(packageScript).toContain('rm -f "releases/$ZIP_NAME"');
  });

  test('應支援輸出本地最小 unpacked 目錄並可選擇跳過 zip', () => {
    expect(packageScript).toContain('--unpacked-dir');
    expect(packageScript).toContain('--skip-zip');
    expect(packageScript).toContain('--manifest-key-file');
    expect(packageScript).toContain('cp -a "$RM_DIR" "$UNPACKED_DIR"');
  });

  test('release package 不應攜帶殘留 sourcemap', () => {
    expect(packageScript).toContain('find "$RM_DIR/dist" -name \'*.map\' -delete');
  });
});
