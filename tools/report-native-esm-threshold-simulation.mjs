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
  buildThresholdSimulationSummary,
  renderThresholdSimulationMarkdown,
  resolveCoverageThresholds,
} = require('./report-native-esm-threshold-simulation-core.cjs');

function readRequiredOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} 必須提供路徑值`);
  }
  return value;
}

function parseDriftThresholdOption(rawValue) {
  const driftThreshold = Number(rawValue);
  if (!Number.isFinite(driftThreshold) || driftThreshold < 0) {
    throw new Error('--drift-threshold 必須是非負數字');
  }
  return driftThreshold;
}

const CLI_OPTION_HANDLERS = {
  '--incumbent-coverage': (options, value) => {
    options.incumbentCoveragePath = value;
  },
  '--native-coverage': (options, value) => {
    options.nativeCoveragePath = value;
  },
  '--scope-parity-json': (options, value) => {
    options.scopeParityJsonPath = value;
  },
  '--source-line-json': (options, value) => {
    options.sourceLineJsonPath = value;
  },
  '--summary-json': (options, value) => {
    options.summaryJsonPath = value;
  },
  '--summary-md': (options, value) => {
    options.summaryMarkdownPath = value;
  },
  '--drift-threshold': (options, value) => {
    options.driftThreshold = parseDriftThresholdOption(value);
  },
};

function getCliOptionHandler(optionName) {
  const handler = CLI_OPTION_HANDLERS[optionName];
  if (!handler) {
    throw new Error(`未知參數：${optionName}`);
  }
  return handler;
}

function parseCliArgs(argv) {
  const options = {
    incumbentCoveragePath: 'coverage/jest/coverage-final.json',
    nativeCoveragePath: 'coverage/native-esm/coverage-final.json',
    scopeParityJsonPath: 'coverage/native-esm/scope-parity-summary.json',
    sourceLineJsonPath: 'coverage/native-esm/line-hit-summary.json',
    summaryJsonPath: 'coverage/native-esm/threshold-simulation-summary.json',
    summaryMarkdownPath: 'coverage/native-esm/threshold-simulation-summary.md',
    driftThreshold: 20,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const handler = getCliOptionHandler(arg);
    handler(options, readRequiredOptionValue(argv, index, arg));
    index += 1;
  }

  return options;
}

function resolveRepoPath(filePath) {
  return path.resolve(projectRoot, filePath);
}

function assertInputPath(filePath, message) {
  assertPathInsideDirectory(resolveRepoPath(filePath), projectRoot, message);
}

function assertOutputPath(filePath) {
  assertPathInsideDirectory(
    resolveRepoPath(filePath),
    allowedOutputRoot,
    'summary output path 必須位於 coverage/native-esm 底下'
  );
}

function readJsonFile(filePath, label, { required = true } = {}) {
  const absolutePath = resolveRepoPath(filePath);
  if (!fs.existsSync(absolutePath)) {
    if (!required) {
      return undefined;
    }
    throw new Error(`找不到 ${label} 檔案：${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`無法解析 ${label} JSON：${filePath}。原始錯誤：${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
}

async function readThresholds() {
  const nativeJestConfig = require(path.join(projectRoot, 'jest.native-esm.config.cjs'));
  return resolveCoverageThresholds(nativeJestConfig);
}

function writeOutputFiles(summary, options) {
  assertOutputPath(options.summaryJsonPath);
  assertOutputPath(options.summaryMarkdownPath);
  const jsonPath = resolveRepoPath(options.summaryJsonPath);
  const markdownPath = resolveRepoPath(options.summaryMarkdownPath);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderThresholdSimulationMarkdown(summary), 'utf8');
}

async function buildCurrentRepoSummary(options) {
  assertInputPath(options.incumbentCoveragePath, 'incumbent coverage path 必須位於 repo root 底下');
  assertInputPath(options.nativeCoveragePath, 'native coverage path 必須位於 repo root 底下');
  assertInputPath(options.scopeParityJsonPath, 'scope parity summary path 必須位於 repo root 底下');
  assertInputPath(
    options.sourceLineJsonPath,
    'source-line correctness summary path 必須位於 repo root 底下'
  );

  return buildThresholdSimulationSummary({
    projectRoot,
    incumbentCoveragePath: options.incumbentCoveragePath,
    nativeCoveragePath: options.nativeCoveragePath,
    incumbentCoverageMap: readJsonFile(options.incumbentCoveragePath, 'incumbent coverage'),
    nativeCoverageMap: readJsonFile(options.nativeCoveragePath, 'native coverage'),
    scopeParitySummary: readJsonFile(options.scopeParityJsonPath, 'scope parity summary', {
      required: false,
    }),
    sourceLineSummary: readJsonFile(options.sourceLineJsonPath, 'source-line correctness summary', {
      required: false,
    }),
    thresholds: await readThresholds(),
    driftThreshold: options.driftThreshold,
  });
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  const summary = await buildCurrentRepoSummary(options);
  writeOutputFiles(summary, options);
  const thresholdGate = summary.gates.find(gate => gate.id === 'threshold-parity');
  console.log(
    `Native ESM threshold simulation 報告已寫入：threshold-parity=${thresholdGate?.status || 'unknown'}, shared files=${summary.totals.sharedFiles}`
  );
}

if (process.argv[1] === __filename) {
  try {
    await runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
