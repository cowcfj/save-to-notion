import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const MARKER_ROOTS = Object.freeze(['pages', 'scripts', 'tests']);
const PRODUCTION_COMMANDS = Object.freeze(['npm run build:prod', 'npm run package:local-unpacked']);
const TEST_COMMANDS = Object.freeze(['npm run test:native:blockers']);
const CUTOVER_CORE_COMMANDS = Object.freeze([
  'node scripts/postinstall.js',
  'npm test',
  'npm run test:native',
  'npm run test:coverage:native-esm:assert',
  'npm run build:prod',
  'node tools/check-message-boundaries.mjs --require-all',
  'bash tools/package-extension.sh --unpacked-dir=.tmp/extension-unpacked',
  'node tools/check-size-gates.mjs --mode=hard --scope=all --unpacked-dir=.tmp/extension-unpacked',
]);
const CUTOVER_PACKAGE_OUTPUT_COMMANDS = Object.freeze([
  'npm run build:prod',
  'node tools/check-message-boundaries.mjs --require-all',
  'bash tools/package-extension.sh --unpacked-dir=.tmp/extension-unpacked',
  'node tools/check-size-gates.mjs --mode=hard --scope=all --unpacked-dir=.tmp/extension-unpacked',
]);
const CUTOVER_ACTIONS = Object.freeze([
  'set-root-package-type-module',
  'transform-scripts-postinstall-to-esm',
  'transform-jest-config-to-esm',
]);
const PRODUCTION_VARIANTS = Object.freeze([
  'pages-only',
  'scripts-production-without-performance',
  'scripts-performance-only',
  'scripts-and-pages',
]);
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const COPY_EXCLUDES = Object.freeze([
  '.git',
  '.codegraph',
  '.jest-cache',
  '.tmp',
  'coverage',
  'dist',
  'node_modules',
  'releases',
]);
const VOLATILE_NAMES = Object.freeze(['.DS_Store']);

const selectProductionMarkers = markers => markers.filter(marker => marker.scope === 'production');
const selectTestMarkers = markers => markers.filter(marker => marker.scope === 'test');
const selectAllMarkers = markers =>
  markers.filter(marker => marker.scope === 'production' || marker.scope === 'test');

const VARIANT_BUILDERS = Object.freeze({
  'pages-only': markers =>
    markers.filter(
      marker => marker.scope === 'production' && marker.relativePath.startsWith('pages/')
    ),
  'scripts-production-without-performance': markers =>
    markers.filter(
      marker =>
        marker.scope === 'production' &&
        marker.relativePath.startsWith('scripts/') &&
        marker.relativePath !== 'scripts/performance/package.json'
    ),
  'scripts-performance-only': markers =>
    markers.filter(marker => marker.relativePath === 'scripts/performance/package.json'),
  'scripts-and-pages': selectProductionMarkers,
  tests: selectTestMarkers,
  'cutover-core': selectProductionMarkers,
  'cutover-with-test-markers': selectAllMarkers,
  'cutover-package-output': selectProductionMarkers,
});

const CUTOVER_VARIANTS = Object.freeze({
  'cutover-core': {
    commands: CUTOVER_CORE_COMMANDS,
    compareOutputs: false,
    runBaselineCommands: false,
  },
  'cutover-with-test-markers': {
    commands: CUTOVER_CORE_COMMANDS,
    compareOutputs: false,
    runBaselineCommands: false,
  },
  'cutover-package-output': {
    commands: CUTOVER_PACKAGE_OUTPUT_COMMANDS,
    compareOutputs: true,
    runBaselineCommands: true,
  },
});

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function listFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const result = [];
  const visit = directory => {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = toPosixPath(path.relative(rootDir, absolutePath));
      if (VOLATILE_NAMES.includes(entry.name)) {
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        result.push(relativePath);
      }
    }
  };

  visit(rootDir);
  return result;
}

function markerDisposition(relativePath) {
  if (relativePath.startsWith('tests/')) {
    return 'test-helper-boundary';
  }
  return 'remove-at-root-esm-cutover';
}

