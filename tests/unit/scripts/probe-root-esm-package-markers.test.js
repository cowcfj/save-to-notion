/**
 * @jest-environment node
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const probe = require('../../../tools/probe-root-esm-package-markers-core.cjs');

const projectRoot = path.resolve(__dirname, '../../..');

const loadProbeWithSpawnSync = spawnSync => {
  jest.resetModules();
  jest.doMock('node:child_process', () => ({ spawnSync }));
  const mockedProbe = require('../../../tools/probe-root-esm-package-markers-core.cjs');
  jest.dontMock('node:child_process');
  return mockedProbe;
};

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

  describe('parseArgs', () => {
    test('parses variant and summary output paths', () => {
      expect(
        probe.parseArgs([
          '--variant=production',
          '--summary-json=coverage/root-esm/summary.json',
          '--summary-md=coverage/root-esm/summary.md',
        ])
      ).toEqual({
        variant: 'production',
        summaryJson: 'coverage/root-esm/summary.json',
        summaryMd: 'coverage/root-esm/summary.md',
        help: false,
        keepTemp: false,
      });
    });

    test('parses help without requiring a variant', () => {
      expect(probe.parseArgs(['--help'])).toEqual({
        variant: '',
        summaryJson: '',
        summaryMd: '',
        help: true,
        keepTemp: false,
      });
    });

    test('parses keep-temp for debugging probe copies', () => {
      expect(probe.parseArgs(['--variant=tests', '--keep-temp'])).toEqual(
        expect.objectContaining({
          variant: 'tests',
          keepTemp: true,
        })
      );
    });

    test('rejects unknown arguments', () => {
      expect(() => probe.parseArgs(['--variant=tests', '--unknown=true'])).toThrow(
        '未知參數：--unknown=true'
      );
    });

    test('rejects missing variant outside help mode', () => {
      expect(() => probe.parseArgs(['--summary-json=coverage/root-esm/summary.json'])).toThrow(
        '缺少必要參數：--variant'
      );
    });
  });

  test('skips excluded directories at any copied source path depth', () => {
    expect(probe.shouldCopySourcePath(tempRoot, tempRoot)).toBe(true);
    expect(
      probe.shouldCopySourcePath(tempRoot, path.join(tempRoot, 'pages/popup/package.json'))
    ).toBe(true);
    expect(
      probe.shouldCopySourcePath(tempRoot, path.join(tempRoot, 'node_modules/package.json'))
    ).toBe(false);
    expect(
      probe.shouldCopySourcePath(
        tempRoot,
        path.join(tempRoot, 'pages/popup/node_modules/pkg/index.js')
      )
    ).toBe(false);
    expect(
      probe.shouldCopySourcePath(tempRoot, path.join(tempRoot, 'scripts/dist/content.js'))
    ).toBe(false);
    expect(
      probe.shouldCopySourcePath(
        tempRoot,
        path.join(tempRoot, 'tests/fixtures/.tmp/generated.json')
      )
    ).toBe(false);
  });

  test('uses Windows junctions for node_modules links and directory symlinks elsewhere', () => {
    expect(probe.getNodeModulesLinkType('win32')).toBe('junction');
    expect(probe.getNodeModulesLinkType('darwin')).toBe('dir');
    expect(probe.getNodeModulesLinkType('linux')).toBe('dir');
  });

  test('formats user-visible Markdown summary labels in zh-TW while preserving data values', () => {
    const summary = probe.buildProbeSummary({
      variant: 'production',
      sourceRoot: projectRoot,
      baselineRoot: path.join(tempRoot, 'baseline'),
      probeRoot: path.join(tempRoot, 'probe'),
      markers: [
        {
          relativePath: 'pages/popup/package.json',
          scope: 'production',
          disposition: 'remove-at-root-esm-cutover',
        },
      ],
      removedMarkers: ['pages/popup/package.json'],
      commands: [{ label: 'build', command: 'npm run build:prod', status: 1 }],
      comparisons: [{ path: 'dist', status: 'drift' }],
      variants: [
        {
          name: 'pages-only',
          removedMarkers: ['pages/popup/package.json'],
          commands: [{ status: 1 }],
          comparisons: [{ status: 'drift' }],
        },
      ],
    });

    const markdown = probe.formatMarkdownSummary(summary);

    expect(markdown).toContain('# Root ESM package marker 探測：production');
    expect(markdown).toContain('- 產生時間：');
    expect(markdown).toContain('## 關卡');
    expect(markdown).toContain('| 關卡 | 狀態 |');
    expect(markdown).toContain('| commands-pass | fail |');
    expect(markdown).toContain('## Marker 處置');
    expect(markdown).toContain('| Marker | 範圍 | 處置 |');
    expect(markdown).toContain(
      '| `pages/popup/package.json` | production | remove-at-root-esm-cutover |'
    );
    expect(markdown).toContain('## Variant 結果');
    expect(markdown).toContain('| Variant | 移除 markers | 命令失敗數 | 輸出漂移數 |');
    expect(markdown).toContain('| pages-only | 1 | 1 | 1 |');
  });

  test('passes an explicit timeout to spawned probe commands and reports timed-out diagnostics', () => {
    const spawnSync = jest.fn(() => ({
      status: null,
      signal: 'SIGTERM',
      stdout: 'partial stdout',
      stderr: '',
      error: Object.assign(new Error('spawnSync timed out'), { code: 'ETIMEDOUT' }),
    }));
    const mockedProbe = loadProbeWithSpawnSync(spawnSync);

    const result = mockedProbe.runCommand('npm run build:prod', tempRoot);

    expect(spawnSync).toHaveBeenCalledWith(
      'npm run build:prod',
      expect.objectContaining({
        cwd: tempRoot,
        shell: true,
        timeout: expect.any(Number),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 124,
        signal: 'SIGTERM',
        stdoutTail: 'partial stdout',
        stderrTail: 'spawnSync timed out',
      })
    );
  });

  test('reuses one production baseline run and removes the temp root by default', () => {
    const sourceRoot = path.join(tempRoot, 'source');
    writeFile(sourceRoot, 'package.json', JSON.stringify({ type: 'commonjs' }));
    writeFile(sourceRoot, 'pages/popup/package.json', JSON.stringify({ type: 'module' }));
    writeFile(sourceRoot, 'scripts/content/package.json', JSON.stringify({ type: 'module' }));
    writeFile(sourceRoot, 'scripts/performance/package.json', JSON.stringify({ type: 'module' }));
    const spawnSync = jest.fn(() => ({
      status: 0,
      signal: null,
      stdout: '',
      stderr: '',
    }));
    const mockedProbe = loadProbeWithSpawnSync(spawnSync);

    const summary = mockedProbe.runProbe({ variant: 'production' }, sourceRoot);
    const probeTempRoot = path.dirname(summary.roots.baseline);

    expect(spawnSync).toHaveBeenCalledTimes(10);
    expect(new Set(summary.variants.map(variant => variant.roots.baseline))).toEqual(
      new Set([summary.roots.baseline])
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    expect(fs.existsSync(probeTempRoot)).toBe(false);
  });

  test('guards direct ESM execution when process.argv[1] is absent', () => {
    const wrapperSource = fs.readFileSync(
      path.join(projectRoot, 'tools/probe-root-esm-package-markers.mjs'),
      'utf8'
    );

    expect(wrapperSource).toContain('process.argv[1] &&');
    expect(wrapperSource).toContain('pathToFileURL(process.argv[1]).href');
  });
});
