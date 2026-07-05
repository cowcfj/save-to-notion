const CSS_ESCAPE_SPECIAL_CHARACTER_PATTERN = /([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g;

function escapeCssIdentifier(value) {
  return String(value).replaceAll(CSS_ESCAPE_SPECIAL_CHARACTER_PATTERN, String.raw`\$1`);
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