function isPackageMarkerPath(relativeFilePath) {
  return relativeFilePath === 'package.json' || relativeFilePath.endsWith('/package.json');
}

function getMarkerScope(relativePath) {
  return relativePath.startsWith('tests/') ? 'test' : 'production';
}

function createPackageMarker(markerRoot, relativeFilePath) {
  const relativePath = toPosixPath(path.join(markerRoot, relativeFilePath));
  const scope = getMarkerScope(relativePath);
  return {
    relativePath,
    directory: path.posix.dirname(relativePath),
    scope,
    disposition: markerDisposition(relativePath),
  };
}

function listPackageMarkersForRoot(rootDir, markerRoot) {
  const absoluteMarkerRoot = path.join(rootDir, markerRoot);
  if (!fs.existsSync(absoluteMarkerRoot)) {
    return [];
  }

  return listFilesRecursive(absoluteMarkerRoot)
    .filter(isPackageMarkerPath)
    .map(relativeFilePath => createPackageMarker(markerRoot, relativeFilePath));
}

function discoverPackageMarkers(rootDir) {
  return MARKER_ROOTS.flatMap(markerRoot => listPackageMarkersForRoot(rootDir, markerRoot)).sort(
    (left, right) => left.relativePath.localeCompare(right.relativePath)
  );
}

function groupMarkersByScope(markers) {
  return {
    production: markers
      .filter(marker => marker.scope === 'production')
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    test: markers
      .filter(marker => marker.scope === 'test')
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
  };
}

function hashDirectoryTree(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return {
      root: rootDir,
      digest: null,
      files: [],
      missing: true,
    };
  }

  const files = listFilesRecursive(rootDir).map(relativePath => {
    const absolutePath = path.join(rootDir, relativePath);
    const content = fs.readFileSync(absolutePath);
    return {
      relativePath,
      size: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    };
  });

  const digest = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');

  return {
    root: rootDir,
    digest,
    files,
    missing: false,
  };
}

function assertSafeProbeRoot(probeRoot, sourceRoot) {
  const resolvedProbeRoot = path.resolve(probeRoot);
  const resolvedSourceRoot = path.resolve(sourceRoot);
  if (resolvedProbeRoot === resolvedSourceRoot) {
    throw new Error('拒絕將來源 repository 當作 probe root 進行變更。');
  }
  if (resolvedProbeRoot.startsWith(`${resolvedSourceRoot}${path.sep}`)) {
    throw new Error('拒絕在來源 repository 內建立 probe root。');
  }
}

function buildProbeSummary({
  variant,
  sourceRoot,
  baselineRoot,
  probeRoot,
  markers,
  removedMarkers,
  commands = [],
  comparisons = [],
  variants = [],
}) {
  const groups = groupMarkersByScope(markers);
  const commandStatus = commands.every(command => command.status === 0) ? 'pass' : 'fail';
  const comparisonStatus = comparisons.every(comparison => comparison.status === 'match')
    ? 'pass'
    : 'fail';
  const cutoverVariants = variants.filter(item => item.kind === 'cutover-rehearsal');
  const cutoverGates =
    cutoverVariants.length === 0
      ? []
      : cutoverVariants.map(variant => {
          const commandsPass = variant.commands.every(command => command.status === 0);
          const comparisonsPass = (variant.comparisons || []).every(
            comp => comp.status === 'match'
          );
          return {
            id: `${variant.name}-cutover-rehearsal`,
            status: commandsPass && comparisonsPass ? 'pass' : 'fail',
          };
        });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    variant,
    roots: {
      source: sourceRoot,
      baseline: baselineRoot,
      probe: probeRoot,
    },
    totals: {
      productionMarkers: groups.production.length,
      testMarkers: groups.test.length,
      removedMarkers: removedMarkers.length,
    },
    markers,
    removedMarkers,
    commands,
    comparisons,
    gates: [
      { id: 'commands-pass', status: commandStatus },
      {
        id: 'output-equivalence',
        status: comparisons.length === 0 ? 'not_evaluated' : comparisonStatus,
      },
      ...cutoverGates,
    ],
    variants,
  };
}

