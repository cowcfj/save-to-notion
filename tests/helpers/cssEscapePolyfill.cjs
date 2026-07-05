function escapeCssIdentifier(value) {
  const string = String(value);
  const firstCodeUnit = string.charCodeAt(0);

  if (string.length === 1 && firstCodeUnit === 0x002d) {
    return String.raw`\-`;
  }

  let result = '';

  for (let index = 0; index < string.length; index += 1) {
    const codeUnit = string.charCodeAt(index);

    if (codeUnit === 0x0000) {
      result += '\uFFFD';
      continue;
    }

    if (
      (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
      codeUnit === 0x007f ||
      (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (index === 1 &&
        codeUnit >= 0x0030 &&
        codeUnit <= 0x0039 &&
        firstCodeUnit === 0x002d)
    ) {
      result += `\\${codeUnit.toString(16)} `;
      continue;
    }

    if (
      codeUnit >= 0x0080 ||
      codeUnit === 0x002d ||
      codeUnit === 0x005f ||
      (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
      (codeUnit >= 0x0061 && codeUnit <= 0x007a)
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
