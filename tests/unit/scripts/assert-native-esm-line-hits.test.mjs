/**
 * @jest-environment node
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createExpandedNativeEsmCohortCoverage = projectRoot => ({
  [path.join(projectRoot, 'pages/options/confirmDialog.js')]: {
    statementMap: { 0: { start: { line: 22 }, end: { line: 23 } } },
    s: { 0: 1 },
  },
  [path.join(projectRoot, 'pages/onboarding/onboardingController.js')]: {
    statementMap: { 0: { start: { line: 29 }, end: { line: 30 } } },
    s: { 0: 1 },
  },
  [path.join(projectRoot, 'pages/popup/popupActions.js')]: {
    statementMap: { 0: { start: { line: 256 }, end: { line: 258 } } },
    s: { 0: 1 },
  },
  [path.join(projectRoot, 'pages/sidepanel/sidepanel-current-view.js')]: {
    statementMap: { 0: { start: { line: 173 }, end: { line: 174 } } },
    s: { 0: 1 },
  },
  [path.join(projectRoot, 'scripts/auth/accountSession.js')]: {
    statementMap: { 0: { start: { line: 117 }, end: { line: 118 } } },
    s: { 0: 1 },
  },
  [path.join(projectRoot, 'scripts/background/handlers/MessageHandler.js')]: {
    statementMap: { 0: { start: { line: 96 }, end: { line: 99 } } },
    s: { 0: 1 },
  },
  [path.join(projectRoot, 'scripts/content/converters/ContentBridge.js')]: {
    statementMap: { 0: { start: { line: 39 }, end: { line: 40 } } },
    s: { 0: 1 },
  },
  [path.join(projectRoot, 'scripts/content/runtimeMessageHandlers.js')]: {
    statementMap: { 0: { start: { line: 163 }, end: { line: 164 } } },
    s: { 0: 1 },
  },
  [path.join(projectRoot, 'scripts/content/sanitizers/htmlSanitizer.js')]: {
    statementMap: { 0: { start: { line: 134 }, end: { line: 135 } } },
    s: { 0: 1 },
  },
  [path.join(projectRoot, 'scripts/destinations/ProfileManager.js')]: {
    statementMap: { 0: { start: { line: 59 }, end: { line: 60 } } },
    s: { 0: 1 },
  },
});

const createExpandedNativeEsmCohortManifest = () => [
  { fileSuffix: 'pages/options/confirmDialog.js', lines: [22, 23] },
  { fileSuffix: 'pages/onboarding/onboardingController.js', lines: [29, 30] },
  { fileSuffix: 'pages/popup/popupActions.js', lines: [256, 257, 258] },
  { fileSuffix: 'pages/sidepanel/sidepanel-current-view.js', lines: [173, 174] },
  { fileSuffix: 'scripts/auth/accountSession.js', lines: [117, 118] },
  { fileSuffix: 'scripts/background/handlers/MessageHandler.js', lines: [96, 97, 98, 99] },
  { fileSuffix: 'scripts/content/converters/ContentBridge.js', lines: [39, 40] },
  { fileSuffix: 'scripts/content/runtimeMessageHandlers.js', lines: [163, 164] },
  { fileSuffix: 'scripts/content/sanitizers/htmlSanitizer.js', lines: [134, 135] },
  { fileSuffix: 'scripts/destinations/ProfileManager.js', lines: [59, 60] },
];

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

  const runCliWithArgs = args =>
    spawnSync('node', [scriptPath, ...args].filter(Boolean), {
      cwd: projectRoot,
      encoding: 'utf8',
    });

  const runCli = (coveragePath, manifestPath) => runCliWithArgs([coveragePath, manifestPath]);

  const writeCoverageFile = coverage => {
    const coveragePath = path.join(tempCoverageRoot, 'coverage-final.json');
    fs.writeFileSync(coveragePath, JSON.stringify(coverage), 'utf8');
    return coveragePath;
  };

  const writeManifestFile = manifest => {
    const manifestPath = path.join(tempManifestRoot, 'coverage-line-hits.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    return manifestPath;
  };

  const writeManifestOutsideAllowedRoot = manifest => {
    const manifestPath = path.join(tempCoverageRoot, 'coverage-line-hits.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    return manifestPath;
  };

  const runCliWithSummary = (coveragePath, manifestPath, summaryRoot = tempCoverageRoot) => {
    const summaryJsonPath = path.join(summaryRoot, 'line-hit-summary.json');
    const summaryMarkdownPath = path.join(summaryRoot, 'line-hit-summary.md');
    const result = runCliWithArgs([
      coveragePath,
      manifestPath,
      '--summary-json',
      summaryJsonPath,
      '--summary-md',
      summaryMarkdownPath,
    ]);
    return { result, summaryJsonPath, summaryMarkdownPath };
  };

  const runCliWithSummaryFlag = (coveragePath, manifestPath, flag, outputPath) =>
    runCliWithArgs([coveragePath, manifestPath, flag, outputPath]);

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
    fs.writeFileSync(externalManifestPath, JSON.stringify(createPassingManifest()), 'utf8');
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
        expect.objectContaining({
          id: 'threshold-parity',
          status: 'not_evaluated',
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
    const markdown = fs.readFileSync(summaryMarkdownPath, 'utf8');
    expect(markdown).toContain('coverage/native-esm/lcov.info');
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

    const result = runCliWithSummaryFlag(
      coveragePath,
      manifestPath,
      '--summary-json',
      outsideSummaryPath
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('summary output path 必須位於 coverage/native-esm 底下');
  });

  test('[SECURITY] summary Markdown output path 必須位於 native ESM coverage 目錄', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile(createPassingManifest());
    const outsideSummaryPath = path.join(os.tmpdir(), 'line-hit-summary.md');

    const result = runCliWithSummaryFlag(
      coveragePath,
      manifestPath,
      '--summary-md',
      outsideSummaryPath
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('summary output path 必須位於 coverage/native-esm 底下');
  });

  test('[SECURITY] summary JSON flag 缺少輸出路徑時不得吃掉下一個 flag', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile(createPassingManifest());
    const summaryMarkdownPath = path.join(tempCoverageRoot, 'line-hit-summary.md');

    const result = runCliWithArgs([
      coveragePath,
      manifestPath,
      '--summary-json',
      '--summary-md',
      summaryMarkdownPath,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--summary-json 缺少輸出路徑');
  });

  test('[SECURITY] summary Markdown flag 缺少輸出路徑時會失敗', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile(createPassingManifest());

    const result = runCliWithSummaryFlag(coveragePath, manifestPath, '--summary-md');

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

  test('[SECURITY] manifest root 必須是陣列', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile({
      fileSuffix: 'scripts/background/utils/BlockBuilder.js',
      lines: [54],
    });

    const result = runCli(coveragePath, manifestPath);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('manifest 必須是陣列');
  });

  test('summary Markdown 會跳脫 manifest rationale table 字元', () => {
    const coveragePath = writeCoverageFile(createPassingCoverage());
    const manifestPath = writeManifestFile([
      {
        fileSuffix: 'scripts/background/utils/BlockBuilder.js',
        lines: [54],
        rationale: '第一段 | 第二段\n第三段',
      },
    ]);

    const { result, summaryMarkdownPath } = runCliWithSummary(coveragePath, manifestPath);

    expect(result.status).toBe(0);
    const markdown = fs.readFileSync(summaryMarkdownPath, 'utf8');
    expect(markdown).toContain(String.raw`第一段 \| 第二段 第三段`);
  });

  test('summary 會保留缺少 coverage entry 的診斷結果', () => {
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

    const { result, summaryJsonPath, summaryMarkdownPath } = runCliWithSummary(
      coveragePath,
      manifestPath
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf8'));
    expect(summary.totals.failedLines).toBe(4);
    expect(summary.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileSuffix: 'scripts/highlighter/autoInit/initializationInputs.js',
          failedLines: [38, 39, 40, 41],
        }),
      ])
    );
    expect(fs.readFileSync(summaryMarkdownPath, 'utf8')).toContain(
      'scripts/highlighter/autoInit/initializationInputs.js'
    );
    expect(result.stderr).toContain(
      '找不到 scripts/highlighter/autoInit/initializationInputs.js 的覆蓋率資料'
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

  test('manifest allowlist 接受 expanded native ESM cohorts', () => {
    const coveragePath = writeCoverageFile(createExpandedNativeEsmCohortCoverage(projectRoot));
    const manifestPath = writeManifestFile(createExpandedNativeEsmCohortManifest());

    const result = runCli(coveragePath, manifestPath);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Native ESM 行命中檢查通過：10 個檔案, 23 行');
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
