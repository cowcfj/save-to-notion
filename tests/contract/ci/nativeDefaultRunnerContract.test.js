import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const rootDir = path.resolve(__dirname, '../../..');
const nativeDefaultConfigPath = path.join(rootDir, 'jest.native-default.config.cjs');
const require = createRequire(__filename);

const phase3NativeDefaultCohort = [
  '<rootDir>/tests/native-esm/background/handlers/backgroundHandlers.native-esm.test.mjs',
];

const phase3BNativeDefaultCohort = [
  '<rootDir>/tests/native-esm/background/services/backgroundServices.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/background/support/background-support-native-siblings.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/background/utils/backgroundUtils.native-esm.test.mjs',
  '<rootDir>/tests/native-esm/destinations/destinations.native-esm.test.mjs',
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

  test('native default allowlist includes the Phase 3 and Phase 3B proven cohorts only', () => {
    const nativeDefaultConfig = require(nativeDefaultConfigPath);

    expect(nativeDefaultConfig.testMatch).toEqual(
      expect.arrayContaining([...phase3NativeDefaultCohort, ...phase3BNativeDefaultCohort])
    );
    expect(nativeDefaultConfig.testMatch).toEqual(
      expect.not.arrayContaining(rootCommonJsCandidateProbes)
    );
  });

  test('incumbent Jest config does not directly allowlist the native-only Phase 3 cohort', () => {
    const incumbentConfig = require(path.join(rootDir, 'jest.config.js'));
    const incumbentProjectMatches = incumbentConfig.projects.flatMap(project => project.testMatch);

    expect(incumbentProjectMatches).toEqual(expect.not.arrayContaining(phase3NativeDefaultCohort));
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
