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

const absoluteCoveragePath = path.resolve(projectRoot, coveragePath);
const absoluteManifestPath = path.resolve(projectRoot, manifestPath);
assertPathInsideDirectory(
  absoluteCoveragePath,
  allowedCoverageRoot,
  '覆蓋率檔案路徑必須位於 coverage/native-esm 底下',
);
assertPathInsideDirectory(absoluteManifestPath, projectRoot, 'manifest 路徑必須位於 repo root 底下');
const coverage = JSON.parse(fs.readFileSync(absoluteCoveragePath, 'utf8'));
const requiredHits = JSON.parse(fs.readFileSync(absoluteManifestPath, 'utf8'));

function assertValidRequirement(requirement) {
  if (!requirement || typeof requirement.fileSuffix !== 'string') {
    throw new Error('manifest entry 必須包含 fileSuffix 字串');
  }

  if (!Array.isArray(requirement.lines) || requirement.lines.length === 0) {
    throw new Error(`${requirement.fileSuffix} 必須包含至少一個 line number`);
  }

  const invalidLine = requirement.lines.find((line) => !Number.isInteger(line) || line <= 0);
  if (invalidLine !== undefined) {
    throw new Error(`${requirement.fileSuffix} 包含無效 line number: ${invalidLine}`);
  }
}

function findFileCoverage(fileSuffix) {
  const normalizedSuffix = fileSuffix.split('/').join(path.sep);
  const entry = Object.entries(coverage).find(([filePath]) => filePath.endsWith(normalizedSuffix));
  if (!entry) {
    throw new Error(`找不到 ${fileSuffix} 的覆蓋率資料`);
  }
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

for (const requirement of requiredHits) {
  assertValidRequirement(requirement);
  const fileCoverage = findFileCoverage(requirement.fileSuffix);
  const lineHits = getLineHits(fileCoverage);
  for (const line of requirement.lines) {
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

console.log('Native ESM 行命中檢查通過');
