import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const allowedOutputRoot = path.join(projectRoot, 'coverage', 'native-esm');

const {
  assertPathInsideDirectory,
  buildScopeParitySummary,
  defaultZeroCoverageCanaryPaths,
  evaluateCoveragePatterns,
  listJavaScriptSourceFiles,
  normalizeRelativePath,
  renderMarkdownSummary,
} = require('./report-native-esm-scope-parity-core.cjs');

function assertOutputPath(filePath) {
  assertPathInsideDirectory(
    path.resolve(projectRoot, filePath),
    allowedOutputRoot,
    'summary output path 必須位於 coverage/native-esm 底下'
  );
}

function parseCliArgs(argv) {
  const options = {
    summaryJsonPath: 'coverage/native-esm/scope-parity-summary.json',
    summaryMarkdownPath: 'coverage/native-esm/scope-parity-summary.md',
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
    throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function readNativeCoverageEntries(coveragePath) {
  const absoluteCoveragePath = path.resolve(projectRoot, coveragePath);
  if (!fs.existsSync(absoluteCoveragePath)) {
    return {};
  }
  assertPathInsideDirectory(absoluteCoveragePath, projectRoot, 'native coverage path 必須位於 repo root 底下');
  const coverage = JSON.parse(fs.readFileSync(absoluteCoveragePath, 'utf8'));
  const entries = {};
  for (const [filePath, fileCoverage] of Object.entries(coverage)) {
    const absoluteFilePath = path.resolve(filePath);
    assertPathInsideDirectory(absoluteFilePath, projectRoot, `coverage entry 必須位於 repo root 底下: ${filePath}`);
    const relativePath = normalizeRelativePath(path.relative(projectRoot, absoluteFilePath));
    if (relativePath.startsWith('.tmp/coverage-spike/')) {
      throw new Error(`coverage entry 不可來自 .tmp/coverage-spike: ${filePath}`);
    }
    entries[relativePath] = { statementHits: Object.values(fileCoverage.s || {}) };
  }
  return entries;
}

function buildCurrentRepoSummary() {
  const officialConfig = require(path.join(projectRoot, 'jest.config.js'));
  const nativeConfig = require(path.join(projectRoot, 'jest.native-esm.config.cjs'));
  const sourceFiles = listJavaScriptSourceFiles(projectRoot, ['scripts', 'pages']);
  const officialScope = evaluateCoveragePatterns(sourceFiles, officialConfig.collectCoverageFrom || []);
  const nativeScope = evaluateCoveragePatterns(sourceFiles, nativeConfig.collectCoverageFrom || []);
  const nativeCoverageEntries = readNativeCoverageEntries('coverage/native-esm/coverage-final.json');

  return buildScopeParitySummary({
    officialIncluded: officialScope.included,
    officialExcluded: officialScope.excluded,
    nativeIncluded: nativeScope.included,
    nativeCoverageEntries,
    zeroCoverageCanaryPaths: defaultZeroCoverageCanaryPaths,
    unsupportedPatterns: [...officialScope.unsupportedPatterns, ...nativeScope.unsupportedPatterns],
  });
}

function writeOutputFiles(summary, options) {
  assertOutputPath(options.summaryJsonPath);
  assertOutputPath(options.summaryMarkdownPath);
  const jsonPath = path.resolve(projectRoot, options.summaryJsonPath);
  const markdownPath = path.resolve(projectRoot, options.summaryMarkdownPath);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdownSummary(summary), 'utf8');
}

function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  const summary = buildCurrentRepoSummary();
  writeOutputFiles(summary, options);
  console.log(
    `Native ESM scope parity report written: ${summary.totals.officialIncluded} official files, ${summary.totals.nativeIncluded} native candidate files, ${summary.totals.missingFromNativeCandidate} missing, ${summary.totals.extraNativeCandidate} extra`
  );
  if (summary.totals.unsupportedPatterns > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
