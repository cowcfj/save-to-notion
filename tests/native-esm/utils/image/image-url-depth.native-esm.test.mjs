/**
 * @jest-environment node
 */

import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  error: jest.fn(),
  warn: jest.fn(),
};

jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: loggerMock,
  ...loggerMock,
}));

let cleanImageUrl;
let hasRejectedImageProtocol;
let isValidCleanedImageUrl;
let isValidImageUrl;
let resolveImageUrl;

beforeAll(async () => {
  ({
    cleanImageUrl,
    hasRejectedImageProtocol,
    isValidCleanedImageUrl,
    isValidImageUrl,
    resolveImageUrl,
  } = await import('../../../../scripts/utils/image/imageUrl.js'));
});

beforeEach(() => {
  loggerMock.error.mockClear();
  loggerMock.warn.mockClear();
});

describe('imageUrl native ESM depth coverage', () => {
  test('resolves absolute, protocol-relative, and relative image URLs', () => {
    expect(resolveImageUrl('https://example.com/image.jpg')).toEqual(
      expect.objectContaining({
        isRelative: false,
        urlObj: expect.any(URL),
      })
    );
    expect(cleanImageUrl('http://example.com/photo (1).jpg?size=large#caption')).toBe(
      'https://example.com/photo%20%281%29.jpg?size=large#caption'
    );
    expect(cleanImageUrl('//cdn.example.com/assets/photo.png')).toBe(
      'https://cdn.example.com/assets/photo.png'
    );
    expect(cleanImageUrl('/images/photo.jpg?b=2&b=3&a=1')).toBe('/images/photo.jpg?b=2&a=1');
    expect(cleanImageUrl('./photo.webp')).toBe('/photo.webp');
  });

  test('rejects unsafe protocols, malformed inputs, and unsupported cleaned URLs', () => {
    expect(hasRejectedImageProtocol(' javascript:alert(1)')).toBe(true);
    expect(hasRejectedImageProtocol('data:image/png;base64,abc')).toBe(true);
    expect(hasRejectedImageProtocol({})).toBe(false);

    expect(cleanImageUrl('javascript:alert(1)')).toBeNull();
    expect(cleanImageUrl('not-a-url')).toBeNull();
    expect(cleanImageUrl(null)).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      'URL 轉換失敗',
      expect.objectContaining({
        action: 'cleanImageUrl',
        result: 'failed',
        url: '[invalid-url]',
      })
    );

    expect(isValidCleanedImageUrl('https://example.com/image[bad].jpg')).toBe(false);
    expect(isValidCleanedImageUrl('relative-image.jpg')).toBe(false);
    expect(isValidCleanedImageUrl('/api/image')).toBe(false);
  });

  test('unwraps Next.js and proxy URLs while preserving current query/hash behavior', () => {
    const nextAbsolute =
      'https://site.example/_next/image?url=https%3A%2F%2Fcdn.example.com%2Fphotos%2Fhero.jpg&w=1200&q=75';
    expect(cleanImageUrl(nextAbsolute)).toBe('https://cdn.example.com/photos/hero.jpg');

    const nextRelative = 'https://site.example/_next/image?url=%2Fimages%2Fhero.png&w=640&q=75';
    expect(cleanImageUrl(nextRelative)).toBe('https://site.example/images/hero.png');

    const facebookProxy =
      'https://www.facebook.com/photo.php?u=https%3A%2F%2Freal.example.com%2Fimage%20one.jpg&x=1';
    expect(cleanImageUrl(facebookProxy)).toBe('https://real.example.com/image%20one.jpg');

    const inmediaUrl = 'https://www.inmediahk.net/files/photo.jpg?itok=abc&download=1';
    expect(cleanImageUrl(inmediaUrl)).toBe('https://www.inmediahk.net/files/photo.jpg?download=1');
  });

  test('validates image extensions, image paths, avatars, and decorative exclusions', () => {
    expect(isValidImageUrl('https://example.com/photo.jpg')).toBe(true);
    expect(isValidImageUrl('/uploads/photo')).toBe(true);
    expect(isValidImageUrl('https://github.com/avatar.png?size=80')).toBe(true);
    expect(isValidImageUrl('https://example.com/assets/spinner.gif')).toBe(false);
    expect(isValidImageUrl('https://example.com/api/photo')).toBe(false);
    expect(isValidImageUrl('https://example.com/document.pdf')).toBe(false);
  });

  test('keeps recursion-depth guard and URL-length guard explicit', () => {
    const url = 'https://example.com/photos/deep.jpg';
    expect(cleanImageUrl(url, 99)).toBe(url);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '達到最大遞迴深度',
      expect.objectContaining({
        action: 'cleanImageUrl',
        result: 'max_depth',
        depth: 99,
      })
    );

    expect(isValidCleanedImageUrl(`https://example.com/${'x'.repeat(2100)}.jpg`)).toBe(false);
  });
});
