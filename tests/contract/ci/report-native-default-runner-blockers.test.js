/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as reporter from '../../../tools/report-native-default-runner-blockers-core.cjs';

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

const writeConfig = (rootDir, relativePath, testMatch) => {
  writeFile(
    rootDir,
    relativePath,
    `'use strict';\n\nmodule.exports = ${JSON.stringify({ rootDir: '.', testMatch }, null, 2)};\n`
  );
};

const expectPathDoesNotExist = filePath => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  expect(fs.existsSync(filePath)).toBe(false);
};

const expectFileContents = (filePath, expectedContents) => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  expect(fs.readFileSync(filePath, 'utf8')).toBe(expectedContents);
};

const setupNativeRunnerFixture = rootDir => {
  writeFile(rootDir, 'tests/unit/storage.test.js', 'sessionStorage.clear();');
  writeConfig(rootDir, 'jest.native-default.config.cjs', []);
  writeConfig(rootDir, 'jest.native-esm.config.cjs', []);
};

const buildRejectedSymlinkOutputPaths = ({ allowedOutputRoot, fileName, flag, symlinkPath }) => ({
  jsonPath:
    flag === '--summary-json'
      ? path.join(symlinkPath, fileName)
      : path.join(allowedOutputRoot, 'blocker-classification-summary.json'),
  markdownPath:
    flag === '--summary-md'
      ? path.join(symlinkPath, fileName)
      : path.join(allowedOutputRoot, 'blocker-classification-summary.md'),
});

const writeClassificationFixtures = rootDir => {
  writeFile(rootDir, 'tests/native-esm/ready.native-esm.test.mjs', 'test("ready", () => {});');
  writeFile(
    rootDir,
    'tests/native-esm/coverage-only.native-esm.test.mjs',
    'test("coverage", () => {});'
  );
  writeFile(rootDir, 'tests/unit/mock-hoist.test.js', 'jest.mock("../../scripts/foo.js");');
  writeFile(
    rootDir,
    'tests/unit/require-actual.test.js',
    'const actual = jest.requireActual("../../scripts/foo.js");'
  );
  writeFile(
    rootDir,
    'tests/unit/production-require.test.js',
    'const tool = require("../../../scripts/background/utils/BlockBuilder.js");'
  );
  writeFile(
    rootDir,
    'tests/unit/root-import-boundary.test.js',
    'import { tool } from "../../../scripts/tool.js";\ntest("tool", () => expect(tool).toBeDefined());'
  );
  writeFile(
    rootDir,
    'tests/unit/node-lifecycle.test.js',
    'if (require.main === module) { module.exports = { argv: process.argv }; }'
  );
  writeFile(rootDir, 'tests/unit/storage.test.js', 'localStorage.setItem("key", "value");');
  writeFile(rootDir, 'tests/unit/helper-package/package.json', JSON.stringify({ type: 'module' }));
  writeFile(
    rootDir,
    'tests/unit/helper-package/package-boundary.test.js',
    'test("esm", () => {});'
  );
  writeFile(rootDir, 'tests/contract/ci/native-contract.test.js', 'test("contract", () => {});');
};

const writeNativeRunnerConfigs = rootDir => {
  writeConfig(rootDir, 'jest.native-default.config.cjs', [
    '<rootDir>/tests/native-esm/ready.native-esm.test.mjs',
  ]);
  writeConfig(rootDir, 'jest.native-esm.config.cjs', [
    '<rootDir>/tests/native-esm/ready.native-esm.test.mjs',
    '<rootDir>/tests/native-esm/coverage-only.native-esm.test.mjs',
  ]);
};

const packageBoundaryCases = [
  {
    description:
      'classifies malformed nearest package.json without falling back to a parent boundary',
    packageJsonPath: 'tests/unit/malformed/package.json',
    packageJsonContent: '{ invalid json',
    testFilePath: 'tests/unit/malformed/package-boundary.test.js',
    testSource: 'test("malformed", () => {});',
    expectedRecord: {
      path: 'tests/unit/malformed/package-boundary.test.js',
      packageBoundary: 'tests/unit/malformed/package.json',
      signals: expect.arrayContaining(['malformed-package-boundary']),
      primaryBlocker: 'malformed-package-boundary',
      disposition: 'requires-package-json-fix',
    },
  },
  {
    description:
      'uses the nearest valid package.json as the package boundary even when it is CommonJS',
    packageJsonPath: 'tests/unit/commonjs-helper/package.json',
    packageJsonContent: JSON.stringify({ type: 'commonjs' }),
    testFilePath: 'tests/unit/commonjs-helper/package-boundary.test.js',
    testSource: 'test("commonjs", () => {});',
    expectedRecord: {
      path: 'tests/unit/commonjs-helper/package-boundary.test.js',
      packageBoundary: 'tests/unit/commonjs-helper/package.json',
      signals: expect.arrayContaining(['test-helper-package-boundary']),
      primaryBlocker: 'test-helper-package-boundary',
      disposition: 'requires-package-boundary-change',
    },
  },
];

