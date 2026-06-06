/**
 * @jest-environment node
 */
/* eslint-disable sonarjs/no-os-command-from-path */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

describe('tools/check-message-boundaries.mjs', () => {
  const scriptPath = path.resolve(__dirname, '../../../tools/check-message-boundaries.mjs');
  let tempRoot;

  const writeFakeBundle = (relativePath, content) => {
    const filePath = path.join(tempRoot, relativePath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(filePath, content, 'utf8');
  };

  const runCli = (args = []) => {
    const result = spawnSync('node', [scriptPath, tempRoot, ...args], {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
    });
    const combinedOutput = result.stdout + result.stderr;
    if (result.status !== 0) {
      const err = new Error(`CLI exited with code ${result.status}`);
      err.stdout = result.stdout;
      err.stderr = result.stderr;
      err.combined = combinedOutput;
      throw err;
    }
    return combinedOutput;
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-boundaries-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('當假 bundle 產物不含任何禁用 sentinel 時，應通過檢查並回傳成功', () => {
    // 寫入不含禁用 sentinel 的乾淨檔案
    writeFakeBundle('dist/content.bundle.js', 'console.log("Hello Content");');
    writeFakeBundle('dist/scripts/background.js', 'console.log("Hello Background");');
    writeFakeBundle('dist/migration-executor.js', 'console.log("Hello Migration");');
    writeFakeBundle('dist/preloader.js', 'console.log("Hello Preloader");');

    const output = runCli();
    expect(output).toContain('Bundle 訊息邊界檢查成功');
    expect(output).toContain('dist/content.bundle.js 邊界檢查通過');
    expect(output).toContain('dist/scripts/background.js 邊界檢查通過');
  });

  test('當假 content.bundle.js 含有禁用 sentinel「雲端備份：」時，應失敗並回傳 1', () => {
    writeFakeBundle('dist/content.bundle.js', 'const x = "雲端備份：";');
    writeFakeBundle('dist/scripts/background.js', 'console.log("Hello Background");');

    let thrownError;
    try {
      runCli();
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeDefined();
    const fullOutput = `${thrownError.stdout}${thrownError.stderr}`;
    expect(fullOutput).toContain('dist/content.bundle.js 包含了禁用的 sentinel(s)');
    expect(fullOutput).toContain('雲端備份：');
    expect(fullOutput).toContain('Bundle 訊息邊界檢查失敗');
  });

  test('當假 background.js 含有禁用 sentinel「Save to Notion 工具列」時，應失敗並回傳 1', () => {
    writeFakeBundle('dist/content.bundle.js', 'console.log("Hello Content");');
    writeFakeBundle('dist/scripts/background.js', 'const tool = "Save to Notion 工具列";');

    let thrownError;
    try {
      runCli();
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeDefined();
    const fullOutput = `${thrownError.stdout}${thrownError.stderr}`;
    expect(fullOutput).toContain('dist/scripts/background.js 包含了禁用的 sentinel(s)');
    expect(fullOutput).toContain('Save to Notion 工具列');
    expect(fullOutput).toContain('Bundle 訊息邊界檢查失敗');
  });

  test('應允許 content.bundle.js 含有允許的 highlighter copy（例如「Save to Notion 工具列」與「標註已刪除」）', () => {
    // 依據 boundary-rules，content.bundle.js 並沒有將「Save to Notion 工具列」與「標註已刪除」加入 forbidden 名單中
    writeFakeBundle(
      'dist/content.bundle.js',
      'const x = "Save to Notion 工具列"; const y = "標註已刪除";'
    );
    writeFakeBundle('dist/scripts/background.js', 'console.log("Hello Background");');

    const output = runCli();
    expect(output).toContain('Bundle 訊息邊界檢查成功');
    expect(output).toContain('dist/content.bundle.js 邊界檢查通過');
  });

  test('當遇到缺失檔案時，應印出 [WARN] 並跳過而不導致整體失敗', () => {
    // 僅寫入 content，而缺失 background.js, migration-executor.js 等
    writeFakeBundle('dist/content.bundle.js', 'console.log("Hello Content");');

    const output = runCli();
    expect(output).toContain('Bundle 訊息邊界檢查成功');
    expect(output).toContain('[WARN] 找不到檔案: dist/scripts/background.js，跳過');
    expect(output).toContain('dist/content.bundle.js 邊界檢查通過');
  });

  test('當啟用 --require-all 且缺少預期 bundle 時，應失敗並回傳 1', () => {
    // 僅寫入 content，其餘 3 個預期 bundle 缺失；--require-all 下缺檔即視為失敗
    writeFakeBundle('dist/content.bundle.js', 'console.log("Hello Content");');

    let thrownError;
    try {
      runCli(['--require-all']);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeDefined();
    const fullOutput = `${thrownError.stdout}${thrownError.stderr}`;
    expect(fullOutput).toContain('缺少預期的 bundle');
    expect(fullOutput).toContain('dist/scripts/background.js');
    expect(fullOutput).toContain('Bundle 訊息邊界檢查失敗');
  });

  test('當啟用 --require-all 且所有預期 bundle 齊全且乾淨時，應通過檢查', () => {
    writeFakeBundle('dist/content.bundle.js', 'console.log("Hello Content");');
    writeFakeBundle('dist/scripts/background.js', 'console.log("Hello Background");');
    writeFakeBundle('dist/migration-executor.js', 'console.log("Hello Migration");');
    writeFakeBundle('dist/preloader.js', 'console.log("Hello Preloader");');

    const output = runCli(['--require-all']);
    expect(output).toContain('Bundle 訊息邊界檢查成功');
  });
});
