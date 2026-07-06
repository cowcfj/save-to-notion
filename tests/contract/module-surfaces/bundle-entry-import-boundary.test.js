/**
 * @jest-environment node
 */
/* eslint-disable security/detect-non-literal-fs-filename */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStaticImports } from '../../../tools/static-import-parser.mjs';

const testFilePath = fileURLToPath(import.meta.url);
const testDirectory = path.dirname(testFilePath);
const projectRoot = path.resolve(testDirectory, '../../..');
const sourceExtensions = ['.js', '.mjs'];
const ignoredPathSegments = new Set([
  '.git',
  '.tmp',
  'coverage',
  'dist',
  'node_modules',
  'releases',
  'tests',
]);

const contentLikeRoots = ['scripts/content', 'scripts/highlighter', 'scripts/performance'];
const backgroundRoots = ['scripts/background.js', 'scripts/background'];

const forbiddenContentLikeRules = [
  {
    label: 'shared UI_MESSAGES facade',
    matches: relativePath => relativePath === 'scripts/config/shared/messages.js',
  },
  {
    label: 'extension page source',
    matches: relativePath => relativePath.startsWith('pages/'),
  },
  {
    label: 'destination ProfileManager',
    matches: relativePath => relativePath === 'scripts/destinations/ProfileManager.js',
  },
];

const forbiddenBackgroundRules = [
  {
    label: 'shared UI_MESSAGES facade',
    matches: relativePath => relativePath === 'scripts/config/shared/messages.js',
  },
];

function toRepoPath(filePath, rootDir = projectRoot) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function isRepoOwnedSource(relativePath) {
  return (
    relativePath &&
    !relativePath.startsWith('../') &&
    !path.isAbsolute(relativePath) &&
    relativePath.split('/').every(segment => !ignoredPathSegments.has(segment))
  );
}

function listSourceFiles(rootDir, relativePath) {
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) {
    return sourceExtensions.includes(path.extname(absolutePath))
      ? [toRepoPath(absolutePath, rootDir)]
      : [];
  }

  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap(entry => {
    const childPath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(rootDir, childPath);
    }
    return sourceExtensions.includes(path.extname(entry.name))
      ? [toRepoPath(path.resolve(rootDir, childPath), rootDir)]
      : [];
  });
}

function resolveRelativeImport(rootDir, importerRelativePath, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const importerDir = path.dirname(path.resolve(rootDir, importerRelativePath));
  const resolvedBase = path.resolve(importerDir, specifier);
  const extname = path.extname(resolvedBase);
  const candidates = sourceExtensions.includes(extname)
    ? [resolvedBase]
    : sourceExtensions.map(extension => `${resolvedBase}${extension}`);

  const resolvedPath = candidates.find(
    candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  );
  if (!resolvedPath) {
    return null;
  }

  const relativePath = toRepoPath(resolvedPath, rootDir);
  return isRepoOwnedSource(relativePath) ? relativePath : null;
}

function resolveStaticImports(rootDir, importerRelativePath) {
  const currentPath = path.resolve(rootDir, importerRelativePath);
  const sourceText = fs.readFileSync(currentPath, 'utf8');
  return parseStaticImports(sourceText)
    .map(specifier => resolveRelativeImport(rootDir, importerRelativePath, specifier))
    .filter(Boolean);
}

function addUnvisitedImports(stack, visited, importedRelativePaths) {
  for (const importedRelativePath of importedRelativePaths) {
    if (!visited.has(importedRelativePath)) {
      stack.push(importedRelativePath);
    }
  }
}

function visitReachableSource(rootDir, stack, visited) {
  const currentRelativePath = stack.pop();
  if (!currentRelativePath || visited.has(currentRelativePath)) {
    return;
  }

  visited.add(currentRelativePath);
  addUnvisitedImports(stack, visited, resolveStaticImports(rootDir, currentRelativePath));
}

function collectReachableSources(rootDir, entryRelativePath) {
  const visited = new Set();
  const stack = [entryRelativePath];

  while (stack.length > 0) {
    visitReachableSource(rootDir, stack, visited);
  }

  return visited;
}

function findRuleViolations(entryRelativePath, reachableRelativePath, rules) {
  return rules
    .filter(rule => rule.matches(reachableRelativePath))
    .map(rule => ({
      entry: entryRelativePath,
      rule: rule.label,
      target: reachableRelativePath,
    }));
}

function findReachableSourceViolations(entryRelativePath, reachableSources, rules) {
  return [...reachableSources].flatMap(reachableRelativePath =>
    findRuleViolations(entryRelativePath, reachableRelativePath, rules)
  );
}

function findEntryViolations(rootDir, entryRelativePath, rules) {
  const reachableSources = collectReachableSources(rootDir, entryRelativePath);
  return findReachableSourceViolations(entryRelativePath, reachableSources, rules);
}

function findBoundaryViolations(rootDir, entryRoots, rules) {
  return entryRoots.flatMap(entryRoot =>
    listSourceFiles(rootDir, entryRoot).flatMap(entryRelativePath =>
      findEntryViolations(rootDir, entryRelativePath, rules)
    )
  );
}