function setRootTypeModule(rootDir) {
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = readJson(packageJsonPath);
  packageJson.type = 'module';
  writeJson(packageJsonPath, packageJson);
}

function removeMarkers(rootDir, markers) {
  for (const marker of markers) {
    fs.rmSync(path.join(rootDir, marker.relativePath), { force: true });
  }
}

function normalizeMarkerPath(markerPath) {
  return toPosixPath(path.normalize(markerPath));
}

function resolveExplicitTestMarkers(markers, markerPaths) {
  if (markerPaths.length === 0) {
    return null;
  }

  const testMarkers = new Map(
    markers
      .filter(marker => marker.scope === 'test')
      .map(marker => [marker.relativePath, marker])
  );

  const resolvedMarkers = [];
  const invalidMarkerPaths = [];

  for (const markerPath of markerPaths) {
    const normalizedPath = normalizeMarkerPath(markerPath);
    const marker = testMarkers.get(normalizedPath);
    if (!marker) {
      invalidMarkerPaths.push(markerPath);
      continue;
    }
    resolvedMarkers.push(marker);
  }

  if (invalidMarkerPaths.length > 0) {
    throw new Error(`未知或非 tests/** package marker：${invalidMarkerPaths.join(', ')}`);
  }

  return resolvedMarkers;
}

function replaceRequiredSource(source, searchValue, replacementValue, fileLabel) {
  if (!source.includes(searchValue)) {
    throw new Error(`${fileLabel} 缺少預期 source 片段：${searchValue}`);
  }
  return source.replace(searchValue, replacementValue);
}

function transformPostinstallToEsm(rootDir) {
  const postinstallPath = path.join(rootDir, 'scripts', 'postinstall.js');
  let source = fs.readFileSync(postinstallPath, 'utf8');
  if (
    source.includes("import fs from 'node:fs';") &&
    source.includes("import path from 'node:path';")
  ) {
    return;
  }
  source = replaceRequiredSource(
    source,
    "const fs = require('node:fs');",
    "import fs from 'node:fs';",
    'scripts/postinstall.js'
  );
  source = replaceRequiredSource(
    source,
    "const path = require('node:path');",
    "import path from 'node:path';",
    'scripts/postinstall.js'
  );
  fs.writeFileSync(postinstallPath, source, 'utf8');
}

function transformJestConfigToEsm(rootDir) {
  const jestConfigPath = path.join(rootDir, 'jest.config.js');
  let source = fs.readFileSync(jestConfigPath, 'utf8');
  if (source.includes('export default config;')) {
    return;
  }
  source = replaceRequiredSource(
    source,
    'module.exports = {',
    'const config = {',
    'jest.config.js'
  );
  fs.writeFileSync(jestConfigPath, `${source.trimEnd()}\n\nexport default config;\n`, 'utf8');
}

function applyCutoverTransforms(rootDir, sourceRoot) {
  assertSafeProbeRoot(rootDir, sourceRoot);
  transformPostinstallToEsm(rootDir);
  transformJestConfigToEsm(rootDir);
}

function shouldCopySourcePath(sourceRoot, src) {
  const relativePath = toPosixPath(path.relative(sourceRoot, src));
  if (!relativePath) {
    return true;
  }
  const segments = relativePath.split('/');
  return !segments.some(segment => COPY_EXCLUDES.includes(segment));
}

function getNodeModulesLinkType(platform = process.platform) {
  return platform === 'win32' ? 'junction' : 'dir';
}

function copyRepository(sourceRoot, targetRoot) {
  assertSafeProbeRoot(targetRoot, sourceRoot);
  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    filter: src => shouldCopySourcePath(sourceRoot, src),
  });

  const sourceNodeModules = path.join(sourceRoot, 'node_modules');
  const targetNodeModules = path.join(targetRoot, 'node_modules');
  if (fs.existsSync(sourceNodeModules) && !fs.existsSync(targetNodeModules)) {
    fs.symlinkSync(sourceNodeModules, targetNodeModules, getNodeModulesLinkType());
  }
}

function createProbeCopy(sourceRoot, targetRoot, markersToRemove) {
  copyRepository(sourceRoot, targetRoot);
  setRootTypeModule(targetRoot);
  removeMarkers(targetRoot, markersToRemove);
}

