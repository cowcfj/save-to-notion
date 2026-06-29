const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../../..');
const nativeDefaultConfigPath = path.join(rootDir, 'jest.native-default.config.cjs');

function readPackageScripts() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  return packageJson.scripts;
}

function requireFresh(configPath) {
  delete require.cache[require.resolve(configPath)];
  return require(configPath);
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

  test('native default config exists and is not an official coverage owner', () => {
    expect(fs.existsSync(nativeDefaultConfigPath)).toBe(true);

    const config = requireFresh(nativeDefaultConfigPath);

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
    const nativeDefaultConfig = fs.existsSync(nativeDefaultConfigPath)
      ? requireFresh(nativeDefaultConfigPath)
      : {};
    const nativeCoverageConfig = requireFresh(path.join(rootDir, 'jest.native-esm.config.cjs'));

    expect(nativeCoverageConfig.coverageProvider).toBe('v8');
    expect(nativeCoverageConfig.coverageThreshold).toEqual(
      expect.objectContaining({
        global: expect.any(Object),
      })
    );
    expect(nativeDefaultConfig).not.toHaveProperty('coverageThreshold');
  });
});
