const IDENTIFIER_PART_PATTERN = /[\dA-Z_a-z$]/;

function isIdentifierPart(char) {
  return Boolean(char && IDENTIFIER_PART_PATTERN.test(char));
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
  if (sourceText.startsWith('//', index)) {
    return skipLineComment(sourceText, index);
  }

  if (sourceText.startsWith('/*', index)) {
    return skipBlockComment(sourceText, index);
  }

  if (sourceText[index] === '"' || sourceText[index] === "'" || sourceText[index] === '`') {
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

    const nextCursor = sourceText.startsWith('//', cursor)
      ? skipLineComment(sourceText, cursor)
      : sourceText.startsWith('/*', cursor)
        ? skipBlockComment(sourceText, cursor)
        : cursor;

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
  if (quote !== '"' && quote !== "'") {
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

export function startsStaticDeclaration(line) {
  const codeIndex = firstCodeIndex(line);
  return codeIndex < line.length && isStaticDeclarationAt(line, codeIndex);
}

export function hasOpenStaticDeclaration(statement) {
  let openBraces = 0;
  let closeBraces = 0;
  let codeText = '';

  for (let index = 0; index < statement.length; index += 1) {
    const nextIndex = skipIgnoredContent(statement, index);
    if (nextIndex !== index) {
      codeText += ' ';
      index = nextIndex - 1;
      continue;
    }

    if (statement[index] === '{') {
      openBraces += 1;
    } else if (statement[index] === '}') {
      closeBraces += 1;
    }

    codeText += statement[index];
  }

  const trimmed = codeText.trimEnd();
  return openBraces > closeBraces || /\bfrom\s*$/.test(trimmed) || /,\s*$/.test(trimmed);
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
  for (let index = 0; index < fragment.length; index += 1) {
    const nextIndex = skipIgnoredContent(fragment, index);
    if (nextIndex !== index) {
      index = nextIndex - 1;
      continue;
    }

    if (!hasKeywordAt(fragment, index, 'from')) {
      continue;
    }

    const specifierIndex = skipWhitespaceAndComments(fragment, index + 'from'.length);
    const specifier = readQuotedSpecifier(fragment, specifierIndex);
    if (specifier) {
      return specifier;
    }
  }

  return null;
}

function splitStaticStatements(statement) {
  const fragments = [];
  let fragmentStart = 0;

  for (let index = 0; index < statement.length; index += 1) {
    const nextIndex = skipIgnoredContent(statement, index);
    if (nextIndex !== index) {
      index = nextIndex - 1;
      continue;
    }

    if (statement[index] === ';') {
      fragments.push(statement.slice(fragmentStart, index));
      fragmentStart = index + 1;
    }
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
  for (let index = startIndex; index < sourceText.length; index += 1) {
    const nextIndex = skipIgnoredContent(sourceText, index);
    if (nextIndex !== index) {
      index = nextIndex - 1;
      continue;
    }

    if (sourceText[index] === ';') {
      return index + 1;
    }

    if (
      sourceText[index] === '\n' &&
      !hasOpenStaticDeclaration(sourceText.slice(startIndex, index))
    ) {
      return index;
    }
  }

  return sourceText.length;
}

export function parseStaticImports(sourceText) {
  const specifiers = [];

  for (let index = 0; index < sourceText.length; index += 1) {
    const nextIndex = skipIgnoredContent(sourceText, index);
    if (nextIndex !== index) {
      index = nextIndex - 1;
      continue;
    }

    if (!isStaticDeclarationAt(sourceText, index)) {
      continue;
    }

    const endIndex = findStaticDeclarationEnd(sourceText, index);
    specifiers.push(...extractImportSpecifiers(sourceText.slice(index, endIndex)));
    index = endIndex - 1;
  }

  return specifiers.filter(Boolean);
}
