const IDENTIFIER_PART_PATTERN = /[\dA-Z_a-z$]/;
const QUOTED_CONTENT_DELIMITERS = new Set(['"', "'", '`']);
const IMPORT_SPECIFIER_DELIMITERS = new Set(['"', "'"]);

function isIdentifierPart(char) {
  return Boolean(char && IDENTIFIER_PART_PATTERN.test(char));
}

function isQuotedContentDelimiter(char) {
  return QUOTED_CONTENT_DELIMITERS.has(char);
}

function isImportSpecifierDelimiter(char) {
  return IMPORT_SPECIFIER_DELIMITERS.has(char);
}

function hasKeywordAt(sourceText, index, keyword) {
  return (
    sourceText.startsWith(keyword, index) &&
    !isIdentifierPart(sourceText[index - 1]) &&
    !isIdentifierPart(sourceText[index + keyword.length])
  );
}

function skipLineComment(sourceText, index) {
  const newlineIndex = sourceText.indexOf('\n', index + 2);
  return newlineIndex === -1 ? sourceText.length : newlineIndex;
}

function skipBlockComment(sourceText, index) {
  const endIndex = sourceText.indexOf('*/', index + 2);
  return endIndex === -1 ? sourceText.length : endIndex + 2;
}

function skipComment(sourceText, index) {
  if (sourceText.startsWith('//', index)) {
    return skipLineComment(sourceText, index);
  }

  if (sourceText.startsWith('/*', index)) {
    return skipBlockComment(sourceText, index);
  }

  return index;
}

function skipQuotedContent(sourceText, index) {
  const quote = sourceText[index];
  let cursor = index + 1;

  while (cursor < sourceText.length) {
    if (sourceText[cursor] === '\\') {
      cursor += 2;
      continue;
    }

    if (sourceText[cursor] === quote) {
      return cursor + 1;
    }

    cursor += 1;
  }

  return sourceText.length;
}

function skipIgnoredContent(sourceText, index) {
  const commentEndIndex = skipComment(sourceText, index);
  if (commentEndIndex !== index) {
    return commentEndIndex;
  }

  if (isQuotedContentDelimiter(sourceText[index])) {
    return skipQuotedContent(sourceText, index);
  }

  return index;
}

function skipWhitespaceAndComments(sourceText, index) {
  let cursor = index;

  while (cursor < sourceText.length) {
    if (/\s/.test(sourceText[cursor])) {
      cursor += 1;
      continue;
    }

    const nextCursor = skipComment(sourceText, cursor);
    if (nextCursor === cursor) {
      return cursor;
    }

    cursor = nextCursor;
  }

  return cursor;
}

function firstCodeIndex(sourceText) {
  return skipWhitespaceAndComments(sourceText, 0);
}

function readQuotedSpecifier(sourceText, index) {
  const quote = sourceText[index];
  if (!isImportSpecifierDelimiter(quote)) {
    return null;
  }

  let cursor = index + 1;
  let specifier = '';

  while (cursor < sourceText.length) {
    if (sourceText[cursor] === '\\') {
      specifier += sourceText.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }

    if (sourceText[cursor] === quote) {
      return specifier;
    }

    specifier += sourceText[cursor];
    cursor += 1;
  }

  return null;
}

function isStaticImportAt(sourceText, index) {
  if (!hasKeywordAt(sourceText, index, 'import')) {
    return false;
  }

  const nextCodeIndex = skipWhitespaceAndComments(sourceText, index + 'import'.length);
  return sourceText[nextCodeIndex] !== '(';
}

function isStaticReexportAt(sourceText, index) {
  if (!hasKeywordAt(sourceText, index, 'export')) {
    return false;
  }

  const exportBodyIndex = skipWhitespaceAndComments(sourceText, index + 'export'.length);
  if (sourceText[exportBodyIndex] === '*' || sourceText[exportBodyIndex] === '{') {
    return true;
  }

  if (!hasKeywordAt(sourceText, exportBodyIndex, 'type')) {
    return false;
  }

  const typeBodyIndex = skipWhitespaceAndComments(sourceText, exportBodyIndex + 'type'.length);
  return sourceText[typeBodyIndex] === '{';
}

function isStaticDeclarationAt(sourceText, index) {
  return isStaticImportAt(sourceText, index) || isStaticReexportAt(sourceText, index);
}

function startsStaticImportDeclaration(statement) {
  const importIndex = firstCodeIndex(statement);
  return importIndex < statement.length && isStaticImportAt(statement, importIndex);
}

export function startsStaticDeclaration(line) {
  const codeIndex = firstCodeIndex(line);
  return codeIndex < line.length && isStaticDeclarationAt(line, codeIndex);
}