const rejectedSymlinkOutputCases = [
  {
    description: 'CLI rejects symlinked parents that escape coverage/native-default (%s)',
    flag: '--summary-json',
    fileName: 'blocker-classification-summary.json',
    symlinkType: 'dir',
    prepareSymlinkTarget: ({ symlinkTargetPath }) => createDirectory(symlinkTargetPath),
    verifyTarget: ({ symlinkTargetPath, fileName }) => {
      expectPathDoesNotExist(path.join(symlinkTargetPath, fileName));
    },
  },
  {
    description: 'CLI rejects symlinked parents that escape coverage/native-default (%s)',
    flag: '--summary-md',
    fileName: 'blocker-classification-summary.md',
    symlinkType: 'dir',
    prepareSymlinkTarget: ({ symlinkTargetPath }) => createDirectory(symlinkTargetPath),
    verifyTarget: ({ symlinkTargetPath, fileName }) => {
      expectPathDoesNotExist(path.join(symlinkTargetPath, fileName));
    },
  },
  {
    description: 'CLI rejects symlinked final files under coverage/native-default (%s)',
    flag: '--summary-json',
    fileName: 'blocker-classification-summary.json',
    symlinkType: 'file',
    prepareSymlinkTarget: ({ tempRoot, fileName }) => {
      writeFile(tempRoot, `escaped-${fileName}`, '');
    },
    verifyTarget: ({ symlinkTargetPath }) => {
      expectFileContents(symlinkTargetPath, '');
    },
  },
  {
    description: 'CLI rejects symlinked final files under coverage/native-default (%s)',
    flag: '--summary-md',
    fileName: 'blocker-classification-summary.md',
    symlinkType: 'file',
    prepareSymlinkTarget: ({ tempRoot, fileName }) => {
      writeFile(tempRoot, `escaped-${fileName}`, '');
    },
    verifyTarget: ({ symlinkTargetPath }) => {
      expectFileContents(symlinkTargetPath, '');
    },
  },
];

const buildClassificationReport = (reporter, rootDir) =>
  reporter.buildClassificationReport({
    rootDir,
    roots: ['tests/unit', 'tests/contract', 'tests/native-esm'],
    nativeDefaultConfigPath: path.join(rootDir, 'jest.native-default.config.cjs'),
    nativeCoverageConfigPath: path.join(rootDir, 'jest.native-esm.config.cjs'),
  });

const expectRootTotals = report => {
  expect(report.totals.byRoot).toEqual({
    'tests/contract': 1,
    'tests/native-esm': 2,
    'tests/unit': 7,
  });
};

const expectClassificationRows = report => {
  expect(report.files).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: 'tests/native-esm/ready.native-esm.test.mjs',
        primaryBlocker: 'already-native-default',
        disposition: 'already-native-default',
      }),
      expect.objectContaining({
        path: 'tests/native-esm/coverage-only.native-esm.test.mjs',
        primaryBlocker: 'coverage-gate-only',
        disposition: 'coverage-only-not-default-runner',
      }),
      expect.objectContaining({
        path: 'tests/unit/mock-hoist.test.js',
        primaryBlocker: 'babel-hoisted-mock',
        disposition: 'requires-helper-refactor',
      }),
      expect.objectContaining({
        path: 'tests/unit/require-actual.test.js',
        primaryBlocker: 'jest-require-actual-esm',
      }),
      expect.objectContaining({
        path: 'tests/unit/production-require.test.js',
        primaryBlocker: 'commonjs-require-production-esm',
      }),
      expect.objectContaining({
        path: 'tests/unit/root-import-boundary.test.js',
        primaryBlocker: 'root-commonjs-test-boundary',
        disposition: 'defer-to-default-cutover-decision',
      }),
      expect.objectContaining({
        path: 'tests/unit/node-lifecycle.test.js',
        primaryBlocker: 'node-lifecycle-contract',
        disposition: 'retain-incumbent-contract',
      }),
      expect.objectContaining({
        path: 'tests/unit/storage.test.js',
        primaryBlocker: 'jsdom-origin-or-storage',
        disposition: 'probe-for-native-default',
      }),
      expect.objectContaining({
        path: 'tests/unit/helper-package/package-boundary.test.js',
        primaryBlocker: 'test-helper-package-boundary',
        disposition: 'requires-package-boundary-change',
      }),
      expect.objectContaining({
        path: 'tests/contract/ci/native-contract.test.js',
        primaryBlocker: 'incumbent-contract-retained',
        disposition: 'retain-incumbent-contract',
      }),
    ])
  );
};

