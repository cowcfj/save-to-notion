import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BUDGETS = Object.freeze({
  bundle: [
    {
      key: 'content_bundle',
      label: 'content.bundle.js',
      type: 'file',
      relPath: 'dist/content.bundle.js',
      hardLimit: 230_400,
      deltaLimit: 8_192,
    },
    {
      key: 'background_bundle',
      label: 'background.js',
      type: 'file',
      relPath: 'dist/scripts/background.js',
      hardLimit: 230_400,
      deltaLimit: 8_192,
    },
    {
      key: 'migration_bundle',
      label: 'migration-executor.js',
      type: 'file',
      relPath: 'dist/migration-executor.js',
      hardLimit: 32_768,
      deltaLimit: 4_096,
    },
  ],
  package: [
    {
      key: 'release_zip',
      label: 'release zip',
      type: 'zip',
      hardLimit: 1_800_000,
      deltaLimit: 32_768,
    },
    {
      key: 'unpacked_package',
      label: 'unpacked package',
      type: 'dir',
      hardLimit: 7_340_032,
      deltaLimit: 131_072,
    },
  ],
});

function parseArgs(argv) {
  const options = {
    mode: 'hard',
    scope: 'all',
    root: process.cwd(),
    unpackedDir: '',
    reportFile: '',
    baseRoot: '',
    baseUnpackedDir: '',
  };

  for (const arg of argv) {
    const [rawKey, ...rawValueParts] = arg.split('=');
    const value = rawValueParts.join('=');
    switch (rawKey) {
      case '--mode':
        options.mode = value;
        break;
      case '--scope':
        options.scope = value;
        break;
      case '--root':
        options.root = path.resolve(value);
        break;
      case '--base-root':
        options.baseRoot = path.resolve(value);
        break;
      case '--unpacked-dir':
        options.unpackedDir = path.resolve(value);
        break;
      case '--base-unpacked-dir':
        options.baseUnpackedDir = path.resolve(value);
        break;
      case '--report-file':
        options.reportFile = path.resolve(value);
        break;
      default:
        throw new Error(`未知參數：${arg}`);
    }
  }

  if (!['hard', 'delta'].includes(options.mode)) {
    throw new Error(`不支援的 mode：${options.mode}`);
  }
  if (!['bundle', 'package', 'all'].includes(options.scope)) {
    throw new Error(`不支援的 scope：${options.scope}`);
  }
  if (options.mode === 'delta' && !options.baseRoot) {
    throw new Error('delta 模式必須提供 --base-root');
  }

  return options;
}

function getScopes(scope) {
  if (scope === 'all') {
    return ['bundle', 'package'];
  }
  return [scope];
}

function getLatestZipPath(rootDir) {
  const releasesDir = path.join(rootDir, 'releases');
  if (!fs.existsSync(releasesDir)) {
    return null;
  }

  const zipFiles = fs
    .readdirSync(releasesDir)
    .filter(name => name.endsWith('.zip'))
    .map(name => {
      const absolutePath = path.join(releasesDir, name);
      return {
        absolutePath,
        mtimeMs: fs.statSync(absolutePath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return zipFiles[0]?.absolutePath ?? null;
}

function getDirectorySizeBytes(dirPath) {
  let total = 0;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirectorySizeBytes(absolutePath);
    } else {
      total += fs.statSync(absolutePath).size;
    }
  }

  return total;
}

function extractZipToTemp(zipPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'size-gate-unpacked-'));
  execFileSync('unzip', ['-q', zipPath, '-d', tempDir]);
  return tempDir;
}

function measureTarget(rootDir, target, unpackedDirOverride = '') {
  switch (target.type) {
    case 'file': {
      const absolutePath = path.join(rootDir, target.relPath);
      if (!fs.existsSync(absolutePath)) {
        return { found: false };
      }
      return { found: true, value: fs.statSync(absolutePath).size };
    }
    case 'zip': {
      const zipPath = getLatestZipPath(rootDir);
      if (!zipPath) {
        return { found: false };
      }
      return { found: true, value: fs.statSync(zipPath).size, metadata: { zipPath } };
    }
    case 'dir': {
      if (unpackedDirOverride) {
        if (!fs.existsSync(unpackedDirOverride)) {
          return { found: false };
        }
        return { found: true, value: getDirectorySizeBytes(unpackedDirOverride) };
      }

      const zipPath = getLatestZipPath(rootDir);
      if (!zipPath) {
        return { found: false };
      }

      const tempDir = extractZipToTemp(zipPath);
      try {
        return {
          found: true,
          value: getDirectorySizeBytes(tempDir),
          metadata: { extractedFrom: zipPath },
        };
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
    default:
      throw new Error(`未知 target type：${target.type}`);
  }
}

function createCheckResult(target, currentMeasurement, baseMeasurement, mode) {
  if (!currentMeasurement.found) {
    return {
      key: target.key,
      label: target.label,
      status: 'failed',
      message: `${target.label} 不存在`,
      hardLimit: target.hardLimit,
      deltaLimit: target.deltaLimit,
    };
  }

  const result = {
    key: target.key,
    label: target.label,
    status: 'pass',
    current: currentMeasurement.value,
    hardLimit: target.hardLimit,
    deltaLimit: target.deltaLimit,
  };

  if (currentMeasurement.metadata) {
    result.currentMeta = currentMeasurement.metadata;
  }

  if (currentMeasurement.value > target.hardLimit) {
    result.status = 'failed';
    result.message = `${target.label} exceeds hard limit`;
    return result;
  }

  if (mode === 'delta') {
    if (!baseMeasurement?.found) {
      result.status = 'skipped';
      result.message = `${target.label} 缺少 base 產物，略過 delta 檢查`;
      return result;
    }

    result.base = baseMeasurement.value;
    result.delta = currentMeasurement.value - baseMeasurement.value;
    if (baseMeasurement.metadata) {
      result.baseMeta = baseMeasurement.metadata;
    }

    if (result.delta > target.deltaLimit) {
      result.status = 'failed';
      result.message = `${target.label} exceeds delta limit`;
    }
  }

  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const checks = [];

  for (const scope of getScopes(options.scope)) {
    for (const target of BUDGETS[scope]) {
      const currentMeasurement = measureTarget(options.root, target, options.unpackedDir);
      const baseMeasurement =
        options.mode === 'delta'
          ? measureTarget(options.baseRoot, target, options.baseUnpackedDir)
          : null;
      checks.push(createCheckResult(target, currentMeasurement, baseMeasurement, options.mode));
    }
  }

  const report = {
    mode: options.mode,
    scope: options.scope,
    root: options.root,
    baseRoot: options.baseRoot || null,
    failed: checks.some(check => check.status === 'failed'),
    checks,
  };

  if (options.reportFile) {
    fs.mkdirSync(path.dirname(options.reportFile), { recursive: true });
    fs.writeFileSync(options.reportFile, JSON.stringify(report, null, 2));
  }

  for (const check of checks) {
    const parts = [`[${check.status.toUpperCase()}]`, check.label];
    if (typeof check.current === 'number') {
      parts.push(`current=${check.current}`);
    }
    if (typeof check.base === 'number') {
      parts.push(`base=${check.base}`);
      parts.push(`delta=${check.delta}`);
    }
    if (check.message) {
      parts.push(check.message);
    }
    console.log(parts.join(' '));
  }

  if (report.failed) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`❌ size gate failed: ${error.message}`);
  process.exit(1);
}
