const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../../..');
const BABEL_PACKAGE_NAMES = ['babel-jest', '@babel/core', '@babel/preset-env'];
const SWC_PACKAGE_NAMES = ['@swc/core', '@swc/jest'];
const RETIRED_BABEL_CONFIG_FILE = ['babel', 'config', 'js'].join('.');
const ACTIVE_POLICY_FILES = [
  '.github/workflows/ci.yml',
  '.github/workflows/coverage-gate.yml',
  'release-please-config.json',
  'tests/contract/ci/ciPolicyContract.test.mjs',
];

function readRootText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readRootJson(relativePath) {
  return JSON.parse(readRootText(relativePath));
}

function collectTransformEntries(jestConfig) {
  const configs = [jestConfig, ...(jestConfig.projects || [])];

  return configs.flatMap(config => Object.entries(config.transform || {}));
}

describe('Jest transformer contract', () => {
  test('repo-owned devDependencies use SWC instead of direct Babel packages', () => {
    const { devDependencies } = readRootJson('package.json');

    SWC_PACKAGE_NAMES.forEach(packageName => {
      expect(devDependencies).toHaveProperty(packageName);
    });

    BABEL_PACKAGE_NAMES.forEach(packageName => {
      expect(devDependencies).not.toHaveProperty(packageName);
    });
  });

  test('default Jest JS and TS transforms are owned by @swc/jest', () => {
    const jestConfig = require('../../../jest.config.js');
    const transformEntries = collectTransformEntries(jestConfig);
    const jsTsTransforms = transformEntries.filter(([pattern]) => /\\\.\[?tj/.test(pattern));

    expect(jsTsTransforms).toHaveLength(3);
    jsTsTransforms.forEach(([, transform]) => {
      expect(Array.isArray(transform)).toBe(true);
      expect(transform[0]).toBe('@swc/jest');
      expect(transform[1]).toEqual(
        expect.objectContaining({
          sourceMaps: 'inline',
          jsc: expect.objectContaining({ target: 'es2023' }),
          module: expect.objectContaining({ type: 'commonjs' }),
        })
      );
    });
  });

  test('Jest config does not retain direct Babel transform references', () => {
    const jestConfigSource = readRootText('jest.config.js');

    BABEL_PACKAGE_NAMES.forEach(packageName => {
      expect(jestConfigSource).not.toContain(packageName);
    });
  });

  test('root Babel config has been removed', () => {
    expect(fs.existsSync(path.join(rootDir, RETIRED_BABEL_CONFIG_FILE))).toBe(false);
  });

  test('active workflow and release policy files no longer list the retired Babel config', () => {
    ACTIVE_POLICY_FILES.forEach(relativePath => {
      expect(readRootText(relativePath)).not.toContain(RETIRED_BABEL_CONFIG_FILE);
    });
  });
});
