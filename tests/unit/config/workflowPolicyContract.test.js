/* eslint-disable security/detect-non-literal-fs-filename */
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '../../..');
const activeWorkflowDir = path.join(rootDir, '.github/workflows');
const activeSonarWorkflow = path.join(activeWorkflowDir, 'sonarcloud.yml');

function readWorkflow(relativePath) {
  return fs.readFileSync(path.join(activeWorkflowDir, relativePath), 'utf8');
}

function readRootText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readRootJson(relativePath) {
  return JSON.parse(readRootText(relativePath));
}

function listActiveWorkflowFiles() {
  return fs
    .readdirSync(activeWorkflowDir)
    .filter(fileName => fs.statSync(path.join(activeWorkflowDir, fileName)).isFile());
}

function getRootReleasePackageConfig() {
  const releasePleaseConfig = readRootJson('release-please-config.json');
  return releasePleaseConfig.packages['.'];
}

function getWorkflowStepBlock(workflowSource, stepName) {
  const stepStart = workflowSource.indexOf(`- name: ${stepName}`);
  if (stepStart === -1) {
    return '';
  }

  const nextStepStart = workflowSource.indexOf('\n      - name:', stepStart + 1);
  return workflowSource.slice(
    stepStart,
    nextStepStart === -1 ? workflowSource.length : nextStepStart
  );
}

function countTrimmedLines(source, expectedLine) {
  return source.split('\n').filter(line => line.trim() === expectedLine).length;
}

