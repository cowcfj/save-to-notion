import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedCoverageRoot = path.join(projectRoot, 'coverage', 'native-esm');
const allowedManifestRoot = path.join(projectRoot, 'tests', 'native-esm');
const allowedSourcePrefixes = [
  'scripts/config/',
  'scripts/background/utils/',
  'scripts/highlighter/',
  'scripts/utils/image/',
];

function readFlagValue(argv, index, flagName, errors) {
  const nextArg = argv[index + 1];
  if (!nextArg || nextArg.startsWith('--')) {
    errors.push(`${flagName} 缺少輸出路徑`);
    return { nextIndex: index, value: undefined };
  }

  return { nextIndex: index + 1, value: nextArg };
}

function parseCliArgs(argv) {
  const positional = [];
  const options = {
    summaryJsonPath: undefined,
    summaryMarkdownPath: undefined,
  };
  const errors = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--summary-json') {
      const result = readFlagValue(argv, index, arg, errors);
      options.summaryJsonPath = result.value;
      index = result.nextIndex;
      continue;
    }
    if (arg === '--summary-md') {
      const result = readFlagValue(argv, index, arg, errors);
      options.summaryMarkdownPath = result.value;
      index = result.nextIndex;
      continue;
    }

    positional.push(arg);
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return {
    coveragePath: positional[0] || 'coverage/native-esm/coverage-final.json',
    manifestPath: positional[1] || 'tests/native-esm/coverage-line-hits.json',
    ...options,
  };
}

function isDescendantPath(relativePath) {
  if (relativePath.startsWith('..')) {
    return false;
  }

  return !path.isAbsolute(relativePath);
}

function assertPathInsideDirectory(filePath, directoryPath, message) {
  const relativePath = path.relative(directoryPath, filePath);
  if (relativePath === '') {
    return;
  }

  if (isDescendantPath(relativePath)) {
    return;
  }

  throw new Error(message);
}

function readJsonFromCanonicalAllowedFile(filePath, directoryPath, message) {
  const absolutePath = path.resolve(projectRoot, filePath);
  const relativePath = path.relative(directoryPath, absolutePath);
  const isOutsideDirectory =
    relativePath !== '' && (relativePath.startsWith('..') || path.isAbsolute(relativePath));
  if (isOutsideDirectory) {
    throw new Error(message);
  }

  const canonicalPath = fs.realpathSync.native(absolutePath);
  const canonicalDirectoryPath = fs.realpathSync.native(directoryPath);
  const canonicalRelativePath = path.relative(canonicalDirectoryPath, canonicalPath);
  const isOutsideCanonicalDirectory =
    canonicalRelativePath !== '' &&
    (canonicalRelativePath.startsWith('..') || path.isAbsolute(canonicalRelativePath));
  if (isOutsideCanonicalDirectory) {
    throw new Error(message);
  }

  return JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
}

function normalizeToPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function resolveCoverageKeyPath(filePath) {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(projectRoot, filePath);
}

function assertFormalCoveragePath(filePath) {
  const normalizedPath = normalizeToPosixPath(filePath);
  if (normalizedPath.includes('/.tmp/coverage-spike/')) {
    throw new Error(`coverage entry 不可來自 .tmp/coverage-spike: ${filePath}`);
  }

  assertPathInsideDirectory(
    resolveCoverageKeyPath(filePath),
    projectRoot,
    `coverage entry 必須位於 repo root 底下: ${filePath}`
  );
}

function assertAllowedSourceSuffix(fileSuffix) {
  if (allowedSourcePrefixes.some(prefix => fileSuffix.startsWith(prefix))) {
    return;
  }

  throw new Error(`manifest fileSuffix 不在 native ESM diagnostic allowlist: ${fileSuffix}`);
}

function assertRequirementFileSuffix(requirement) {
  if (!requirement || typeof requirement.fileSuffix !== 'string') {
    throw new Error('manifest entry 必須包含 fileSuffix 字串');
  }

  assertAllowedSourceSuffix(requirement.fileSuffix);
  return requirement.fileSuffix;
}

function hasRequiredLineList(lines) {
  return Array.isArray(lines) && lines.length > 0;
}

function isInvalidLineNumber(line) {
  return !Number.isInteger(line) || line <= 0;
}

function assertRequirementLines(fileSuffix, lines) {
  if (!hasRequiredLineList(lines)) {
    throw new Error(`${fileSuffix} 必須包含至少一個 line number`);
  }

  const invalidLine = lines.find(isInvalidLineNumber);
  if (invalidLine !== undefined) {
    throw new Error(`${fileSuffix} 包含無效 line number: ${invalidLine}`);
  }
}

