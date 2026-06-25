const fs = require('node:fs');
const path = require('node:path');

const defaultZeroCoverageCanaryPaths = ['pages/update-notification/update-notification.js'];

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function normalizeRelativePath(filePath) {
  return toPosix(filePath).replace(/^\.\//, '');
}

function normalizePattern(pattern) {
  return pattern.trim().replace(/^!/, '').replace(/^<rootDir>\//, '').replace(/^\.\//, '');
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

function isSupportedPattern(pattern) {
  const normalizedPattern = normalizePattern(pattern);
  return normalizedPattern === '**/node_modules/**' || /^[^{}()[\]]+$/.test(normalizedPattern);
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function globToRegExp(pattern) {
  const normalizedPattern = normalizePattern(pattern);
  let expression = '^';
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const char = normalizedPattern[index];
    const next = normalizedPattern[index + 1];
    const afterNext = normalizedPattern[index + 2];

    if (char === '*' && next === '*' && afterNext === '/') {
      expression += '(?:.*/)?';
      index += 2;
      continue;
    }

    if (char === '*' && next === '*') {
      expression += '.*';
      index += 1;
      continue;
    }

    if (char === '*') {
      expression += '[^/]*';
      continue;
    }

    expression += escapeRegExp(char);
  }
  expression += '$';
  return new RegExp(expression);
}

function matchesPattern(filePath, pattern) {
  return globToRegExp(pattern).test(normalizeRelativePath(filePath));
}

function collectFiles(rootDir, currentDir, roots, files) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(rootDir, absolutePath, roots, files);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) {
      continue;
    }
    const relativePath = normalizeRelativePath(path.relative(rootDir, absolutePath));
    if (roots.some(root => relativePath === root || relativePath.startsWith(`${root}/`))) {
      files.push(relativePath);
    }
  }
}

function listJavaScriptSourceFiles(rootDir, roots) {
  const files = [];
  const normalizedRoots = roots.map(root => normalizeRelativePath(root).replace(/\/$/, ''));
  for (const root of normalizedRoots) {
    const rootPath = path.join(rootDir, root);
    if (fs.existsSync(rootPath)) {
      collectFiles(rootDir, rootPath, normalizedRoots, files);
    }
  }
  return [...new Set(files)].sort();
}

function evaluateCoveragePatterns(files, patterns) {
  const included = new Set();
  const excluded = new Set();
  const unsupportedPatterns = [];

  for (const pattern of patterns) {
    if (!isSupportedPattern(pattern)) {
      unsupportedPatterns.push(pattern);
      continue;
    }
    const isExclusion = pattern.trim().startsWith('!');
    for (const file of files) {
      if (!matchesPattern(file, pattern)) {
        continue;
      }
      if (isExclusion) {
        included.delete(file);
        excluded.add(file);
      } else if (!excluded.has(file)) {
        included.add(file);
      }
    }
  }

  return {
    included: [...included].sort(),
    excluded: [...excluded].sort(),
    unsupportedPatterns,
  };
}

function classifyCoverageEntry(entry) {
  if (!entry) {
    return 'missing';
  }
  const hits = entry.statementHits || [];
  if (hits.length === 0 || hits.every(hit => hit === 0)) {
    return 'zero';
  }
  return 'nonzero';
}

function createFileRecords({
  officialIncluded,
  officialExcluded,
  nativeIncluded,
  nativeCoverageEntries,
  zeroCoverageCanaryPaths,
}) {
  const officialIncludedSet = new Set(officialIncluded);
  const officialExcludedSet = new Set(officialExcluded);
  const nativeIncludedSet = new Set(nativeIncluded);
  const allFiles = new Set([...officialIncluded, ...officialExcluded, ...nativeIncluded, ...zeroCoverageCanaryPaths]);

  return [...allFiles].sort().flatMap(filePath => {
    const official = officialIncludedSet.has(filePath)
      ? 'included'
      : officialExcludedSet.has(filePath)
        ? 'excluded'
        : 'not_in_scope';
    const nativeCandidate = nativeIncludedSet.has(filePath) ? 'included' : 'missing';
    const nativeCoverageEntry = classifyCoverageEntry(nativeCoverageEntries[filePath]);
    const isZeroCanary = zeroCoverageCanaryPaths.includes(filePath);

    if (isZeroCanary) {
      return [
        {
          path: filePath,
          official,
          nativeCandidate,
          nativeCoverageEntry,
          classification: 'zero-coverage-canary',
          reason: 'Official in-scope page script should remain visible as 0% before cutover.',
        },
      ];
    }

    if (official === 'included' && nativeCandidate === 'missing') {
      return [
        {
          path: filePath,
          official,
          nativeCandidate,
          nativeCoverageEntry,
          classification: 'missing-from-native-candidate',
          reason: 'Official coverage scope includes this file, but native candidate scope does not.',
        },
      ];
    }

    if (official !== 'included' && nativeCandidate === 'included') {
      return [
        {
          path: filePath,
          official,
          nativeCandidate,
          nativeCoverageEntry,
          classification: 'extra-native-candidate',
          reason: 'Native candidate includes a file outside official included coverage scope.',
        },
      ];
    }

    if (official === 'included' && nativeCandidate === 'included') {
      return [
        {
          path: filePath,
          official,
          nativeCandidate,
          nativeCoverageEntry,
          classification: 'included-in-both',
          reason: 'File is included by both official and native candidate coverage scopes.',
        },
      ];
    }

    return [];
  });
}

