/**
 * @jest-environment node
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testFilePath = fileURLToPath(import.meta.url);
const testDir = path.dirname(testFilePath);

describe('tools/check-size-gates.mjs', () => {
  const scriptPath = path.resolve(testDir, '../../../../tools/check-size-gates.mjs');
  const DEFAULT_BUNDLE_SIZE = 1024;
  const DEFAULT_UNPACKED_SIZE = 2048;
  let tempRoot;

  const writeSizedFile = (filePath, size) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.alloc(size, 65));
  };

  const createZipFromDir = (sourceDir, zipPath) => {
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    execFileSync('zip', ['-rq', zipPath, '.'], { cwd: sourceDir });
  };

  const runCli = args =>
    execFileSync('node', [scriptPath, ...args], {
      cwd: path.resolve(testDir, '../../../..'),
      encoding: 'utf8',
      stdio: 'pipe',
    });

  const readSizeGateScript = () => fs.readFileSync(scriptPath, 'utf8');

  const createBundleRoot = ({
    rootDir,
    contentSize = DEFAULT_BUNDLE_SIZE,
    backgroundSize = DEFAULT_BUNDLE_SIZE,
    migrationSize = DEFAULT_BUNDLE_SIZE,
    preloaderSize = DEFAULT_BUNDLE_SIZE,
    unpackedSize = DEFAULT_UNPACKED_SIZE,
  }) => {
    writeSizedFile(path.join(rootDir, 'dist/content.bundle.js'), contentSize);
    writeSizedFile(path.join(rootDir, 'dist/scripts/background.js'), backgroundSize);
    writeSizedFile(path.join(rootDir, 'dist/migration-executor.js'), migrationSize);
    writeSizedFile(path.join(rootDir, 'dist/preloader.js'), preloaderSize);

    const unpackedDir = path.join(rootDir, '.tmp/extension-unpacked');
    writeSizedFile(path.join(unpackedDir, 'manifest.json'), 512);
    writeSizedFile(path.join(unpackedDir, 'payload.bin'), unpackedSize);

    const zipSourceDir = path.join(rootDir, '.tmp/zip-source');
    writeSizedFile(path.join(zipSourceDir, 'manifest.json'), 256);
    writeSizedFile(path.join(zipSourceDir, 'payload.bin'), unpackedSize);
    createZipFromDir(zipSourceDir, path.join(rootDir, 'releases/notion-smart-clipper-test.zip'));

    return {
      unpackedDir,
      reportPath: path.join(rootDir, '.tmp/size-report.json'),
    };
  };

  const runHardBundleReport = ({
    rootDir,
    contentSize = DEFAULT_BUNDLE_SIZE,
    backgroundSize = DEFAULT_BUNDLE_SIZE,
    migrationSize = DEFAULT_BUNDLE_SIZE,
    preloaderSize = DEFAULT_BUNDLE_SIZE,
    unpackedSize = DEFAULT_UNPACKED_SIZE,
  }) => {
    const { unpackedDir, reportPath } = createBundleRoot({
      rootDir,
      contentSize,
      backgroundSize,
      migrationSize,
      preloaderSize,
      unpackedSize,
    });

    runCli([
      '--mode=hard',
      '--scope=bundle',
      `--root=${rootDir}`,
      `--unpacked-dir=${unpackedDir}`,
      `--report-file=${reportPath}`,
    ]);
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  };

  const runHardBundleCheck = ({ sizes = {}, checkKey }) => {
    const report = runHardBundleReport({
      rootDir: path.join(tempRoot, 'current'),
      ...sizes,
    });
    const check = report.checks.find(check => check.key === checkKey);

    return { report, check };
  };

  const runHardBundleFailureOutput = ({ sizes }) => {
    const rootDir = path.join(tempRoot, 'current');
    const { unpackedDir } = createBundleRoot({
      rootDir,
      ...sizes,
    });

    try {
      runCli([
        '--mode=hard',
        '--scope=bundle',
        `--root=${rootDir}`,
        `--unpacked-dir=${unpackedDir}`,
      ]);
    } catch (error) {
      return `${error.stdout}${error.stderr}`;
    }

    throw new Error('Expected hard bundle check to fail');
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'size-gates-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('[SECURITY] unzip command 不應透過 PATH lookup 解析', () => {
    const scriptSource = readSizeGateScript();

    expect(scriptSource).not.toMatch(/execFileSync\(\s*['"]unzip['"]/);
  });

  test('[SECURITY] unzip executable 應限制在固定 absolute allowlist', () => {
    const scriptSource = readSizeGateScript();

    expect(scriptSource).toContain(
      "const SYSTEM_UNZIP_CANDIDATES = Object.freeze(['/usr/bin/unzip', '/bin/unzip']);"
    );
    expect(scriptSource).toMatch(/const SYSTEM_UNZIP_PATH = resolveSystemUnzipPath\(\);/);
    expect(scriptSource).not.toMatch(/process\.env\.[A-Z_]*UNZIP|which|command -v/);
  });

  test('hard mode 應在所有目標低於門檻時通過並輸出報告', () => {
    const rootDir = path.join(tempRoot, 'current');
    const { unpackedDir, reportPath } = createBundleRoot({
      rootDir,
      contentSize: 1024,
      backgroundSize: 2048,
      migrationSize: 4096,
      unpackedSize: 8192,
    });

    runCli([
      '--mode=hard',
      '--scope=all',
      `--root=${rootDir}`,
      `--unpacked-dir=${unpackedDir}`,
      `--report-file=${reportPath}`,
    ]);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(report.mode).toBe('hard');
    expect(report.scope).toBe('all');
    expect(report.failed).toBe(false);
    expect(report.checks.every(check => check.status === 'pass')).toBe(true);
  });

  test.each([
    {
      name: 'content bundle',
      sizes: {
        contentSize: 300_001,
      },
      targetPattern: /content\.bundle\.js/,
      messagePattern: /content\.bundle\.js 超過硬性上限/,
    },
    {
      name: 'preloader bundle',
      sizes: {
        preloaderSize: 8193,
      },
      targetPattern: /preloader\.js/,
      messagePattern: /preloader\.js 超過硬性上限/,
    },
  ])('hard mode 應在 $name 超過 hard cap 時失敗', ({ sizes, targetPattern, messagePattern }) => {
    const failureOutput = runHardBundleFailureOutput({ sizes });

    expect(failureOutput).toMatch(targetPattern);
    expect(failureOutput).toMatch(messagePattern);
  });

  const contentBundleHardPassCases = [
    ['pre-DOMPurify CI 回歸值', 257_170],
    ['DOMPurify sanitizer baseline', 283_783],
    ['Floating Rail complexity refactor baseline', 287_438],
    ['Floating Rail CSS decomposition baseline (2026-06-05)', 290_041],
    ['Entry auto-init complexity refactor baseline (2026-06-05)', 292_643],
    ['HighlightManager complexity refactor current baseline (2026-06-06)', 294_600],
    ['Migration tree-shaking remediation current baseline (2026-06-06)', 296_616],
    ['接近 hard cap', 299_500],
    ['正好等於 hard cap', 300_000],
  ].map(([label, contentSize]) => ({
    name: `content bundle ${label} (${contentSize} bytes)`,
    sizes: { contentSize },
    checkKey: 'content_bundle',
    expected: {
      current: contentSize,
      hardLimit: 300_000,
    },
  }));

  test.each([
    ...contentBundleHardPassCases,
    {
      name: 'background bundle complexity hardening baseline (2026-07-09)',
      sizes: { backgroundSize: 246_787 },
      checkKey: 'background_bundle',
      expected: {
        current: 246_787,
        hardLimit: 250_000,
      },
    },
    {
      name: 'preloader bundle 正好等於 hard cap',
      sizes: { preloaderSize: 8192 },
      checkKey: 'preloader_bundle',
      expected: {
        current: 8192,
        hardLimit: 8192,
      },
    },
  ])('[REGRESSION] hard mode 應允許 $name 通過', ({ sizes, checkKey, expected }) => {
    expect.assertions(2);

    const { report, check } = runHardBundleCheck({
      sizes,
      checkKey,
    });

    expect(report.failed).toBe(false);
    expect(check).toEqual(expect.objectContaining({ status: 'pass', ...expected }));
  });

  test('[REGRESSION] bundle report 應涵蓋所有 production bundle targets', () => {
    const report = runHardBundleReport({
      rootDir: path.join(tempRoot, 'current'),
    });

    expect(report.checks.map(check => check.key)).toEqual([
      'content_bundle',
      'background_bundle',
      'migration_bundle',
      'preloader_bundle',
    ]);
  });

  test('delta mode 應在增量超過門檻時失敗', () => {
    const baseRoot = path.join(tempRoot, 'base');
    const currentRoot = path.join(tempRoot, 'current');
    const { unpackedDir: baseUnpackedDir } = createBundleRoot({
      rootDir: baseRoot,
      contentSize: 1000,
      backgroundSize: 1000,
      migrationSize: 1000,
      unpackedSize: 1000,
    });
    const { unpackedDir: currentUnpackedDir } = createBundleRoot({
      rootDir: currentRoot,
      contentSize: 31_001,
      backgroundSize: 1000,
      migrationSize: 1000,
      unpackedSize: 1000,
    });

    let thrownError;
    try {
      runCli([
        '--mode=delta',
        '--scope=bundle',
        `--root=${currentRoot}`,
        `--base-root=${baseRoot}`,
        `--unpacked-dir=${currentUnpackedDir}`,
        `--base-unpacked-dir=${baseUnpackedDir}`,
      ]);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeDefined();
    expect(`${thrownError.stdout}${thrownError.stderr}`).toMatch(
      /content\.bundle\.js 超出差異限制/
    );
  });

  test('[REGRESSION] delta mode 應允許 Floating Rail 已核准的 content bundle 增量', () => {
    const baseRoot = path.join(tempRoot, 'base');
    const currentRoot = path.join(tempRoot, 'current');
    const { unpackedDir: baseUnpackedDir } = createBundleRoot({
      rootDir: baseRoot,
      contentSize: 229_687,
      backgroundSize: 1000,
      migrationSize: 1000,
      unpackedSize: 1000,
    });
    const { unpackedDir: currentUnpackedDir, reportPath } = createBundleRoot({
      rootDir: currentRoot,
      contentSize: 255_986,
      backgroundSize: 1000,
      migrationSize: 1000,
      unpackedSize: 1000,
    });

    runCli([
      '--mode=delta',
      '--scope=bundle',
      `--root=${currentRoot}`,
      `--base-root=${baseRoot}`,
      `--unpacked-dir=${currentUnpackedDir}`,
      `--base-unpacked-dir=${baseUnpackedDir}`,
      `--report-file=${reportPath}`,
    ]);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const contentCheck = report.checks.find(check => check.key === 'content_bundle');

    expect(report.failed).toBe(false);
    expect(contentCheck).toEqual(
      expect.objectContaining({
        status: 'pass',
        current: 255_986,
        base: 229_687,
        delta: 26_299,
        deltaLimit: 30_000,
      })
    );
  });

  test('delta mode 在 base 目標缺失時應標記 skipped 而不是失敗', () => {
    const baseRoot = path.join(tempRoot, 'base');
    const currentRoot = path.join(tempRoot, 'current');
    const { unpackedDir: currentUnpackedDir, reportPath } = createBundleRoot({
      rootDir: currentRoot,
      contentSize: 1000,
      backgroundSize: 1000,
      migrationSize: 1000,
      unpackedSize: 1000,
    });
    fs.mkdirSync(baseRoot, { recursive: true });

    runCli([
      '--mode=delta',
      '--scope=all',
      `--root=${currentRoot}`,
      `--base-root=${baseRoot}`,
      `--unpacked-dir=${currentUnpackedDir}`,
      `--report-file=${reportPath}`,
    ]);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(report.failed).toBe(false);
    expect(report.checks.some(check => check.status === 'skipped')).toBe(true);
  });
});