describe('tools/report-native-default-runner-blockers', () => {
  const projectRoot = path.resolve(__dirname, '../../..');
  const tempRoot = path.join(projectRoot, '.tmp/test-native-default-blockers');
  const allowedOutputRoot = path.join(projectRoot, 'coverage/native-default/test-output');
  const cliPath = path.join(projectRoot, 'tools/report-native-default-runner-blockers.mjs');

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
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(allowedOutputRoot, { recursive: true, force: true });
  });

  test('classifies fixture suites with blocker signals and stable dispositions', () => {
    expect.hasAssertions();

    writeClassificationFixtures(tempRoot);
    writeNativeRunnerConfigs(tempRoot);

    const report = buildClassificationReport(reporter, tempRoot);

    expect(report.files).toHaveLength(10);
    expectRootTotals(report);
    expectClassificationRows(report);
  });

  test('classifies custom root suites under the caller-provided roots', () => {
    writeFile(tempRoot, 'tests/custom/domain/custom-root.test.js', 'test("custom", () => {});');
    writeConfig(tempRoot, 'jest.native-default.config.cjs', []);
    writeConfig(tempRoot, 'jest.native-esm.config.cjs', []);

    const report = reporter.buildClassificationReport({
      rootDir: tempRoot,
      roots: ['tests/custom'],
      nativeDefaultConfigPath: path.join(tempRoot, 'jest.native-default.config.cjs'),
      nativeCoverageConfigPath: path.join(tempRoot, 'jest.native-esm.config.cjs'),
    });

    expect(report.files).toEqual([
      expect.objectContaining({
        path: 'tests/custom/domain/custom-root.test.js',
        root: 'tests/custom',
      }),
    ]);
    expect(report.totals.byRoot).toEqual({ 'tests/custom': 1 });
  });

  test('detects root ESM syntax without regex backtracking-prone line anchors', () => {
    expect(reporter.hasRootEsmSyntax('const importable = true;\n  export { importable };\n')).toBe(
      true
    );
    expect(reporter.hasRootEsmSyntax('const imported = "value";\nconst exported = true;\n')).toBe(
      false
    );
  });

  test.each(packageBoundaryCases)(
    '$description',
    ({ packageJsonPath, packageJsonContent, testFilePath, testSource, expectedRecord }) => {
      writeFile(tempRoot, 'tests/unit/package.json', JSON.stringify({ type: 'module' }));
      writeFile(tempRoot, packageJsonPath, packageJsonContent);
      writeFile(tempRoot, testFilePath, testSource);
      writeNativeRunnerConfigs(tempRoot);

      const report = buildClassificationReport(reporter, tempRoot);

      expect(report.files).toEqual(
        expect.arrayContaining([expect.objectContaining(expectedRecord)])
      );
    }
  );

  test('does not treat the project root package.json as a nested test-helper boundary', () => {
    writeFile(tempRoot, 'package.json', JSON.stringify({ type: 'commonjs' }));
    writeFile(tempRoot, 'tests/unit/root-package-only.test.js', 'test("root", () => {});');
    writeNativeRunnerConfigs(tempRoot);

    const report = buildClassificationReport(reporter, tempRoot);

    expect(report.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'tests/unit/root-package-only.test.js',
          packageBoundary: null,
          signals: expect.not.arrayContaining(['test-helper-package-boundary']),
        }),
      ])
    );
  });

  test('classifies caller-provided file paths with the same record shape as discovered files', () => {
    setupNativeRunnerFixture(tempRoot);

    const report = reporter.buildClassificationReport({
      rootDir: tempRoot,
      roots: ['tests/unit'],
      nativeDefaultConfigPath: path.join(tempRoot, 'jest.native-default.config.cjs'),
      nativeCoverageConfigPath: path.join(tempRoot, 'jest.native-esm.config.cjs'),
      files: ['tests/unit/storage.test.js'],
    });

    expect(report.files).toEqual([
      expect.objectContaining({
        path: 'tests/unit/storage.test.js',
        root: 'tests/unit',
        signals: expect.arrayContaining(['jsdom-origin-or-storage']),
        primaryBlocker: 'jsdom-origin-or-storage',
        disposition: 'probe-for-native-default',
      }),
    ]);
    expect(report.totals.byRoot).toEqual({ 'tests/unit': 1 });
    expect(report.totals.byBlocker).toEqual({ 'jsdom-origin-or-storage': 1 });
    expect(report.candidateCohorts).toEqual([
      expect.objectContaining({ path: 'tests/unit/storage.test.js' }),
    ]);
  });

  test('classifies a single file when native runner sets are omitted', () => {
    writeFile(tempRoot, 'tests/unit/storage.test.js', 'sessionStorage.clear();');

    const record = reporter.classifyFile({
      filePath: 'tests/unit/storage.test.js',
      rootDir: tempRoot,
      roots: ['tests/unit'],
    });

    expect(record).toEqual(
      expect.objectContaining({
        path: 'tests/unit/storage.test.js',
        root: 'tests/unit',
        primaryBlocker: 'jsdom-origin-or-storage',
      })
    );
  });

  test('renders Markdown with blocker counts and candidate rows', () => {
    setupNativeRunnerFixture(tempRoot);

    const report = reporter.buildClassificationReport({
      rootDir: tempRoot,
      roots: ['tests/unit', 'tests/contract', 'tests/native-esm'],
      nativeDefaultConfigPath: path.join(tempRoot, 'jest.native-default.config.cjs'),
      nativeCoverageConfigPath: path.join(tempRoot, 'jest.native-esm.config.cjs'),
      files: ['tests/unit/storage.test.js'],
    });

    const markdown = reporter.renderMarkdown(report);

    expect(markdown).toContain('## Blocker Class Counts');
    expect(markdown).toContain('`jsdom-origin-or-storage`');
    expect(markdown).toContain('## Phase 3 Candidate Cohorts');
    expect(markdown).toContain('tests/unit/storage.test.js');
  });

  test('CLI writes summaries under coverage/native-default', () => {
    setupNativeRunnerFixture(tempRoot);

    const result = runCliWithArgs([
      '--root-dir',
      tempRoot,
      '--native-default-config',
      path.join(tempRoot, 'jest.native-default.config.cjs'),
      '--native-coverage-config',
      path.join(tempRoot, 'jest.native-esm.config.cjs'),
      '--summary-json',
      path.join(allowedOutputRoot, 'blocker-classification-summary.json'),
      '--summary-md',
      path.join(allowedOutputRoot, 'blocker-classification-summary.md'),
    ]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(allowedOutputRoot, 'blocker-classification-summary.json'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(allowedOutputRoot, 'blocker-classification-summary.md'))).toBe(
      true
    );
  });

  test.each(rejectedSymlinkOutputCases)('$description', caseDefinition => {
    expect.hasAssertions();
    setupNativeRunnerFixture(tempRoot);

    const symlinkTargetPath = path.join(tempRoot, `escaped-${caseDefinition.fileName}`);
    const symlinkPath = path.join(allowedOutputRoot, `symlink-${caseDefinition.fileName}`);
    const { jsonPath, markdownPath } = buildRejectedSymlinkOutputPaths({
      allowedOutputRoot,
      fileName: caseDefinition.fileName,
      flag: caseDefinition.flag,
      symlinkPath,
    });

    caseDefinition.prepareSymlinkTarget({
      tempRoot,
      fileName: caseDefinition.fileName,
      symlinkTargetPath,
    });
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.symlinkSync(symlinkTargetPath, symlinkPath, caseDefinition.symlinkType);

    const result = runCliWithArgs([
      '--root-dir',
      tempRoot,
      '--native-default-config',
      path.join(tempRoot, 'jest.native-default.config.cjs'),
      '--native-coverage-config',
      path.join(tempRoot, 'jest.native-esm.config.cjs'),
      '--summary-json',
      jsonPath,
      '--summary-md',
      markdownPath,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('摘要輸出路徑必須位於 coverage/native-default 底下');
    caseDefinition.verifyTarget({ symlinkTargetPath, fileName: caseDefinition.fileName });
  });

  test('CLI rejects symlinked coverage/native-default output root', () => {
    setupNativeRunnerFixture(tempRoot);
    fs.rmSync(allowedOutputRoot, { recursive: true, force: true });
    const escapedOutputRoot = path.join(tempRoot, 'escaped-native-default-root');
    createDirectory(escapedOutputRoot);
    fs.symlinkSync(escapedOutputRoot, allowedOutputRoot, 'dir');

    const result = runCliWithArgs([
      '--root-dir',
      tempRoot,
      '--native-default-config',
      path.join(tempRoot, 'jest.native-default.config.cjs'),
      '--native-coverage-config',
      path.join(tempRoot, 'jest.native-esm.config.cjs'),
      '--summary-json',
      path.join(allowedOutputRoot, 'blocker-classification-summary.json'),
      '--summary-md',
      path.join(allowedOutputRoot, 'blocker-classification-summary.md'),
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('摘要輸出路徑必須位於 coverage/native-default 底下');
    expectPathDoesNotExist(path.join(escapedOutputRoot, 'blocker-classification-summary.json'));
  });
});
