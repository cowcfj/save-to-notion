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
  const coverageFiles = [
    {
      filePath: 'scripts/a.js',
      incumbent: { statements: [1], functions: [1], branches: [[1, 1]] },
      native: { statements: [0], functions: [0], branches: [[0, 0]] },
    },
    {
      filePath: 'scripts/b.js',
      incumbent: { statements: [1, 1], functions: [1], branches: [[1, 1]] },
      native: { statements: [1, 0], functions: [1], branches: [[1, 0]] },
    },
  ];
  const buildSummary = profileName => {
    const coverageMap = Object.fromEntries(
      coverageFiles.map(({ filePath, [profileName]: profile }) => [
        path.join(projectRoot, filePath),
        createCoverageEntry({
          statements: profile.statements.map((hits, index) => ({ startLine: index + 1, hits })),
          functions: Object.fromEntries(profile.functions.map((hits, index) => [index, hits])),
          branches: Object.fromEntries(profile.branches.map((hits, index) => [index, hits])),
        }),
      ])
    );
    return reporter.summarizeCoverageMap(coverageMap, { projectRoot });
  };

  return {
    incumbentSummary: buildSummary('incumbent'),
    nativeSummary: buildSummary('native'),
  };
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
    const { incumbentSummary, nativeSummary } = buildMaterialDriftComparisonInputs(
      reporter,
      projectRoot
    );

    const summary = reporter.compareCoverageSummaries({
      incumbentSummary,
      nativeSummary,
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
      driftThreshold: 20,
      scopeParitySummary: {
        gates: [{ id: 'official-scope-parity', status: 'pass' }],
      },
    });

    expect(summary.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'threshold-parity',
          status: 'fail',
          blocking: false,
        }),
      ])
    );
    expect(summary.drift.materialFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'scripts/a.js', linePctDelta: -100 }),
        expect.objectContaining({ path: 'scripts/b.js', linePctDelta: -50 }),
      ])
    );
    expect(summary.drift.nativeZeroIncumbentNonzeroFiles).toEqual([
      expect.objectContaining({ path: 'scripts/a.js' }),
    ]);
    expect(summary.breadth).toEqual(
      expect.objectContaining({
        nativeNonzeroOfficialFiles: 1,
        nativeZeroOfficialFiles: 1,
        materialDriftFiles: 2,
        nativeZeroIncumbentNonzeroFiles: 1,
      })
    );
    expect(summary.breadth.topMaterialDriftGroups).toEqual([
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
    ]);
    expect(summary.breadth.topNativeZeroIncumbentNonzeroGroups).toEqual([
      expect.objectContaining({
        group: 'scripts/a.js',
        files: 1,
        worstLinePctDelta: -100,
        sampleFiles: ['scripts/a.js'],
      }),
    ]);
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
    expect(markdown).toContain('coverage/jest/lcov.info');
    expect(markdown).toContain('threshold-parity');
    expect(markdown).toContain('native nonzero official 檔案數');
    expect(markdown).toContain('## Native Zero / Incumbent Nonzero');
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
