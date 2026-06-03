/* eslint-disable security/detect-non-literal-fs-filename */
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const BACKGROUND_ENTRY = path.join(REPO_ROOT, 'scripts/background.js');
const CONTENT_HTML_SANITIZER = path.join(REPO_ROOT, 'scripts/content/sanitizers/htmlSanitizer.js');

const FROM_IMPORT_RE = /from ['"]([^'"]+)['"]/g;
const BARE_IMPORT_RE = /import ['"]([^'"]+)['"]/g;

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return specifier;
  }

  const candidate = path.resolve(path.dirname(fromFile), specifier);
  const jsCandidate = candidate.endsWith('.js') ? candidate : `${candidate}.js`;

  if (fs.existsSync(jsCandidate)) {
    return jsCandidate;
  }

  return null;
}

function collectStaticDependencies(entryFile) {
  const visitedFiles = new Set();
  const externalSpecifiers = new Set();
  const stack = [entryFile];

  while (stack.length > 0) {
    const file = stack.pop();
    if (!file || visitedFiles.has(file)) {
      continue;
    }

    visitedFiles.add(file);

    const source = fs.readFileSync(file, 'utf8');
    for (const specifier of collectImportSpecifiers(source)) {
      appendResolvedDependency(file, specifier, stack, externalSpecifiers);
    }
  }

  return { visitedFiles, externalSpecifiers };
}

function collectImportSpecifiers(source) {
  const specifiers = [];

  for (const match of source.matchAll(FROM_IMPORT_RE)) {
    specifiers.push(match[1]);
  }

  for (const match of source.matchAll(BARE_IMPORT_RE)) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

function appendResolvedDependency(fromFile, specifier, stack, externalSpecifiers) {
  const resolved = resolveLocalImport(fromFile, specifier);
  if (!resolved) {
    return;
  }

  if (path.isAbsolute(resolved)) {
    stack.push(resolved);
    return;
  }

  externalSpecifiers.add(resolved);
}

describe('background sanitizer runtime boundary', () => {
  test('background dependency graph must not import content HTML sanitizer or DOMPurify', () => {
    const { visitedFiles, externalSpecifiers } = collectStaticDependencies(BACKGROUND_ENTRY);

    expect(visitedFiles).not.toContain(CONTENT_HTML_SANITIZER);
    expect(externalSpecifiers).not.toContain('dompurify');
  });
});
