/**
 * @jest-environment node
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import probe from '../../../tools/probe-root-esm-package-markers-core.cjs';

const testFilePath = fileURLToPath(import.meta.url);
const testDirectory = path.dirname(testFilePath);
const projectRoot = path.resolve(testDirectory, '../../..');

const loadProbeWithSpawnSync = async spawnSync => {
  let mockedProbe;
  await jest.isolateModulesAsync(async () => {
    jest.doMock('node:child_process', () => ({ spawnSync }));
    try {
      const importedProbe = await import('../../../tools/probe-root-esm-package-markers-core.cjs');
      mockedProbe = importedProbe.default ?? importedProbe;
    } finally {
      jest.dontMock('node:child_process');
    }
  });
  return mockedProbe;
};

const writeFile = (rootDirectory, relativePath, content = '') => {
  const filePath = path.join(rootDirectory, relativePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(filePath, content, 'utf8');
};

const readUtf8File = filePath => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readFileSync(filePath, 'utf8');
};

const readJsonFile = filePath => JSON.parse(readUtf8File(filePath));

const pathExists = filePath => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.existsSync(filePath);
};

const createCutoverSourceFixture = rootDirectory => {
  const sourceRoot = path.join(rootDirectory, 'source');
  writeFile(
    sourceRoot,
    'package.json',
    JSON.stringify({ type: 'commonjs', scripts: { test: 'jest --config jest.config.js' } })
  );
  writeFile(sourceRoot, 'pages/popup/package.json', JSON.stringify({ type: 'module' }));
  writeFile(sourceRoot, 'scripts/content/package.json', JSON.stringify({ type: 'module' }));
  writeFile(sourceRoot, 'tests/helpers/package.json', JSON.stringify({ type: 'module' }));
  writeFile(
    sourceRoot,
    'scripts/postinstall.js',
    [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "console.log(path.join('scripts', fs.existsSync('package.json') ? 'ok' : 'missing'));",
    ].join('\n')
  );
  writeFile(
    sourceRoot,
    'jest.config.js',
    [
      'const SWC_JEST_TRANSFORM = [',
      "  '@swc/jest',",
      '  { module: { type: "commonjs" } },',
      '];',
      'module.exports = {',
      String.raw`  transform: { '^.+\\.[tj]sx?$': SWC_JEST_TRANSFORM },`,
      '};',
    ].join('\n')
  );

  return sourceRoot;
};

const createSuccessfulSpawnSync = () =>
  jest.fn(() => ({
    status: 0,
    signal: null,
    stdout: '',
    stderr: '',
  }));

const createMarkerProbeSourceFixture = rootDirectory => {
  const sourceRoot = path.join(rootDirectory, 'marker-source');
  writeFile(sourceRoot, 'package.json', JSON.stringify({ type: 'commonjs' }));
  writeFile(sourceRoot, 'tests/helpers/package.json', JSON.stringify({ type: 'module' }));
  writeFile(sourceRoot, 'tests/unit/security/package.json', JSON.stringify({ type: 'commonjs' }));
  writeFile(sourceRoot, 'pages/popup/package.json', JSON.stringify({ type: 'module' }));
  return sourceRoot;
};

const runCutoverCoreProbe = async sourceRoot => {
  const spawnSync = createSuccessfulSpawnSync();
  const mockedProbe = await loadProbeWithSpawnSync(spawnSync);
  const summary = mockedProbe.runProbe({ variant: 'cutover-core', keepTemp: true }, sourceRoot);

  return {
    summary,
    spawnSync,
    probeTempRoot: path.dirname(summary.roots.probe),
  };
};

const readCutoverProbeArtifacts = summary => ({
  baselinePackage: readJsonFile(path.join(summary.roots.baseline, 'package.json')),
  probePackage: readJsonFile(path.join(summary.roots.probe, 'package.json')),
  probePostinstall: readUtf8File(path.join(summary.roots.probe, 'scripts/postinstall.js')),
  probeJestConfig: readUtf8File(path.join(summary.roots.probe, 'jest.config.js')),
});

const expectCutoverPackageMarkers = (summary, artifacts) => {
  expect(artifacts.baselinePackage.type).toBe('commonjs');
  expect(artifacts.probePackage.type).toBe('module');
  expect(pathExists(path.join(summary.roots.baseline, 'pages/popup/package.json'))).toBe(true);
  expect(pathExists(path.join(summary.roots.probe, 'pages/popup/package.json'))).toBe(false);
  expect(pathExists(path.join(summary.roots.probe, 'tests/helpers/package.json'))).toBe(true);
};

const expectCutoverConfigTransforms = artifacts => {
  expect(artifacts.probePostinstall).toContain("import fs from 'node:fs';");
  expect(artifacts.probePostinstall).toContain("import path from 'node:path';");
  expect(artifacts.probePostinstall).not.toContain("require('node:fs')");
  expect(artifacts.probeJestConfig).toContain('const config = {');
  expect(artifacts.probeJestConfig).toContain('export default config;');
  expect(artifacts.probeJestConfig).not.toContain('module.exports');
};

const expectCutoverSummary = summary => {
  expect(summary.variants).toEqual([
    expect.objectContaining({
      name: 'cutover-core',
      kind: 'cutover-rehearsal',
      removedMarkers: ['pages/popup/package.json', 'scripts/content/package.json'],
      actions: expect.arrayContaining([
        'set-root-package-type-module',
        'transform-scripts-postinstall-to-esm',
        'transform-jest-config-to-esm',
      ]),
    }),
  ]);
  expect(summary.gates).toEqual(
    expect.arrayContaining([{ id: 'cutover-core-cutover-rehearsal', status: 'pass' }])
  );
};

const expectCutoverPostinstallCommand = (spawnSync, summary) => {
  expect(spawnSync).toHaveBeenCalledWith(
    'node scripts/postinstall.js',
    expect.objectContaining({ cwd: summary.roots.probe })
  );
};

describe('tools/probe-root-esm-package-markers.mjs', () => {
  let temporaryRoot;

  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'root-esm-marker-test-'));
  });

  afterEach(() => {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  test('resolves the project root from the test module location', () => {
    expect(path.relative(projectRoot, testFilePath)).toBe(
      path.join('tests', 'contract', 'ci', 'probe-root-esm-package-markers.contract.test.js')
    );
  });

  test('discovers production and test package markers from an explicit root', () => {
    writeFile(temporaryRoot, 'package.json', JSON.stringify({ type: 'commonjs' }));
    writeFile(temporaryRoot, 'pages/popup/package.json', JSON.stringify({ type: 'module' }));
    writeFile(temporaryRoot, 'scripts/content/package.json', JSON.stringify({ type: 'module' }));
    writeFile(temporaryRoot, 'tests/helpers/package.json', JSON.stringify({ type: 'module' }));
    writeFile(temporaryRoot, 'dist/package.json', JSON.stringify({ type: 'module' }));

    const markers = probe.discoverPackageMarkers(temporaryRoot);

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
    const leftRoot = path.join(temporaryRoot, 'left');
    const rightRoot = path.join(temporaryRoot, 'right');
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
      '拒絕將來源 repository 當作 probe root 進行變更。'
    );
    expect(() => probe.assertSafeProbeRoot(temporaryRoot, projectRoot)).not.toThrow();
  });

  test('builds a JSON summary with marker totals, command results, and comparison gates', () => {
    const baselineRoot = path.join(temporaryRoot, 'baseline');
    const probeRoot = path.join(temporaryRoot, 'probe');
    const summary = probe.buildProbeSummary({
      variant: 'production',
      sourceRoot: projectRoot,
      baselineRoot,
      probeRoot,
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
          baseline: baselineRoot,
          probe: probeRoot,
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
        removeMarkers: [],
        help: false,
        keepTemp: false,
      });
    });

    test('parses help without requiring a variant', () => {
      expect(probe.parseArgs(['--help'])).toEqual({
        variant: '',
        summaryJson: '',
        summaryMd: '',
        removeMarkers: [],
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

    test('parses repeated explicit marker removals', () => {
      expect(
        probe.parseArgs([
          '--variant=tests',
          '--remove-marker=tests/helpers/package.json',
          '--remove-marker=tests/unit/security/package.json',
        ])
      ).toEqual(
        expect.objectContaining({
          removeMarkers: ['tests/helpers/package.json', 'tests/unit/security/package.json'],
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
    expect(probe.shouldCopySourcePath(temporaryRoot, temporaryRoot)).toBe(true);
    expect(
      probe.shouldCopySourcePath(
        temporaryRoot,
        path.join(temporaryRoot, 'pages/popup/package.json')
      )
    ).toBe(true);
    expect(
      probe.shouldCopySourcePath(
        temporaryRoot,
        path.join(temporaryRoot, 'node_modules/package.json')
      )
    ).toBe(false);
    expect(
      probe.shouldCopySourcePath(
        temporaryRoot,
        path.join(temporaryRoot, 'pages/popup/node_modules/pkg/index.js')
      )
    ).toBe(false);
    expect(
      probe.shouldCopySourcePath(temporaryRoot, path.join(temporaryRoot, 'scripts/dist/content.js'))
    ).toBe(false);
    expect(
      probe.shouldCopySourcePath(
        temporaryRoot,
        path.join(temporaryRoot, 'tests/fixtures/.tmp/generated.json')
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
      baselineRoot: path.join(temporaryRoot, 'baseline'),
      probeRoot: path.join(temporaryRoot, 'probe'),
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

    expect(markdown).toContain('# Root ESM 套件標記探測：production');
    expect(markdown).toContain('- 產生時間：');
    expect(markdown).toContain('- production 標記數：1');
    expect(markdown).toContain('- test 標記數：0');
    expect(markdown).toContain('- 已選變體移除標記數：1');
    expect(markdown).toContain('## 關卡');
    expect(markdown).toContain('| 關卡 | 狀態 |');
    expect(markdown).toContain('| commands-pass | 失敗 |');
    expect(markdown).toContain('## 套件標記處置');
    expect(markdown).toContain('| 套件標記 | 範圍 | 處置 |');
    expect(markdown).toContain(
      '| `pages/popup/package.json` | production | remove-at-root-esm-cutover |'
    );
    expect(markdown).toContain('## 變體結果');
    expect(markdown).toContain('| 變體 | 移除標記數 | 命令失敗數 | 輸出漂移數 |');
    expect(markdown).toContain('| pages-only | 1 | 1 | 1 |');
  });

  test('cutover-core rehearses root type and config transforms only in the probe copy', async () => {
    expect.hasAssertions();

    const sourceRoot = createCutoverSourceFixture(temporaryRoot);
    const { summary, spawnSync, probeTempRoot } = await runCutoverCoreProbe(sourceRoot);

    try {
      expect(summary.variants).toHaveLength(1);
      const artifacts = readCutoverProbeArtifacts(summary);
      expectCutoverPackageMarkers(summary, artifacts);
      expectCutoverConfigTransforms(artifacts);
      expectCutoverSummary(summary);
      expectCutoverPostinstallCommand(spawnSync, summary);
    } finally {
      fs.rmSync(probeTempRoot, { recursive: true, force: true });
    }
  });

  test('removes only explicit test markers in the probe copy', async () => {
    expect.hasAssertions();

    const sourceRoot = createMarkerProbeSourceFixture(temporaryRoot);
    const spawnSync = createSuccessfulSpawnSync();
    const mockedProbe = await loadProbeWithSpawnSync(spawnSync);
    const summary = mockedProbe.runProbe(
      {
        variant: 'tests',
        removeMarkers: ['tests/unit/security/package.json'],
        keepTemp: true,
      },
      sourceRoot
    );
    const probeTemporaryRoot = path.dirname(summary.roots.probe);

    try {
      expect(summary.totals.testMarkers).toBe(2);
      expect(summary.removedMarkers).toEqual(['tests/unit/security/package.json']);
      expect(summary.variants).toEqual([
        expect.objectContaining({
          name: 'tests',
          removedMarkers: ['tests/unit/security/package.json'],
        }),
      ]);
      expect(pathExists(path.join(sourceRoot, 'tests/unit/security/package.json'))).toBe(true);
      expect(
        pathExists(path.join(summary.roots.baseline, 'tests/unit/security/package.json'))
      ).toBe(true);
      expect(pathExists(path.join(summary.roots.probe, 'tests/unit/security/package.json'))).toBe(
        false
      );
      expect(pathExists(path.join(summary.roots.probe, 'tests/helpers/package.json'))).toBe(true);
    } finally {
      fs.rmSync(probeTemporaryRoot, { recursive: true, force: true });
    }
  });

  test('rejects explicit marker paths outside discovered test markers', async () => {
    const sourceRoot = createMarkerProbeSourceFixture(temporaryRoot);
    const mockedProbe = await loadProbeWithSpawnSync(createSuccessfulSpawnSync());

    expect(() =>
      mockedProbe.runProbe(
        {
          variant: 'tests',
          removeMarkers: ['tests/unit/missing/package.json'],
        },
        sourceRoot
      )
    ).toThrow('未知或非 tests/** package marker：tests/unit/missing/package.json');
    expect(() =>
      mockedProbe.runProbe(
        {
          variant: 'tests',
          removeMarkers: ['pages/popup/package.json'],
        },
        sourceRoot
      )
    ).toThrow('未知或非 tests/** package marker：pages/popup/package.json');
  });

  test('lists every invalid explicit marker path before rejecting', async () => {
    const sourceRoot = createMarkerProbeSourceFixture(temporaryRoot);
    const mockedProbe = await loadProbeWithSpawnSync(createSuccessfulSpawnSync());

    expect(() =>
      mockedProbe.runProbe(
        {
          variant: 'tests',
          removeMarkers: ['tests/unit/missing/package.json', 'pages/popup/package.json'],
        },
        sourceRoot
      )
    ).toThrow(
      /未知或非 tests\/\*\* package marker：tests\/unit\/missing\/package\.json[\s\S]*pages\/popup\/package\.json/
    );
  });

  test('rejects explicit marker removals outside the tests variant', async () => {
    const sourceRoot = createMarkerProbeSourceFixture(temporaryRoot);
    const mockedProbe = await loadProbeWithSpawnSync(createSuccessfulSpawnSync());

    expect(() =>
      mockedProbe.runProbe(
        {
          variant: 'production',
          removeMarkers: ['tests/helpers/package.json'],
        },
        sourceRoot
      )
    ).toThrow('--remove-marker 只支援 --variant=tests');
  });

  test('cutover package-output gate fails when output comparison drifts', () => {
    const summary = probe.buildProbeSummary({
      variant: 'cutover-package-output',
      sourceRoot: projectRoot,
      baselineRoot: path.join(temporaryRoot, 'baseline'),
      probeRoot: path.join(temporaryRoot, 'probe'),
      markers: [],
      removedMarkers: [],
      variants: [
        {
          name: 'cutover-package-output',
          kind: 'cutover-rehearsal',
          commands: [{ status: 0 }],
          comparisons: [
            { path: 'dist', status: 'match' },
            { path: '.tmp/extension-unpacked', status: 'drift' },
          ],
        },
      ],
    });

    expect(summary.gates).toEqual(
      expect.arrayContaining([{ id: 'cutover-package-output-cutover-rehearsal', status: 'fail' }])
    );
  });

  test('cutover transform helpers refuse to run against the source repository root', () => {
    expect(() => probe.applyCutoverTransforms(projectRoot, projectRoot)).toThrow(
      '拒絕將來源 repository 當作 probe root 進行變更。'
    );
  });

  test('cutover transform source mismatch errors are user-visible zh-TW', () => {
    const sourceRoot = path.join(temporaryRoot, 'source');
    const probeRoot = path.join(temporaryRoot, 'probe');
    writeFile(sourceRoot, 'package.json', JSON.stringify({ type: 'commonjs' }));
    writeFile(sourceRoot, 'scripts/postinstall.js', "console.log('沒有 require source');");
    writeFile(probeRoot, 'package.json', JSON.stringify({ type: 'module' }));
    writeFile(probeRoot, 'scripts/postinstall.js', "console.log('沒有 require source');");

    expect(() => probe.applyCutoverTransforms(probeRoot, sourceRoot)).toThrow(
      "scripts/postinstall.js 缺少預期 source 片段：const fs = require('node:fs');"
    );
  });

  test('formats cutover rehearsal rows separately from marker-only proofs', () => {
    const summary = probe.buildProbeSummary({
      variant: 'cutover-core',
      sourceRoot: projectRoot,
      baselineRoot: path.join(temporaryRoot, 'baseline'),
      probeRoot: path.join(temporaryRoot, 'probe'),
      markers: [
        {
          relativePath: 'scripts/content/package.json',
          scope: 'production',
          disposition: 'remove-at-root-esm-cutover',
        },
      ],
      removedMarkers: ['scripts/content/package.json'],
      commands: [{ label: 'probe', command: 'node scripts/postinstall.js', status: 0 }],
      comparisons: [],
      variants: [
        {
          name: 'cutover-core',
          kind: 'cutover-rehearsal',
          removedMarkers: ['scripts/content/package.json'],
          commands: [{ status: 0 }],
          comparisons: [],
          actions: [
            'set-root-package-type-module',
            'transform-scripts-postinstall-to-esm',
            'transform-jest-config-to-esm',
          ],
        },
      ],
    });

    const markdown = probe.formatMarkdownSummary(summary);

    expect(markdown).toContain('## 切換演練');
    expect(markdown).toContain('| 變體 | 動作 |');
    expect(markdown).toContain(
      '| cutover-core | set-root-package-type-module, transform-scripts-postinstall-to-esm, transform-jest-config-to-esm |'
    );
  });

  test('passes an explicit timeout to spawned probe commands and reports timed-out diagnostics', async () => {
    const spawnSync = jest.fn(() => ({
      status: null,
      signal: 'SIGTERM',
      stdout: 'partial stdout',
      stderr: '',
      error: Object.assign(new Error('spawnSync timed out'), { code: 'ETIMEDOUT' }),
    }));
    const mockedProbe = await loadProbeWithSpawnSync(spawnSync);

    const result = mockedProbe.runCommand('npm run build:prod', temporaryRoot);

    expect(spawnSync).toHaveBeenCalledWith(
      'npm run build:prod',
      expect.objectContaining({
        cwd: temporaryRoot,
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

  test('reuses one production baseline run and removes the temp root by default', async () => {
    const sourceRoot = path.join(temporaryRoot, 'source');
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
    const mockedProbe = await loadProbeWithSpawnSync(spawnSync);

    const summary = mockedProbe.runProbe({ variant: 'production' }, sourceRoot);
    const probeTemporaryRoot = path.dirname(summary.roots.baseline);

    expect(spawnSync).toHaveBeenCalledTimes(10);
    expect(new Set(summary.variants.map(variant => variant.roots.baseline))).toEqual(
      new Set([summary.roots.baseline])
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    expect(fs.existsSync(probeTemporaryRoot)).toBe(false);
  });

  test('guards direct ESM execution when process.argv[1] is absent', () => {
    const wrapperSource = readUtf8File(
      path.join(projectRoot, 'tools/probe-root-esm-package-markers.mjs')
    );

    expect(wrapperSource).toContain('process.argv[1] &&');
    expect(wrapperSource).toContain('pathToFileURL(process.argv[1]).href');
  });
});
