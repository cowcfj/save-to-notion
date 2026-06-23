import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [
  ,
  ,
  coveragePath = 'coverage/native-esm/coverage-final.json',
  manifestPath = 'tests/native-esm/coverage-line-hits.json',
] = process.argv;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedCoverageRoot = path.join(projectRoot, 'coverage', 'native-esm');
const allowedSourcePrefixes = [
  'scripts/config/',
  'scripts/background/utils/',
  'scripts/highlighter/',
  'scripts/utils/image/',
];

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

function resolveAllowedFilePath(filePath, directoryPath, message) {
  const absolutePath = path.resolve(projectRoot, filePath);
  assertPathInsideDirectory(absolutePath, directoryPath, message);

  const canonicalPath = fs.realpathSync.native(absolutePath);
  const canonicalDirectoryPath = fs.realpathSync.native(directoryPath);
  assertPathInsideDirectory(canonicalPath, canonicalDirectoryPath, message);
  return canonicalPath;
}

const validatedCoveragePath = resolveAllowedFilePath(
  coveragePath,
  allowedCoverageRoot,
  '覆蓋率檔案路徑必須位於 coverage/native-esm 底下'
);
const validatedManifestPath = resolveAllowedFilePath(
  manifestPath,
  projectRoot,
  'manifest 路徑必須位於 repo root 底下'
);
const coverage = JSON.parse(fs.readFileSync(validatedCoveragePath, 'utf8'));
const requiredHits = JSON.parse(fs.readFileSync(validatedManifestPath, 'utf8'));

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

function normalizeCoverageLookupPath(filePath) {
  return normalizeToPosixPath(resolveCoverageKeyPath(filePath));
}

function findFileCoverage(fileSuffix) {
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

const failures = [];
const checkedFiles = new Set();
let checkedLineCount = 0;

for (const filePath of Object.keys(coverage)) {
  assertFormalCoveragePath(filePath);
}

for (const requirement of requiredHits) {
  assertValidRequirement(requirement);
  const fileCoverage = findFileCoverage(requirement.fileSuffix);
  checkedFiles.add(requirement.fileSuffix);
  const lineHits = getLineHits(fileCoverage);
  for (const line of requirement.lines) {
    checkedLineCount += 1;
    const count = lineHits.get(line) || 0;
    if (count <= 0) {
      failures.push(`${requirement.fileSuffix}:${line} 預期命中次數 > 0，實際為 ${count}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Native ESM 行命中檢查通過：${checkedFiles.size} 個檔案, ${checkedLineCount} 行`);
