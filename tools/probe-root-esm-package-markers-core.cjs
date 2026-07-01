'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const MARKER_ROOTS = Object.freeze(['pages', 'scripts', 'tests']);
const PRODUCTION_COMMANDS = Object.freeze(['npm run build:prod', 'npm run package:local-unpacked']);
const TEST_COMMANDS = Object.freeze([
  'npm run test:native:blockers',
]);
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

const VARIANT_BUILDERS = Object.freeze({
  'pages-only': markers =>
    markers.filter(marker => marker.scope === 'production' && marker.relativePath.startsWith('pages/')),
  'scripts-production-without-performance': markers =>
    markers.filter(
      marker =>
        marker.scope === 'production' &&
        marker.relativePath.startsWith('scripts/') &&
        marker.relativePath !== 'scripts/performance/package.json'
    ),
  'scripts-performance-only': markers =>
    markers.filter(marker => marker.relativePath === 'scripts/performance/package.json'),
  'scripts-and-pages': markers => markers.filter(marker => marker.scope === 'production'),
  tests: markers => markers.filter(marker => marker.scope === 'test'),
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
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    );

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

function discoverPackageMarkers(rootDir) {
  const markers = [];

  for (const markerRoot of MARKER_ROOTS) {
    const absoluteMarkerRoot = path.join(rootDir, markerRoot);
    if (!fs.existsSync(absoluteMarkerRoot)) {
      continue;
    }

    for (const relativeFilePath of listFilesRecursive(absoluteMarkerRoot)) {
      if (!relativeFilePath.endsWith('/package.json') && relativeFilePath !== 'package.json') {
        continue;
      }

      const relativePath = toPosixPath(path.join(markerRoot, relativeFilePath));
      const directory = path.posix.dirname(relativePath);
      const scope = relativePath.startsWith('tests/') ? 'test' : 'production';
      markers.push({
        relativePath,
        directory,
        scope,
        disposition: markerDisposition(relativePath),
      });
    }
  }

  return markers.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
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
    throw new Error('Refusing to mutate the source repository as a probe root.');
  }
  if (resolvedProbeRoot.startsWith(`${resolvedSourceRoot}${path.sep}`)) {
    throw new Error('Refusing to create a probe root inside the source repository.');
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
  const comparisonStatus = comparisons.every(comparison => comparison.status === 'match') ? 'pass' : 'fail';

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
      { id: 'output-equivalence', status: comparisons.length === 0 ? 'not_evaluated' : comparisonStatus },
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

function shouldCopySourcePath(sourceRoot, src) {
  const relativePath = toPosixPath(path.relative(sourceRoot, src));
  if (!relativePath) {
    return true;
  }
  const [topLevel] = relativePath.split('/');
  return !COPY_EXCLUDES.includes(topLevel);
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
    fs.symlinkSync(sourceNodeModules, targetNodeModules, 'dir');
  }
}

function createProbeCopy(sourceRoot, targetRoot, markersToRemove) {
  copyRepository(sourceRoot, targetRoot);
  setRootTypeModule(targetRoot);
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
    env: { ...process.env, CI: process.env.CI ?? '1' },
  });

  return {
    label: command,
    command,
    status: result.status ?? 1,
    signal: result.signal,
    startedAt,
    finishedAt: new Date().toISOString(),
    stdoutTail: tailLines(result.stdout),
    stderrTail: tailLines(result.stderr),
  };
}

