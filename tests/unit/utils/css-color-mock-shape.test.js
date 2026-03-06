const { convert, resolve, utils } = require('@asamuzakjp/css-color');

describe('css-color 模擬形狀', () => {
  it('應該暴露 convert 物件的方法', () => {
    expect(typeof convert).toBe('object');
    expect(typeof convert.colorToHex).toBe('function');
    expect(typeof convert.numberToHex).toBe('function');
    expect(convert.colorToHex('red')).toBe('#ff0000');
    expect(convert.numberToHex(255)).toBe('ff');
  });

  it('應該保留 resolve 與 utils.isColor 可用', () => {
    expect(typeof resolve).toBe('function');
    expect(typeof utils.isColor).toBe('function');
  });
});