function createCutoverProbeCopy(sourceRoot, targetRoot, markersToRemove) {
  copyRepository(sourceRoot, targetRoot);
  setRootTypeModule(targetRoot);
  applyCutoverTransforms(targetRoot, sourceRoot);
  removeMarkers(targetRoot, markersToRemove);
}

function tailLines(value = '', limit = 80) {
  return value.split(/\r?\n/).slice(-limit).join('\n').trim();
}

function runCommand(command, cwd) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
    env: { ...process.env, CI: process.env.CI ?? '1' },
  });
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const stderr = [result.stderr, timedOut ? result.error.message : ''].filter(Boolean).join('\n');

  return {
    label: command,
    command,
    status: timedOut ? 124 : (result.status ?? 1),
    signal: result.signal,
    startedAt,
    finishedAt: new Date().toISOString(),
    stdoutTail: tailLines(result.stdout),
    stderrTail: tailLines(stderr),
  };
}

function compareOutputTrees(baselineRoot, probeRoot, relativePath) {
  const baselineHash = hashDirectoryTree(path.join(baselineRoot, relativePath));
  const probeHash = hashDirectoryTree(path.join(probeRoot, relativePath));
  const status =
    baselineHash.digest && baselineHash.digest === probeHash.digest ? 'match' : 'drift';

  return {
    path: relativePath,
    status,
    baselineDigest: baselineHash.digest,
    probeDigest: probeHash.digest,
    baselineFiles: baselineHash.files.length,
    probeFiles: probeHash.files.length,
  };
}

function runCommands(commands, cwd, labelPrefix) {
  return commands.map(command => ({
    ...runCommand(command, cwd),
    label: `${labelPrefix}: ${command}`,
  }));
}

function buildSharedBaselineRun({ sourceRoot, tempRoot, commands }) {
  const baselineRoot = path.join(tempRoot, 'production-baseline');
  createProbeCopy(sourceRoot, baselineRoot, []);
  return {
    root: baselineRoot,
    commands: runCommands(commands, baselineRoot, 'production 基準'),
  };
}

function buildVariantRun({
  sourceRoot,
  tempRoot,
  variantName,
  markers,
  commands,
  compareOutputs,
  sharedBaselineRun = null,
  explicitRemovedMarkers = null,
}) {
  const baselineRoot = sharedBaselineRun?.root ?? path.join(tempRoot, `${variantName}-baseline`);
  const probeRoot = path.join(tempRoot, `${variantName}-probe`);
  const removedMarkers = explicitRemovedMarkers ?? VARIANT_BUILDERS[variantName](markers);

  if (!sharedBaselineRun) {
    createProbeCopy(sourceRoot, baselineRoot, []);
  }
  createProbeCopy(sourceRoot, probeRoot, removedMarkers);

  const baselineCommands =
    sharedBaselineRun?.commands ?? runCommands(commands, baselineRoot, `${variantName} 基準`);
  const probeCommands = runCommands(commands, probeRoot, `${variantName} 探測`);
  const comparisons = compareOutputs
    ? ['dist', '.tmp/extension-unpacked'].map(relativePath =>
        compareOutputTrees(baselineRoot, probeRoot, relativePath)
      )
    : [];

  return {
    name: variantName,
    roots: { baseline: baselineRoot, probe: probeRoot },
    removedMarkers: removedMarkers.map(marker => marker.relativePath),
    commands: [...baselineCommands, ...probeCommands],
    comparisons,
  };
}

