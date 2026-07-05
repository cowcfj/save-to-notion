const {
  escapeCssIdentifier,
  installCssEscapePolyfill,
} = require('../../helpers/cssEscapePolyfill.cjs');

describe('cssEscapePolyfill', () => {
  it.each([
    ['leading digit', '1abc', String.raw`\31 abc`],
    ['leading hyphen digit', '-1abc', String.raw`-\31 abc`],
    ['lone hyphen', '-', String.raw`\-`],
    ['null code point', '\0', '\uFFFD'],
    ['control character', 'a\nb', String.raw`a\a b`],
    ['delete control character', 'a\u007Fb', String.raw`a\7f b`],
    ['punctuation', 'a.b#c', String.raw`a\.b\#c`],
    ['non-ascii identifier', '資料', '資料'],
  ])('escapes %s like CSS.escape', (_name, input, expected) => {
    expect(escapeCssIdentifier(input)).toBe(expected);
  });

  it('installs CSS.escape on the provided target and window alias', () => {
    const target = { window: {} };

    const cssApi = installCssEscapePolyfill(target);

    expect(cssApi.escape('1abc')).toBe(String.raw`\31 abc`);
    expect(target.CSS).toBe(cssApi);
    expect(target.window.CSS).toBe(cssApi);
  });

  it('preserves an existing native CSS.escape implementation', () => {
    const existingCss = { escape: jest.fn(value => `native:${value}`) };
    const target = { CSS: existingCss, window: {} };

    const cssApi = installCssEscapePolyfill(target);

    expect(cssApi).toBe(existingCss);
    expect(cssApi.escape('x')).toBe('native:x');
  });
});
