const fs = require('node:fs');
const path = require('node:path');

const defaultRoots = ['tests/unit', 'tests/contract', 'tests/native-esm'];

const blockerPriority = [
  'already-native-default',
  'coverage-gate-only',
  'native-esm-candidate',
  'node-lifecycle-contract',
  'incumbent-contract-retained',
  'malformed-package-boundary',
  'test-helper-package-boundary',
  'babel-hoisted-mock',
  'jest-require-actual-esm',
  'commonjs-require-production-esm',
  'root-commonjs-test-boundary',
  'global-runtime-surface',
  'jsdom-origin-or-storage',
  'unknown-needs-reproduction',
];

const dispositionByBlocker = {
  'already-native-default': 'already-native-default',
  'native-esm-candidate': 'migrate-to-native-default',
  'coverage-gate-only': 'coverage-only-not-default-runner',
  'babel-hoisted-mock': 'requires-helper-refactor',
  'commonjs-require-production-esm': 'requires-helper-refactor',
  'jest-require-actual-esm': 'requires-helper-refactor',
  'root-commonjs-test-boundary': 'defer-to-default-cutover-decision',
  'node-lifecycle-contract': 'retain-incumbent-contract',
  'global-runtime-surface': 'probe-for-native-default',
  'jsdom-origin-or-storage': 'probe-for-native-default',
  'malformed-package-boundary': 'requires-package-json-fix',
  'test-helper-package-boundary': 'requires-package-boundary-change',
  'incumbent-contract-retained': 'retain-incumbent-contract',
  'unknown-needs-reproduction': 'defer-to-default-cutover-decision',
};

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function normalizeRelativePath(filePath) {
  return toPosix(filePath).replace(/^\.\//, '');
}

function isDescendantPath(relativePath) {
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function assertPathInsideDirectory(filePath, directoryPath, message) {
  const relativePath = path.relative(directoryPath, filePath);
  if (relativePath === '' || isDescendantPath(relativePath)) {
    return;
  }
  throw new Error(message);
}

function normalizeConfigPattern(pattern, rootDir) {
  const normalized = pattern.trim().replace(/^<rootDir>\//, '').replace(/^\.\//, '');
  const absolutePrefix = normalizeRelativePath(path.resolve(rootDir));
  if (normalized.startsWith(`${absolutePrefix}/`)) {
    return normalized.slice(absolutePrefix.length + 1);
  }
  return normalizeRelativePath(normalized);
}

function isTestFile(fileName) {
  return /\.(?:test|spec)\.(?:js|mjs|cjs)$/.test(fileName);
}

function collectTestFiles(rootDir, currentDir, files) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(rootDir, absolutePath, files);
      continue;
    }
    if (entry.isFile() && isTestFile(entry.name)) {
      files.push(normalizeRelativePath(path.relative(rootDir, absolutePath)));
    }
  }
}

function listTestFiles({ rootDir, roots = defaultRoots }) {
  const files = [];
  for (const root of roots) {
    const normalizedRoot = normalizeRelativePath(root).replace(/\/$/, '');
    const absoluteRoot = path.join(rootDir, normalizedRoot);
    if (fs.existsSync(absoluteRoot)) {
      collectTestFiles(rootDir, absoluteRoot, files);
    }
  }
  return [...new Set(files)].sort();
}

function loadConfigTestMatch(configPath, rootDir = process.cwd()) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`找不到 Jest config：${configPath}`);
  }
  delete require.cache[require.resolve(configPath)];
  const config = require(configPath);
  return (config.testMatch || []).map(pattern => normalizeConfigPattern(pattern, rootDir));
}

function findPackageBoundary({ filePath, rootDir }) {
  let currentDir = path.dirname(path.join(rootDir, filePath));
  const rootPath = path.resolve(rootDir);
  while (currentDir.startsWith(rootPath)) {
    if (currentDir === rootPath) {
      break;
    }
    const packagePath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packagePath)) {
      try {
        JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return {
          path: normalizeRelativePath(path.relative(rootDir, packagePath)),
          malformed: false,
        };
      } catch {
        return {
          path: normalizeRelativePath(path.relative(rootDir, packagePath)),
          malformed: true,
        };
      }
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

function startsWithModuleKeyword(line, keyword) {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith(keyword)) {
    return false;
  }
  const nextCharacter = trimmed.at(keyword.length) || '';
  return (
    nextCharacter === '' ||
    nextCharacter === ' ' ||
    nextCharacter === '\t' ||
    nextCharacter === '{' ||
    nextCharacter === '*'
  );
}

