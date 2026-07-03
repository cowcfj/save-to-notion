import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import nodeConfigLoader from '../../../helpers/nodeConfigLoader.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../..');
const nativeDefaultConfigPath = path.join(rootDir, 'jest.native-default.config.cjs');
const packageJsonPath = path.join(rootDir, 'package.json');
const require = createRequire(import.meta.url);
const { loadConfig } = nodeConfigLoader;
const retiredIncumbentCoverageScript = 'test:coverage:' + 'incumbent';
const retiredIncumbentCiScript = 'test:ci:' + 'incumbent';
const retiredThresholdSimulationScript = ['test:coverage:native-esm', 'threshold-simulation'].join(
  ':'
);
const retiredThresholdSimulationTestFile = [
  'report-native-esm',
  'threshold-simulation.test.mjs',
].join('-');

const phase3NativeDefaultCohort = [
  '<rootDir>/tests/native-esm/background/handlers/backgroundHandlers.native-esm.test.mjs',
];

const phase3BNativeDefaultCohort = [
  '<rootDir>/tests/native-esm/background/services/backgroundServices.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/background/support/background-support-native-siblings.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/background/utils/backgroundUtils.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/destinations/destinations.native-esm.test.mjs',
];

const incumbentMainstreamMjsPatterns = [
  '<rootDir>/tests/unit/incumbent/helpers/**/*.test.mjs',
  '<rootDir>/tests/integration/incumbent/helpers/**/*.test.mjs',
];

const incumbentMainstreamMjsExactEntries = [
  '<rootDir>/tests/contract/incumbent/ci/ciPolicyContract.test.mjs',
  '<rootDir>/tests/contract/incumbent/module-surfaces/RetryManager.contract.test.mjs',
  '<rootDir>/tests/unit/incumbent/scripts/check-size-gates.test.mjs',
  '<rootDir>/tests/unit/incumbent/scripts/inject-manifest-key.test.mjs',
  '<rootDir>/tests/unit/incumbent/scripts/package-extension.test.mjs',
  '<rootDir>/tests/unit/incumbent/performance/PerformanceOptimizer.comprehensive.test.mjs',
];

const reassignedToIncumbentMjsCohort = [
  '<rootDir>/tests/contract/incumbent/ci/ciPolicyContract.test.mjs',
  '<rootDir>/tests/contract/incumbent/module-surfaces/RetryManager.contract.test.mjs',
  '<rootDir>/tests/integration/incumbent/helpers/integration-test-helper.test.mjs',
  '<rootDir>/tests/unit/incumbent/helpers/performanceOptimizerTestHarness.test.mjs',
  '<rootDir>/tests/unit/incumbent/helpers/storageServiceTestHarness.test.mjs',
  '<rootDir>/tests/unit/incumbent/performance/PerformanceOptimizer.comprehensive.test.mjs',
  '<rootDir>/tests/unit/incumbent/scripts/check-size-gates.test.mjs',
  '<rootDir>/tests/unit/incumbent/scripts/inject-manifest-key.test.mjs',
  '<rootDir>/tests/unit/incumbent/scripts/package-extension.test.mjs',
];

const retiredIncumbentCoverageSurfaces = [
  retiredIncumbentCoverageScript,
  retiredIncumbentCiScript,
  retiredThresholdSimulationScript,
];

const retiredThresholdSimulationSuites = [
  `<rootDir>/tests/unit/scripts/${retiredThresholdSimulationTestFile}`,
];

const retainedNativeDefaultCohort = [
  '<rootDir>/tests/unit/background/core-functions.test.js',
  '<rootDir>/tests/unit/background/image-processing.test.js',
  '<rootDir>/tests/unit/highlighter/highlighter-path-compression.test.js',
  '<rootDir>/tests/unit/highlighter/highlighter-storage-optimization.test.js',
];

const cjsEsmRequireProductionEsmCohort = [
  '<rootDir>/tests/unit/config/messages.test.js',
  '<rootDir>/tests/unit/config/storageKeys.test.js',
  '<rootDir>/tests/unit/normalizeUrl.test.js',
  '<rootDir>/tests/unit/background/buildHighlightBlocks.test.js',
];

