import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
const nativeDefaultConfigPath = path.join(rootDir, 'jest.native-default.config.cjs');
const require = createRequire(import.meta.url);
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

const phase3DPolicyLifecycleCohort = [
  '<rootDir>/tests/contract/ci/ciPolicyContract.test.mjs',
  '<rootDir>/tests/contract/ci/nativeDefaultRunnerContract.test.mjs',
  '<rootDir>/tests/contract/ci/report-native-default-runner-blockers.test.mjs',
  '<rootDir>/tests/contract/module-surfaces/RetryManager.contract.test.mjs',
  '<rootDir>/tests/integration/background/background-require.integration.test.mjs',
  '<rootDir>/tests/integration/helpers/integration-test-helper.test.mjs',
  '<rootDir>/tests/unit/config/auth.callback-page.test.js',
  '<rootDir>/tests/unit/config/coverageExclusionsContract.test.js',
  '<rootDir>/tests/unit/config/env.test.mjs',
  '<rootDir>/tests/unit/config/manifest.auth.test.js',
  '<rootDir>/tests/unit/config/manifest.permissions.test.js',
  '<rootDir>/tests/unit/helpers/storageServiceTestHarness.test.mjs',
  '<rootDir>/tests/unit/scripts/assert-native-esm-line-hits.test.mjs',
  '<rootDir>/tests/unit/scripts/check-message-boundaries.test.js',
  '<rootDir>/tests/unit/scripts/check-size-gates.test.mjs',
  '<rootDir>/tests/unit/scripts/inject-manifest-key.test.mjs',
  '<rootDir>/tests/unit/scripts/package-extension.test.mjs',
  '<rootDir>/tests/unit/scripts/postinstall.test.js',
  '<rootDir>/tests/unit/scripts/report-native-esm-scope-parity.test.mjs',
  '<rootDir>/tests/unit/utils.dateFormat.test.js',
  '<rootDir>/tests/unit/utils/chrome-mock.test.js',
  '<rootDir>/tests/unit/utils/css-color-mock-shape.test.js',
];

const retiredIncumbentCoverageSurfaces = [
  retiredIncumbentCoverageScript,
  retiredIncumbentCiScript,
  retiredThresholdSimulationScript,
];

const retiredThresholdSimulationSuites = [
  `<rootDir>/tests/unit/scripts/${retiredThresholdSimulationTestFile}`,
];

const phase2ProbePassingNativeDefaultCohort = [
  '<rootDir>/tests/unit/background/core-functions.test.js',
  '<rootDir>/tests/unit/background/image-processing.test.js',
  '<rootDir>/tests/unit/helpers/performanceOptimizerTestHarness.test.mjs',
  '<rootDir>/tests/unit/highlighter/highlighter-path-compression.test.js',
  '<rootDir>/tests/unit/highlighter/highlighter-storage-optimization.test.js',
  '<rootDir>/tests/unit/performance/PerformanceOptimizer.comprehensive.test.mjs',
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

const rootCommonJsCandidateProbes = [
  '<rootDir>/tests/unit/background/background-state.test.js',
  '<rootDir>/tests/unit/utils/securityUtils.test.js',
];

function readPackageScripts() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  return packageJson.scripts;
}

describe('native default Jest runner contract', () => {
  test('incumbent default scripts remain on jest.config.js', () => {
    const scripts = readPackageScripts();

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

  test('native default allowlist includes the proven native and no-Babel policy/lifecycle cohorts only', () => {
    const nativeDefaultConfig = require(nativeDefaultConfigPath);

    expect(nativeDefaultConfig.testMatch).toEqual(
      expect.arrayContaining([
        ...phase3NativeDefaultCohort,
        ...phase3BNativeDefaultCohort,
        ...phase3DPolicyLifecycleCohort,
        ...phase2ProbePassingNativeDefaultCohort,
        ...cjsEsmRequireProductionEsmCohort,
        ...cjsEsmRequireProductionEsmCohort2,
      ])
    );
    expect(nativeDefaultConfig.testMatch).toEqual(
      expect.not.arrayContaining(rootCommonJsCandidateProbes)
    );
    expect(nativeDefaultConfig.testMatch).toEqual(
      expect.not.arrayContaining(retiredThresholdSimulationSuites)
    );
  });

  test('incumbent Jest config does not directly allowlist the native-only Phase 3 and Phase 3B cohorts', () => {
    const incumbentConfig = require(path.join(rootDir, 'jest.config.js'));
    const incumbentProjectMatches = incumbentConfig.projects.flatMap(project => project.testMatch);

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
    const nativeCoverageConfig = require('../../../jest.native-esm.config.cjs');

    expect(nativeCoverageConfig.coverageProvider).toBe('v8');
    expect(nativeCoverageConfig.coverageThreshold).toEqual(
      expect.objectContaining({
        global: expect.any(Object),
      })
    );
    expect(nativeDefaultConfig).not.toHaveProperty('coverageThreshold');
  });
});
