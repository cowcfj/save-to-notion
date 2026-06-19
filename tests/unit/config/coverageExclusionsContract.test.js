const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../../..');

function normalizeCoveragePattern(pattern) {
  return pattern
    .trim()
    .replace(/^!/, '')
    .replace(/^<rootDir>\//, '')
    .replace(/^\*\*\//, '');
}

function readSonarProperties() {
  const properties = fs.readFileSync(path.join(rootDir, 'sonar-project.properties'), 'utf8');
  return properties
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

function readJestCoverageExclusions() {
  const { collectCoverageFrom } = require('../../../jest.config.js');
  return new Set(
    collectCoverageFrom
      .filter(pattern => pattern.startsWith('!'))
      .map(pattern => normalizeCoveragePattern(pattern))
      .filter(Boolean)
  );
}

function readJestProjectCacheDirectories() {
  const { projects } = require('../../../jest.config.js');
  return projects.map(project => project.cacheDirectory);
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function hasSonarProperty(lines, propertyName) {
  const propertyPattern = new RegExp(String.raw`^${escapeRegExp(propertyName)}\s*=`);
  return lines.some(line => propertyPattern.test(line.trim()));
}

function readSonarPropertyValue(lines, propertyName) {
  const propertyPattern = new RegExp(String.raw`^${escapeRegExp(propertyName)}\s*=\s*(.*)$`);
  const matchingLine = lines.find(line => propertyPattern.test(line.trim()));
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

  test('Jest keeps production coverage exclusions explicit', () => {
    const jestExclusions = readJestCoverageExclusions();
    const productionCoverageExclusions = [
      'scripts/config/index.js',
      'scripts/config/extension/**/*.js',
      'scripts/highlighter/ui/Toolbar.js',
      'scripts/highlighter/ui/ToolbarRuntime.js',
      'scripts/highlighter/ui/ToolbarState.js',
      'scripts/highlighter/ui/ToolbarUI.js',
      'scripts/highlighter/ui/styles/toolbarStyles.js',
      'scripts/highlighter/ui/components/ColorPicker.js',
      'scripts/highlighter/ui/components/MiniIcon.js',
      'scripts/highlighter/ui/components/ToolbarContainer.js',
    ];

    productionCoverageExclusions.forEach(pattern => {
      expect({
        pattern,
        jest: jestExclusions.has(pattern),
      }).toEqual({ pattern, jest: true });
    });
  });

  test('SonarCloud automatic analysis does not declare a CI LCOV import contract', () => {
    const sonarProperties = readSonarProperties();

    expect(hasSonarProperty(sonarProperties, 'sonar.javascript.lcov.reportPaths')).toBe(false);
    expect(hasSonarProperty(sonarProperties, 'sonar.coverage.exclusions')).toBe(false);
  });

  test('unit spec files remain excluded from Jest coverage accounting', () => {
    const jestExclusions = readJestCoverageExclusions();

    expect(jestExclusions.has('scripts/**/*.test.js')).toBe(true);
    expect(jestExclusions.has('scripts/**/*.spec.js')).toBe(true);
  });

  test('Jest project cache directories align with the GitHub Actions cache path', () => {
    expect(readJestProjectCacheDirectories()).toEqual([
      '<rootDir>/.jest-cache',
      '<rootDir>/.jest-cache',
    ]);
  });

  test('Sonar source scope includes production pages and site debt', () => {
    const sonarProperties = readSonarProperties();

    expect(readCommaSeparatedSonarProperty(sonarProperties, 'sonar.sources')).toEqual([
      'scripts',
      'pages',
      'site',
    ]);
  });

  test('Sonar source exclusions do not suppress test debt governance', () => {
    const sonarProperties = readSonarProperties();
    const sourceExclusions = readCommaSeparatedSonarProperty(sonarProperties, 'sonar.exclusions');

    expect(sourceExclusions).toEqual([
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'lib/Readability.js',
    ]);
    expect(sourceExclusions).not.toContain('tests/**');
    expect(sourceExclusions).not.toContain('**/*.test.js');
    expect(sourceExclusions).not.toContain('**/*.spec.js');
  });

  test('Sonar test scope remains explicit for test debt analysis', () => {
    const sonarProperties = readSonarProperties();

    expect(readCommaSeparatedSonarProperty(sonarProperties, 'sonar.tests')).toEqual(['tests']);
    expect(readCommaSeparatedSonarProperty(sonarProperties, 'sonar.test.inclusions')).toEqual([
      '**/*.test.js',
      '**/*.spec.js',
    ]);
  });
});
