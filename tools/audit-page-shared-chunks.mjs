import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DIST_PAGES_DIR = path.resolve(process.cwd(), 'dist/pages');
const PROFILE_MANAGER_IMPORT = './shared/ProfileManager.js';
const SHARED_IMPORT_WARNING_LIMIT = 5;
const AUTH_OPTIONS_ONLY_SENTINELS = Object.freeze(['保存目標名稱', '雲端備份：']);

function parseArgs(argv) {
  const options = { distPagesDir: DEFAULT_DIST_PAGES_DIR };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--dist-pages-dir=')) {
      options.distPagesDir = path.resolve(arg.slice('--dist-pages-dir='.length));
    } else if (arg === '--dist-pages-dir') {
      index += 1;
      options.distPagesDir = path.resolve(argv[index] || '');
    } else {
      throw new Error(`未知參數：${arg}`);
    }
  }

  return options;
}

function extractImportSpecifiers(line) {
  const specifiers = [];
  const importPattern = /(?:^\s*import\s*['"]([^'"]+)['"])|(?:\bfrom\s*['"]([^'"]+)['"])/g;
  for (const match of line.matchAll(importPattern)) {
    specifiers.push(match[1] || match[2]);
  }
  return specifiers;
}

function parseStaticImports(sourceText) {
  return sourceText
    .split('\n')
    .flatMap((line) => extractImportSpecifiers(line))
    .filter(Boolean);
}

function listPageEntryFiles(distPagesDir) {
  if (!fs.existsSync(distPagesDir) || !fs.statSync(distPagesDir).isDirectory()) {
    throw new Error(`找不到 dist pages 目錄：${distPagesDir}`);
  }

  return fs
    .readdirSync(distPagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort();
}

function isSharedImport(specifier) {
  return specifier.startsWith('./shared/') && specifier.endsWith('.js');
}

function readEntryReports(distPagesDir) {
  return listPageEntryFiles(distPagesDir).map((entryFile) => {
    const sourceText = fs.readFileSync(path.join(distPagesDir, entryFile), 'utf8');
    return {
      entryFile,
      imports: parseStaticImports(sourceText),
      sourceText,
    };
  });
}

function formatImports(imports) {
  return imports.length === 0 ? '(none)' : imports.join(', ');
}

function findCriticalViolations(entryReports) {
  const violations = [];
  for (const report of entryReports) {
    const sharedImports = report.imports.filter((specifier) => isSharedImport(specifier));
    if (report.entryFile === 'auth.js' && report.imports.includes(PROFILE_MANAGER_IMPORT)) {
      violations.push('auth.js must not import ./shared/ProfileManager.js');
    }
    if (report.entryFile === 'update-notification.js' && sharedImports.length > 0) {
      violations.push('update-notification.js must not import shared chunks');
    }
    if (report.entryFile === 'onboarding.js' && report.imports.includes(PROFILE_MANAGER_IMPORT)) {
      violations.push('onboarding.js must not import ./shared/ProfileManager.js');
    }
    if (report.entryFile === 'auth.js') {
      for (const sentinel of AUTH_OPTIONS_ONLY_SENTINELS) {
        if (report.sourceText.includes(sentinel)) {
          violations.push(`auth.js contains options-only sentinel: ${sentinel}`);
        }
      }
    }
  }
  return violations;
}

function findWarnings(entryReports) {
  const warnings = [];
  for (const report of entryReports) {
    const sharedImports = report.imports.filter((specifier) => isSharedImport(specifier));
    if (report.entryFile === 'popup.js' && report.imports.includes(PROFILE_MANAGER_IMPORT)) {
      warnings.push(
        'popup.js imports ./shared/ProfileManager.js; split popup read-only destination selection in a future plan.'
      );
    }
    if (sharedImports.length > SHARED_IMPORT_WARNING_LIMIT) {
      warnings.push(
        `${report.entryFile} imports ${sharedImports.length} shared chunks; review whether the entry needs a narrower bundle.`
      );
    }
  }
  return warnings;
}

function reportAudit(entryReports, warnings, violations) {
  console.log('Page shared chunk import map:');
  for (const report of entryReports) {
    console.log(`${report.entryFile} -> ${formatImports(report.imports)}`);
  }

  for (const warning of warnings) {
    console.log(`[WARN] ${warning}`);
  }

  if (violations.length > 0) {
    console.error('❌ Page shared chunk audit failed');
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    return false;
  }

  console.log('✅ Page shared chunk audit completed');
  return true;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const entryReports = readEntryReports(options.distPagesDir);
  const warnings = findWarnings(entryReports);
  const violations = findCriticalViolations(entryReports);
  if (!reportAudit(entryReports, warnings, violations)) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`❌ Page shared chunk audit failed: ${error.message}`);
  process.exit(1);
}