function assertValidRequirement(requirement) {
  const fileSuffix = assertRequirementFileSuffix(requirement);
  assertRequirementLines(fileSuffix, requirement.lines);
}

function assertUniqueRequirements(requirements) {
  if (!Array.isArray(requirements)) {
    throw new Error('manifest 必須是陣列');
  }

  const seen = new Set();
  for (const requirement of requirements) {
    const fileSuffix = requirement?.fileSuffix;
    if (typeof fileSuffix !== 'string') {
      continue;
    }
    if (seen.has(fileSuffix)) {
      throw new Error(`manifest fileSuffix 不可重複: ${fileSuffix}`);
    }
    seen.add(fileSuffix);
  }
}

function normalizeCoverageLookupPath(filePath) {
  return normalizeToPosixPath(resolveCoverageKeyPath(filePath));
}

function findFileCoverage(coverage, fileSuffix) {
  const normalizedFilePath = normalizeCoverageLookupPath(fileSuffix.split('/').join(path.sep));
  const entry = Object.entries(coverage).find(
    ([filePath]) => normalizeCoverageLookupPath(filePath) === normalizedFilePath
  );
  if (!entry) {
    throw new Error(`找不到 ${fileSuffix} 的覆蓋率資料`);
  }
  assertFormalCoveragePath(entry[0]);
  return entry[1];
}

function getLineHits(fileCoverage) {
  const hits = new Map();
  for (const [id, location] of Object.entries(fileCoverage.statementMap)) {
    const count = fileCoverage.s[id] || 0;
    for (let line = location.start.line; line <= location.end.line; line += 1) {
      hits.set(line, Math.max(hits.get(line) || 0, count));
    }
  }
  return hits;
}

function normalizeReportPath(filePath) {
  return normalizeToPosixPath(path.relative(projectRoot, path.resolve(projectRoot, filePath)));
}

function createGateRecords({ failedLines, checkedLineCount }) {
  return [
    {
      id: 'source-line-correctness',
      label: '來源行命中正確性',
      status: failedLines === 0 ? 'pass' : 'fail',
      blocking: true,
      evidence:
        failedLines === 0
          ? `${checkedLineCount} 個必要行命中斷言已通過。`
          : `${failedLines} 個必要行命中斷言失敗。`,
    },
    {
      id: 'diagnostic-integrity',
      label: '診斷完整性',
      status: 'pass',
      blocking: true,
      evidence: '覆蓋率 entries 與 manifest targets 都維持在允許的正式 source paths 內。',
    },
    {
      id: 'official-scope-parity',
      label: '正式範圍對齊',
      status: 'not_evaluated',
      blocking: false,
      evidence: '診斷 target list 刻意比 jest.config.js collectCoverageFrom 更窄。',
    },
    {
      id: 'codecov-upload-isolation',
      label: 'Codecov 上傳隔離',
      status: 'pass',
      blocking: false,
      evidence: 'coverage-gate.yml 會上傳 coverage/jest/lcov.info 到 Codecov。',
    },
    {
      id: 'threshold-parity',
      label: '門檻對齊',
      status: 'not_evaluated',
      blocking: false,
      evidence: '正式 coverageThreshold 仍由 npm run test:coverage / npm run test:ci 負責。',
    },
  ];
}

function buildSummary({ coveragePath, manifestPath, fileResults, checkedLineCount, failedLines }) {
  return {
    schemaVersion: 1,
    diagnosticOnly: true,
    coveragePath: normalizeReportPath(coveragePath),
    manifestPath: normalizeReportPath(manifestPath),
    totals: {
      files: fileResults.length,
      requiredLines: checkedLineCount,
      passedLines: checkedLineCount - failedLines,
      failedLines,
    },
    files: fileResults,
    gates: createGateRecords({ failedLines, checkedLineCount }),
  };
}

function formatGateStatus(status) {
  return (
    {
      pass: '通過',
      fail: '失敗',
      not_evaluated: '未評估',
    }[status] || status
  );
}

function formatGateName(gate) {
  return gate.label || ['`', gate.id, '`'].join('');
}

function escapeMarkdownTableCell(value) {
  return String(value).replace(/\r?\n/g, ' ').replaceAll('|', '\\|');
}