function createGateRecords({ files, unsupportedPatterns }) {
  const missingCount = files.filter(file => file.official === 'included' && file.nativeCandidate === 'missing').length;
  const extraCount = files.filter(file => file.classification === 'extra-native-candidate').length;
  const zeroCanaries = files.filter(file => file.classification === 'zero-coverage-canary');
  const zeroCanaryPass = zeroCanaries.length > 0 && zeroCanaries.every(file => file.nativeCoverageEntry === 'zero');

  return [
    {
      id: 'official-scope-parity',
      status: missingCount === 0 && extraCount === 0 ? 'pass' : 'fail',
      blocking: false,
      evidence:
        missingCount === 0 && extraCount === 0
          ? 'Native candidate scope matches official included coverage scope.'
          : `Native candidate differs from official scope: ${missingCount} missing, ${extraCount} extra.`,
    },
    {
      id: 'zero-coverage-canary',
      status: zeroCanaryPass ? 'pass' : 'fail',
      blocking: false,
      evidence: zeroCanaryPass
        ? 'Zero-coverage canary appears in native coverage output with zero hits.'
        : 'Zero-coverage canary is missing or not represented as a zero-hit file.',
    },
    {
      id: 'report-integrity',
      status: unsupportedPatterns.length === 0 ? 'pass' : 'fail',
      blocking: true,
      evidence:
        unsupportedPatterns.length === 0
          ? 'Configs, source files, coverage entries, and output paths stayed under repo root / coverage/native-esm.'
          : `${unsupportedPatterns.length} unsupported collectCoverageFrom pattern(s) found.`,
    },
  ];
}

function buildScopeParitySummary({
  officialIncluded,
  officialExcluded,
  nativeIncluded,
  nativeCoverageEntries,
  zeroCoverageCanaryPaths = defaultZeroCoverageCanaryPaths,
  unsupportedPatterns,
  officialConfigPath = 'jest.config.js',
  nativeConfigPath = 'jest.native-esm.config.cjs',
  nativeCoveragePath = 'coverage/native-esm/coverage-final.json',
}) {
  const files = createFileRecords({
    officialIncluded,
    officialExcluded,
    nativeIncluded,
    nativeCoverageEntries,
    zeroCoverageCanaryPaths,
  });
  const missingCount = files.filter(file => file.official === 'included' && file.nativeCandidate === 'missing').length;
  const extraCount = files.filter(file => file.classification === 'extra-native-candidate').length;

  return {
    schemaVersion: 1,
    diagnosticOnly: true,
    officialConfigPath,
    nativeConfigPath,
    nativeCoveragePath,
    totals: {
      officialIncluded: officialIncluded.length,
      officialExcluded: officialExcluded.length,
      nativeIncluded: nativeIncluded.length,
      missingFromNativeCandidate: missingCount,
      extraNativeCandidate: extraCount,
      zeroCoverageCanaries: zeroCoverageCanaryPaths.length,
      unsupportedPatterns: unsupportedPatterns.length,
    },
    files,
    unsupportedPatterns,
    gates: createGateRecords({ files, unsupportedPatterns }),
  };
}

function formatGateStatus(status) {
  return {
    pass: '通過',
    fail: '失敗',
  }[status] || status;
}

function escapeMarkdownTableCell(value) {
  return String(value).replace(/\r?\n/g, ' ').replaceAll('|', String.raw`\|`);
}

function renderMarkdownSummary(summary) {
  const gateRows = summary.gates
    .map(
      gate =>
        `| \`${gate.id}\` | ${formatGateStatus(gate.status)} | ${gate.blocking ? '是' : '否'} | ${escapeMarkdownTableCell(gate.evidence)} |`
    )
    .join('\n');
  const fileRows = summary.files
    .map(
      file =>
        `| \`${file.path}\` | ${file.official} | ${file.nativeCandidate} | ${file.nativeCoverageEntry} | ${file.classification} | ${escapeMarkdownTableCell(file.reason)} |`
    )
    .join('\n');

  return `# Native ESM Scope Parity Summary

> 僅供診斷。這不是正式 coverage truth；Codecov 仍使用 \`coverage/jest/lcov.info\`。

## Totals

- Official included files: ${summary.totals.officialIncluded}
- Official excluded files: ${summary.totals.officialExcluded}
- Native candidate files: ${summary.totals.nativeIncluded}
- Missing from native candidate: ${summary.totals.missingFromNativeCandidate}
- Extra native candidate files: ${summary.totals.extraNativeCandidate}
- Zero-coverage canaries: ${summary.totals.zeroCoverageCanaries}
- Unsupported patterns: ${summary.totals.unsupportedPatterns}

## Gates

| Gate | 狀態 | 阻擋 | 證據 |
| --- | --- | --- | --- |
${gateRows}

## File Classifications

| File | Official | Native Candidate | Native Coverage Entry | Classification | Reason |
| --- | --- | --- | --- | --- | --- |
${fileRows}
`;
}

module.exports = {
  assertPathInsideDirectory,
  buildScopeParitySummary,
  defaultZeroCoverageCanaryPaths,
  evaluateCoveragePatterns,
  listJavaScriptSourceFiles,
  normalizePattern,
  normalizeRelativePath,
  renderMarkdownSummary,
};
