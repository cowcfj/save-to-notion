import fs from 'node:fs';
import path from 'node:path';
import { AUTH_OPTIONS_ONLY_SENTINELS, matchesSentinel } from './bundle-boundary-sentinels.mjs';

const DEFAULT_DIST_PAGES_DIR = path.resolve(process.cwd(), 'dist/pages');
const PROFILE_MANAGER_IMPORT = './shared/ProfileManager.js';
const SHARED_IMPORT_WARNING_LIMIT = 5;

function parseArgs(argv) {
  const options = { distPagesDir: DEFAULT_DIST_PAGES_DIR };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--dist-pages-dir=')) {
      options.distPagesDir = path.resolve(readInlineFlagValue(arg, '--dist-pages-dir'));
    } else if (arg === '--dist-pages-dir') {
      options.distPagesDir = path.resolve(readNextFlagValue(argv, index, '--dist-pages-dir'));
      index += 1;
    } else {
      throw new Error(`未知參數：${arg}`);
    }
  }

  return options;
}

function readInlineFlagValue(arg, flagName) {
  const value = arg.slice(`${flagName}=`.length);
  if (!value || value.startsWith('-')) {
    throw new Error(`必須提供 ${flagName} 的值`);
  }
  return value;
}

function readNextFlagValue(argv, index, flagName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`必須提供 ${flagName} 的值`);
  }
  return value;
}

function startsStaticDeclaration(line) {
  return /^\s*(?:import(?!\s*\()|export)\b/.test(line);
}

function hasOpenStaticDeclaration(statement) {
  const openBraces = (statement.match(/\{/g) || []).length;
  const closeBraces = (statement.match(/\}/g) || []).length;
  const trimmed = statement.trimEnd();
  return openBraces > closeBraces || /\bfrom\s*$/.test(trimmed) || /,\s*$/.test(trimmed);
}

function extractImportSpecifiers(statement) {
  const specifiers = [];
  for (const fragment of statement.split(';')) {
    const trimmed = fragment.trim();
    if (/^import(?!\s*\()/.test(trimmed)) {
      const bareImportMatch = trimmed.match(/^import\s*['"]([^'"]+)['"]/);
      const fromImportMatch = trimmed.match(/\bfrom\s*['"]([^'"]+)['"]/);
      const specifier = bareImportMatch?.[1] || fromImportMatch?.[1];
      if (specifier) {
        specifiers.push(specifier);
      }
    } else if (/^export\s+(?:\*|(?:type\s+)?\{)/.test(trimmed)) {
      const fromExportMatch = trimmed.match(/\bfrom\s*['"]([^'"]+)['"]/);
      if (fromExportMatch) {
        specifiers.push(fromExportMatch[1]);
      }
    }
  }
  return specifiers;
}

function parseStaticImports(sourceText) {
  const specifiers = [];
  let pendingStatement = '';

  for (const line of sourceText.split('\n')) {
    if (pendingStatement) {
      pendingStatement += `\n${line}`;
      const matches = extractImportSpecifiers(pendingStatement);
      if (matches.length > 0 || !hasOpenStaticDeclaration(pendingStatement)) {
        specifiers.push(...matches);
        pendingStatement = '';
      }
      continue;
    }

    if (!startsStaticDeclaration(line)) {
      continue;
    }

    const matches = extractImportSpecifiers(line);
    if (matches.length > 0 || !hasOpenStaticDeclaration(line)) {
      specifiers.push(...matches);
    } else {
      pendingStatement = line;
    }
  }

  if (pendingStatement) {
    specifiers.push(...extractImportSpecifiers(pendingStatement));
  }

  return specifiers.filter(Boolean);
}

function listPageEntryFiles(distPagesDir) {
  if (!fs.existsSync(distPagesDir) || !fs.statSync(distPagesDir).isDirectory()) {
    throw new Error(`找不到 dist pages 目錄：${distPagesDir}`);
  }

  return fs
    .readdirSync(distPagesDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => entry.name)
    .sort();
}

function isSharedImport(specifier) {
  return specifier.startsWith('./shared/') && specifier.endsWith('.js');
}

function readEntryReports(distPagesDir) {
  return listPageEntryFiles(distPagesDir).map(entryFile => {
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

function getSharedImports(report) {
  return report.imports.filter(specifier => isSharedImport(specifier));
}

function findRestrictedImportViolation(report) {
  if (report.entryFile === 'auth.js' && report.imports.includes(PROFILE_MANAGER_IMPORT)) {
    return 'auth.js 不得匯入 ./shared/ProfileManager.js';
  }
  if (report.entryFile === 'update-notification.js' && getSharedImports(report).length > 0) {
    return 'update-notification.js 不得匯入 shared chunks';
  }
  if (report.entryFile === 'onboarding.js' && report.imports.includes(PROFILE_MANAGER_IMPORT)) {
    return 'onboarding.js 不得匯入 ./shared/ProfileManager.js';
  }
  return null;
}

function findAuthOptionsOnlySentinelViolations(report) {
  if (report.entryFile !== 'auth.js') {
    return [];
  }

  return AUTH_OPTIONS_ONLY_SENTINELS.filter(sentinel =>
    matchesSentinel(report.sourceText, sentinel)
  ).map(sentinel => `auth.js 包含 options-only sentinel: ${sentinel.value}`);
}

function findReportCriticalViolations(report) {
  return [
    findRestrictedImportViolation(report),
    ...findAuthOptionsOnlySentinelViolations(report),
  ].filter(Boolean);
}

function findCriticalViolations(entryReports) {
  const violations = [];
  for (const report of entryReports) {
    violations.push(...findReportCriticalViolations(report));
  }
  return violations;
}

function findWarnings(entryReports) {
  const warnings = [];
  for (const report of entryReports) {
    const sharedImports = getSharedImports(report);
    if (report.entryFile === 'popup.js' && report.imports.includes(PROFILE_MANAGER_IMPORT)) {
      warnings.push(
        'popup.js 匯入 ./shared/ProfileManager.js；請在後續計畫拆分 popup read-only destination selection。'
      );
    }
    if (sharedImports.length > SHARED_IMPORT_WARNING_LIMIT) {
      warnings.push(
        `${report.entryFile} 匯入 ${sharedImports.length} 個 shared chunks；請檢查此 entry 是否需要更窄的 bundle。`
      );
    }
  }
  return warnings;
}

function reportAudit(entryReports, warnings, violations) {
  console.log('頁面 shared chunk 匯入對照：');
  for (const report of entryReports) {
    console.log(`${report.entryFile} -> ${formatImports(report.imports)}`);
  }

  for (const warning of warnings) {
    console.log(`[WARN] ${warning}`);
  }

  if (violations.length > 0) {
    console.error('❌ 頁面 shared chunk 稽核失敗');
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    return false;
  }

  console.log('✅ 頁面 shared chunk 稽核完成');
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
  console.error(`❌ 頁面 shared chunk 稽核失敗：${error.message}`);
  process.exit(1);
}