function writeFixtureTree(rootDir, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents, 'utf8');
  }
}

describe('bundle-sensitive entry import boundaries', () => {
  let tempRoot;

  afterEach(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  test.each([
    [
      'shared messages facade',
      {
        'scripts/content/index.js': "import '../config/shared/messages.js';\n",
        'scripts/config/shared/messages.js': 'export const UI_MESSAGES = {};\n',
      },
      'shared UI_MESSAGES facade',
    ],
    [
      'pages source',
      {
        'scripts/content/index.js': "import '../../pages/options/options.js';\n",
        'pages/options/options.js': 'export const OPTIONS_PAGE = true;\n',
      },
      'extension page source',
    ],
    [
      'ProfileManager source',
      {
        'scripts/content/index.js': "import '../destinations/ProfileManager.js';\n",
        'scripts/destinations/ProfileManager.js': 'export class ProfileManager {}\n',
      },
      'destination ProfileManager',
    ],
  ])('scanner catches a content-like leak to %s', (_caseName, files, expectedRule) => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-import-boundary-'));
    writeFixtureTree(tempRoot, files);

    expect(
      findBoundaryViolations(tempRoot, ['scripts/content'], forbiddenContentLikeRules)
    ).toEqual([
      {
        entry: 'scripts/content/index.js',
        rule: expectedRule,
        target: expect.any(String),
      },
    ]);
  });

  test('scanner ignores from-like text outside static import statements', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-import-boundary-'));
    writeFixtureTree(tempRoot, {
      'scripts/content/index.js': "import './allowed.js';\n",
      'scripts/content/allowed.js': [
        "// from '../config/shared/messages.js'",
        'const message = "from \'../config/shared/messages.js\'";',
        'export const allowed = true;',
      ].join('\n'),
      'scripts/config/shared/messages.js': 'export const UI_MESSAGES = {};\n',
    });

    expect(
      findBoundaryViolations(tempRoot, ['scripts/content'], forbiddenContentLikeRules)
    ).toEqual([]);
  });

  test('static import parser ignores comments and string content inside declarations', () => {
    const sourceText = [
      "import { /* from '../commented.js' */ allowed } from './allowed.js';",
      "export { note as value } from './reexport.js' with { type: 'import \"../string.js\"' };",
      "import template from './template.js' with { type: `import '../template-text.js'` };",
    ].join('\n');

    expect(parseStaticImports(sourceText)).toEqual([
      './allowed.js',
      './reexport.js',
      './template.js',
    ]);
  });

  test('static import parser preserves same-line declarations after pending imports close', () => {
    const sourceText = [
      'import {',
      "  first } from './first.js'; import {",
      "  second } from './second.js';",
    ].join('\n');

    expect(parseStaticImports(sourceText)).toEqual(['./first.js', './second.js']);
  });

  test('static import parser preserves imports split after the import keyword', () => {
    const sourceText = ['import', '  defaultExport', "from './split-default.js';"].join('\n');

    expect(parseStaticImports(sourceText)).toEqual(['./split-default.js']);
  });

  test('scanner preserves multiline static import detection', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-import-boundary-'));
    writeFixtureTree(tempRoot, {
      'scripts/content/index.js': [
        'import {',
        '  UI_MESSAGES,',
        "} from '../config/shared/messages.js';",
      ].join('\n'),
      'scripts/config/shared/messages.js': 'export const UI_MESSAGES = {};\n',
    });

    expect(
      findBoundaryViolations(tempRoot, ['scripts/content'], forbiddenContentLikeRules)
    ).toEqual([
      {
        entry: 'scripts/content/index.js',
        rule: 'shared UI_MESSAGES facade',
        target: 'scripts/config/shared/messages.js',
      },
    ]);
  });

  test('content, highlighter, and preloader sources do not reach page or profile management modules', () => {
    const violations = findBoundaryViolations(
      projectRoot,
      contentLikeRoots,
      forbiddenContentLikeRules
    );

    expect(violations).toEqual([]);
  });

  test('background sources do not reach the shared UI_MESSAGES facade', () => {
    const violations = findBoundaryViolations(
      projectRoot,
      backgroundRoots,
      forbiddenBackgroundRules
    );

    expect(violations).toEqual([]);
  });

  test('preloader imports the leaf runtime action contract instead of the shared runtime facade', () => {
    const preloaderSource = fs.readFileSync(
      path.resolve(projectRoot, 'scripts/performance/preloader.js'),
      'utf8'
    );

    expect(preloaderSource).toContain("from '../config/runtimeActions/preloaderActions.js'");
    expect(preloaderSource).not.toContain("from '../config/shared/runtimeActions.js'");
  });

  test('auth page entry is an explicit page-bundle exception outside content and background gates', () => {
    const authReachableSources = collectReachableSources(projectRoot, 'scripts/auth/auth.js');

    expect(authReachableSources.has('scripts/config/shared/messages.js')).toBe(true);
    expect(contentLikeRoots).not.toContain('scripts/auth/auth.js');
    expect(backgroundRoots).not.toContain('scripts/auth/auth.js');
  });
});