function buildCutoverVariantRun({ sourceRoot, tempRoot, variantName, markers }) {
  const config = CUTOVER_VARIANTS[variantName];
  const baselineRoot = path.join(tempRoot, `${variantName}-baseline`);
  const probeRoot = path.join(tempRoot, `${variantName}-probe`);
  const removedMarkers = VARIANT_BUILDERS[variantName](markers);

  copyRepository(sourceRoot, baselineRoot);
  createCutoverProbeCopy(sourceRoot, probeRoot, removedMarkers);

  const baselineCommands = config.runBaselineCommands
    ? runCommands(config.commands, baselineRoot, `${variantName} 基準`)
    : [];
  const probeCommands = runCommands(config.commands, probeRoot, `${variantName} 探測`);
  const comparisons = config.compareOutputs
    ? ['dist', '.tmp/extension-unpacked'].map(relativePath =>
        compareOutputTrees(baselineRoot, probeRoot, relativePath)
      )
    : [];

  return {
    name: variantName,
    kind: 'cutover-rehearsal',
    actions: [...CUTOVER_ACTIONS],
    roots: { baseline: baselineRoot, probe: probeRoot },
    removedMarkers: removedMarkers.map(marker => marker.relativePath),
    commands: [...baselineCommands, ...probeCommands],
    comparisons,
  };
}

function formatGateStatus(status) {
  if (status === 'pass') {
    return '通過';
  }
  if (status === 'fail') {
    return '失敗';
  }
  if (status === 'not_evaluated') {
    return '未評估';
  }
  return status;
}

function createSummaryHeaderLines(summary) {
  return [
    `# Root ESM 套件標記探測：${summary.variant}`,
    '',
    `- 產生時間：${summary.generatedAt}`,
    `- production 標記數：${summary.totals.productionMarkers}`,
    `- test 標記數：${summary.totals.testMarkers}`,
    `- 已選變體移除標記數：${summary.totals.removedMarkers}`,
  ];
}

function createGateTableLines(gates) {
  return [
    '',
    '## 關卡',
    '',
    '| 關卡 | 狀態 |',
    '| --- | --- |',
    ...gates.map(gate => `| ${gate.id} | ${formatGateStatus(gate.status)} |`),
  ];
}

function createMarkerDispositionLines(markers) {
  return [
    '',
    '## 套件標記處置',
    '',
    '| 套件標記 | 範圍 | 處置 |',
    '| --- | --- | --- |',
    ...markers.map(
      marker => `| \`${marker.relativePath}\` | ${marker.scope} | ${marker.disposition} |`
    ),
  ];
}

function countCommandFailures(variant) {
  return variant.commands.filter(command => command.status !== 0).length;
}

function countOutputDrifts(variant) {
  return variant.comparisons.filter(comparison => comparison.status !== 'match').length;
}

function createVariantResultLines(variants) {
  if (variants.length === 0) {
    return [];
  }

  return [
    '',
    '## 變體結果',
    '',
    '| 變體 | 移除標記數 | 命令失敗數 | 輸出漂移數 |',
    '| --- | ---: | ---: | ---: |',
    ...variants.map(
      variant =>
        `| ${variant.name} | ${variant.removedMarkers.length} | ${countCommandFailures(variant)} | ${countOutputDrifts(variant)} |`
    ),
  ];
}

function selectCutoverVariants(variants) {
  return variants.filter(variant => variant.kind === 'cutover-rehearsal');
}

function createCutoverRehearsalLines(variants) {
  const cutoverVariants = selectCutoverVariants(variants);
  if (cutoverVariants.length === 0) {
    return [];
  }

  return [
    '',
    '## 切換演練',
    '',
    '| 變體 | 動作 |',
    '| --- | --- |',
    ...cutoverVariants.map(variant => `| ${variant.name} | ${(variant.actions || []).join(', ')} |`),
  ];
}

