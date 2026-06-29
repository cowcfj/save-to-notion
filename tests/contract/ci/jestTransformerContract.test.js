import fs from 'node:fs';

import jestConfig from '../../../jest.config.js';
import packageJson from '../../../package.json';

const BABEL_PACKAGE_NAMES = ['babel-jest', '@babel/core', '@babel/preset-env'];
const SWC_PACKAGE_NAMES = ['@swc/core', '@swc/jest'];
const RETIRED_BABEL_CONFIG_FILE = 'babel.config.js';

function collectTransformEntries(jestConfig) {
  const configs = [jestConfig, ...(jestConfig.projects || [])];

  return configs.flatMap(config => Object.entries(config.transform || {}));
}

describe('Jest transformer contract', () => {
  test('repo-owned devDependencies use SWC instead of direct Babel packages', () => {
    const { devDependencies } = packageJson;

    SWC_PACKAGE_NAMES.forEach(packageName => {
      expect(devDependencies).toHaveProperty(packageName);
    });

    BABEL_PACKAGE_NAMES.forEach(packageName => {
      expect(devDependencies).not.toHaveProperty(packageName);
    });
  });

  test('default Jest JS and TS transforms are owned by @swc/jest', () => {
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
    const jestConfigSource = fs.readFileSync('jest.config.js', 'utf8');

    BABEL_PACKAGE_NAMES.forEach(packageName => {
      expect(jestConfigSource).not.toContain(packageName);
    });
  });

  test('root Babel config has been removed', () => {
    expect(fs.existsSync('babel.config.js')).toBe(false);
  });

  test('active workflow and release policy files no longer list the retired Babel config', () => {
    [
      fs.readFileSync('.github/workflows/ci.yml', 'utf8'),
      fs.readFileSync('.github/workflows/coverage-gate.yml', 'utf8'),
      fs.readFileSync('release-please-config.json', 'utf8'),
      fs.readFileSync('tests/contract/ci/ciPolicyContract.test.mjs', 'utf8'),
    ].forEach(policyFileSource => {
      expect(policyFileSource).not.toContain(RETIRED_BABEL_CONFIG_FILE);
    });
  });
});
