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

function readRequiredOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${optionName} 必須提供路徑值`);
  }
  return value;
}

function parseCliArgs(argv) {
  const options = {
    nativeCoveragePath: 'coverage/native-esm/coverage-final.json',
    summaryJsonPath: 'coverage/native-esm/scope-parity-summary.json',
    summaryMarkdownPath: 'coverage/native-esm/scope-parity-summary.md',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--native-coverage') {
      options.nativeCoveragePath = readRequiredOptionValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--summary-json') {
      options.summaryJsonPath = readRequiredOptionValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--summary-md') {
      options.summaryMarkdownPath = readRequiredOptionValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`未知參數：${arg}`);
  }
  return options;
}

function isCoverageObject(coverage) {
  if (coverage === null) {
    return false;
  }
  if (Array.isArray(coverage)) {
    return false;
  }
  return typeof coverage === 'object';
}

function toNativeCoverageEntry(filePath, fileCoverage) {
  const absoluteFilePath = path.resolve(filePath);
  assertPathInsideDirectory(absoluteFilePath, projectRoot, `coverage entry 必須位於 repo root 底下: ${filePath}`);
  const relativePath = normalizeRelativePath(path.relative(projectRoot, absoluteFilePath));
  if (relativePath.startsWith('.tmp/coverage-spike/')) {
    throw new Error(`coverage entry 不可來自 .tmp/coverage-spike: ${filePath}`);
  }
  if (!isCoverageObject(fileCoverage) || !isCoverageObject(fileCoverage.s)) {
    throw new Error(`native ESM coverage entry 的 statement hit map 必須是 JSON object：${relativePath}`);
  }
  return [relativePath, { statementHits: Object.values(fileCoverage.s) }];
}

function readNativeCoverageEntries(coveragePath) {
  const absoluteCoveragePath = path.resolve(projectRoot, coveragePath);
  if (!fs.existsSync(absoluteCoveragePath)) {
    throw new Error(`找不到 native ESM 覆蓋率檔案：${coveragePath}。請先執行 npm run test:coverage:native-esm。`);
  }
  assertPathInsideDirectory(absoluteCoveragePath, projectRoot, 'native coverage path 必須位於 repo root 底下');
  let coverage;
  try {
    coverage = JSON.parse(fs.readFileSync(absoluteCoveragePath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`無法解析 native ESM 覆蓋率 JSON：${coveragePath}。原始錯誤：${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
  if (!isCoverageObject(coverage)) {
    throw new Error('native ESM 覆蓋率檔案必須是 JSON object');
  }
  const entries = {};
  for (const [filePath, fileCoverage] of Object.entries(coverage)) {
    const [relativePath, nativeCoverageEntry] = toNativeCoverageEntry(filePath, fileCoverage);
    entries[relativePath] = nativeCoverageEntry;
  }
  return entries;
}

function buildCurrentRepoSummary(nativeCoveragePath) {
  const officialConfig = require(path.join(projectRoot, 'jest.config.js'));
  const nativeConfig = require(path.join(projectRoot, 'jest.native-esm.config.cjs'));
  const sourceFiles = listJavaScriptSourceFiles(projectRoot, ['scripts', 'pages']);
  const officialScope = evaluateCoveragePatterns(sourceFiles, officialConfig.collectCoverageFrom || []);
  const nativeScope = evaluateCoveragePatterns(sourceFiles, nativeConfig.collectCoverageFrom || []);
  const nativeCoverageEntries = readNativeCoverageEntries(nativeCoveragePath);

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
  const summary = buildCurrentRepoSummary(options.nativeCoveragePath);
  writeOutputFiles(summary, options);
  console.log(
    `Native ESM 範圍一致性報告已寫入：${summary.totals.officialIncluded} 個 official 檔案，${summary.totals.nativeIncluded} 個 native candidate 檔案，缺少 ${summary.totals.missingFromNativeCandidate} 個，多出 ${summary.totals.extraNativeCandidate} 個`
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