function formatMarkdownSummary(summary) {
  const lines = [
    ...createSummaryHeaderLines(summary),
    ...createGateTableLines(summary.gates),
    ...createMarkerDispositionLines(summary.markers),
    ...createVariantResultLines(summary.variants),
    ...createCutoverRehearsalLines(summary.variants),
  ];

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function createDefaultOptions() {
  return {
    variant: '',
    summaryJson: '',
    summaryMd: '',
    removeMarkers: [],
    help: false,
    keepTemp: false,
  };
}

function splitOptionArg(arg) {
  const [key, ...valueParts] = arg.split('=');
  return {
    key,
    value: valueParts.join('='),
  };
}

const booleanArgHandlers = Object.freeze(
  new Map([
    [
      '--help',
      options => {
        options.help = true;
      },
    ],
    [
      '-h',
      options => {
        options.help = true;
      },
    ],
    [
      '--keep-temp',
      options => {
        options.keepTemp = true;
      },
    ],
  ])
);

const valueArgHandlers = Object.freeze(
  new Map([
    [
      '--variant',
      (options, value) => {
        options.variant = value;
      },
    ],
    [
      '--summary-json',
      (options, value) => {
        options.summaryJson = value;
      },
    ],
    [
      '--summary-md',
      (options, value) => {
        options.summaryMd = value;
      },
    ],
    [
      '--remove-marker',
      (options, value) => {
        options.removeMarkers.push(value);
      },
    ],
  ])
);

function applyArgument(options, arg) {
  const booleanHandler = booleanArgHandlers.get(arg);
  if (booleanHandler) {
    booleanHandler(options);
    return;
  }

  const { key, value } = splitOptionArg(arg);
  const valueHandler = valueArgHandlers.get(key);
  if (!valueHandler) {
    throw new Error(`未知參數：${arg}`);
  }
  valueHandler(options, value);
}

function assertRequiredArgs(options) {
  if (!options.help && !options.variant) {
    throw new Error('缺少必要參數：--variant');
  }
}

function parseArgs(argv) {
  const options = createDefaultOptions();

  for (const arg of argv) {
    applyArgument(options, arg);
  }

  assertRequiredArgs(options);
  return options;
}

function printHelp() {
  console.log(`用法：node tools/probe-root-esm-package-markers.mjs --variant=<variant> [--summary-json=path] [--summary-md=path] [--keep-temp]

變體：
  production                         執行 pages-only、scripts-production-without-performance、scripts-performance-only 與 scripts-and-pages。
  tests                              在 root ESM probe copy 中移除 tests/** package markers。
  pages-only                         只移除 pages/** package markers。
  scripts-production-without-performance
  scripts-performance-only
  scripts-and-pages
  cutover-core                      在 probe copy 內執行 root type module、postinstall ESM、Jest config ESM 與 production marker removal rehearsal。
  cutover-with-test-markers         在 cutover-core 基礎上暫時移除 tests/** package markers。
  cutover-package-output            以 live CommonJS baseline 對照 cutover probe 的 build/package output。

此工具會將 repository 複製到暫存目錄，只在 copy 內把 root package.json type 設為 module，
只在 probe copy 內移除選定的 nested package markers，執行相關命令，並比對輸出 hash。`);
}

function isCutoverVariant(variantName) {
  return Object.hasOwn(CUTOVER_VARIANTS, variantName);
}

function resolveVariantNames(variant) {
  return variant === 'production' ? [...PRODUCTION_VARIANTS] : [variant];
}

function assertSupportedVariantNames(variantNames) {
  for (const variantName of variantNames) {
    if (!VARIANT_BUILDERS[variantName]) {
      throw new Error(`不支援的 variant：${variantName}`);
    }
  }
}

function validateExplicitMarkerVariant(explicitRemovedMarkers, variant) {
  if (explicitRemovedMarkers && variant !== 'tests') {
    throw new Error('--remove-marker 只支援 --variant=tests');
  }
}

function selectProbeCommands(variant) {
  return variant === 'tests' ? TEST_COMMANDS : PRODUCTION_COMMANDS;
}

function buildCutoverVariantRuns({ sourceRoot, tempRoot, variantNames, markers }) {
  return variantNames.map(variantName =>
    buildCutoverVariantRun({ sourceRoot, tempRoot, variantName, markers })
  );
}

function buildMarkerVariantRuns({
  sourceRoot,
  tempRoot,
  variantNames,
  markers,
  commands,
  compareOutputs,
  sharedBaselineRun,
  explicitRemovedMarkers,
}) {
  return variantNames.map(variantName =>
    buildVariantRun({
      sourceRoot,
      tempRoot,
      variantName,
      markers,
      commands,
      compareOutputs,
      sharedBaselineRun,
      explicitRemovedMarkers: variantName === 'tests' ? explicitRemovedMarkers : null,
    })
  );
}

function createSharedBaselineRun({ sourceRoot, tempRoot, variant, commands }) {
  return variant === 'production' ? buildSharedBaselineRun({ sourceRoot, tempRoot, commands }) : null;
}

function buildProbeVariantRuns({
  sourceRoot,
  tempRoot,
  variant,
  variantNames,
  markers,
  commands,
  explicitRemovedMarkers,
}) {
  if (variantNames.every(isCutoverVariant)) {
    return buildCutoverVariantRuns({ sourceRoot, tempRoot, variantNames, markers });
  }

  const sharedBaselineRun = createSharedBaselineRun({ sourceRoot, tempRoot, variant, commands });
  return buildMarkerVariantRuns({
    sourceRoot,
    tempRoot,
    variantNames,
    markers,
    commands,
    compareOutputs: variant !== 'tests',
    sharedBaselineRun,
    explicitRemovedMarkers,
  });
}

function collectVariantRunArtifacts(variantRuns) {
  return {
    removedMarkers: [...new Set(variantRuns.flatMap(variant => variant.removedMarkers))].sort(),
    commands: variantRuns.flatMap(variant => variant.commands),
    comparisons: variantRuns.flatMap(variant => variant.comparisons),
  };
}

function getFirstVariantRoots(variantRuns) {
  const [firstVariant = {}] = variantRuns;
  return firstVariant.roots || { baseline: '', probe: '' };
}

function buildProbeRunSummary({ variant, sourceRoot, markers, variantRuns }) {
  const { removedMarkers, commands, comparisons } = collectVariantRunArtifacts(variantRuns);
  const firstVariantRoots = getFirstVariantRoots(variantRuns);
  return buildProbeSummary({
    variant,
    sourceRoot,
    baselineRoot: firstVariantRoots.baseline,
    probeRoot: firstVariantRoots.probe,
    markers,
    removedMarkers,
    commands,
    comparisons,
    variants: variantRuns,
  });
}

function removeTempRootUnlessKept(tempRoot, keepTemp) {
  if (!keepTemp) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function writeSummaries(summary, options) {
  if (options.summaryJson) {
    writeJson(path.resolve(options.summaryJson), summary);
  }
  if (options.summaryMd) {
    const summaryMdPath = path.resolve(options.summaryMd);
    fs.mkdirSync(path.dirname(summaryMdPath), { recursive: true });
    fs.writeFileSync(summaryMdPath, formatMarkdownSummary(summary), 'utf8');
  }
}

function runProbe(options, sourceRoot = process.cwd()) {
  const markers = discoverPackageMarkers(sourceRoot);
  const explicitRemovedMarkers = resolveExplicitTestMarkers(markers, options.removeMarkers ?? []);
  validateExplicitMarkerVariant(explicitRemovedMarkers, options.variant);
  const variantNames = resolveVariantNames(options.variant);
  assertSupportedVariantNames(variantNames);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'root-esm-package-markers-'));
  const commands = selectProbeCommands(options.variant);
  try {
    const variantRuns = buildProbeVariantRuns({
      sourceRoot,
      tempRoot,
      variant: options.variant,
      variantNames,
      markers,
      commands,
      explicitRemovedMarkers,
    });
    const summary = buildProbeRunSummary({
      variant: options.variant,
      sourceRoot,
      markers,
      variantRuns,
    });

    writeSummaries(summary, options);
    return summary;
  } finally {
    removeTempRootUnlessKept(tempRoot, options.keepTemp);
  }
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }
  if (!options.variant) {
    throw new Error('缺少必要參數：--variant');
  }

  const summary = runProbe(options);
  console.log(formatMarkdownSummary(summary));
  const failedCommands = summary.commands.filter(command => command.status !== 0);
  const drifts = summary.comparisons.filter(comparison => comparison.status !== 'match');
  return failedCommands.length === 0 && drifts.length === 0 ? 0 : 1;
}

export {
  applyCutoverTransforms,
  assertSafeProbeRoot,
  buildProbeSummary,
  discoverPackageMarkers,
  formatMarkdownSummary,
  getNodeModulesLinkType,
  groupMarkersByScope,
  hashDirectoryTree,
  main,
  parseArgs,
  runCommand,
  runProbe,
  shouldCopySourcePath,
};