describe('workflow policy contract', () => {
  test('SonarCloud GitHub Action stays out of the active workflow directory', () => {
    expect(fs.existsSync(activeSonarWorkflow)).toBe(false);

    const activeSonarArchives = listActiveWorkflowFiles().filter(fileName =>
      fileName.toLowerCase().startsWith('sonarcloud')
    );

    expect(activeSonarArchives).toEqual([]);
  });

  test('active workflows do not treat the archived SonarCloud workflow as a CI trigger', () => {
    const activeWorkflowSources = ['ci.yml', 'coverage-gate.yml']
      .map(relativePath => readWorkflow(relativePath))
      .join('\n');

    expect(activeWorkflowSources).not.toContain('.github/workflows/sonarcloud.yml');
    expect(activeWorkflowSources).not.toContain('SonarCloud Scan');
  });

  test('release-please keeps test commits hidden from release notes', () => {
    const rootPackageConfig = getRootReleasePackageConfig();
    const testSection = rootPackageConfig['changelog-sections'].find(
      section => section.type === 'test'
    );

    expect(rootPackageConfig['exclude-paths']).toContain('tests/');
    expect(testSection).toEqual(
      expect.objectContaining({
        type: 'test',
        hidden: true,
      })
    );
  });

  test('release-please excludes non-runtime repository surfaces from version decisions', () => {
    const rootPackageConfig = getRootReleasePackageConfig();

    expect(rootPackageConfig['exclude-paths']).toEqual(
      expect.arrayContaining([
        '.github/',
        'docs/',
        'examples/',
        'tests/',
        'tools/',
        'rollup/',
        'babel.config.js',
        'eslint.config.mjs',
        'jest.config.js',
        'jest.native-esm.config.cjs',
        'knip.json',
        'playwright.config.js',
        'sonar-project.properties',
        'codecov.yml',
        'package-lock.json',
        'release-please-config.json',
      ])
    );
  });

  test('release-please keeps runtime extension surfaces eligible for version decisions', () => {
    const rootPackageConfig = getRootReleasePackageConfig();
    const runtimeExtensionSurfaces = [
      'scripts/',
      'pages/',
      'styles/',
      'icons/',
      'auth.html',
      'manifest.json',
      'package.json',
    ];

    runtimeExtensionSurfaces.forEach(runtimePath => {
      expect(rootPackageConfig['exclude-paths']).not.toContain(runtimePath);
    });
  });

  test('native ESM threshold comparison regenerates fallback and official artifacts before reporting', () => {
    const script =
      readRootJson('package.json').scripts['test:coverage:native-esm:threshold-simulation'];

    expect(script).toMatch(
      /^npm run test:coverage:incumbent && npm run test:coverage:native-esm && node tools\/report-native-esm-threshold-simulation\.mjs/
    );
  });

  test('native ESM coverage owns official local thresholds and emits LCOV in the official V8 directory', () => {
    const scripts = readRootJson('package.json').scripts;
    const nativeConfig = require('../../../jest.native-esm.config.cjs');

    expect(scripts['test:coverage:native-esm']).toMatch(/(?:^| )--ci(?: |$)/);
    expect(nativeConfig.coverageDirectory).toBe('<rootDir>/coverage/native-esm');
    expect(nativeConfig.coverageReporters).toEqual(
      expect.arrayContaining(['json', 'text', 'lcov'])
    );
    expect(nativeConfig.coverageThreshold.global).toEqual({
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    });
  });

  test('incumbent Jest coverage is retained as a fallback but no longer owns local thresholds', () => {
    const scripts = readRootJson('package.json').scripts;
    const incumbentConfig = require('../../../jest.config.js');

    expect(scripts['test:coverage']).toBe('npm run test:coverage:native-esm:assert');
    expect(scripts['test:ci']).toBe('npm run test:coverage:native-esm:assert');
    expect(scripts['test:coverage:incumbent']).toBe('jest --config jest.config.js --coverage');
    expect(incumbentConfig.coverageThreshold.global).toEqual({
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    });
  });

  test('native ESM parity flag is retired after single-upload cutover', () => {
    const codecovConfig = readRootText('codecov.yml');

    expect(codecovConfig).not.toContain('  native-esm-parity:');
    expect(codecovConfig).not.toContain('carryforward: false # Phase 3 diagnostic flag');
  });

  test('Coverage Gate runs the official V8 coverage route once and uploads only native LCOV', () => {
    const workflowSource = readWorkflow('coverage-gate.yml');
    const validationStep = getWorkflowStepBlock(workflowSource, '驗證覆蓋率檔案');
    const officialUploadStep = getWorkflowStepBlock(workflowSource, '上傳覆蓋率到 Codecov');

    expect(workflowSource).toContain('name: Coverage Gate');
    expect(workflowSource).toContain('run-name: Coverage Gate @');
    expect(workflowSource).toContain('name: 覆蓋率閘門分類器');
    expect(workflowSource).toContain('name: V8 覆蓋率閘門');
    expect(workflowSource).toContain('name: 執行 V8 覆蓋率閘門');
    expect(countTrimmedLines(workflowSource, 'run: npm run test:ci')).toBe(1);
    expect(workflowSource).not.toContain('npm run test:coverage:native-esm:assert');
    expect(workflowSource).not.toContain('npm run test:coverage:native-esm:scope-parity');
    expect(workflowSource).not.toContain('coverage/native-esm/line-hit-summary.md');
    expect(workflowSource).not.toContain('coverage/native-esm/scope-parity-summary.md');
    expect(workflowSource).not.toContain('native-esm-diagnostic-${{ github.sha }}');
    expect(workflowSource).not.toContain('coverage/jest/lcov.info');

    expect(validationStep).toContain('EXPECTED_CODECOV_LCOV_FILE="coverage/native-esm/lcov.info"');
    expect(validationStep).toContain('LCOV_FILE="coverage/native-esm/lcov.info"');

    expect(officialUploadStep).toContain('files: ${{ steps.validate-coverage.outputs.file }}');
    expect(officialUploadStep).toContain('flags: unit');
    expect(officialUploadStep).toContain('disable_search: true');
    expect(officialUploadStep).toContain('use_oidc: true');
    expect(officialUploadStep).not.toContain('native-esm-parity');
    expect(workflowSource).not.toContain('- name: Validate native ESM coverage');
    expect(workflowSource).not.toContain(
      '- name: Upload native ESM coverage to Codecov parity flag'
    );
    expect(workflowSource).not.toMatch(/codecov\/codecov-action@[\s\S]*flags:\s+native-esm-parity/);
  });

  test('Coverage Gate classifier treats native Jest ESM config as coverage-relevant', () => {
    const workflowSource = readWorkflow('coverage-gate.yml');
    const classifierStep = getWorkflowStepBlock(workflowSource, '偵測覆蓋率相關變更');

    expect(classifierStep).toContain("- 'jest.native-esm.config.cjs'");
  });
});
