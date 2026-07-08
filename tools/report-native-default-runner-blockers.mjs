import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const allowedOutputRoot = path.join(projectRoot, 'coverage', 'native-default');
const outputPathErrorMessage = '摘要輸出路徑必須位於 coverage/native-default 底下';

const {
  assertPathInsideDirectory,
  buildClassificationReport,
  renderMarkdown,
} = require('./report-native-default-runner-blockers-core.cjs');

function assertNoSymlinkedSegment(filePath) {
  const absoluteFilePath = path.resolve(filePath);

  let currentPath = projectRoot;
  const relativePath = path.relative(projectRoot, path.dirname(absoluteFilePath));
  if (relativePath === '') {
    return;
  }

  for (const segment of relativePath.split(path.sep)) {
    currentPath = path.join(currentPath, segment);
    if (!fs.existsSync(currentPath)) {
      return;
    }
    if (fs.lstatSync(currentPath).isSymbolicLink()) {
      throw new Error(outputPathErrorMessage);
    }
  }

  if (fs.existsSync(absoluteFilePath) && fs.lstatSync(absoluteFilePath).isSymbolicLink()) {
    throw new Error(outputPathErrorMessage);
  }
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
    rootDir: projectRoot,
    nativeDefaultConfigPath: path.join(projectRoot, 'jest.native-default.config.cjs'),
    nativeCoverageConfigPath: path.join(projectRoot, 'jest.native-esm.config.cjs'),
    summaryJsonPath: path.join(projectRoot, 'coverage/native-default/blocker-classification-summary.json'),
    summaryMarkdownPath: path.join(projectRoot, 'coverage/native-default/blocker-classification-summary.md'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root-dir') {
      options.rootDir = readRequiredOptionValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--native-default-config') {
      options.nativeDefaultConfigPath = readRequiredOptionValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--native-coverage-config') {
      options.nativeCoverageConfigPath = readRequiredOptionValue(argv, index, arg);
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

function assertOutputPath(filePath) {
  const absolutePath = path.resolve(filePath);
  assertPathInsideDirectory(
    absolutePath,
    allowedOutputRoot,
    outputPathErrorMessage
  );
  assertNoSymlinkedSegment(absolutePath);
}

function writeOutputFiles(report, options) {
  assertOutputPath(options.summaryJsonPath);
  assertOutputPath(options.summaryMarkdownPath);
  fs.mkdirSync(path.dirname(options.summaryJsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(options.summaryMarkdownPath), { recursive: true });
  fs.writeFileSync(options.summaryJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(options.summaryMarkdownPath, renderMarkdown(report), 'utf8');
}

function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  const report = buildClassificationReport(options);
  writeOutputFiles(report, options);
  console.log(
    `Native default blocker classification 已寫入：${report.totals.discoveredSuites} 個 suite，${report.totals.unknown} 個 unknown`
  );
}

if (process.argv[1] === __filename) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
