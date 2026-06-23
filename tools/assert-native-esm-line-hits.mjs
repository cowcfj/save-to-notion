import fs from 'node:fs';
import path from 'node:path';

const [, , coveragePath = 'coverage/native-esm/coverage-final.json'] = process.argv;
const absoluteCoveragePath = path.resolve(coveragePath);
const coverage = JSON.parse(fs.readFileSync(absoluteCoveragePath, 'utf8'));

const requiredHits = [
  {
    fileSuffix: 'scripts/background/utils/BlockBuilder.js',
    lines: [54, 55, 56, 57],
  },
  {
    fileSuffix: 'scripts/highlighter/autoInit/initializationInputs.js',
    lines: [38, 39, 40, 41],
  },
];

function findFileCoverage(fileSuffix) {
  const normalizedSuffix = fileSuffix.split('/').join(path.sep);
  const entry = Object.entries(coverage).find(([filePath]) => filePath.endsWith(normalizedSuffix));
  if (!entry) {
    throw new Error(`Missing coverage entry for ${fileSuffix}`);
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
  const fileCoverage = findFileCoverage(requirement.fileSuffix);
  const lineHits = getLineHits(fileCoverage);
  for (const line of requirement.lines) {
    const count = lineHits.get(line) || 0;
    if (count <= 0) {
      failures.push(`${requirement.fileSuffix}:${line} expected > 0 hit, got ${count}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('native-esm-line-hits:ok');
