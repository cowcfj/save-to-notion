/**
 * @jest-environment node
 */
/* eslint-disable sonarjs/no-os-command-from-path */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

describe('tools/check-size-gates.mjs', () => {
  const scriptPath = path.resolve(__dirname, '../../../tools/check-size-gates.mjs');
  let tempRoot;

  const writeSizedFile = (filePath, size) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(filePath, Buffer.alloc(size, 65));
  };

  const createZipFromDir = (sourceDir, zipPath) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    execFileSync('zip', ['-rq', zipPath, '.'], { cwd: sourceDir });
  };

  const runCli = args =>
    execFileSync('node', [scriptPath, ...args], {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
      stdio: 'pipe',
    });

  const createBundleRoot = ({
    rootDir,
    contentSize,
    backgroundSize,
    migrationSize,
    unpackedSize,
  }) => {
    writeSizedFile(path.join(rootDir, 'dist/content.bundle.js'), contentSize);
    writeSizedFile(path.join(rootDir, 'dist/scripts/background.js'), backgroundSize);
    writeSizedFile(path.join(rootDir, 'dist/migration-executor.js'), migrationSize);

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

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'size-gates-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
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

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(report.mode).toBe('hard');
    expect(report.scope).toBe('all');
    expect(report.failed).toBe(false);
    expect(report.checks.every(check => check.status === 'pass')).toBe(true);
  });

  test('hard mode 應在 content bundle 超過 hard cap 時失敗', () => {
    const rootDir = path.join(tempRoot, 'current');
    const { unpackedDir } = createBundleRoot({
      rootDir,
      contentSize: 256_001,
      backgroundSize: 1024,
      migrationSize: 1024,
      unpackedSize: 2048,
    });

    let thrownError;
    try {
      runCli([
        '--mode=hard',
        '--scope=bundle',
        `--root=${rootDir}`,
        `--unpacked-dir=${unpackedDir}`,
      ]);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeDefined();
    expect(`${thrownError.stdout}${thrownError.stderr}`).toMatch(/content\.bundle\.js/);
  });

  test('[REGRESSION] hard mode 應允許 255_000 bytes 的 content bundle 通過', () => {
    const rootDir = path.join(tempRoot, 'current');
    const { unpackedDir, reportPath } = createBundleRoot({
      rootDir,
      contentSize: 255_000,
      backgroundSize: 1024,
      migrationSize: 1024,
      unpackedSize: 2048,
    });

    runCli([
      '--mode=hard',
      '--scope=bundle',
      `--root=${rootDir}`,
      `--unpacked-dir=${unpackedDir}`,
      `--report-file=${reportPath}`,
    ]);

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const contentCheck = report.checks.find(check => check.key === 'content_bundle');

    expect(report.failed).toBe(false);
    expect(contentCheck).toEqual(
      expect.objectContaining({
        status: 'pass',
        current: 255_000,
        hardLimit: 256_000,
      })
    );
  });

  test('[REGRESSION] hard mode 應允許正好等於 hard cap (256_000 bytes) 的 content bundle 通過', () => {
    const rootDir = path.join(tempRoot, 'current');
    const { unpackedDir, reportPath } = createBundleRoot({
      rootDir,
      contentSize: 256_000,
      backgroundSize: 1024,
      migrationSize: 1024,
      unpackedSize: 2048,
    });

    runCli([
      '--mode=hard',
      '--scope=bundle',
      `--root=${rootDir}`,
      `--unpacked-dir=${unpackedDir}`,
      `--report-file=${reportPath}`,
    ]);

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const contentCheck = report.checks.find(check => check.key === 'content_bundle');

    expect(report.failed).toBe(false);
    expect(contentCheck).toEqual(
      expect.objectContaining({
        status: 'pass',
        current: 256_000,
        hardLimit: 256_000,
      })
    );
  });

  test('[REGRESSION] hard mode 應允許 background bundle 在 delta gate 內自然成長', () => {
    const rootDir = path.join(tempRoot, 'current');
    const { unpackedDir, reportPath } = createBundleRoot({
      rootDir,
      contentSize: 1024,
      backgroundSize: 243_500,
      migrationSize: 1024,
      unpackedSize: 2048,
    });

    runCli([
      '--mode=hard',
      '--scope=bundle',
      `--root=${rootDir}`,
      `--unpacked-dir=${unpackedDir}`,
      `--report-file=${reportPath}`,
    ]);

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const backgroundCheck = report.checks.find(check => check.key === 'background_bundle');

    expect(report.failed).toBe(false);
    expect(backgroundCheck).toEqual(
      expect.objectContaining({
        status: 'pass',
        current: 243_500,
        hardLimit: 245_000,
      })
    );
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
    expect(`${thrownError.stdout}${thrownError.stderr}`).toMatch(/delta limit/i);
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

    // eslint-disable-next-line security/detect-non-literal-fs-filename
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
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.mkdirSync(baseRoot, { recursive: true });

    runCli([
      '--mode=delta',
      '--scope=all',
      `--root=${currentRoot}`,
      `--base-root=${baseRoot}`,
      `--unpacked-dir=${currentUnpackedDir}`,
      `--report-file=${reportPath}`,
    ]);

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    expect(report.failed).toBe(false);
    expect(report.checks.some(check => check.status === 'skipped')).toBe(true);
  });
});
