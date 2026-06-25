/**
 * @jest-environment node
 */

const fs = require('node:fs');
const path = require('node:path');

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
  let reporter;

  const loadReporter = () => {
    reporter = require('../../../tools/report-native-esm-scope-parity-core.cjs');
  };

  beforeEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    createDirectory(tempRoot);
    loadReporter();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
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
    ]);
    expect(summary.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'zero-coverage-canary', status: 'pass' }),
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
});