function compareOutputTrees(baselineRoot, probeRoot, relativePath) {
  const baselineHash = hashDirectoryTree(path.join(baselineRoot, relativePath));
  const probeHash = hashDirectoryTree(path.join(probeRoot, relativePath));
  const status = baselineHash.digest && baselineHash.digest === probeHash.digest ? 'match' : 'drift';

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

function buildVariantRun({ sourceRoot, tempRoot, variantName, markers, commands, compareOutputs }) {
  const baselineRoot = path.join(tempRoot, `${variantName}-baseline`);
  const probeRoot = path.join(tempRoot, `${variantName}-probe`);
  const removedMarkers = VARIANT_BUILDERS[variantName](markers);

  createProbeCopy(sourceRoot, baselineRoot, []);
  createProbeCopy(sourceRoot, probeRoot, removedMarkers);

  const baselineCommands = runCommands(commands, baselineRoot, `${variantName} baseline`);
  const probeCommands = runCommands(commands, probeRoot, `${variantName} probe`);
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

function formatMarkdownSummary(summary) {
  const lines = [
    `# Root ESM Package Marker Probe: ${summary.variant}`,
    '',
    `- Generated: ${summary.generatedAt}`,
    `- Production markers: ${summary.totals.productionMarkers}`,
    `- Test markers: ${summary.totals.testMarkers}`,
    `- Removed markers in selected variant(s): ${summary.totals.removedMarkers}`,
    '',
    '## Gates',
    '',
    '| Gate | Status |',
    '| --- | --- |',
    ...summary.gates.map(gate => `| ${gate.id} | ${gate.status} |`),
    '',
    '## Marker Dispositions',
    '',
    '| Marker | Scope | Disposition |',
    '| --- | --- | --- |',
    ...summary.markers.map(
      marker => `| \`${marker.relativePath}\` | ${marker.scope} | ${marker.disposition} |`
    ),
  ];

  if (summary.variants.length > 0) {
    lines.push('', '## Variant Results', '', '| Variant | Removed markers | Command failures | Drift |', '| --- | ---: | ---: | ---: |');
    for (const variant of summary.variants) {
      const commandFailures = variant.commands.filter(command => command.status !== 0).length;
      const driftCount = variant.comparisons.filter(comparison => comparison.status !== 'match').length;
      lines.push(`| ${variant.name} | ${variant.removedMarkers.length} | ${commandFailures} | ${driftCount} |`);
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const options = {
    variant: '',
    summaryJson: '',
    summaryMd: '',
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    const [key, ...valueParts] = arg.split('=');
    const value = valueParts.join('=');
    if (key === '--variant') {
      options.variant = value;
    } else if (key === '--summary-json') {
      options.summaryJson = value;
    } else if (key === '--summary-md') {
      options.summaryMd = value;
    } else {
      throw new Error(`未知參數：${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node tools/probe-root-esm-package-markers.mjs --variant=<variant> [--summary-json=path] [--summary-md=path]

Variants:
  production                         Run pages-only, scripts-production-without-performance, scripts-performance-only, and scripts-and-pages.
  tests                              Remove tests/** package markers in a root-ESM probe copy.
  pages-only                         Remove pages/** package markers only.
  scripts-production-without-performance
  scripts-performance-only
  scripts-and-pages

The tool copies the repository to a temp directory, sets root package.json type to module only in the copies,
removes selected nested package markers only in probe copies, runs the relevant commands, and compares output hashes.`);
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
  const variantNames =
    options.variant === 'production'
      ? [
          'pages-only',
          'scripts-production-without-performance',
          'scripts-performance-only',
          'scripts-and-pages',
        ]
      : [options.variant];

  for (const variantName of variantNames) {
    if (!VARIANT_BUILDERS[variantName]) {
      throw new Error(`不支援的 variant：${variantName}`);
    }
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'root-esm-package-markers-'));
  const isTestVariant = options.variant === 'tests';
  const commands = isTestVariant ? TEST_COMMANDS : PRODUCTION_COMMANDS;
  const variantRuns = variantNames.map(variantName =>
    buildVariantRun({
      sourceRoot,
      tempRoot,
      variantName,
      markers,
      commands,
      compareOutputs: !isTestVariant,
    })
  );

  const removedMarkers = variantRuns.flatMap(variant => variant.removedMarkers);
  const allCommands = variantRuns.flatMap(variant => variant.commands);
  const allComparisons = variantRuns.flatMap(variant => variant.comparisons);
  const firstVariant = variantRuns[0] ?? {};
  const summary = buildProbeSummary({
    variant: options.variant,
    sourceRoot,
    baselineRoot: firstVariant.roots?.baseline ?? '',
    probeRoot: firstVariant.roots?.probe ?? '',
    markers,
    removedMarkers: [...new Set(removedMarkers)].sort(),
    commands: allCommands,
    comparisons: allComparisons,
    variants: variantRuns,
  });

  writeSummaries(summary, options);
  return summary;
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

module.exports = {
  assertSafeProbeRoot,
  buildProbeSummary,
  discoverPackageMarkers,
  formatMarkdownSummary,
  groupMarkersByScope,
  hashDirectoryTree,
  main,
  parseArgs,
  runProbe,
};