const cjsEsmRequireProductionEsmCohort2 = [
  '<rootDir>/tests/unit/pageComplexityDetector.node-env.test.js',
  '<rootDir>/tests/unit/splitTextForHighlight.test.js',
  '<rootDir>/tests/unit/background/processContentResult.test.js',
];

const rootCommonJsRetainedCutoverCandidates = [
  '<rootDir>/tests/unit/performance/timingHelpers.test.js',
];

const nativeDefaultDiagnosticSentinelCohort = [
  '<rootDir>/tests/contract/native-default/ci/nativeDefaultRunnerContract.test.mjs',
  '<rootDir>/tests/contract/native-default/ci/report-native-default-runner-blockers.test.mjs',
  '<rootDir>/tests/integration/background/background-require.integration.test.mjs',
  '<rootDir>/tests/unit/background.test.js',
  '<rootDir>/tests/unit/background/extension-lifecycle.test.js',
  '<rootDir>/tests/unit/native-default/config/env.test.mjs',
  '<rootDir>/tests/unit/content/content-script.require.test.js',
  '<rootDir>/tests/unit/pageComplexityDetector.node-env.test.js',
  '<rootDir>/tests/unit/native-default/performance/PerformanceOptimizer.advanced.test.mjs',
  '<rootDir>/tests/unit/scripts/assert-native-esm-line-hits.test.mjs',
  '<rootDir>/tests/unit/scripts/postinstall.test.js',
  '<rootDir>/tests/unit/scripts/report-native-esm-scope-parity.test.mjs',
];

