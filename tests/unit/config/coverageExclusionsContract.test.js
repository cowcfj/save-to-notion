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

    expect(
      sonarProperties.some(line => line.startsWith('sonar.javascript.lcov.reportPaths='))
    ).toBe(false);
    expect(sonarProperties.some(line => line.startsWith('sonar.coverage.exclusions='))).toBe(false);
  });

  test('unit spec files remain excluded from Jest coverage accounting', () => {
    const jestExclusions = readJestCoverageExclusions();

    expect(jestExclusions.has('scripts/**/*.test.js')).toBe(true);
    expect(jestExclusions.has('scripts/**/*.spec.js')).toBe(true);
  });
});