function hasRootEsmSyntax(source) {
  return source
    .split(/\r?\n/)
    .some(line => startsWithModuleKeyword(line, 'import') || startsWithModuleKeyword(line, 'export'));
}

function detectSignals({ filePath, source, packageBoundary }) {
  const signals = [];
  const normalizedPath = normalizeRelativePath(filePath);

  if (packageBoundary?.malformed) {
    signals.push('malformed-package-boundary');
  } else if (packageBoundary) {
    signals.push('test-helper-package-boundary');
  }
  if (normalizedPath.startsWith('tests/contract/')) {
    signals.push('incumbent-contract-retained');
  }
  if (/\bjest\.mock\s*\(/.test(source)) {
    signals.push('babel-hoisted-mock');
  }
  if (/\bjest\.requireActual\s*\(/.test(source)) {
    signals.push('jest-require-actual-esm');
  }
  if (/\brequire\s*\(\s*['"][^'"]*(?:scripts|pages)\//.test(source)) {
    signals.push('commonjs-require-production-esm');
  }
  if (/\bmodule\.exports\b|\brequire\.main\b|\bprocess\.argv\b|scripts\/postinstall\.js/.test(source)) {
    signals.push('node-lifecycle-contract');
  }
  if (/\bglobalThis\b|\bglobal\./.test(source)) {
    signals.push('global-runtime-surface');
  }
  if (/\b(?:localStorage|sessionStorage)\b/.test(source)) {
    signals.push('jsdom-origin-or-storage');
  }
  if (
    normalizedPath.endsWith('.js') &&
    (/\brequire\s*\(/.test(source) || hasRootEsmSyntax(source))
  ) {
    signals.push('root-commonjs-test-boundary');
  }

  return [...new Set(signals)];
}

function choosePrimaryBlocker(signals) {
  for (const blocker of blockerPriority) {
    if (signals.includes(blocker)) {
      return blocker;
    }
  }
  return 'unknown-needs-reproduction';
}

function chooseDisposition(primaryBlocker) {
  return dispositionByBlocker[primaryBlocker] || 'defer-to-default-cutover-decision';
}

function countBy(records, key) {
  return records.reduce((counts, record) => {
    const value = record[key];
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function findMatchingRoot(filePath, roots = defaultRoots) {
  return roots
    .map(root => normalizeRelativePath(root).replace(/\/$/, ''))
    .find(candidate => filePath === candidate || filePath.startsWith(`${candidate}/`));
}

function classifyFile({
  filePath,
  rootDir,
  roots = defaultRoots,
  nativeDefaultSet = new Set(),
  nativeCoverageSet = new Set(),
}) {
  const absolutePath = path.join(rootDir, filePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const packageBoundary = findPackageBoundary({ filePath, rootDir });
  const signals = detectSignals({ filePath, source, packageBoundary });
  const root = findMatchingRoot(filePath, roots);

  if (nativeDefaultSet.has(filePath)) {
    signals.unshift('already-native-default');
  } else if (nativeCoverageSet.has(filePath) && filePath.endsWith('.native-esm.test.mjs')) {
    signals.unshift('coverage-gate-only');
  } else if (filePath.endsWith('.native-esm.test.mjs')) {
    signals.unshift('native-esm-candidate');
  }

  const primaryBlocker = choosePrimaryBlocker([...new Set(signals)]);
  return {
    path: filePath,
    root,
    packageBoundary: packageBoundary?.path || null,
    signals: [...new Set(signals)],
    primaryBlocker,
    disposition: chooseDisposition(primaryBlocker),
  };
}

function buildClassificationReport(options) {
  const {
    rootDir = process.cwd(),
    roots = defaultRoots,
    nativeDefaultConfigPath = path.join(rootDir, 'jest.native-default.config.cjs'),
    nativeCoverageConfigPath = path.join(rootDir, 'jest.native-esm.config.cjs'),
    files,
  } = options || {};

  const discoveredFiles = files || listTestFiles({ rootDir, roots });
  const nativeDefaultSet = new Set(loadConfigTestMatch(nativeDefaultConfigPath, rootDir));
  const nativeCoverageSet = new Set(loadConfigTestMatch(nativeCoverageConfigPath, rootDir));
  const records = discoveredFiles.map(filePath =>
    classifyFile({ filePath, rootDir, roots, nativeDefaultSet, nativeCoverageSet })
  );

  return {
    schemaVersion: 1,
    diagnosticOnly: true,
    generatedAt: new Date().toISOString(),
    roots,
    nativeDefaultConfigPath: normalizeRelativePath(path.relative(rootDir, nativeDefaultConfigPath)),
    nativeCoverageConfigPath: normalizeRelativePath(path.relative(rootDir, nativeCoverageConfigPath)),
    totals: {
      discoveredSuites: records.length,
      byRoot: countBy(records, 'root'),
      byBlocker: countBy(records, 'primaryBlocker'),
      byDisposition: countBy(records, 'disposition'),
      alreadyNativeDefault: records.filter(record => record.primaryBlocker === 'already-native-default').length,
      nativeCoverageOnly: records.filter(record => record.primaryBlocker === 'coverage-gate-only').length,
      unknown: records.filter(record => record.primaryBlocker === 'unknown-needs-reproduction').length,
    },
    files: records,
    candidateCohorts: records.filter(record =>
      ['probe-for-native-default', 'migrate-to-native-default'].includes(record.disposition)
    ),
    retainedIncumbentContracts: records.filter(
      record => record.disposition === 'retain-incumbent-contract'
    ),
  };
}

function escapeMarkdownTableCell(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replaceAll('|', String.raw`\|`);
}

function renderCountRows(counts) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => `| \`${escapeMarkdownTableCell(name)}\` | ${count} |`)
    .join('\n');
}

function renderFileRows(files) {
  return files
    .map(
      file =>
        `| \`${escapeMarkdownTableCell(file.path)}\` | \`${file.primaryBlocker}\` | \`${file.disposition}\` | \`${escapeMarkdownTableCell(file.signals.join(', '))}\` |`
    )
    .join('\n');
}

function renderMarkdown(report) {
  const candidateRows =
    report.candidateCohorts.length > 0
      ? renderFileRows(report.candidateCohorts.slice(0, 30))
      : '| _none_ | _none_ | _none_ | _none_ |';
  const retainedRows =
    report.retainedIncumbentContracts.length > 0
      ? renderFileRows(report.retainedIncumbentContracts.slice(0, 30))
      : '| _none_ | _none_ | _none_ | _none_ |';

  return `# Native Default Runner Blocker Classification

> Diagnostic only. This report classifies static migration blockers and does not run Jest suites or claim default runner parity.

## Summary

- Discovered suites: ${report.totals.discoveredSuites}
- Already native default: ${report.totals.alreadyNativeDefault}
- Native ESM coverage-only: ${report.totals.nativeCoverageOnly}
- Unknown entries: ${report.totals.unknown}

## Root Counts

| Root | Count |
| --- | ---: |
${renderCountRows(report.totals.byRoot)}

## Blocker Class Counts

| Blocker | Count |
| --- | ---: |
${renderCountRows(report.totals.byBlocker)}

## Disposition Counts

| Disposition | Count |
| --- | ---: |
${renderCountRows(report.totals.byDisposition)}

## Phase 3 Candidate Cohorts

| File | Primary blocker | Disposition | Signals |
| --- | --- | --- | --- |
${candidateRows}

## Retained Incumbent Contract Cohorts

| File | Primary blocker | Disposition | Signals |
| --- | --- | --- | --- |
${retainedRows}

## Full File Ledger

| File | Primary blocker | Disposition | Signals |
| --- | --- | --- | --- |
${renderFileRows(report.files)}
`;
}

module.exports = {
  assertPathInsideDirectory,
  buildClassificationReport,
  classifyFile,
  chooseDisposition,
  choosePrimaryBlocker,
  defaultRoots,
  detectSignals,
  findMatchingRoot,
  hasRootEsmSyntax,
  listTestFiles,
  loadConfigTestMatch,
  normalizeConfigPattern,
  normalizeRelativePath,
  renderMarkdown,
};
