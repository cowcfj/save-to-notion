/**
 * @jest-environment node
 */
/* eslint-disable sonarjs/no-os-command-from-path */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

describe('tools/assert-native-esm-line-hits.mjs', () => {
  const projectRoot = path.resolve(__dirname, '../../..');
  const scriptPath = path.join(projectRoot, 'tools/assert-native-esm-line-hits.mjs');
  const allowedCoverageRoot = path.join(projectRoot, 'coverage/native-esm');
  const allowedManifestRoot = path.join(projectRoot, 'tests/native-esm');
  let tempCoverageRoot;
  let tempManifestRoot;

  const createPassingCoverage = () => ({
    [path.join(projectRoot, 'scripts/background/utils/BlockBuilder.js')]: {
      statementMap: {
        0: {
          start: { line: 54 },
          end: { line: 57 },
        },
      },
      s: { 0: 1 },
    },
    [path.join(projectRoot, 'scripts/highlighter/autoInit/initializationInputs.js')]: {
      statementMap: {
        0: {
          start: { line: 38 },
          end: { line: 41 },
        },
      },
      s: { 0: 1 },
    },
  });

  const createPassingManifest = () => [
    {
      fileSuffix: 'scripts/background/utils/BlockBuilder.js',
      lines: [54, 55, 56, 57],
    },
    {
      fileSuffix: 'scripts/highlighter/autoInit/initializationInputs.js',
      lines: [38, 39, 40, 41],
    },
  ];

  const runCli = (coveragePath, manifestPath) =>
    spawnSync('node', [scriptPath, coveragePath, manifestPath].filter(Boolean), {
      cwd: projectRoot,
      encoding: 'utf8',
    });

  const writeCoverageFile = coverage => {
    const coveragePath = path.join(tempCoverageRoot, 'coverage-final.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(coveragePath, JSON.stringify(coverage), 'utf8');
    return coveragePath;
  };

  const writeManifestFile = manifest => {
    const manifestPath = path.join(tempManifestRoot, 'coverage-line-hits.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    return manifestPath;
  };

  const writeManifestOutsideAllowedRoot = manifest => {
    const manifestPath = path.join(tempCoverageRoot, 'coverage-line-hits.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    return manifestPath;
  };

  const runCliWithSummary = (coveragePath, manifestPath, summaryRoot = tempCoverageRoot) => {
    const summaryJsonPath = path.join(summaryRoot, 'line-hit-summary.json');
    const summaryMarkdownPath = path.join(summaryRoot, 'line-hit-summary.md');
    const result = spawnSync(
      'node',
      [
        scriptPath,
        coveragePath,
        manifestPath,
        '--summary-json',
        summaryJsonPath,
        '--summary-md',
        summaryMarkdownPath,
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      }
    );
    return { result, summaryJsonPath, summaryMarkdownPath };
  };

  beforeEach(() => {
    fs.mkdirSync(allowedCoverageRoot, { recursive: true });
    fs.mkdirSync(allowedManifestRoot, { recursive: true });
    tempCoverageRoot = fs.mkdtempSync(path.join(allowedCoverageRoot, 'line-hits-test-'));
    tempManifestRoot = fs.mkdtempSync(path.join(allowedManifestRoot, 'line-hits-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempCoverageRoot, { recursive: true, force: true });
    fs.rmSync(tempManifestRoot, { recursive: true, force: true });
  });

  test('[SECURITY] repo 外 coverage path 應被拒絕', () => {
    const externalTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'native-esm-line-hits-'));
    const externalCoveragePath = path.join(externalTempRoot, 'coverage-final.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(externalCoveragePath, JSON.stringify(createPassingCoverage()), 'utf8');

    const result = runCli(externalCoveragePath);

    fs.rmSync(externalTempRoot, { recursive: true, force: true });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('覆蓋率檔案路徑必須位於 coverage/native-esm 底下');
    expect(result.stdout).not.toContain('Native ESM 行命中檢查通過');
  });

  test('[SECURITY] repo 內 manifest symlink 指向 repo 外檔案時應被拒絕', () => {
    const externalTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'native-esm-line-hits-'));
    const externalManifestPath = path.join(externalTempRoot, 'coverage-line-hits.json');
    const linkedManifestPath = path.join(tempManifestRoot, 'linked-coverage-line-hits.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(externalManifestPath, JSON.stringify(createPassingManifest()), 'utf8');
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.symlinkSync(externalManifestPath, linkedManifestPath);

    const coveragePath = writeCoverageFile(createPassingCoverage());
    const result = runCli(coveragePath, linkedManifestPath);

    fs.rmSync(externalTempRoot, { recursive: true, force: true });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('manifest 路徑必須位於 tests/native-esm 底下');
    expect(result.stdout).not.toContain('Native ESM 行命中檢查通過');
  });

  test('[SECURITY] repo 內但不在 native ESM manifest 目錄的 manifest path 應被拒絕', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestOutsideAllowedRoot(createPassingManifest());

    const result = runCli(coveragePath, manifestPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('manifest 路徑必須位於 tests/native-esm 底下');
    expect(result.stdout).not.toContain('Native ESM 行命中檢查通過');
  });

  test('缺少必要 source coverage entry 時輸出繁中錯誤', () => {
    const coveragePath = writeCoverageFile({
      [path.join(projectRoot, 'scripts/background/utils/BlockBuilder.js')]: {
        statementMap: {
          0: {
            start: { line: 54 },
            end: { line: 57 },
          },
        },
        s: { 0: 1 },
      },
    });
    const manifestPath = writeManifestFile(createPassingManifest());

    const result = runCli(coveragePath, manifestPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '找不到 scripts/highlighter/autoInit/initializationInputs.js 的覆蓋率資料'
    );
  });

  test('必要 line 未命中時輸出繁中失敗訊息', () => {
    const coverage = createPassingCoverage();
    coverage[path.join(projectRoot, 'scripts/background/utils/BlockBuilder.js')].s[0] = 0;
    const coveragePath = writeCoverageFile(coverage);
    const manifestPath = writeManifestFile([
      {
        fileSuffix: 'scripts/background/utils/BlockBuilder.js',
        lines: [54],
      },
    ]);

    const result = runCli(coveragePath, manifestPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'scripts/background/utils/BlockBuilder.js:54 預期命中次數 > 0，實際為 0'
    );
  });

  test('必要 line 都命中時輸出繁中成功訊息', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile(createPassingManifest());

    const result = runCli(coveragePath, manifestPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Native ESM 行命中檢查通過：2 個檔案, 8 行');
  });

  test('summary JSON 會記錄 diagnostic-only gate evidence', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile(createPassingManifest());

    const { result, summaryJsonPath } = runCliWithSummary(coveragePath, manifestPath);

    expect(result.status).toBe(0);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const summary = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf8'));
    expect(summary.diagnosticOnly).toBe(true);
    expect(summary.totals).toEqual({
      files: 2,
      requiredLines: 8,
      passedLines: 8,
      failedLines: 0,
    });
    expect(summary.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'source-line-correctness',
          status: 'pass',
          blocking: true,
        }),
        expect.objectContaining({
          id: 'codecov-upload-isolation',
          status: 'pass',
          blocking: false,
        }),
      ])
    );
  });

  test('summary Markdown 會標明不是正式 coverage truth', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile(createPassingManifest());

    const { result, summaryMarkdownPath } = runCliWithSummary(coveragePath, manifestPath);

    expect(result.status).toBe(0);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const markdown = fs.readFileSync(summaryMarkdownPath, 'utf8');
    expect(markdown).toContain('coverage/jest/lcov.info');
    expect(markdown).toContain('| `scripts/background/utils/BlockBuilder.js` | 4 | 4 | 0 |');
    expect(markdown).toContain('僅供診斷');
    expect(markdown).toContain('來源行命中正確性');
    expect(markdown).toContain('| 來源行命中正確性 | 通過 | 是 |');
  });

  test('必要 line 未命中時仍會寫出 failure summary', () => {
    const coverage = createPassingCoverage();
    coverage[path.join(projectRoot, 'scripts/background/utils/BlockBuilder.js')].s[0] = 0;
    const coveragePath = writeCoverageFile(coverage);
    const manifestPath = writeManifestFile([
      {
        fileSuffix: 'scripts/background/utils/BlockBuilder.js',
        lines: [54],
      },
    ]);

    const { result, summaryJsonPath } = runCliWithSummary(coveragePath, manifestPath);

    expect(result.status).toBe(1);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const summary = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf8'));
    expect(summary.totals.failedLines).toBe(1);
    expect(summary.files[0].failedLines).toEqual([54]);
    expect(summary.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'source-line-correctness',
          status: 'fail',
          blocking: true,
        }),
      ])
    );
  });

  test('[SECURITY] summary output path 必須位於 native ESM coverage 目錄', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile(createPassingManifest());
    const outsideSummaryPath = path.join(os.tmpdir(), 'line-hit-summary.json');

    const result = spawnSync(
      'node',
      [scriptPath, coveragePath, manifestPath, '--summary-json', outsideSummaryPath],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('summary output path 必須位於 coverage/native-esm 底下');
  });

  test('[SECURITY] summary Markdown output path 必須位於 native ESM coverage 目錄', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile(createPassingManifest());
    const outsideSummaryPath = path.join(os.tmpdir(), 'line-hit-summary.md');

    const result = spawnSync(
      'node',
      [scriptPath, coveragePath, manifestPath, '--summary-md', outsideSummaryPath],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('summary output path 必須位於 coverage/native-esm 底下');
  });

  test('[SECURITY] summary JSON flag 缺少輸出路徑時不得吃掉下一個 flag', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile(createPassingManifest());
    const summaryMarkdownPath = path.join(tempCoverageRoot, 'line-hit-summary.md');

    const result = spawnSync(
      'node',
      [
        scriptPath,
        coveragePath,
        manifestPath,
        '--summary-json',
        '--summary-md',
        summaryMarkdownPath,
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--summary-json 缺少輸出路徑');
  });

  test('[SECURITY] summary Markdown flag 缺少輸出路徑時會失敗', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile(createPassingManifest());

    const result = spawnSync('node', [scriptPath, coveragePath, manifestPath, '--summary-md'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--summary-md 缺少輸出路徑');
  });

  test('[SECURITY] manifest fileSuffix 不可重複', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile([
      {
        fileSuffix: 'scripts/background/utils/BlockBuilder.js',
        lines: [54],
      },
      {
        fileSuffix: 'scripts/background/utils/BlockBuilder.js',
        lines: [55],
      },
    ]);

    const result = runCli(coveragePath, manifestPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'manifest fileSuffix 不可重複: scripts/background/utils/BlockBuilder.js'
    );
  });

  test('coverage lookup 必須精準匹配 manifest 指定檔案', () => {
    const coveragePath = writeCoverageFile({
      [path.join(projectRoot, 'fixtures/scripts/background/utils/BlockBuilder.js')]: {
        statementMap: {
          0: {
            start: { line: 54 },
            end: { line: 57 },
          },
        },
        s: { 0: 0 },
      },
      [path.join(projectRoot, 'scripts/background/utils/BlockBuilder.js')]: {
        statementMap: {
          0: {
            start: { line: 54 },
            end: { line: 57 },
          },
        },
        s: { 0: 1 },
      },
    });
    const manifestPath = writeManifestFile([
      {
        fileSuffix: 'scripts/background/utils/BlockBuilder.js',
        lines: [54],
      },
    ]);

    const result = runCli(coveragePath, manifestPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Native ESM 行命中檢查通過：1 個檔案, 1 行');
  });

  test('[SECURITY] coverage entry 不可來自 copy-slice spike path', () => {
    const coveragePath = writeCoverageFile({
      [path.join(projectRoot, '.tmp/coverage-spike/scripts/background/utils/BlockBuilder.js')]: {
        statementMap: {
          0: {
            start: { line: 54 },
            end: { line: 57 },
          },
        },
        s: { 0: 1 },
      },
    });
    const manifestPath = writeManifestFile([
      {
        fileSuffix: 'scripts/background/utils/BlockBuilder.js',
        lines: [54],
      },
    ]);

    const result = runCli(coveragePath, manifestPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('coverage entry 不可來自 .tmp/coverage-spike');
  });

  test('[SECURITY] manifest fileSuffix 必須位於 native ESM allowlist', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile([
      {
        fileSuffix: 'scripts/utils/RetryManager.js',
        lines: [1],
      },
    ]);

    const result = runCli(coveragePath, manifestPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'manifest fileSuffix 不在 native ESM diagnostic allowlist: scripts/utils/RetryManager.js'
    );
  });
});
