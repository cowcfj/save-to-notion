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

function readSonarCoverageExclusions() {
  const properties = fs.readFileSync(path.join(rootDir, 'sonar-project.properties'), 'utf8');
  const line = properties
    .split(/\r?\n/)
    .find(entry => entry.startsWith('sonar.coverage.exclusions='));
  expect(line).toBeDefined();
  return new Set(
    line
      .slice('sonar.coverage.exclusions='.length)
      .split(',')
      .map(pattern => normalizeCoveragePattern(pattern))
      .filter(Boolean)
  );
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
  test('Jest and Sonar keep production coverage exclusions aligned', () => {
    const jestExclusions = readJestCoverageExclusions();
    const sonarExclusions = readSonarCoverageExclusions();
    const productionCoverageExclusions = [
      'scripts/config/app.js',
      'scripts/config/icons.js',
      'scripts/config/ui.js',
      'scripts/config/extraction.js',
      'scripts/config/highlightConstants.js',
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
        sonar: sonarExclusions.has(pattern),
      }).toEqual({ pattern, jest: true, sonar: true });
    });
  });

  test('Sonar excludes non-production generated outputs and coverage artifacts', () => {
    const sonarExclusions = readSonarCoverageExclusions();
    ['node_modules/**', 'dist/**', 'coverage/**', 'playwright-report/**'].forEach(pattern => {
      expect({ pattern, sonar: sonarExclusions.has(pattern) }).toEqual({ pattern, sonar: true });
    });
  });

  test('unit spec files remain excluded from coverage accounting', () => {
    const jestExclusions = readJestCoverageExclusions();
    const sonarExclusions = readSonarCoverageExclusions();

    expect(jestExclusions.has('scripts/**/*.test.js')).toBe(true);
    expect(jestExclusions.has('scripts/**/*.spec.js')).toBe(true);
    expect(sonarExclusions.has('*.test.js')).toBe(true);
    expect(sonarExclusions.has('*.spec.js')).toBe(true);
    expect(sonarExclusions.has('tests/**')).toBe(true);
  });
});
