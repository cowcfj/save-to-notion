function escapeCssIdentifier(value) {
  const string = String(value);
  const firstCodePoint = string.codePointAt(0);

  if (string.length === 1 && firstCodePoint === 0x002d) {
    return String.raw`\-`;
  }

  let result = '';

  for (let index = 0; index < string.length; index += 1) {
    const codePoint = string.codePointAt(index);

    if (codePoint === 0x0000) {
      result += '\uFFFD';
      continue;
    }

    if (
      (codePoint >= 0x0001 && codePoint <= 0x001f) ||
      codePoint === 0x007f ||
      (index === 0 && codePoint >= 0x0030 && codePoint <= 0x0039) ||
      (index === 1 &&
        codePoint >= 0x0030 &&
        codePoint <= 0x0039 &&
        firstCodePoint === 0x002d)
    ) {
      result += `\\${codePoint.toString(16)} `;
      continue;
    }

    if (
      codePoint >= 0x0080 ||
      codePoint === 0x002d ||
      codePoint === 0x005f ||
      (codePoint >= 0x0030 && codePoint <= 0x0039) ||
      (codePoint >= 0x0041 && codePoint <= 0x005a) ||
      (codePoint >= 0x0061 && codePoint <= 0x007a)
    ) {
      result += string.charAt(index);
      continue;
    }

    result += `\\${string.charAt(index)}`;
  }

  return result;
}

function installCssEscapePolyfill(target = globalThis) {
  if (typeof target.CSS?.escape === 'function') {
    return target.CSS;
  }

  const cssApi = target.CSS ?? {};
  cssApi.escape = escapeCssIdentifier;
  target.CSS = cssApi;

  if (target.window !== undefined) {
    target.window.CSS = cssApi;
  }

  return cssApi;
}

module.exports = {
  escapeCssIdentifier,
  installCssEscapePolyfill,
};
