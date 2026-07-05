const STATIC_IMPORT_PATTERN = /^import(?!\s*\()/;
const BARE_IMPORT_SPECIFIER_PATTERN = /^import\s*['"]([^'"]+)['"]/;
const FROM_SPECIFIER_PATTERN = /\bfrom\s*['"]([^'"]+)['"]/;
const STATIC_REEXPORT_PATTERN = /^export\s+(?:\*|(?:type\s+)?\{)/;

export function startsStaticDeclaration(line) {
  return /^\s*(?:import(?!\s*\()|export)\b/.test(line);
}

export function hasOpenStaticDeclaration(statement) {
  const openBraces = (statement.match(/\{/g) || []).length;
  const closeBraces = (statement.match(/\}/g) || []).length;
  const trimmed = statement.trimEnd();
  return openBraces > closeBraces || /\bfrom\s*$/.test(trimmed) || /,\s*$/.test(trimmed);
}

export function readStaticImportSpecifier(fragment) {
  if (!STATIC_IMPORT_PATTERN.test(fragment)) {
    return null;
  }

  const bareImportMatch = fragment.match(BARE_IMPORT_SPECIFIER_PATTERN);
  if (bareImportMatch) {
    return bareImportMatch[1];
  }

  const fromImportMatch = fragment.match(FROM_SPECIFIER_PATTERN);
  return fromImportMatch ? fromImportMatch[1] : null;
}

export function readStaticExportSpecifier(fragment) {
  if (!STATIC_REEXPORT_PATTERN.test(fragment)) {
    return null;
  }

  const fromExportMatch = fragment.match(FROM_SPECIFIER_PATTERN);
  return fromExportMatch ? fromExportMatch[1] : null;
}

export function readStaticSpecifier(fragment) {
  return readStaticImportSpecifier(fragment) || readStaticExportSpecifier(fragment);
}

export function extractImportSpecifiers(statement) {
  return statement
    .split(';')
    .map(fragment => readStaticSpecifier(fragment.trim()))
    .filter(Boolean);
}

export function parseStaticImports(sourceText) {
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
