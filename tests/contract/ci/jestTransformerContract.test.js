import fs from 'node:fs';

import jestConfig from '../../../jest.config.js';
import packageJson from '../../../package.json';

const BABEL_PACKAGE_NAMES = ['babel-jest', '@babel/core', '@babel/preset-env'];
const SWC_PACKAGE_NAMES = ['@swc/core', '@swc/jest'];
const RETIRED_BABEL_CONFIG_FILE = 'babel.config.js';
const JS_TS_TRANSFORM_FIXTURE_PATHS = [
  'transform-fixture.js',
  'transform-fixture.jsx',
  'transform-fixture.ts',
  'transform-fixture.tsx',
];
const ESM_TRANSFORM_IGNORE_PATTERNS = [
  String.raw`node_modules/(?!(jsdom|@exodus|html-encoding-sniffer|@notionhq|parse5|@jest|jest-environment-jsdom|whatwg-url|tr46|webidl-conversions|data-urls|decimal.js|punycode|entities|nwsapi|saxes|cssstyle|rrweb-cssom|symbol-tree|@asamuzakjp\/css-color)/)`,
];
const EXPECTED_SETUP_FILES = ['<rootDir>/tests/presetup.cjs'];
const EXPECTED_SETUP_FILES_AFTER_ENV = ['<rootDir>/tests/setup.cjs'];
const EXPECTED_MODULE_NAME_MAPPER = {
  '^chrome$': '<rootDir>/tests/mocks/chrome.cjs',
  '^@asamuzakjp/css-color$': '<rootDir>/tests/mocks/css-color.cjs',
};

function collectJestConfigs(jestConfig) {
  return [jestConfig, ...(jestConfig.projects || [])];
}

function collectTransformEntries(jestConfig) {
  const configs = collectJestConfigs(jestConfig);

  return configs.flatMap(config => Object.entries(config.transform || {}));
}

function collectTransformIgnorePatterns(jestConfig) {
  const configs = collectJestConfigs(jestConfig);

  return configs.map(config => config.transformIgnorePatterns);
}

function matchesJsTsTransformPattern(pattern) {
  const transformPattern = new RegExp(pattern);

  return JS_TS_TRANSFORM_FIXTURE_PATHS.every(filePath => transformPattern.test(filePath));
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
    const jsTsTransforms = transformEntries.filter(([pattern]) =>
      matchesJsTsTransformPattern(pattern)
    );

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

  test('default Jest ESM transform allowlist stays explicit', () => {
    const transformIgnorePatternSets = collectTransformIgnorePatterns(jestConfig);

    expect(transformIgnorePatternSets).toHaveLength(3);
    transformIgnorePatternSets.forEach(patterns => {
      expect(patterns).toEqual(ESM_TRANSFORM_IGNORE_PATTERNS);
    });
  });

  test('default Jest setup files are explicit CommonJS containment files', () => {
    const configs = collectJestConfigs(jestConfig);

    expect(configs).toHaveLength(3);
    configs.forEach(config => {
      expect(config.setupFiles).toEqual(EXPECTED_SETUP_FILES);
      expect(config.setupFilesAfterEnv).toEqual(EXPECTED_SETUP_FILES_AFTER_ENV);
    });
  });

  test('default Jest shared mock mappers are explicit CommonJS containment files', () => {
    const configs = collectJestConfigs(jestConfig);

    expect(configs).toHaveLength(3);
    configs.forEach(config => {
      expect(config.moduleNameMapper).toEqual(EXPECTED_MODULE_NAME_MAPPER);
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
