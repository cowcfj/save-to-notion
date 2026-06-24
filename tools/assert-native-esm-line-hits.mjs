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

function parseCliArgs(argv) {
  const positional = [];
  const options = {
    summaryJsonPath: undefined,
    summaryMarkdownPath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--summary-json') {
      options.summaryJsonPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--summary-md') {
      options.summaryMarkdownPath = argv[index + 1];
      index += 1;
      continue;
    }

    positional.push(arg);
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
      status: failedLines === 0 ? 'pass' : 'fail',
      blocking: true,
      evidence:
        failedLines === 0
          ? `${checkedLineCount} required line-hit assertions passed.`
          : `${failedLines} required line-hit assertions failed.`,
    },
    {
      id: 'diagnostic-integrity',
      status: 'pass',
      blocking: true,
      evidence: 'Coverage entries and manifest targets stayed within allowed formal source paths.',
    },
    {
      id: 'official-scope-parity',
      status: 'not_evaluated',
      blocking: false,
      evidence:
        'Diagnostic target list is intentionally narrower than jest.config.js collectCoverageFrom.',
    },
    {
      id: 'codecov-upload-isolation',
      status: 'pass',
      blocking: false,
      evidence: 'coverage-gate.yml uploads coverage/jest/lcov.info to Codecov.',
    },
    {
      id: 'threshold-parity',
      status: 'not_evaluated',
      blocking: false,
      evidence:
        'Formal coverageThreshold remains owned by npm run test:coverage / npm run test:ci.',
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

function renderMarkdownSummary(summary) {
  const failedFiles = summary.files.filter(file => file.failedLines.length > 0);
  const gateRows = summary.gates
    .map(
      gate =>
        `| \`${gate.id}\` | ${gate.status} | ${gate.blocking ? 'yes' : 'no'} | ${gate.evidence} |`
    )
    .join('\n');
  const fileRows = summary.files
    .map(
      file =>
        `| \`${file.fileSuffix}\` | ${file.requiredLines.length} | ${file.passedLines.length} | ${file.failedLines.length} | ${file.rationale || ''} |`
    )
    .join('\n');
  const failureSection =
    failedFiles.length === 0
      ? 'No failed required line hits.'
      : failedFiles
          .map(file => `- \`${file.fileSuffix}\`: ${file.failedLines.join(', ')}`)
          .join('\n');

  return `# Native ESM Diagnostic Summary

> Diagnostic-only. This is not the official coverage truth; Codecov still uses \`coverage/jest/lcov.info\`.

## Totals

- Files: ${summary.totals.files}
- Required line-hit assertions: ${summary.totals.requiredLines}
- Passed line-hit assertions: ${summary.totals.passedLines}
- Failed line-hit assertions: ${summary.totals.failedLines}

## Gates

| Gate | Status | Blocking | Evidence |
| --- | --- | --- | --- |
${gateRows}

## Files

| File | Required | Passed | Failed | Rationale |
| --- | ---: | ---: | ---: | --- |
${fileRows}

## Failures

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

  for (const filePath of Object.keys(coverage)) {
    assertFormalCoveragePath(filePath);
  }

  for (const requirement of requiredHits) {
    assertValidRequirement(requirement);
    const fileCoverage = findFileCoverage(coverage, requirement.fileSuffix);
    const lineHits = getLineHits(fileCoverage);
    const passedLines = [];
    const failedLines = [];

    for (const line of requirement.lines) {
      checkedLineCount += 1;
      const count = lineHits.get(line) || 0;
      if (count <= 0) {
        failedLines.push(line);
        failures.push(`${requirement.fileSuffix}:${line} 預期命中次數 > 0，實際為 ${count}`);
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
      failedLines: failures.length,
    }),
  };
}

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
