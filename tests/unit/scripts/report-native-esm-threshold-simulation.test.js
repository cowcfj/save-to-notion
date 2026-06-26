/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const createDirectory = directoryPath => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.mkdirSync(directoryPath, { recursive: true });
};

const writeJson = (filePath, value) => {
  createDirectory(path.dirname(filePath));
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const createCoverageEntry = ({ statements, functions = {}, branches = {} }) => {
  const statementMap = {};
  const statementHits = {};
  statements.forEach((statement, index) => {
    const id = String(index);
    statementMap[id] = {
      start: { line: statement.startLine, column: 0 },
      end: { line: statement.endLine || statement.startLine, column: 1 },
    };
    statementHits[id] = statement.hits;
  });

  const fnMap = {};
  const functionHits = {};
  Object.entries(functions).forEach(([id, hits]) => {
    fnMap[id] = {
      name: `fn${id}`,
      decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
    };
    functionHits[id] = hits;
  });

  const branchMap = {};
  const branchHits = {};
  Object.entries(branches).forEach(([id, hits]) => {
    branchMap[id] = {
      type: 'if',
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
      locations: hits.map(() => ({
        start: { line: 1, column: 0 },
        end: { line: 1, column: 1 },
      })),
    };
    branchHits[id] = hits;
  });

  return {
    path: 'fixture.js',
    statementMap,
    s: statementHits,
    fnMap,
    f: functionHits,
    branchMap,
    b: branchHits,
  };
};

const buildMaterialDriftComparisonInputs = (reporter, projectRoot) => {
  const profiles = ['incumbent', 'native'];
  const coverageRows = [
    ['scripts/a.js', [[1], [1], [[1, 1]]], [[0], [0], [[0, 0]]]],
    ['scripts/b.js', [[1, 1], [1], [[1, 1]]], [[1, 0], [1], [[1, 0]]]],
  ];
  const toIndexedHits = hits => Object.fromEntries(hits.map((hit, index) => [index, hit]));
  const buildEntry = ([statements, functions, branches]) =>
    createCoverageEntry({
      statements: statements.map((hits, index) => ({ startLine: index + 1, hits })),
      functions: toIndexedHits(functions),
      branches: toIndexedHits(branches),
    });
  const buildSummary = profileIndex =>
    reporter.summarizeCoverageMap(
      Object.fromEntries(
        coverageRows.map(([filePath, ...profileEntries]) => [
          path.join(projectRoot, filePath),
          buildEntry(profileEntries[profileIndex]),
        ])
      ),
      { projectRoot }
    );

  return {
    incumbentSummary: buildSummary(profiles.indexOf('incumbent')),
    nativeSummary: buildSummary(profiles.indexOf('native')),
  };
};

const compareMaterialDriftCoverage = (reporter, projectRoot) => {
  const { incumbentSummary, nativeSummary } = buildMaterialDriftComparisonInputs(
    reporter,
    projectRoot
  );
  return reporter.compareCoverageSummaries({
    incumbentSummary,
    nativeSummary,
    thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    driftThreshold: 20,
    scopeParitySummary: {
      gates: [{ id: 'official-scope-parity', status: 'pass' }],
    },
  });
};

describe('tools/report-native-esm-threshold-simulation', () => {
  const projectRoot = path.resolve(__dirname, '../../..');
  const tempRoot = path.join(projectRoot, '.tmp/test-threshold-simulation');
  const cliPath = path.join(projectRoot, 'tools/report-native-esm-threshold-simulation.mjs');
  const allowedOutputRoot = path.join(
    projectRoot,
    'coverage/native-esm/test-threshold-simulation-output'
  );
  let reporter;

  const loadReporter = () => {
    reporter = require('../../../tools/report-native-esm-threshold-simulation-core.cjs');
  };

  const runCliWithArgs = args =>
    spawnSync(process.execPath, [cliPath, ...args], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

  beforeEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(allowedOutputRoot, { recursive: true, force: true });
    createDirectory(tempRoot);
    createDirectory(allowedOutputRoot);
    loadReporter();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(allowedOutputRoot, { recursive: true, force: true });
  });

  test('summarizeCoverageMap computes Istanbul-style file and global metrics', () => {
    const coverageMap = {
      [path.join(projectRoot, 'scripts/example.js')]: createCoverageEntry({
        statements: [
          { startLine: 1, hits: 1 },
          { startLine: 2, hits: 0 },
          { startLine: 2, endLine: 3, hits: 3 },
        ],
        functions: { 0: 1, 1: 0 },
        branches: { 0: [1, 0], 1: [0, 0] },
      }),
    };

    const summary = reporter.summarizeCoverageMap(coverageMap, { projectRoot });

    expect(summary.files).toEqual([
      expect.objectContaining({
        path: 'scripts/example.js',
        metrics: expect.objectContaining({
          lines: { total: 2, covered: 2, pct: 100 },
          statements: { total: 3, covered: 2, pct: 66.66 },
          functions: { total: 2, covered: 1, pct: 50 },
          branches: { total: 4, covered: 1, pct: 25 },
        }),
      }),
    ]);
    expect(summary.global.metrics).toEqual({
      lines: { total: 2, covered: 2, pct: 100 },
      statements: { total: 3, covered: 2, pct: 66.66 },
      functions: { total: 2, covered: 1, pct: 50 },
      branches: { total: 4, covered: 1, pct: 25 },
    });
  });

  test('normalizePercentage treats NaN coverage percentages as full coverage', () => {
    expect(reporter.normalizePercentage(Number.NaN)).toBe(100);
  });

  test('evaluateThresholds records pass and fail per global metric', () => {
    const summary = {
      global: {
        metrics: {
          lines: { pct: 82 },
          statements: { pct: 81 },
          functions: { pct: 79.99 },
          branches: { pct: 70 },
        },
      },
    };

    const result = reporter.evaluateThresholds(summary, {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    });

    expect(result.pass).toBe(false);
    expect(result.metrics).toEqual({
      lines: expect.objectContaining({ status: 'pass', actual: 82, threshold: 80 }),
      statements: expect.objectContaining({ status: 'pass', actual: 81, threshold: 80 }),
      functions: expect.objectContaining({ status: 'fail', actual: 79.99, threshold: 80 }),
      branches: expect.objectContaining({ status: 'pass', actual: 70, threshold: 70 }),
    });
  });

  test('compareCoverageSummaries reports threshold parity and material native drift', () => {
    const { gates, drift } = compareMaterialDriftCoverage(reporter, projectRoot);

    expect(gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'threshold-parity',
          status: 'fail',
          blocking: false,
        }),
      ])
    );
    expect(drift.materialFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'scripts/a.js', linePctDelta: -100 }),
        expect.objectContaining({ path: 'scripts/b.js', linePctDelta: -50 }),
      ])
    );
    expect(drift.nativeZeroIncumbentNonzeroFiles).toEqual([
      expect.objectContaining({ path: 'scripts/a.js' }),
    ]);
  });

  test('compareCoverageSummaries reports breadth and diagnostic adapter details', () => {
    const { breadth, diagnosticThresholdAdapter } = compareMaterialDriftCoverage(
      reporter,
      projectRoot
    );
    const expectedMaterialGroups = [
      expect.objectContaining({
        group: 'scripts/a.js',
        files: 1,
        worstLinePctDelta: -100,
        sampleFiles: ['scripts/a.js'],
      }),
      expect.objectContaining({
        group: 'scripts/b.js',
        files: 1,
        worstLinePctDelta: -50,
        sampleFiles: ['scripts/b.js'],
      }),
    ];
    expect(breadth).toEqual(
      expect.objectContaining({
        nativeNonzeroOfficialFiles: 1,
        nativeZeroOfficialFiles: 1,
        materialDriftFiles: 2,
        nativeZeroIncumbentNonzeroFiles: 1,
      })
    );
    expect(diagnosticThresholdAdapter).toEqual(
      expect.objectContaining({
        blocking: false,
        diagnosticOnly: true,
        status: 'fail',
      })
    );
    expect(breadth.topMaterialDriftGroups).toEqual(expectedMaterialGroups);
    expect(breadth.topNativeZeroIncumbentNonzeroGroups).toEqual([expectedMaterialGroups[0]]);
  });

  test('threshold parity is inconclusive when official scope parity did not pass', () => {
    const incumbentSummary = reporter.summarizeCoverageMap({}, { projectRoot });
    const nativeSummary = reporter.summarizeCoverageMap({}, { projectRoot });

    const summary = reporter.compareCoverageSummaries({
      incumbentSummary,
      nativeSummary,
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
      scopeParitySummary: {
        gates: [{ id: 'official-scope-parity', status: 'fail' }],
      },
    });

    expect(summary.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'threshold-parity',
          status: 'inconclusive',
          blocking: false,
        }),
      ])
    );
  });

  test('assertPathInsideDirectory rejects paths outside allowed roots', () => {
    expect(() =>
      reporter.assertPathInsideDirectory(
        path.join(projectRoot, 'coverage/native-esm/summary.json'),
        path.join(projectRoot, 'coverage/native-esm'),
        'output must stay inside native coverage root'
      )
    ).not.toThrow();

    expect(() =>
      reporter.assertPathInsideDirectory(
        path.join(projectRoot, 'coverage/jest/summary.json'),
        path.join(projectRoot, 'coverage/native-esm'),
        'output must stay inside native coverage root'
      )
    ).toThrow('output must stay inside native coverage root');
  });

  test('markdown summary states diagnostic-only and Codecov isolation', () => {
    const summary = reporter.compareCoverageSummaries({
      incumbentSummary: reporter.summarizeCoverageMap({}, { projectRoot }),
      nativeSummary: reporter.summarizeCoverageMap({}, { projectRoot }),
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
      scopeParitySummary: {
        gates: [{ id: 'official-scope-parity', status: 'pass' }],
      },
    });

    const markdown = reporter.renderThresholdSimulationMarkdown(summary);

    expect(markdown).toContain('僅供診斷');
    expect(markdown).toContain('non-blocking');
    expect(markdown).toContain('coverage/native-esm/lcov.info');
    expect(markdown).toContain('threshold-parity');
    expect(markdown).toContain('## Diagnostic Threshold Adapter');
    expect(markdown).toContain('official-scope-parity');
    expect(markdown).toContain('native nonzero official 檔案數');
    expect(markdown).toContain('## Native Zero / Incumbent Nonzero');
  });

  test('markdown summary renders missing thresholds as 不適用', () => {
    const summary = reporter.compareCoverageSummaries({
      incumbentSummary: reporter.summarizeCoverageMap({}, { projectRoot }),
      nativeSummary: reporter.summarizeCoverageMap({}, { projectRoot }),
      thresholds: { lines: 80, statements: 80 },
      scopeParitySummary: {
        gates: [{ id: 'official-scope-parity', status: 'pass' }],
      },
    });

    const markdown = reporter.renderThresholdSimulationMarkdown(summary);

    expect(markdown).toContain('| functions | 100 | 100 | 0 | 不適用 |');
    expect(markdown).toContain('| branches | 100 | 100 | 0 | 不適用 |');
    expect(markdown).not.toContain('undefined');
  });

  test('markdown summary renders optional summary fallbacks as 不適用', () => {
    const summary = reporter.compareCoverageSummaries({
      incumbentSummary: reporter.summarizeCoverageMap({}, { projectRoot }),
      nativeSummary: reporter.summarizeCoverageMap({}, { projectRoot }),
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
      scopeParitySummary: {
        gates: [{ id: 'official-scope-parity', status: 'pass' }],
      },
    });

    const markdown = reporter.renderThresholdSimulationMarkdown({
      ...summary,
      breadth: undefined,
      diagnosticThresholdAdapter: undefined,
    });

    expect(markdown).toContain('- native nonzero official 檔案數：不適用');
    expect(markdown).toContain('- native zero official 檔案數：不適用');
    expect(markdown).toContain('- material drift 檔案數：不適用');
    expect(markdown).toContain('- native zero / incumbent nonzero 檔案數：不適用');
    expect(markdown).toContain('- adapter 狀態：不適用');
  });

  test('markdown summary limits material drift files to the 50 worst deltas', () => {
    const summary = reporter.compareCoverageSummaries({
      incumbentSummary: reporter.summarizeCoverageMap({}, { projectRoot }),
      nativeSummary: reporter.summarizeCoverageMap({}, { projectRoot }),
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
      scopeParitySummary: {
        gates: [{ id: 'official-scope-parity', status: 'pass' }],
      },
    });
    const materialFiles = Array.from({ length: 55 }, (_, index) => {
      const severity = index + 1;
      return {
        path: `scripts/file-${index}.js`,
        incumbentLinePct: 100,
        nativeLinePct: 100 - severity,
        linePctDelta: -severity,
      };
    });

    const markdown = reporter.renderThresholdSimulationMarkdown({
      ...summary,
      drift: {
        ...summary.drift,
        materialFiles,
      },
    });

    const worstRow = '| `scripts/file-54.js` | 100 | 45 | -55 |';
    const fiftiethRow = '| `scripts/file-5.js` | 100 | 94 | -6 |';
    expect(markdown).toContain(worstRow);
    expect(markdown).toContain(fiftiethRow);
    expect(markdown.indexOf(worstRow)).toBeLessThan(markdown.indexOf(fiftiethRow));
    expect(markdown).not.toContain('| `scripts/file-4.js` | 100 | 95 | -5 |');
    expect(markdown).toContain('顯示最嚴重前 50 筆；另有 5 筆未顯示。');
  });

  test('resolveCoverageThresholds supports object and function jest config exports', async () => {
    const thresholds = { lines: 80, statements: 80, functions: 80, branches: 70 };

    await expect(
      reporter.resolveCoverageThresholds({ coverageThreshold: { global: thresholds } })
    ).resolves.toBe(thresholds);
    await expect(
      reporter.resolveCoverageThresholds(() => ({ coverageThreshold: { global: thresholds } }))
    ).resolves.toBe(thresholds);
    await expect(
      reporter.resolveCoverageThresholds(async () => ({
        coverageThreshold: { global: thresholds },
      }))
    ).resolves.toBe(thresholds);
  });

  test('diagnostic threshold adapter constrains breadth and line-hit regression without official threshold claims', () => {
    const adapter = reporter.evaluateDiagnosticThresholdAdapter({
      baseline: {
        nativeNonzeroOfficialFiles: 1,
        nativeZeroIncumbentNonzeroFiles: 1,
        requiredLines: 3,
        residualGroupCounts: { 'scripts/a.js': 1 },
      },
      breadth: {
        nativeNonzeroOfficialFiles: 2,
        nativeZeroIncumbentNonzeroFiles: 0,
        topNativeZeroIncumbentNonzeroGroups: [],
      },
      scopeParitySummary: {
        gates: [{ id: 'official-scope-parity', status: 'pass' }],
      },
      sourceLineSummary: {
        totals: { failedLines: 0, passedLines: 4, requiredLines: 4 },
      },
    });

    expect(adapter).toEqual(
      expect.objectContaining({
        blocking: false,
        diagnosticOnly: true,
        status: 'pass',
      })
    );
    expect(adapter.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'official-scope-parity',
          status: 'pass',
          evidence: 'official-scope-parity 已通過。',
        }),
        expect.objectContaining({
          id: 'source-line-correctness',
          status: 'pass',
          evidence: 'required lines 通過 4/4；失敗 0。',
        }),
        expect.objectContaining({
          id: 'required-line-manifest-count',
          status: 'pass',
          evidence: 'required-line manifest count 4；baseline 3。',
        }),
        expect.objectContaining({
          id: 'native-nonzero-official-files',
          status: 'pass',
          evidence: 'native nonzero official 檔案數 2；baseline 1。',
        }),
        expect.objectContaining({
          id: 'native-zero-incumbent-nonzero-files',
          status: 'pass',
          evidence: 'native zero / incumbent nonzero 檔案數 0；baseline 1。',
        }),
        expect.objectContaining({
          id: 'residual-group:scripts/a.js',
          status: 'pass',
          evidence: 'scripts/a.js native zero / incumbent nonzero 檔案數 0；baseline 1。',
        }),
      ])
    );
  });

  test('diagnostic threshold adapter reports actionable failures', () => {
    const adapter = reporter.evaluateDiagnosticThresholdAdapter({
      baseline: {
        nativeNonzeroOfficialFiles: 2,
        nativeZeroIncumbentNonzeroFiles: 1,
        requiredLines: 4,
        residualGroupCounts: { 'scripts/a.js': 1 },
      },
      breadth: {
        nativeNonzeroOfficialFiles: 1,
        nativeZeroIncumbentNonzeroFiles: 2,
        topNativeZeroIncumbentNonzeroGroups: [{ group: 'scripts/a.js', files: 2 }],
      },
      scopeParitySummary: {
        gates: [{ id: 'official-scope-parity', status: 'fail' }],
      },
      sourceLineSummary: {
        totals: { failedLines: 1, passedLines: 3, requiredLines: 4 },
      },
    });

    expect(adapter.status).toBe('fail');
    expect(adapter.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'official-scope-parity',
          status: 'fail',
          evidence: 'official-scope-parity 未通過或缺少 summary。',
        }),
        expect.objectContaining({
          id: 'source-line-correctness',
          status: 'fail',
          evidence: 'required lines 通過 3/4；失敗 1。',
        }),
        expect.objectContaining({
          id: 'residual-group:scripts/a.js',
          status: 'fail',
          evidence: 'scripts/a.js native zero / incumbent nonzero 檔案數 2；baseline 1。',
        }),
      ])
    );
  });

  test('diagnostic threshold adapter reports missing source-line summary in zh-TW', () => {
    const adapter = reporter.evaluateDiagnosticThresholdAdapter({
      baseline: {
        nativeNonzeroOfficialFiles: 1,
        nativeZeroIncumbentNonzeroFiles: 1,
        requiredLines: 3,
        residualGroupCounts: {},
      },
      breadth: {
        nativeNonzeroOfficialFiles: 1,
        nativeZeroIncumbentNonzeroFiles: 1,
        topNativeZeroIncumbentNonzeroGroups: [],
      },
      scopeParitySummary: {
        gates: [{ id: 'official-scope-parity', status: 'pass' }],
      },
    });

    expect(adapter.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'source-line-correctness',
          status: 'not_evaluated',
          evidence: '缺少 source-line correctness summary。',
        }),
        expect.objectContaining({
          id: 'required-line-manifest-count',
          status: 'not_evaluated',
          evidence: '缺少 source-line correctness summary。',
        }),
      ])
    );
  });

  test('CLI fails when required coverage inputs are missing and writes no summaries', () => {
    const incumbentCoveragePath = path.join(tempRoot, 'coverage/jest/coverage-final.json');
    const nativeCoveragePath = path.join(tempRoot, 'coverage/native-esm/coverage-final.json');
    const summaryJsonPath = path.join(allowedOutputRoot, 'threshold-simulation-summary.json');
    const summaryMarkdownPath = path.join(allowedOutputRoot, 'threshold-simulation-summary.md');

    const result = runCliWithArgs([
      '--incumbent-coverage',
      incumbentCoveragePath,
      '--native-coverage',
      nativeCoveragePath,
      '--summary-json',
      summaryJsonPath,
      '--summary-md',
      summaryMarkdownPath,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('找不到 incumbent coverage 檔案');
    expect(fs.existsSync(summaryJsonPath)).toBe(false);
    expect(fs.existsSync(summaryMarkdownPath)).toBe(false);
  });

  test('CLI rejects missing option values before reading coverage inputs', () => {
    const result = runCliWithArgs([
      '--incumbent-coverage',
      '--native-coverage',
      'coverage/native-esm/coverage-final.json',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--incumbent-coverage 必須提供路徑值');
    expect(result.stderr).not.toContain('找不到 incumbent coverage 檔案');
  });

  test('CLI rejects unknown options before reading coverage inputs', () => {
    const result = runCliWithArgs(['--unknown-option']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('未知參數：--unknown-option');
  });

  test('CLI rejects invalid drift threshold values', () => {
    const result = runCliWithArgs(['--drift-threshold', '-1']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--drift-threshold 必須是非負數字');
  });

  test('CLI rejects source-line summary paths outside the repo root before reading coverage inputs', () => {
    const result = runCliWithArgs([
      '--source-line-json',
      path.resolve(projectRoot, '../line-hit-summary.json'),
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('source-line correctness summary path 必須位於 repo root 底下');
    expect(result.stderr).not.toContain('找不到 incumbent coverage 檔案');
  });

  test('CLI writes JSON and Markdown summaries under coverage/native-esm', () => {
    const incumbentCoveragePath = path.join(tempRoot, 'coverage/jest/coverage-final.json');
    const nativeCoveragePath = path.join(tempRoot, 'coverage/native-esm/coverage-final.json');
    const scopeParityPath = path.join(tempRoot, 'coverage/native-esm/scope-parity-summary.json');
    const summaryJsonPath = path.join(allowedOutputRoot, 'threshold-simulation-summary.json');
    const summaryMarkdownPath = path.join(allowedOutputRoot, 'threshold-simulation-summary.md');
    const coverageMap = {
      [path.join(projectRoot, 'scripts/a.js')]: createCoverageEntry({
        statements: [{ startLine: 1, hits: 1 }],
        functions: { 0: 1 },
        branches: { 0: [1, 1] },
      }),
    };
    writeJson(incumbentCoveragePath, coverageMap);
    writeJson(nativeCoveragePath, coverageMap);
    writeJson(scopeParityPath, {
      gates: [{ id: 'official-scope-parity', status: 'pass' }],
    });

    const result = runCliWithArgs([
      '--incumbent-coverage',
      incumbentCoveragePath,
      '--native-coverage',
      nativeCoveragePath,
      '--scope-parity-json',
      scopeParityPath,
      '--summary-json',
      summaryJsonPath,
      '--summary-md',
      summaryMarkdownPath,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Native ESM threshold simulation 報告已寫入');
    const summary = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf8'));
    expect(summary.diagnosticOnly).toBe(true);
    expect(summary.breadth).toEqual(
      expect.objectContaining({
        nativeNonzeroOfficialFiles: 1,
        nativeZeroOfficialFiles: 0,
        materialDriftFiles: 0,
        nativeZeroIncumbentNonzeroFiles: 0,
      })
    );
    expect(summary.gates).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'threshold-parity', status: 'pass' })])
    );
    expect(fs.readFileSync(summaryMarkdownPath, 'utf8')).toContain('threshold-parity');
  });
});
