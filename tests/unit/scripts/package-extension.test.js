/**
 * @jest-environment node
 */

const fs = require('node:fs');
const path = require('node:path');

describe('tools/package-extension.sh regressions', () => {
  let packageScript;
  let popupHtml;
  let sidepanelHtml;

  beforeAll(() => {
    packageScript = fs.readFileSync(
      path.resolve(__dirname, '../../../tools/package-extension.sh'),
      'utf8'
    );
    popupHtml = fs.readFileSync(path.resolve(__dirname, '../../../pages/popup/popup.html'), 'utf8');
    sidepanelHtml = fs.readFileSync(
      path.resolve(__dirname, '../../../pages/sidepanel/sidepanel.html'),
      'utf8'
    );
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

  test('release package 的 ES module 驗證應覆蓋 auth.html callback bridge', () => {
    const verificationBlock = packageScript.slice(packageScript.indexOf('const htmlDirs = fs'));

    expect(verificationBlock).toContain('auth.html');
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
