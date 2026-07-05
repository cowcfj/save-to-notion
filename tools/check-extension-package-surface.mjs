import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_RULES = Object.freeze([
  {
    label: 'raw scripts source',
    matches: (relativePath) => relativePath.startsWith('scripts/') && relativePath.endsWith('.js'),
  },
  {
    label: 'tests output',
    matches: (relativePath) => relativePath.startsWith('tests/'),
  },
  {
    label: 'docs output',
    matches: (relativePath) => relativePath.startsWith('docs/'),
  },
  {
    label: 'agent metadata',
    matches: (relativePath) => relativePath.startsWith('.agents/'),
  },
  {
    label: 'github metadata',
    matches: (relativePath) => relativePath.startsWith('.github/'),
  },
  {
    label: 'coverage output',
    matches: (relativePath) => relativePath.startsWith('coverage/'),
  },
  {
    label: 'source map',
    matches: (relativePath) => relativePath.endsWith('.map'),
  },
  {
    label: 'bundle analysis report',
    matches: (relativePath) => /(^|\/)[^/]*bundle-analysis[^/]*\.html$/.test(relativePath),
  },
  {
    label: 'visualizer report',
    matches: (relativePath) => /(^|\/)[^/]*visualizer[^/]*\.html$/.test(relativePath),
  },
  {
    label: 'nested page package marker',
    matches: (relativePath) => /^pages\/.+\/package\.json$/.test(relativePath),
  },
]);

function parseArgs(argv) {
  const options = { unpackedDir: '' };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--unpacked-dir=')) {
      options.unpackedDir = path.resolve(arg.slice('--unpacked-dir='.length));
    } else if (arg === '--unpacked-dir') {
      index += 1;
      options.unpackedDir = path.resolve(argv[index] || '');
    } else {
      throw new Error(`未知參數：${arg}`);
    }
  }

  if (!options.unpackedDir) {
    throw new Error('必須提供 --unpacked-dir');
  }

  return options;
}

function toPackagePath(filePath, rootDir) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function enumerateFiles(rootDir, currentDir = rootDir) {
  const files = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...enumerateFiles(rootDir, absolutePath));
    } else if (entry.isFile()) {
      files.push(toPackagePath(absolutePath, rootDir));
    }
  }
  return files.sort();
}

function findSurfaceViolations(relativePaths) {
  const violations = [];
  for (const relativePath of relativePaths) {
    const matchedRule = FORBIDDEN_RULES.find((rule) => rule.matches(relativePath));
    if (matchedRule) {
      violations.push({ relativePath, rule: matchedRule.label });
    }
  }
  return violations;
}

function checkPackageSurface(unpackedDir) {
  if (!fs.existsSync(unpackedDir) || !fs.statSync(unpackedDir).isDirectory()) {
    throw new Error(`找不到 unpacked extension package：${unpackedDir}`);
  }

  const files = enumerateFiles(unpackedDir);
  const violations = findSurfaceViolations(files);
  return { files, violations };
}

function reportResult(result) {
  if (result.violations.length === 0) {
    console.log(`✅ Extension package surface 檢查通過，已檢查 ${result.files.length} 個檔案。`);
    return true;
  }

  console.error('❌ Extension package surface 檢查失敗，發現禁止打包的檔案：');
  for (const violation of result.violations) {
    console.error(`  - ${violation.relativePath} (${violation.rule})`);
  }
  return false;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const result = checkPackageSurface(options.unpackedDir);
  if (!reportResult(result)) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`❌ Extension package surface 檢查失敗：${error.message}`);
  process.exit(1);
}
