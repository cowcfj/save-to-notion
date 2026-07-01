/**
 * @jest-environment node
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

describe('scripts/postinstall.js', () => {
  const repoRoot = process.cwd();
  const postinstallScript = path.join(repoRoot, 'scripts/postinstall.js');
  const postinstallTestTimeoutMs = 5000;

  let tempRoot;

  function ensureTempEnvDir() {
    const envDir = path.join(tempRoot, 'scripts/config/env');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-owned temp workspace path.
    fs.mkdirSync(envDir, { recursive: true });
    return envDir;
  }

  function readTempBuildFile() {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-owned temp workspace path.
    return fs.readFileSync(path.join(tempRoot, 'scripts/config/env/build.js'), 'utf8');
  }

  function tempBuildFileExists() {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-owned temp workspace path.
    return fs.existsSync(path.join(tempRoot, 'scripts/config/env/build.js'));
  }

  function writeBuildExample(content = 'export const BUILD_ENV = Object.freeze({});\n') {
    const envDir = ensureTempEnvDir();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-owned temp workspace path.
    fs.writeFileSync(path.join(envDir, 'build.example.js'), content);
  }

  function writeBuild(content) {
    const envDir = ensureTempEnvDir();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-owned temp workspace path.
    fs.writeFileSync(path.join(envDir, 'build.js'), content);
  }

  function runPostinstall({ spawnSyncImpl = spawnSync } = {}) {
    return spawnSyncImpl(process.execPath, [postinstallScript], {
      cwd: tempRoot,
      encoding: 'utf8',
      timeout: postinstallTestTimeoutMs,
    });
  }

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notion-postinstall-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('runPostinstall 應設定 timeout，避免 postinstall 子程序卡住時阻塞 Jest worker', () => {
    const timeoutResult = {
      error: Object.assign(new Error('spawnSync timed out'), { code: 'ETIMEDOUT' }),
      signal: 'SIGTERM',
      status: null,
      stderr: '',
      stdout: '',
    };
    const spawnSyncImpl = jest.fn(() => timeoutResult);

    const result = runPostinstall({ spawnSyncImpl });

    expect(spawnSyncImpl).toHaveBeenCalledWith(process.execPath, [postinstallScript], {
      cwd: tempRoot,
      encoding: 'utf8',
      timeout: postinstallTestTimeoutMs,
    });
    expect(result).toBe(timeoutResult);
  });

  test('當 build.js 不存在且 template 存在時應從 template 複製並輸出成功訊息', () => {
    const templateContent = `export const BUILD_ENV = Object.freeze({
  OAUTH_CLIENT_ID: 'configured-client-id',
});
`;
    writeBuildExample(templateContent);

    const result = runPostinstall();

    expect(result.status).toBe(0);
    expect(readTempBuildFile()).toBe(templateContent);
    expect(result.stdout).toContain(
      '已從 scripts/config/env/build.example.js 建立 scripts/config/env/build.js'
    );
    expect(result.stderr).toBe('');
  });

  test('當 build.js 已存在時應驗證 BUILD_ENV 匯出而不複製', () => {
    const envContent = `export const BUILD_ENV = Object.freeze({
  OAUTH_CLIENT_ID: 'configured-client-id',
});
`;
    const templateContent = `export const BUILD_ENV = Object.freeze({
  OAUTH_CLIENT_ID: 'template-client-id',
});
`;
    writeBuild(envContent);
    writeBuildExample(templateContent);

    const result = runPostinstall();

    expect(result.status).toBe(0);
    expect(readTempBuildFile()).toBe(envContent);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  test('當 build.js 的 OAUTH_CLIENT_ID 為空且格式與範本不同時仍應輸出警告', () => {
    writeBuild(`export const BUILD_ENV = Object.freeze({
  OAUTH_CLIENT_ID:'',
});
`);

    const result = runPostinstall();

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('scripts/config/env/build.js 中 OAUTH_CLIENT_ID 尚未設定');
  });

  test('當 build.js 缺少 OAUTH_CLIENT_ID key 時仍應輸出警告', () => {
    writeBuild(`export const BUILD_ENV = Object.freeze({
  ENABLE_OAUTH: false,
});
`);

    const result = runPostinstall();

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('scripts/config/env/build.js 中 OAUTH_CLIENT_ID 尚未設定');
  });

  test('當 template 不存在時應拋出錯誤中止安裝', () => {
    ensureTempEnvDir();

    const result = runPostinstall();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('找不到 scripts/config/env/build.example.js');
    expect(tempBuildFileExists()).toBe(false);
  });

  test('當複製後 build.js 缺少 BUILD_ENV 匯出時應拋出錯誤中止安裝', () => {
    writeBuildExample('export const OTHER_ENV = Object.freeze({});\n');

    const result = runPostinstall();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('scripts/config/env/build.js 缺少必要的 BUILD_ENV 匯出');
  });
});