function readPackageScripts() {
  return readPackageJson().scripts;
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

describe('native default Jest runner contract', () => {
  test('incumbent default scripts remain on jest.config.js', () => {
    const scripts = readPackageScripts();

    expect(readPackageJson().type).toBe('module');
    expect(scripts.test).toBe('jest --config jest.config.js');
    expect(scripts['test:quick']).toBe('jest --config jest.config.js --onlyChanged');
  });

  test('native default scripts use the non-default native config', () => {
    const scripts = readPackageScripts();

    expect(scripts['test:native']).toBe(
      'NODE_OPTIONS=--experimental-vm-modules jest --config jest.native-default.config.cjs'
    );
    expect(scripts['test:quick:native']).toBe(
      'NODE_OPTIONS=--experimental-vm-modules jest --config jest.native-default.config.cjs --onlyChanged'
    );
  });

  test('coverage and CI scripts remain on the official native ESM V8 lane', () => {
    const scripts = readPackageScripts();

    expect(scripts['test:coverage']).toBe('npm run test:coverage:native-esm:assert');
    expect(scripts['test:ci']).toBe('npm run test:coverage:native-esm:assert');
    expect(scripts['test:coverage:native-esm']).toContain(
      'jest --config jest.native-esm.config.cjs --ci --coverage'
    );
    for (const retiredScriptName of retiredIncumbentCoverageSurfaces) {
      expect(scripts).not.toHaveProperty(retiredScriptName);
    }
  });

  test('native blocker classifier is diagnostic-only and writes under native-default coverage artifacts', () => {
    const scripts = readPackageScripts();

    expect(scripts['test:native:blockers']).toBe(
      'node tools/report-native-default-runner-blockers.mjs --summary-json coverage/native-default/blocker-classification-summary.json --summary-md coverage/native-default/blocker-classification-summary.md'
    );
    expect(scripts['test:native:blockers']).toContain(
      '--summary-json coverage/native-default/blocker-classification-summary.json'
    );
    expect(scripts['test:native:blockers']).toContain(
      '--summary-md coverage/native-default/blocker-classification-summary.md'
    );
    expect(scripts['test:native:blockers']).toContain('coverage/native-default/');
    expect(scripts['test:native:blockers']).not.toContain('docs/reports/');
    expect(scripts['test:native:blockers']).not.toContain('coverage/native-esm/lcov.info');
    expect(scripts['test:native:blockers']).not.toContain('jest ');
    expect(scripts.test).toBe('jest --config jest.config.js');
    expect(scripts['test:quick']).toBe('jest --config jest.config.js --onlyChanged');
    expect(scripts['test:coverage']).toBe('npm run test:coverage:native-esm:assert');
    expect(scripts['test:ci']).toBe('npm run test:coverage:native-esm:assert');
  });

  test('native default allowlist includes proven cohorts and excludes retained root-cutover probes', () => {
    const nativeDefaultConfig = require(nativeDefaultConfigPath);

    expect(nativeDefaultConfig.testMatch).toEqual(
      expect.arrayContaining([
        ...phase3NativeDefaultCohort,
        ...phase3BNativeDefaultCohort,
        ...retainedNativeDefaultCohort,
        ...cjsEsmRequireProductionEsmCohort,
        ...cjsEsmRequireProductionEsmCohort2,
        ...nativeDefaultDiagnosticSentinelCohort,
      ])
    );
    for (const reassignedSuite of reassignedToIncumbentMjsCohort) {
      expect(nativeDefaultConfig.testMatch).not.toContain(reassignedSuite);
    }
    expect(nativeDefaultConfig.testMatch).toEqual(
      expect.not.arrayContaining(rootCommonJsRetainedCutoverCandidates)
    );
    expect(nativeDefaultConfig.testMatch).toEqual(
      expect.not.arrayContaining(retiredThresholdSimulationSuites)
    );
  });

  test('incumbent Jest config directly owns mainstream correctness .mjs suites and still excludes native-esm-only cohorts', async () => {
    const incumbentConfig = await loadConfig(path.join(rootDir, 'jest.config.js'));
    const incumbentProjectMatches = incumbentConfig.projects.flatMap(project => project.testMatch);

    expect(incumbentProjectMatches).toEqual(
      expect.arrayContaining([
        ...incumbentMainstreamMjsPatterns,
        ...incumbentMainstreamMjsExactEntries,
      ])
    );
    for (const nativeOnlyCohortMatch of [
      ...phase3NativeDefaultCohort,
      ...phase3BNativeDefaultCohort,
    ]) {
      expect(incumbentProjectMatches).not.toContain(nativeOnlyCohortMatch);
    }
    expect(incumbentConfig.testPathIgnorePatterns).toEqual(expect.arrayContaining(['/tests/e2e/']));
  });

  test('native default config exists and is not an official coverage owner', () => {
    expect(fs.existsSync(nativeDefaultConfigPath)).toBe(true);

    const config = require(nativeDefaultConfigPath);

    expect(config.rootDir).toBe('.');
    expect(config.testEnvironment).toBe('jsdom');
    expect(config.testEnvironmentOptions).toMatchObject({
      url: 'https://notion-chrome.test/',
    });
    expect(config.transform).toEqual({});
    expect(config.transformIgnorePatterns).toEqual([]);
    expect(config.cacheDirectory).toBe('<rootDir>/.tmp/jest-cache-native-default');
    expect(config.setupFiles).toEqual(['<rootDir>/tests/native-esm/native-runner.setup.mjs']);
    expect(config.setupFilesAfterEnv).toEqual([
      '<rootDir>/tests/native-esm/native-default.after-env.mjs',
    ]);
    expect(config.moduleNameMapper).toEqual({
      '^@asamuzakjp/css-color$': '<rootDir>/tests/mocks/css-color.cjs',
    });
    expect(config.testMatch).toEqual(
      expect.arrayContaining([
        '<rootDir>/tests/native-esm/config/configConstants.native-esm.test.mjs',
      ])
    );

    expect(config).not.toHaveProperty('coverageProvider');
    expect(config).not.toHaveProperty('coverageDirectory');
    expect(config).not.toHaveProperty('coverageReporters');
    expect(config).not.toHaveProperty('collectCoverageFrom');
    expect(config).not.toHaveProperty('coverageThreshold');
  });

  test('native ESM coverage config remains the only V8 threshold owner', () => {
    const nativeDefaultConfig = require(nativeDefaultConfigPath);
    const nativeCoverageConfig = require('../../../../jest.native-esm.config.cjs');

    expect(nativeCoverageConfig.coverageProvider).toBe('v8');
    expect(nativeCoverageConfig.coverageThreshold).toEqual(
      expect.objectContaining({
        global: expect.any(Object),
      })
    );
    expect(nativeDefaultConfig).not.toHaveProperty('coverageThreshold');
  });
});
