import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import nodeConfigLoader from '../../../helpers/nodeConfigLoader.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../..');
const nativeDefaultConfigPath = path.join(rootDir, 'jest.native-default.config.js');
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

const incumbentOwnerMjsPatterns = [
  '<rootDir>/tests/unit/incumbent/**/*.test.mjs',
  '<rootDir>/tests/contract/incumbent/**/*.test.mjs',
  '<rootDir>/tests/integration/incumbent/**/*.test.mjs',
];

const retiredIncumbentOwnerExactEntries = [
  '<rootDir>/tests/unit/incumbent/helpers/**/*.test.mjs',
  '<rootDir>/tests/integration/incumbent/helpers/**/*.test.mjs',
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

const phase2BRemovedIncumbentOwnedSuites = [
  '<rootDir>/tests/unit/background/core-functions.test.js',
  '<rootDir>/tests/unit/background/image-processing.test.js',
  '<rootDir>/tests/unit/highlighter/highlighter-path-compression.test.js',
  '<rootDir>/tests/unit/highlighter/highlighter-storage-optimization.test.js',
];

const phase2BNativeDefaultOwnerPathEntries = [
  '<rootDir>/tests/unit/native-default/config/messages.test.js',
  '<rootDir>/tests/unit/native-default/config/storageKeys.test.js',
  '<rootDir>/tests/unit/native-default/utils/normalizeUrl.test.js',
  '<rootDir>/tests/unit/native-default/background/buildHighlightBlocks.test.js',
  '<rootDir>/tests/unit/native-default/utils/pageComplexityDetector.node-env.test.js',
  '<rootDir>/tests/unit/native-default/utils/splitTextForHighlight.test.js',
  '<rootDir>/tests/unit/native-default/background/processContentResult.test.js',
  '<rootDir>/tests/unit/native-default/performance/PerformanceOptimizer.batchProcessing.test.js',
];

const rootCommonJsRetainedCutoverCandidates = [
  '<rootDir>/tests/unit/performance/timingHelpers.test.js',
];

const nativeEsmCrossLaneSentinelEntries = [
  '<rootDir>/tests/native-esm/background/handlers/backgroundHandlers.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/background/services/backgroundServices.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/background/support/background-support-native-siblings.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/background/utils/backgroundUtils.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/config/configConstants.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/destinations/destinations.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/highlighter/utils/domText.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/highlighter/utils/pureUtils.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/utils/root-url-and-page-complexity.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/utils/root-utils-runtime.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/utils/rootUtils.native-esm.test.mjs',
];

const nativeDefaultOwnerPathEntries = [
  '<rootDir>/tests/contract/native-default/ci/nativeDefaultRunnerContract.test.mjs',
  '<rootDir>/tests/contract/native-default/ci/report-native-default-runner-blockers.test.mjs',
  '<rootDir>/tests/integration/native-default/background/background-require.integration.test.mjs',
  '<rootDir>/tests/unit/native-default/config/env.test.mjs',
  '<rootDir>/tests/unit/native-default/config/messages.test.js',
  '<rootDir>/tests/unit/native-default/config/storageKeys.test.js',
  '<rootDir>/tests/unit/native-default/content/content-script.require.test.mjs',
  '<rootDir>/tests/unit/native-default/utils/normalizeUrl.test.js',
  '<rootDir>/tests/unit/native-default/background/buildHighlightBlocks.test.js',
  '<rootDir>/tests/unit/native-default/utils/pageComplexityDetector.node-env.test.js',
  '<rootDir>/tests/unit/native-default/utils/splitTextForHighlight.test.js',
  '<rootDir>/tests/unit/native-default/background/processContentResult.test.js',
  '<rootDir>/tests/unit/native-default/performance/PerformanceOptimizer.advanced.test.mjs',
  '<rootDir>/tests/unit/native-default/performance/PerformanceOptimizer.batchProcessing.test.js',
  '<rootDir>/tests/unit/native-default/scripts/assert-native-esm-line-hits.test.mjs',
  '<rootDir>/tests/unit/native-default/scripts/postinstall.test.cjs',
  '<rootDir>/tests/unit/native-default/scripts/report-native-esm-scope-parity.test.mjs',
];

const retainedBackgroundEntrypointHarnessEntries = [
  '<rootDir>/tests/unit/background/extension-lifecycle.test.cjs',
  '<rootDir>/tests/unit/background.test.cjs',
];

function readPackageScripts() {
  return readPackageJson().scripts;
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

async function importRootConfig(configPath) {
  const importedConfig = await import(pathToFileURL(configPath).href);
  return importedConfig.default ?? importedConfig;
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
      'NODE_OPTIONS=--experimental-vm-modules jest --config jest.native-default.config.js'
    );
    expect(scripts['test:quick:native']).toBe(
      'NODE_OPTIONS=--experimental-vm-modules jest --config jest.native-default.config.js --onlyChanged'
    );
  });

  test('coverage and CI scripts remain on the official native ESM V8 lane', () => {
    const scripts = readPackageScripts();

    expect(scripts['test:coverage']).toBe('npm run test:coverage:native-esm:assert');
    expect(scripts['test:ci']).toBe('npm run test:coverage:native-esm:assert');
    expect(scripts['test:coverage:native-esm']).toContain(
      'jest --config jest.native-esm.config.js --ci --coverage'
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

  test('native default allowlist includes proven cohorts and excludes retained root-cutover probes', async () => {
    const nativeDefaultConfig = await importRootConfig(nativeDefaultConfigPath);

    expect(nativeDefaultConfig.testMatch).toEqual(
      expect.arrayContaining([
        ...phase3NativeDefaultCohort,
        ...phase3BNativeDefaultCohort,
        ...nativeDefaultOwnerPathEntries,
        ...retainedBackgroundEntrypointHarnessEntries,
        ...nativeEsmCrossLaneSentinelEntries,
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
    expect(nativeDefaultConfig.testMatch).toEqual(
      expect.not.arrayContaining(phase2BRemovedIncumbentOwnedSuites)
    );
  });

  test('incumbent Jest config owns mainstream correctness .mjs suites through owner globs and still excludes native-esm-only cohorts', async () => {
    const incumbentConfig = await loadConfig(path.join(rootDir, 'jest.config.js'));
    const incumbentProjectMatches = incumbentConfig.projects.flatMap(project => project.testMatch);

    expect(incumbentProjectMatches).toEqual(expect.arrayContaining(incumbentOwnerMjsPatterns));
    expect(incumbentProjectMatches).toEqual(
      expect.not.arrayContaining(retiredIncumbentOwnerExactEntries)
    );
    for (const nativeOnlyCohortMatch of [
      ...phase3NativeDefaultCohort,
      ...phase3BNativeDefaultCohort,
    ]) {
      expect(incumbentProjectMatches).not.toContain(nativeOnlyCohortMatch);
    }
    expect(incumbentConfig.testPathIgnorePatterns).toEqual(expect.arrayContaining(['/tests/e2e/']));
  });

  test('native default config exists and is not an official coverage owner', async () => {
    expect(fs.existsSync(nativeDefaultConfigPath)).toBe(true);

    const config = await importRootConfig(nativeDefaultConfigPath);

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
        ...nativeDefaultOwnerPathEntries,
        ...retainedBackgroundEntrypointHarnessEntries,
        ...nativeEsmCrossLaneSentinelEntries,
      ])
    );
    expect(config.testMatch.filter(entry => entry.includes('/native-default/'))).toEqual(
      nativeDefaultOwnerPathEntries
    );
    expect(config.testMatch.filter(entry => entry.includes('/tests/native-esm/'))).toEqual(
      nativeEsmCrossLaneSentinelEntries
    );
    expect(
      config.testMatch.filter(
        entry => entry.includes('/tests/unit/') && !entry.includes('/native-default/')
      )
    ).toEqual(retainedBackgroundEntrypointHarnessEntries);

    expect(config).not.toHaveProperty('coverageProvider');
    expect(config).not.toHaveProperty('coverageDirectory');
    expect(config).not.toHaveProperty('coverageReporters');
    expect(config).not.toHaveProperty('collectCoverageFrom');
    expect(config).not.toHaveProperty('coverageThreshold');
  });

  test('native ESM coverage config remains the only V8 threshold owner', async () => {
    const nativeDefaultConfig = await importRootConfig(nativeDefaultConfigPath);
    const nativeCoverageConfig = await importRootConfig(
      path.join(rootDir, 'jest.native-esm.config.js')
    );

    expect(nativeCoverageConfig.coverageProvider).toBe('v8');
    expect(nativeCoverageConfig.coverageThreshold).toEqual(
      expect.objectContaining({
        global: expect.any(Object),
      })
    );
    expect(nativeDefaultConfig).not.toHaveProperty('coverageThreshold');
  });
});
