import fs from 'node:fs';
import path from 'node:path';

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
  if (hits.length === 0) {
    return 'zero';
  }
  if (hits.every(hit => hit === 0)) {
    return 'zero';
  }
  return 'nonzero';
}

function getOfficialScopeStatus(filePath, officialIncludedSet, officialExcludedSet) {
  if (officialIncludedSet.has(filePath)) {
    return 'included';
  }
  if (officialExcludedSet.has(filePath)) {
    return 'excluded';
  }
  return 'not_in_scope';
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
    const official = getOfficialScopeStatus(filePath, officialIncludedSet, officialExcludedSet);
    const nativeCandidate = nativeIncludedSet.has(filePath) ? 'included' : 'missing';
    const nativeCoverageEntry = classifyCoverageEntry(nativeCoverageEntries[filePath]);
    const isZeroCanary = zeroCoverageCanaryPaths.includes(filePath);
    const records = [];

    if (isZeroCanary) {
      records.push({
        path: filePath,
        official,
        nativeCandidate,
        nativeCoverageEntry,
        classification: 'zero-coverage-canary',
        reason: '正式範圍內的頁面腳本在切換前應維持可見，即使 native ESM 覆蓋率為 0%。',
      });
    }

    if (official === 'included' && nativeCandidate === 'missing') {
      records.push({
        path: filePath,
        official,
        nativeCandidate,
        nativeCoverageEntry,
        classification: 'missing-from-native-candidate',
        reason: 'official coverage 範圍包含此檔案，但 native candidate 範圍未包含。',
      });
    }

    if (official !== 'included' && nativeCandidate === 'included') {
      records.push({
        path: filePath,
        official,
        nativeCandidate,
        nativeCoverageEntry,
        classification: 'extra-native-candidate',
        reason: 'native candidate 包含 official included coverage 範圍外的檔案。',
      });
    }

    if (official === 'included' && nativeCandidate === 'included') {
      records.push({
        path: filePath,
        official,
        nativeCandidate,
        nativeCoverageEntry,
        classification: 'included-in-both',
        reason: 'official 與 native candidate coverage 範圍都包含此檔案。',
      });
    }

    return records;
  });
}

function createGateRecords({ files, unsupportedPatterns }) {
  const missingCount = files.filter(file => file.classification === 'missing-from-native-candidate').length;
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
          ? 'native candidate 範圍與 official included coverage 範圍一致。'
          : `native candidate 與 official 範圍不一致：缺少 ${missingCount} 個，多出 ${extraCount} 個。`,
    },
    {
      id: 'zero-coverage-canary',
      status: zeroCanaryPass ? 'pass' : 'fail',
      blocking: false,
      evidence: zeroCanaryPass
        ? 'zero-coverage canary 已出現在 native coverage output，且命中數為 0。'
        : 'zero-coverage canary 缺失，或未以零命中檔案呈現。',
    },
    {
      id: 'report-integrity',
      status: unsupportedPatterns.length === 0 ? 'pass' : 'fail',
      blocking: true,
      evidence:
        unsupportedPatterns.length === 0
          ? 'config、source file、coverage entry 與 output path 都維持在 repo root / coverage/native-esm 範圍內。'
          : `發現 ${unsupportedPatterns.length} 個不支援的 collectCoverageFrom pattern。`,
    },
  ];
}

function buildScopeParitySummary({
  officialIncluded,
  officialExcluded,
  nativeIncluded,
  nativeCoverageEntries = {},
  zeroCoverageCanaryPaths = defaultZeroCoverageCanaryPaths,
  unsupportedPatterns,
  officialConfigPath = 'jest.config.js',
  nativeConfigPath = 'jest.native-esm.config.js',
  nativeCoveragePath = 'coverage/native-esm/coverage-final.json',
}) {
  const files = createFileRecords({
    officialIncluded,
    officialExcluded,
    nativeIncluded,
    nativeCoverageEntries,
    zeroCoverageCanaryPaths,
  });
  const missingCount = files.filter(file => file.classification === 'missing-from-native-candidate').length;
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

  return `# Native ESM scope parity 摘要

> 僅供診斷。在本次單一上傳演練中，Codecov 已切換使用 \`coverage/native-esm/lcov.info\`。

## 總計

- official included 檔案數：${summary.totals.officialIncluded}
- official excluded 檔案數：${summary.totals.officialExcluded}
- native candidate 檔案數：${summary.totals.nativeIncluded}
- native candidate 缺少檔案數：${summary.totals.missingFromNativeCandidate}
- native candidate 多出檔案數：${summary.totals.extraNativeCandidate}
- zero-coverage canary 數：${summary.totals.zeroCoverageCanaries}
- 不支援 pattern 數：${summary.totals.unsupportedPatterns}

## 閘門

| 閘門 | 狀態 | 阻擋 | 證據 |
| --- | --- | --- | --- |
${gateRows}

## 檔案分類

| 檔案 | official 狀態 | native candidate 狀態 | native coverage entry | 分類 | 原因 |
| --- | --- | --- | --- | --- | --- |
${fileRows}
`;
}

export {
  assertPathInsideDirectory,
  buildScopeParitySummary,
  defaultZeroCoverageCanaryPaths,
  evaluateCoveragePatterns,
  listJavaScriptSourceFiles,
  normalizePattern,
  normalizeRelativePath,
  renderMarkdownSummary,
};
