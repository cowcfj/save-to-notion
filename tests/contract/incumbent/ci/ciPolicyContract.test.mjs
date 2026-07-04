import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import nodeConfigLoader from '../../../helpers/nodeConfigLoader.cjs';

const contractFilePath = fileURLToPath(import.meta.url);
const contractDir = path.dirname(contractFilePath);
const require = createRequire(import.meta.url);
const { loadConfig } = nodeConfigLoader;
const rootDir = path.resolve(contractDir, '../../../..');
const activeWorkflowDir = path.join(rootDir, '.github/workflows');
const activeSonarWorkflow = path.join(activeWorkflowDir, 'sonarcloud.yml');
// Keep these retired script names computed so global scans do not flag this contract test itself.
const retiredIncumbentCoverageScript = 'test:coverage:' + 'incumbent';
const retiredIncumbentCiScript = 'test:ci:' + 'incumbent';
const retiredThresholdSimulationScript = ['test:coverage:native-esm', 'threshold-simulation'].join(
  ':'
);
const releasePleaseNode24ActionRef =
  'googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7';

function readWorkflow(relativePath) {
  return fs.readFileSync(path.join(activeWorkflowDir, relativePath), 'utf8');
}

function readRootText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readRootJson(relativePath) {
  return JSON.parse(readRootText(relativePath));
}