export function hasOpenStaticDeclaration(statement) {
  let openBraces = 0;
  let closeBraces = 0;
  let codeText = '';
  let cursor = 0;

  while (cursor < statement.length) {
    const nextCursor = skipIgnoredContent(statement, cursor);
    if (nextCursor !== cursor) {
      codeText += ' ';
      cursor = nextCursor;
      continue;
    }

    if (statement[cursor] === '{') {
      openBraces += 1;
    } else if (statement[cursor] === '}') {
      closeBraces += 1;
    }

    codeText += statement[cursor];
    cursor += 1;
  }

  const trimmed = codeText.trimEnd();
  const hasCompleteStaticImport =
    startsStaticImportDeclaration(statement) && readStaticImportSpecifier(statement);
  return (
    openBraces > closeBraces ||
    (!hasCompleteStaticImport &&
      (/\bfrom\s*$/.test(trimmed) ||
        /,\s*$/.test(trimmed) ||
        startsStaticImportDeclaration(statement)))
  );
}

export function readStaticImportSpecifier(fragment) {
  const importIndex = firstCodeIndex(fragment);
  if (!isStaticImportAt(fragment, importIndex)) {
    return null;
  }

  const importBodyIndex = skipWhitespaceAndComments(fragment, importIndex + 'import'.length);
  const bareImportSpecifier = readQuotedSpecifier(fragment, importBodyIndex);
  if (bareImportSpecifier) {
    return bareImportSpecifier;
  }

  return readFromSpecifier(fragment);
}

export function readStaticExportSpecifier(fragment) {
  const exportIndex = firstCodeIndex(fragment);
  if (!isStaticReexportAt(fragment, exportIndex)) {
    return null;
  }

  return readFromSpecifier(fragment);
}

export function readStaticSpecifier(fragment) {
  return readStaticImportSpecifier(fragment) || readStaticExportSpecifier(fragment);
}

function readFromSpecifier(fragment) {
  let cursor = 0;

  while (cursor < fragment.length) {
    const nextCursor = skipIgnoredContent(fragment, cursor);
    if (nextCursor !== cursor) {
      cursor = nextCursor;
      continue;
    }

    if (!hasKeywordAt(fragment, cursor, 'from')) {
      cursor += 1;
      continue;
    }

    const specifierIndex = skipWhitespaceAndComments(fragment, cursor + 'from'.length);
    const specifier = readQuotedSpecifier(fragment, specifierIndex);
    if (specifier) {
      return specifier;
    }

    cursor += 1;
  }

  return null;
}

function splitStaticStatements(statement) {
  const fragments = [];
  let fragmentStart = 0;
  let cursor = 0;

  while (cursor < statement.length) {
    const nextCursor = skipIgnoredContent(statement, cursor);
    if (nextCursor !== cursor) {
      cursor = nextCursor;
      continue;
    }

    if (statement[cursor] === ';') {
      fragments.push(statement.slice(fragmentStart, cursor));
      fragmentStart = cursor + 1;
    }

    cursor += 1;
  }

  fragments.push(statement.slice(fragmentStart));
  return fragments;
}

export function extractImportSpecifiers(statement) {
  return splitStaticStatements(statement)
    .map(fragment => readStaticSpecifier(fragment))
    .filter(Boolean);
}

function findStaticDeclarationEnd(sourceText, startIndex) {
  let cursor = startIndex;

  while (cursor < sourceText.length) {
    const nextCursor = skipIgnoredContent(sourceText, cursor);
    if (nextCursor !== cursor) {
      cursor = nextCursor;
      continue;
    }

    if (sourceText[cursor] === ';') {
      return cursor + 1;
    }

    if (
      sourceText[cursor] === '\n' &&
      !hasOpenStaticDeclaration(sourceText.slice(startIndex, cursor))
    ) {
      return cursor;
    }

    cursor += 1;
  }

  return sourceText.length;
}

export function parseStaticImports(sourceText) {
  const specifiers = [];
  let cursor = 0;

  while (cursor < sourceText.length) {
    const nextCursor = skipIgnoredContent(sourceText, cursor);
    if (nextCursor !== cursor) {
      cursor = nextCursor;
      continue;
    }

    if (!isStaticDeclarationAt(sourceText, cursor)) {
      cursor += 1;
      continue;
    }

    const endIndex = findStaticDeclarationEnd(sourceText, cursor);
    specifiers.push(...extractImportSpecifiers(sourceText.slice(cursor, endIndex)));
    cursor = endIndex;
  }

  return specifiers.filter(Boolean);
}
