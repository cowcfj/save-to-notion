/* eslint-disable security/detect-non-literal-fs-filename */
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../../..');
const activeWorkflowDir = path.join(rootDir, '.github/workflows');
const activeSonarWorkflow = path.join(activeWorkflowDir, 'sonarcloud.yml');

function readWorkflow(relativePath) {
  return fs.readFileSync(path.join(activeWorkflowDir, relativePath), 'utf8');
}

function readRootJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
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

    expect(rootPackageConfig['exclude-paths']).not.toEqual(
      expect.arrayContaining([
        'scripts/',
        'pages/',
        'styles/',
        'icons/',
        'auth.html',
        'manifest.json',
        'package.json',
      ])
    );
  });
});
