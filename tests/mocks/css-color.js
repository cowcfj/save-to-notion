const NAMED_COLORS = {
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  black: '#000000',
  white: '#ffffff',
  transparent: null,
};

const HEX3_PATTERN = /^#[\da-f]{3}$/i;
const HEX4_PATTERN = /^#[\da-f]{4}$/i;
const HEX6_PATTERN = /^#[\da-f]{6}$/i;
const HEX8_PATTERN = /^#[\da-f]{8}$/i;
const RGB_PATTERN = /^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i;
const RGBA_PATTERN = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i;

function numberToHex(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new TypeError(`${value} is not a number.`);
  }
  if (value < 0 || value > 255) {
    throw new RangeError(`${value} is not between 0 and 255.`);
  }
  return Math.trunc(value).toString(16).padStart(2, '0');
}

function parseRgbValue(rawValue) {
  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) {
    return null;
  }
  if (parsed < 0 || parsed > 255) {
    return null;
  }
  return parsed;
}

function parseAlphaValue(rawValue) {
  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) {
    return null;
  }
  if (parsed < 0 || parsed > 1) {
    return null;
  }
  return numberToHex(Math.round(parsed * 255));
}

function normalizeHexColor(value) {
  const normalized = value.toLowerCase();
  if (HEX3_PATTERN.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  if (HEX4_PATTERN.test(normalized)) {
    return {
      hex: `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`,
      alphaHex: `${normalized[4]}${normalized[4]}`,
    };
  }
  if (HEX6_PATTERN.test(normalized)) {
    return normalized;
  }
  if (HEX8_PATTERN.test(normalized)) {
    return {
      hex: normalized.slice(0, 7),
      alphaHex: normalized.slice(7, 9),
    };
  }
  return null;
}

function colorToHex(value, opt = {}) {
  if (typeof value !== 'string') {
    throw new TypeError(`${value} is not a string.`);
  }

  const normalized = value.trim().toLowerCase();
  const { alpha = false } = opt;

  if (normalized in NAMED_COLORS) {
    return NAMED_COLORS[normalized];
  }

  const normalizedHex = normalizeHexColor(normalized);
  if (typeof normalizedHex === 'string') {
    return normalizedHex;
  }
  if (normalizedHex && typeof normalizedHex === 'object') {
    return alpha ? `${normalizedHex.hex}${normalizedHex.alphaHex}` : normalizedHex.hex;
  }

  const rgbMatch = RGB_PATTERN.exec(normalized);
  if (rgbMatch) {
    const red = parseRgbValue(rgbMatch[1]);
    const green = parseRgbValue(rgbMatch[2]);
    const blue = parseRgbValue(rgbMatch[3]);
    if (red === null || green === null || blue === null) {
      return null;
    }
    return `#${numberToHex(red)}${numberToHex(green)}${numberToHex(blue)}`;
  }

  const rgbaMatch = RGBA_PATTERN.exec(normalized);
  if (rgbaMatch) {
    const red = parseRgbValue(rgbaMatch[1]);
    const green = parseRgbValue(rgbaMatch[2]);
    const blue = parseRgbValue(rgbaMatch[3]);
    const alphaHex = parseAlphaValue(rgbaMatch[4]);
    if (red === null || green === null || blue === null || alphaHex === null) {
      return null;
    }
    const baseHex = `#${numberToHex(red)}${numberToHex(green)}${numberToHex(blue)}`;
    return alpha ? `${baseHex}${alphaHex}` : baseHex;
  }

  return null;
}

const resolve = () => null;
const utils = {
  isColor: value => {
    try {
      return colorToHex(value) !== null;
    } catch {
      return false;
    }
  },
};

module.exports = {
  convert: {
    colorToHex,
    numberToHex,
  },
  resolve,
  utils,
};
