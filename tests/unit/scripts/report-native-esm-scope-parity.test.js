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

const writeFile = (rootDir, relativePath, content = '') => {
  const filePath = path.join(rootDir, relativePath);
  createDirectory(path.dirname(filePath));
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(filePath, content, 'utf8');
};

describe('tools/report-native-esm-scope-parity.mjs', () => {
  const projectRoot = path.resolve(__dirname, '../../..');
  const tempRoot = path.join(projectRoot, '.tmp/test-scope-parity');
  const cliPath = path.join(projectRoot, 'tools/report-native-esm-scope-parity.mjs');
  const nativeCoveragePath = path.join(projectRoot, 'coverage/native-esm/coverage-final.json');
  const nativeCoverageBackupPath = path.join(
    projectRoot,
    'coverage/native-esm/coverage-final.json.scope-parity-test-bak'
  );
  const allowedOutputRoot = path.join(projectRoot, 'coverage/native-esm/test-scope-parity-output');
  let reporter;
  let removeNativeCoverageAfterTest;

  const loadReporter = () => {
    reporter = require('../../../tools/report-native-esm-scope-parity-core.cjs');
  };

  const runCliWithSummary = summaryRoot =>
    spawnSync(
      process.execPath,
      [
        cliPath,
        '--summary-json',
        path.join(summaryRoot, 'scope-parity-summary.json'),
        '--summary-md',
        path.join(summaryRoot, 'scope-parity-summary.md'),
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      }
    );

  beforeEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(allowedOutputRoot, { recursive: true, force: true });
    createDirectory(tempRoot);
    createDirectory(allowedOutputRoot);
    removeNativeCoverageAfterTest = false;
    loadReporter();
  });

  afterEach(() => {
    if (!fs.existsSync(nativeCoveragePath) && fs.existsSync(nativeCoverageBackupPath)) {
      fs.renameSync(nativeCoverageBackupPath, nativeCoveragePath);
    }
    if (
      removeNativeCoverageAfterTest &&
      fs.existsSync(nativeCoveragePath) &&
      !fs.existsSync(nativeCoverageBackupPath)
    ) {
      fs.rmSync(nativeCoveragePath, { force: true });
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(allowedOutputRoot, { recursive: true, force: true });
  });

  test('coverage patterns include scripts and pages production JavaScript files', () => {
    writeFile(tempRoot, 'scripts/background/utils/BlockBuilder.js');
    writeFile(tempRoot, 'pages/update-notification/update-notification.js');
    writeFile(tempRoot, 'pages/update-notification/update-notification.css');

    const files = reporter.listJavaScriptSourceFiles(tempRoot, ['scripts', 'pages']);
    const result = reporter.evaluateCoveragePatterns(files, [
      '<rootDir>/scripts/**/*.js',
      '<rootDir>/pages/**/*.js',
    ]);

    expect(result.included).toEqual([
      'pages/update-notification/update-notification.js',
      'scripts/background/utils/BlockBuilder.js',
    ]);
    expect(result.excluded).toEqual([]);
    expect(result.unsupportedPatterns).toEqual([]);
  });

  test('coverage exclusions remove exact, subtree, and test-like source files', () => {
    writeFile(tempRoot, 'scripts/config/index.js');
    writeFile(tempRoot, 'scripts/config/extension/notionApi.js');
    writeFile(tempRoot, 'scripts/config/shared/storage.js');
    writeFile(tempRoot, 'scripts/config/shared/storage.test.js');
    writeFile(tempRoot, 'scripts/config/shared/storage.spec.js');

    const files = reporter.listJavaScriptSourceFiles(tempRoot, ['scripts']);
    const result = reporter.evaluateCoveragePatterns(files, [
      '<rootDir>/scripts/**/*.js',
      '!<rootDir>/scripts/config/index.js',
      '!<rootDir>/scripts/config/extension/**/*.js',
      '!<rootDir>/scripts/**/*.test.js',
      '!<rootDir>/scripts/**/*.spec.js',
    ]);

    expect(result.included).toEqual(['scripts/config/shared/storage.js']);
    expect(result.excluded).toEqual([
      'scripts/config/extension/notionApi.js',
      'scripts/config/index.js',
      'scripts/config/shared/storage.spec.js',
      'scripts/config/shared/storage.test.js',
    ]);
    expect(result.unsupportedPatterns).toEqual([]);
  });

  test('scope summary classifies missing, extra, and zero-coverage canary files', () => {
    const summary = reporter.buildScopeParitySummary({
      officialIncluded: [
        'pages/update-notification/update-notification.js',
        'scripts/background/utils/BlockBuilder.js',
        'scripts/config/shared/storage.js',
      ],
      officialExcluded: ['scripts/config/index.js'],
      nativeIncluded: ['scripts/background/utils/BlockBuilder.js', 'scripts/config/index.js'],
      nativeCoverageEntries: {
        'scripts/background/utils/BlockBuilder.js': { statementHits: [1] },
      },
      zeroCoverageCanaryPaths: ['pages/update-notification/update-notification.js'],
      unsupportedPatterns: [],
    });

    expect(summary.totals).toEqual({
      officialIncluded: 3,
      officialExcluded: 1,
      nativeIncluded: 2,
      missingFromNativeCandidate: 2,
      extraNativeCandidate: 1,
      zeroCoverageCanaries: 1,
      unsupportedPatterns: 0,
    });
    expect(summary.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'pages/update-notification/update-notification.js',
          classification: 'zero-coverage-canary',
          nativeCandidate: 'missing',
          nativeCoverageEntry: 'missing',
        }),
        expect.objectContaining({
          path: 'scripts/config/shared/storage.js',
          classification: 'missing-from-native-candidate',
        }),
        expect.objectContaining({
          path: 'scripts/config/index.js',
          classification: 'extra-native-candidate',
        }),
      ])
    );
    expect(summary.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'official-scope-parity',
          status: 'fail',
          blocking: false,
        }),
        expect.objectContaining({
          id: 'zero-coverage-canary',
          status: 'fail',
          blocking: false,
        }),
        expect.objectContaining({
          id: 'report-integrity',
          status: 'pass',
          blocking: true,
        }),
      ])
    );
  });

  test('scope summary records zero canary pass when native coverage contains only zero hits', () => {
    const summary = reporter.buildScopeParitySummary({
      officialIncluded: ['pages/update-notification/update-notification.js'],
      officialExcluded: [],
      nativeIncluded: ['pages/update-notification/update-notification.js'],
      nativeCoverageEntries: {
        'pages/update-notification/update-notification.js': { statementHits: [0, 0] },
      },
      zeroCoverageCanaryPaths: ['pages/update-notification/update-notification.js'],
      unsupportedPatterns: [],
    });

    expect(summary.files).toEqual([
      expect.objectContaining({
        path: 'pages/update-notification/update-notification.js',
        classification: 'zero-coverage-canary',
        nativeCoverageEntry: 'zero',
      }),
      expect.objectContaining({
        path: 'pages/update-notification/update-notification.js',
        classification: 'included-in-both',
        nativeCoverageEntry: 'zero',
      }),
    ]);
    expect(summary.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'zero-coverage-canary', status: 'pass' }),
      ])
    );
  });

  test('zero canary still contributes to native extra scope drift', () => {
    const summary = reporter.buildScopeParitySummary({
      officialIncluded: [],
      officialExcluded: [],
      nativeIncluded: ['pages/update-notification/update-notification.js'],
      nativeCoverageEntries: {
        'pages/update-notification/update-notification.js': { statementHits: [0, 0] },
      },
      zeroCoverageCanaryPaths: ['pages/update-notification/update-notification.js'],
      unsupportedPatterns: [],
    });

    expect(summary.totals.extraNativeCandidate).toBe(1);
    expect(summary.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'pages/update-notification/update-notification.js',
          classification: 'zero-coverage-canary',
        }),
        expect.objectContaining({
          path: 'pages/update-notification/update-notification.js',
          classification: 'extra-native-candidate',
        }),
      ])
    );
    expect(summary.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'official-scope-parity', status: 'fail' }),
      ])
    );
  });

  test('unsupported patterns are recorded and make report integrity fail', () => {
    const files = ['scripts/background/utils/BlockBuilder.js'];
    const result = reporter.evaluateCoveragePatterns(files, ['<rootDir>/scripts/**/{foo,bar}.js']);
    const summary = reporter.buildScopeParitySummary({
      officialIncluded: [],
      officialExcluded: [],
      nativeIncluded: [],
      nativeCoverageEntries: {},
      zeroCoverageCanaryPaths: ['pages/update-notification/update-notification.js'],
      unsupportedPatterns: result.unsupportedPatterns,
    });

    expect(result.unsupportedPatterns).toEqual(['<rootDir>/scripts/**/{foo,bar}.js']);
    expect(summary.totals.unsupportedPatterns).toBe(1);
    expect(summary.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'report-integrity', status: 'fail', blocking: true }),
      ])
    );
  });

  test('markdown summary states diagnostic boundary and Codecov isolation', () => {
    const summary = reporter.buildScopeParitySummary({
      officialIncluded: ['pages/update-notification/update-notification.js'],
      officialExcluded: [],
      nativeIncluded: [],
      nativeCoverageEntries: {},
      zeroCoverageCanaryPaths: ['pages/update-notification/update-notification.js'],
      unsupportedPatterns: [],
    });

    const markdown = reporter.renderMarkdownSummary(summary);

    expect(markdown).toContain('coverage/jest/lcov.info');
    expect(markdown).toContain('僅供診斷');
    expect(markdown).toContain('official-scope-parity');
    expect(markdown).toContain('pages/update-notification/update-notification.js');
  });

  test('缺少 native coverage-final.json 時 CLI 應失敗且不產生摘要', () => {
    const outputRoot = path.join(allowedOutputRoot, 'missing-coverage-output');
    createDirectory(outputRoot);
    if (fs.existsSync(nativeCoveragePath)) {
      fs.renameSync(nativeCoveragePath, nativeCoverageBackupPath);
    }

    const result = runCliWithSummary(outputRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('找不到 native ESM 覆蓋率檔案');
    expect(fs.existsSync(path.join(outputRoot, 'scope-parity-summary.json'))).toBe(false);
    expect(fs.existsSync(path.join(outputRoot, 'scope-parity-summary.md'))).toBe(false);
  });

  test('CLI 成功訊息使用繁體中文摘要', () => {
    if (!fs.existsSync(nativeCoveragePath)) {
      createDirectory(path.dirname(nativeCoveragePath));
      fs.writeFileSync(nativeCoveragePath, JSON.stringify({}), 'utf8');
      removeNativeCoverageAfterTest = true;
    }
    const outputRoot = path.join(allowedOutputRoot, 'success-output');
    createDirectory(outputRoot);

    const result = runCliWithSummary(outputRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Native ESM scope parity 報告已寫入：');
    expect(result.stdout).toContain('official 檔案');
    expect(result.stdout).toContain('native candidate 檔案');
    expect(result.stdout).not.toContain('report written');
  });
});
