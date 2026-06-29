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

    expectRootTotals(report);
    expectClassificationRows(report);
  });

  test('classifies malformed nearest package.json without falling back to a parent boundary', () => {
    writeFile(tempRoot, 'tests/unit/package.json', JSON.stringify({ type: 'module' }));
    writeFile(tempRoot, 'tests/unit/malformed/package.json', '{ invalid json');
    writeFile(
      tempRoot,
      'tests/unit/malformed/package-boundary.test.js',
      'test("malformed", () => {});'
    );
    writeNativeRunnerConfigs(tempRoot);

    const report = buildClassificationReport(reporter, tempRoot);

    expect(report.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'tests/unit/malformed/package-boundary.test.js',
          packageBoundary: 'tests/unit/malformed/package.json',
          signals: expect.arrayContaining(['malformed-package-boundary']),
          primaryBlocker: 'malformed-package-boundary',
          disposition: 'requires-package-json-fix',
        }),
      ])
    );
  });

  test('renders Markdown with blocker counts and candidate rows', () => {
    writeConfig(tempRoot, 'jest.native-default.config.cjs', []);
    writeConfig(tempRoot, 'jest.native-esm.config.cjs', []);

    const report = reporter.buildClassificationReport({
      rootDir: tempRoot,
      roots: ['tests/unit', 'tests/contract', 'tests/native-esm'],
      nativeDefaultConfigPath: path.join(tempRoot, 'jest.native-default.config.cjs'),
      nativeCoverageConfigPath: path.join(tempRoot, 'jest.native-esm.config.cjs'),
      files: [
        {
          path: 'tests/unit/storage.test.js',
          root: 'tests/unit',
          signals: ['jsdom-origin-or-storage'],
          primaryBlocker: 'jsdom-origin-or-storage',
          disposition: 'probe-for-native-default',
        },
      ],
    });

    const markdown = reporter.renderMarkdown(report);

    expect(markdown).toContain('## Blocker Class Counts');
    expect(markdown).toContain('`jsdom-origin-or-storage`');
    expect(markdown).toContain('## Phase 3 Candidate Cohorts');
    expect(markdown).toContain('tests/unit/storage.test.js');
  });

  test('CLI writes summaries under coverage/native-default', () => {
    writeFile(tempRoot, 'tests/unit/storage.test.js', 'sessionStorage.clear();');
    writeConfig(tempRoot, 'jest.native-default.config.cjs', []);
    writeConfig(tempRoot, 'jest.native-esm.config.cjs', []);

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
});
