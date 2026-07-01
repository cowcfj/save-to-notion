/**
 * @jest-environment node
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const probe = require('../../../tools/probe-root-esm-package-markers-core.cjs');

const projectRoot = path.resolve(__dirname, '../../..');

const writeFile = (rootDir, relativePath, content = '') => {
  const filePath = path.join(rootDir, relativePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(filePath, content, 'utf8');
};

describe('tools/probe-root-esm-package-markers.mjs', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'root-esm-marker-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('discovers production and test package markers from an explicit root', () => {
    writeFile(tempRoot, 'package.json', JSON.stringify({ type: 'commonjs' }));
    writeFile(tempRoot, 'pages/popup/package.json', JSON.stringify({ type: 'module' }));
    writeFile(tempRoot, 'scripts/content/package.json', JSON.stringify({ type: 'module' }));
    writeFile(tempRoot, 'tests/helpers/package.json', JSON.stringify({ type: 'module' }));
    writeFile(tempRoot, 'dist/package.json', JSON.stringify({ type: 'module' }));

    const markers = probe.discoverPackageMarkers(tempRoot);

    expect(markers).toEqual([
      expect.objectContaining({
        relativePath: 'pages/popup/package.json',
        scope: 'production',
        directory: 'pages/popup',
      }),
      expect.objectContaining({
        relativePath: 'scripts/content/package.json',
        scope: 'production',
        directory: 'scripts/content',
      }),
      expect.objectContaining({
        relativePath: 'tests/helpers/package.json',
        scope: 'test',
        directory: 'tests/helpers',
      }),
    ]);
  });

  test('groups markers by production and test scope', () => {
    const groups = probe.groupMarkersByScope([
      { relativePath: 'pages/options/package.json', scope: 'production' },
      { relativePath: 'scripts/performance/package.json', scope: 'production' },
      { relativePath: 'tests/unit/options/package.json', scope: 'test' },
    ]);

    expect(groups.production.map(marker => marker.relativePath)).toEqual([
      'pages/options/package.json',
      'scripts/performance/package.json',
    ]);
    expect(groups.test.map(marker => marker.relativePath)).toEqual([
      'tests/unit/options/package.json',
    ]);
  });

  test('hashes directory trees deterministically while ignoring volatile files', () => {
    const leftRoot = path.join(tempRoot, 'left');
    const rightRoot = path.join(tempRoot, 'right');
    writeFile(leftRoot, 'dist/content.bundle.js', 'const answer = 42;');
    writeFile(leftRoot, 'dist/.DS_Store', 'left volatile');
    writeFile(rightRoot, 'dist/.DS_Store', 'right volatile');
    writeFile(rightRoot, 'dist/content.bundle.js', 'const answer = 42;');

    const leftHash = probe.hashDirectoryTree(leftRoot);
    const rightHash = probe.hashDirectoryTree(rightRoot);
    expect(leftHash.digest).toBe(rightHash.digest);
    expect(leftHash.files).toEqual(rightHash.files);
  });

  test('refuses destructive probe operations against the live repo root', () => {
    expect(() => probe.assertSafeProbeRoot(projectRoot, projectRoot)).toThrow(
      /refusing to mutate the source repository/i
    );
    expect(() => probe.assertSafeProbeRoot(tempRoot, projectRoot)).not.toThrow();
  });

  test('builds a JSON summary with marker totals, command results, and comparison gates', () => {
    const summary = probe.buildProbeSummary({
      variant: 'production',
      sourceRoot: projectRoot,
      baselineRoot: path.join(tempRoot, 'baseline'),
      probeRoot: path.join(tempRoot, 'probe'),
      markers: [
        { relativePath: 'pages/popup/package.json', scope: 'production' },
        { relativePath: 'tests/helpers/package.json', scope: 'test' },
      ],
      removedMarkers: ['pages/popup/package.json'],
      commands: [{ label: 'build', command: 'npm run build:prod', status: 0 }],
      comparisons: [{ path: 'dist', status: 'match' }],
    });

    expect(summary).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        variant: 'production',
        roots: expect.objectContaining({
          source: projectRoot,
          baseline: path.join(tempRoot, 'baseline'),
          probe: path.join(tempRoot, 'probe'),
        }),
        totals: {
          productionMarkers: 1,
          testMarkers: 1,
          removedMarkers: 1,
        },
        commands: [{ label: 'build', command: 'npm run build:prod', status: 0 }],
        comparisons: [{ path: 'dist', status: 'match' }],
      })
    );
  });
});
