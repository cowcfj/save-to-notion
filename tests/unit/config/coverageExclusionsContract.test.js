const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../../helpers/nodeConfigLoader.cjs');

const rootDirectory = path.resolve(__dirname, '../../..');

function normalizeCoveragePattern(pattern) {
  return pattern
    .trim()
    .replace(/^!/, '')
    .replace(/^<rootDir>\//, '')
    .replace(/^\*\*\//, '');
}

function readSonarProperties() {
  const properties = fs.readFileSync(path.join(rootDirectory, 'sonar-project.properties'), 'utf8');
  return properties
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

async function readJestCoverageExclusions() {
  const { collectCoverageFrom } = await readJestConfig();
  return new Set(
    collectCoverageFrom
      .filter(pattern => pattern.startsWith('!'))
      .map(pattern => normalizeCoveragePattern(pattern))
      .filter(Boolean)
  );
}

async function readJestProjectCacheDirectories() {
  const { projects } = await readJestConfig();
  return projects.map(project => project.cacheDirectory);
}

async function readJestConfig() {
  return loadConfig(path.join(rootDirectory, 'jest.config.js'));
}

async function readNativeEsmConfig() {
  return loadConfig(path.join(rootDirectory, 'jest.native-esm.config.cjs'));
}

async function readNativeEsmCoverageInclusions() {
  const { collectCoverageFrom } = await readNativeEsmConfig();
  return new Set(
    collectCoverageFrom
      .filter(pattern => !pattern.startsWith('!'))
      .map(pattern => normalizeCoveragePattern(pattern))
      .filter(Boolean)
  );
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function hasSonarProperty(lines, propertyName) {
  const propertyPattern = new RegExp(String.raw`^${escapeRegExp(propertyName)}\s*=`);
  return lines.some(line => propertyPattern.test(line.trim()));
}

function readSonarPropertyValue(lines, propertyName) {
  const propertyPattern = new RegExp(
    String.raw`^${escapeRegExp(propertyName)}\s*=\s*([^#]*)(?:#.*)?$`
  );
  const matchingLine = lines.findLast(line => propertyPattern.test(line.trim()));
  return matchingLine?.replace(propertyPattern, '$1').trim() ?? '';
}

function readCommaSeparatedSonarProperty(lines, propertyName) {
  return readSonarPropertyValue(lines, propertyName)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

describe('coverage exclusion contract', () => {
  test('Sonar property parser normalizes whitespace and ignores comments', () => {
    const readFileSync = jest.spyOn(fs, 'readFileSync').mockReturnValue(`
      # comment
        sonar.projectKey=cowcfj_save-to-notion

        # sonar.coverage.exclusions=legacy/**
        sonar.sources=scripts,pages
    `);

    try {
      expect(readSonarProperties()).toEqual([
        'sonar.projectKey=cowcfj_save-to-notion',
        'sonar.sources=scripts,pages',
      ]);
    } finally {
      readFileSync.mockRestore();
    }
  });

  test('Sonar property detection treats whitespace before equals as a declaration', () => {
    const sonarProperties = ['sonar.coverage.exclusions = legacy/**'];

    expect(hasSonarProperty(sonarProperties, 'sonar.coverage.exclusions')).toBe(true);
  });

  test('Sonar property values stop before inline comments', () => {
    const sonarProperties = ['sonar.sources=scripts,pages # keep source debt visible'];

    expect(readCommaSeparatedSonarProperty(sonarProperties, 'sonar.sources')).toEqual([
      'scripts',
      'pages',
    ]);
  });

  test('Sonar property parser uses the last declaration for duplicate keys', () => {
    const sonarProperties = [
      'sonar.sources=scripts,pages',
      'sonar.sources=site # override earlier declaration',
    ];

    expect(readCommaSeparatedSonarProperty(sonarProperties, 'sonar.sources')).toEqual(['site']);
  });

  test('Jest keeps production coverage exclusions explicit', async () => {
    const jestExclusions = await readJestCoverageExclusions();
    const productionCoverageExclusions = [
      'scripts/config/index.js',
      'scripts/config/extension/**/*.js',
      'scripts/config/env/build.example.js',
      'scripts/postinstall.js',
      'scripts/highlighter/ui/Toolbar.js',
      'scripts/highlighter/ui/ToolbarRuntime.js',
      'scripts/highlighter/ui/ToolbarState.js',
      'scripts/highlighter/ui/ToolbarUI.js',
      'scripts/highlighter/ui/styles/toolbarStyles.js',
      'scripts/highlighter/ui/components/ColorPicker.js',
      'scripts/highlighter/ui/components/MiniIcon.js',
      'scripts/highlighter/ui/components/ToolbarContainer.js',
    ];

    for (const pattern of productionCoverageExclusions) {
      expect({
        pattern,
        jest: jestExclusions.has(pattern),
      }).toEqual({ pattern, jest: true });
    }
  });

  test('native ESM coverage keeps the zero canary but excludes config examples', async () => {
    const nativeEsmInclusions = await readNativeEsmCoverageInclusions();

    expect(nativeEsmInclusions.has('pages/update-notification/update-notification.js')).toBe(true);
    expect(nativeEsmInclusions.has('scripts/config/env/build.example.js')).toBe(false);
    expect(nativeEsmInclusions.has('scripts/postinstall.js')).toBe(false);
  });

  test('SonarCloud automatic analysis does not declare a CI LCOV import contract', () => {
    const sonarProperties = readSonarProperties();

    expect(hasSonarProperty(sonarProperties, 'sonar.javascript.lcov.reportPaths')).toBe(false);
    expect(hasSonarProperty(sonarProperties, 'sonar.coverage.exclusions')).toBe(false);
  });

  test('unit spec files remain excluded from Jest coverage accounting', async () => {
    const jestExclusions = await readJestCoverageExclusions();

    expect(jestExclusions.has('scripts/**/*.test.js')).toBe(true);
    expect(jestExclusions.has('scripts/**/*.spec.js')).toBe(true);
  });

  test('Jest project cache directories align with the GitHub Actions cache path', async () => {
    await expect(readJestProjectCacheDirectories()).resolves.toEqual([
      '<rootDir>/.jest-cache',
      '<rootDir>/.jest-cache',
    ]);
  });

  test('Sonar source scope includes production pages and site debt', () => {
    const sonarProperties = readSonarProperties();

    const sources = readCommaSeparatedSonarProperty(sonarProperties, 'sonar.sources');
    expect(sources).toEqual(expect.arrayContaining(['scripts', 'pages', 'site']));
    expect(sources).toHaveLength(3);
  });

  test('Sonar source exclusions do not suppress test debt governance', () => {
    const sonarProperties = readSonarProperties();
    const sourceExclusions = readCommaSeparatedSonarProperty(sonarProperties, 'sonar.exclusions');

    expect(sourceExclusions).toEqual(
      expect.arrayContaining([
        'node_modules/**',
        'dist/**',
        'coverage/**',
        'playwright-report/**',
        'lib/Readability.js',
      ])
    );
    expect(sourceExclusions).not.toContain('tests/**');
    expect(sourceExclusions).not.toContain('**/*.test.js');
    expect(sourceExclusions).not.toContain('**/*.spec.js');
  });

  test('Sonar test scope remains explicit for test debt analysis', () => {
    const sonarProperties = readSonarProperties();
    const testSources = readCommaSeparatedSonarProperty(sonarProperties, 'sonar.tests');
    const testInclusions = readCommaSeparatedSonarProperty(
      sonarProperties,
      'sonar.test.inclusions'
    );

    expect(testSources).toEqual(expect.arrayContaining(['tests']));
    expect(testSources).toHaveLength(1);
    expect(testInclusions).toEqual(expect.arrayContaining(['**/*.test.js', '**/*.spec.js']));
    expect(testInclusions).toHaveLength(2);
  });
});