function renderMarkdownSummary(summary) {
  const failedFiles = summary.files.filter(file => file.failedLines.length > 0);
  const gateRows = summary.gates
    .map(
      gate =>
        `| ${formatGateName(gate)} | ${formatGateStatus(gate.status)} | ${gate.blocking ? '是' : '否'} | ${gate.evidence} |`
    )
    .join('\n');
  const fileRows = summary.files
    .map(
      file =>
        `| \`${file.fileSuffix}\` | ${file.requiredLines.length} | ${file.passedLines.length} | ${file.failedLines.length} | ${escapeMarkdownTableCell(file.rationale || '')} |`
    )
    .join('\n');
  const failureSection =
    failedFiles.length === 0
      ? '沒有失敗的必要行命中。'
      : failedFiles
          .map(file => `- \`${file.fileSuffix}\`: ${file.failedLines.join(', ')}`)
          .join('\n');

  return `# Native ESM 診斷摘要

> 僅供診斷。這不是正式 coverage truth；Codecov 仍使用 \`coverage/jest/lcov.info\`。

## 總計

- 檔案數：${summary.totals.files}
- 必要行命中斷言：${summary.totals.requiredLines}
- 已通過行命中斷言：${summary.totals.passedLines}
- 失敗行命中斷言：${summary.totals.failedLines}

## Gates

| Gate | 狀態 | 阻擋 | 證據 |
| --- | --- | --- | --- |
${gateRows}

## 檔案

| 檔案 | 必要 | 通過 | 失敗 | 理由 |
| --- | ---: | ---: | ---: | --- |
${fileRows}

## 失敗明細

${failureSection}
`;
}

function assertSummaryPath(filePath) {
  if (!filePath) {
    throw new Error('summary output path 不可為空');
  }
  assertPathInsideDirectory(
    path.resolve(projectRoot, filePath),
    allowedCoverageRoot,
    'summary output path 必須位於 coverage/native-esm 底下'
  );
}

function writeSummaryFile(filePath, content) {
  assertSummaryPath(filePath);
  const absolutePath = path.resolve(projectRoot, filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
}

function runDiagnostic({ coveragePath, manifestPath }) {
  const coverage = readJsonFromCanonicalAllowedFile(
    coveragePath,
    allowedCoverageRoot,
    '覆蓋率檔案路徑必須位於 coverage/native-esm 底下'
  );
  const requiredHits = readJsonFromCanonicalAllowedFile(
    manifestPath,
    allowedManifestRoot,
    'manifest 路徑必須位於 tests/native-esm 底下'
  );

  assertUniqueRequirements(requiredHits);

  const failures = [];
  const fileResults = [];
  let checkedLineCount = 0;
  let failedLineCount = 0;

  for (const filePath of Object.keys(coverage)) {
    assertFormalCoveragePath(filePath);
  }

  for (const requirement of requiredHits) {
    assertValidRequirement(requirement);
    const passedLines = [];
    const failedLines = [];

    let lineHits;
    try {
      lineHits = getLineHits(findFileCoverage(coverage, requirement.fileSuffix));
    } catch (error) {
      failures.push(error.message);
      checkedLineCount += requirement.lines.length;
      failedLineCount += requirement.lines.length;
      fileResults.push({
        fileSuffix: requirement.fileSuffix,
        rationale: requirement.rationale || '',
        requiredLines: requirement.lines,
        passedLines,
        failedLines: requirement.lines,
      });
      continue;
    }

    for (const line of requirement.lines) {
      checkedLineCount += 1;
      const count = lineHits.get(line) || 0;
      if (count <= 0) {
        failedLines.push(line);
        failures.push(`${requirement.fileSuffix}:${line} 預期命中次數 > 0，實際為 ${count}`);
        failedLineCount += 1;
      } else {
        passedLines.push(line);
      }
    }

    fileResults.push({
      fileSuffix: requirement.fileSuffix,
      rationale: requirement.rationale || '',
      requiredLines: requirement.lines,
      passedLines,
      failedLines,
    });
  }

  return {
    failures,
    checkedLineCount,
    summary: buildSummary({
      coveragePath,
      manifestPath,
      fileResults,
      checkedLineCount,
      failedLines: failedLineCount,
    }),
  };
}

function main() {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const { failures, checkedLineCount, summary } = runDiagnostic(cliOptions);

  if (cliOptions.summaryJsonPath) {
    writeSummaryFile(cliOptions.summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  }
  if (cliOptions.summaryMarkdownPath) {
    writeSummaryFile(cliOptions.summaryMarkdownPath, renderMarkdownSummary(summary));
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }

  console.log(`Native ESM 行命中檢查通過：${summary.totals.files} 個檔案, ${checkedLineCount} 行`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
