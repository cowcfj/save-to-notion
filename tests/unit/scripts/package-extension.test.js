/**
 * @jest-environment node
 */

const fs = require('node:fs');
const path = require('node:path');

describe('tools/package-extension.sh regressions', () => {
  let packageScript;
  let sidepanelEntry;

  beforeAll(() => {
    packageScript = fs.readFileSync(
      path.resolve(__dirname, '../../../tools/package-extension.sh'),
      'utf8'
    );
    sidepanelEntry = fs.readFileSync(
      path.resolve(__dirname, '../../../sidepanel/sidepanel.js'),
      'utf8'
    );
  });

  test('sidepanel 直接依賴的 HighlightLookupResolver 不應在 release package 中遺失', () => {
    expect(sidepanelEntry).toContain('../scripts/highlighter/core/HighlightLookupResolver.js');

    const excludesWholeHighlighterDir = packageScript.includes("--exclude='highlighter'");
    const copiesResolverExplicitly = packageScript.includes(
      'scripts/highlighter/core/HighlightLookupResolver.js'
    );

    expect(excludesWholeHighlighterDir && !copiesResolverExplicitly).toBe(false);
  });

  test('release package 的 ES module 驗證應覆蓋 auth.html callback bridge', () => {
    const verificationBlock = packageScript.slice(packageScript.indexOf('const htmlDirs = ['));

    expect(verificationBlock).toContain('auth.html');
  });

  test('打包流程應排除並清理所有 .DS_Store', () => {
    expect(packageScript).toContain("--exclude='.DS_Store'");
    expect(packageScript).toContain('find "$RM_DIR" -name \'.DS_Store\'');
  });

  test('每次打包前應先移除既有 zip，避免舊檔案殘留在 archive 內', () => {
    expect(packageScript).toContain('rm -f "releases/$ZIP_NAME"');
  });

  test('應支援輸出本地最小 unpacked 目錄並可選擇跳過 zip', () => {
    expect(packageScript).toContain('--unpacked-dir');
    expect(packageScript).toContain('--skip-zip');
    expect(packageScript).toContain('cp -a "$RM_DIR" "$UNPACKED_DIR"');
  });

  test('release package 不應攜帶殘留 sourcemap', () => {
    expect(packageScript).toContain('find "$RM_DIR/dist" -name \'*.map\' -delete');
  });
});
