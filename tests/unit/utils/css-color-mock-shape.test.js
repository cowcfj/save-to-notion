const { convert, resolve, utils } = require('@asamuzakjp/css-color');

describe('css-color mock shape', () => {
  it('should expose convert object methods', () => {
    expect(typeof convert).toBe('object');
    expect(typeof convert.colorToHex).toBe('function');
    expect(typeof convert.numberToHex).toBe('function');
    expect(convert.colorToHex('red')).toBeTruthy();
    expect(convert.numberToHex(255)).toBeTruthy();
  });

  it('should keep resolve and utils.isColor available', () => {
    expect(typeof resolve).toBe('function');
    expect(typeof utils.isColor).toBe('function');
  });
});