async function importRootConfig(relativePath) {
  const importedConfig = await import(pathToFileURL(path.join(rootDir, relativePath)).href);
  return importedConfig.default ?? importedConfig;
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

describe('CI policy contract', () => {
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
        'eslint.config.mjs',
        'jest.config.js',
        'jest.native-esm.config.js',
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

  test('release-please uses the Node 24 native action without runner-level forcing', () => {
    const workflowSource = readWorkflow('release-please.yml');

    expect(workflowSource).toContain(`uses: ${releasePleaseNode24ActionRef}`);
    expect(workflowSource).not.toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24');
    expect(workflowSource).not.toContain('googleapis/release-please-action@5c625bfb');
  });

  test('active coverage scripts do not expose retired incumbent coverage lanes', () => {
    const scripts = readRootJson('package.json').scripts;

    expect(scripts['test:coverage']).toBe('npm run test:coverage:native-esm:assert');
    expect(scripts['test:ci']).toBe('npm run test:coverage:native-esm:assert');
    expect(scripts).not.toHaveProperty(retiredIncumbentCoverageScript);
    expect(scripts).not.toHaveProperty(retiredIncumbentCiScript);
    expect(scripts).not.toHaveProperty(retiredThresholdSimulationScript);
  });

  test('native ESM coverage owns official local thresholds and emits LCOV in the official V8 directory', async () => {
    const scripts = readRootJson('package.json').scripts;
    const nativeConfig = await importRootConfig('jest.native-esm.config.js');

    expect(scripts['test:coverage:native-esm']).toMatch(/(?:^| )--ci(?: |$)/);
    expect(scripts['test:coverage:native-esm']).not.toMatch(/(?:^| )--runInBand(?: |$)/);
    expect(nativeConfig.maxWorkers).toBe(4);
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

  test('incumbent Jest config remains a non-coverage default runner config', async () => {
    const incumbentConfig = await loadConfig(path.join(rootDir, 'jest.config.js'));

    expect(incumbentConfig.coverageThreshold.global).toEqual({
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    });
  });

  test('Jest open-handle troubleshooting guidance avoids retired incumbent coverage scripts', () => {
    const scripts = readRootJson('package.json').scripts;
    const incumbentJestConfig = readRootText('jest.config.js');

    expect(scripts).not.toHaveProperty('test:ci:diagnostic');
    expect(scripts).not.toHaveProperty(retiredIncumbentCiScript);
    expect(incumbentJestConfig).not.toContain('test:ci:diagnostic');
    expect(incumbentJestConfig).not.toContain(retiredIncumbentCiScript);
    expect(incumbentJestConfig).toContain('npm test -- --detectOpenHandles');
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
    expect(workflowSource).toContain('name: Coverage Gate Classifier');
    expect(workflowSource).toContain('name: Jest Full Coverage');
    expect(workflowSource).toContain('name: 執行 V8 覆蓋率閘門');
    expect(countTrimmedLines(workflowSource, 'run: npm run test:ci')).toBe(1);
    expect(workflowSource).not.toContain('npm run test:coverage:native-esm:assert');
    expect(workflowSource).not.toContain('npm run test:coverage:native-esm:scope-parity');
    expect(workflowSource).not.toContain('coverage/native-esm/line-hit-summary.md');
    expect(workflowSource).not.toContain('coverage/native-esm/scope-parity-summary.md');
    expect(workflowSource).not.toContain('native-esm-diagnostic-${{ github.sha }}');
    expect(workflowSource).not.toContain('coverage/jest/lcov.info');
    expect(workflowSource).toContain('path: .tmp/jest-cache-native-esm');
    expect(workflowSource).not.toContain('path: .jest-cache');

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

    expect(classifierStep).toContain("- 'jest.native-esm.config.js'");
  });

  test('CI related-test changed-file detection tracks secondary Jest config files', () => {
    const workflowSource = readWorkflow('ci.yml');
    const detectSourceChangesStep = getWorkflowStepBlock(workflowSource, 'Detect source changes');
    const changedFilesStep = getWorkflowStepBlock(
      workflowSource,
      'Detect changed source files for related tests'
    );
    const relatedTestsStep = getWorkflowStepBlock(workflowSource, 'Jest related tests');

    expect(workflowSource).toContain("- 'jest.config.*.js'");
    expect(detectSourceChangesStep).toContain("- 'jest.native-default.config.js'");
    expect(detectSourceChangesStep).toContain("- 'jest.native-esm.config.js'");
    [changedFilesStep, relatedTestsStep].forEach(step => {
      expect(step).toContain(
        "jest.config.js 'jest.config.*.js' jest.native-default.config.js jest.native-esm.config.js"
      );
    });
    expect(relatedTestsStep).toContain(
      String.raw`jest\.config(\..*)?\.js|jest\.(native-default|native-esm)\.config\.js`
    );
  });

  test('CI related-test 執行器會先以路徑執行變更測試檔，再查找來源關聯測試', () => {
    const workflowSource = readWorkflow('ci.yml');
    const relatedTestsStep = getWorkflowStepBlock(workflowSource, 'Jest related tests');

    expect(relatedTestsStep).toContain('SOURCE_FILES=');
    expect(relatedTestsStep).toContain('INCUMBENT_TEST_FILES=');
    expect(relatedTestsStep).toContain('NATIVE_TEST_FILES=');
    expect(relatedTestsStep).toContain('NATIVE_DEFAULT_TEST_FILES=');
    expect(relatedTestsStep).toContain('CANDIDATE_FILES="$CANDIDATE_FILES" node - <<\'NODE\'');
    expect(relatedTestsStep).toContain("await import('./jest.config.js')");
    expect(relatedTestsStep).toContain("await import('./jest.native-default.config.js')");
    expect(relatedTestsStep).toContain('config.testMatch');
    expect(relatedTestsStep).toContain("process.env.CANDIDATE_FILES || ''");
    expect(relatedTestsStep).toContain('filter(Boolean);');
    expect(relatedTestsStep).toContain('function globToRegex(glob)');
    expect(countTrimmedLines(relatedTestsStep, 'function globToRegex(glob) {')).toBe(2);
    expect(relatedTestsStep).toContain(
      'const nativeDefaultRegexes = (config.testMatch || []).map(globToRegex);'
    );
    expect(relatedTestsStep).toContain(
      'if (nativeDefaultRegexes.some(regex => regex.test(candidate))) {'
    );
    expect(relatedTestsStep).not.toContain('const allowlisted = new Set();');
    expect(relatedTestsStep).not.toContain('allowlisted.has(candidate)');
    expect(relatedTestsStep).toContain(
      'xargs npx jest --config jest.config.js --ci --runTestsByPath --maxWorkers=2'
    );
    expect(relatedTestsStep).toContain(
      'xargs npx jest --config jest.native-default.config.js --ci --runTestsByPath --maxWorkers=2'
    );
    expect(relatedTestsStep).toContain(
      'xargs npx jest --config jest.config.js --ci --findRelatedTests --passWithNoTests --maxWorkers=2'
    );
    expect(relatedTestsStep).toContain('--passWithNoTests');
    expect(relatedTestsStep).not.toContain(
      'echo "$TEST_FILES" | xargs npx jest --config jest.config.js --ci --findRelatedTests --maxWorkers=2'
    );
    expect(relatedTestsStep).not.toContain('NATIVE_TEST_FILES=$(echo "$CANDIDATE_FILES" | grep -E');
    expect(relatedTestsStep).not.toContain(
      'INCUMBENT_TEST_FILES=$(echo "$CANDIDATE_FILES" | grep -E'
    );
    expect(relatedTestsStep).toContain(
      '::notice::只變更設定檔，改執行 smoke test 而不是 related tests'
    );
    expect(relatedTestsStep).toContain('正在執行變更的 incumbent Jest 測試檔:');
    expect(relatedTestsStep).toContain('正在執行變更的 native-default Jest 測試檔:');
    expect(relatedTestsStep).toContain('正在為變更的來源檔案執行 related tests:');
    expect(relatedTestsStep).not.toContain(
      'Only config files changed, running smoke test instead of related tests'
    );
    expect(relatedTestsStep).not.toContain('Running changed incumbent Jest test files:');
    expect(relatedTestsStep).not.toContain('Running changed native-default Jest test files:');
    expect(relatedTestsStep).not.toContain('Running related tests for changed source files:');
  });

  test('CI related-test 執行器不會把 e2e helper 丟進 Jest related tests', () => {
    const workflowSource = readWorkflow('ci.yml');
    const relatedTestsStep = getWorkflowStepBlock(workflowSource, 'Jest related tests');

    expect(relatedTestsStep).toContain(
      String.raw`SOURCE_FILES=$(echo "$CANDIDATE_FILES" | grep -E '^(scripts|pages)/.*\.(cjs|js|mjs)$' || true)`
    );
    expect(relatedTestsStep).toContain(
      String.raw`const candidates = (process.env.CANDIDATE_FILES || '').split('\n').filter(Boolean);`
    );
    expect(relatedTestsStep).not.toContain(
      String.raw`grep -E '^tests/(unit|contract|integration)/.*\.(test|spec)\.js$'`
    );
    expect(relatedTestsStep).not.toContain(String.raw`grep -E '^tests/.*\.(test|spec)\.mjs$'`);
  });

  test('CI related-test 執行器不會把 nested package markers 丟進 Jest related tests', () => {
    const workflowSource = readWorkflow('ci.yml');
    const relatedTestsStep = getWorkflowStepBlock(workflowSource, 'Jest related tests');

    expect(relatedTestsStep).toContain(
      String.raw`SOURCE_FILES=$(echo "$CANDIDATE_FILES" | grep -E '^(scripts|pages)/.*\.(cjs|js|mjs)$' || true)`
    );
    expect(relatedTestsStep).not.toContain(
      'SOURCE_FILES=$(echo "$CANDIDATE_FILES" | grep -E \'^(scripts|pages)/\' || true)'
    );
  });
});
