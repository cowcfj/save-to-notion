/**
 * @jest-environment jsdom
 */

import { afterEach, describe, expect, jest, test } from '@jest/globals';

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

await jest.unstable_mockModule('../../../../scripts/utils/LogSanitizer.js', () => ({
  LogSanitizer: {
    _sanitizeString: String,
  },
  sanitizeUrlForLogging: String,
}));

const imageUrl = await import('../../../../scripts/utils/image/imageUrl.js');
const { parseBestCandidateSrcsetUrl } =
  await import('../../../../scripts/utils/image/srcsetCandidateParser.js');
const srcsetExtractor = await import('../../../../scripts/utils/image/srcsetExtractor.js');
const { parseWithSrcsetParser } =
  await import('../../../../scripts/utils/image/srcsetParserAdapter.js');
const { validateSrcsetUrl } = await import('../../../../scripts/utils/image/srcsetUrlValidator.js');
const attributeSource = await import('../../../../scripts/utils/image/imageAttributeSource.js');
const { extractFromAnchor } = await import('../../../../scripts/utils/image/imageAnchorSource.js');
const { extractImageSrc } = await import('../../../../scripts/utils/image/imageSourceExtractor.js');
const { extractFromPicture } =
  await import('../../../../scripts/utils/image/imagePictureSource.js');
const { extractFromNoscript } =
  await import('../../../../scripts/utils/image/imageNoscriptSource.js');
const { extractFromBackgroundImage } =
  await import('../../../../scripts/utils/image/imageBackgroundSource.js');
const { mergeUniqueImages } = await import('../../../../scripts/utils/image/imageBlockMerge.js');

function makeImageBlock(url) {
  return {
    type: 'image',
    image: {
      external: { url },
    },
  };
}

afterEach(() => {
  delete globalThis.SrcsetParser;
  document.body.innerHTML = '';
});

describe('image pipeline native ESM diagnostics', () => {
  test('imageUrl normalizes valid URLs and rejects unsafe inputs', () => {
    expect(imageUrl.cleanImageUrl('http://example.com/images/photo(1).jpg?x=1&x=2')).toBe(
      'https://example.com/images/photo%281%29.jpg?x=1'
    );
    expect(imageUrl.cleanImageUrl('/images/photo.jpg')).toBe('/images/photo.jpg');
    expect(imageUrl.isValidImageUrl('https://example.com/images/photo.jpg')).toBe(true);
    expect(imageUrl.isValidImageUrl('javascript:alert(1)')).toBe(false);
    expect(imageUrl.isValidCleanedImageUrl('/images/photo.jpg')).toBe(true);
    expect(imageUrl.hasRejectedImageProtocol('blob:https://example.com/id')).toBe(true);
  });

  test('srcset helpers choose best candidates and validate safe protocols', () => {
    expect(parseBestCandidateSrcsetUrl(['small.jpg 320w', 'large.jpg 1200w'])).toBe('large.jpg');
    expect(srcsetExtractor.extractBestUrlFromSrcset('small.jpg 1x, retina.jpg 2x')).toBe(
      'retina.jpg'
    );
    const srcsetImg = document.createElement('img');
    srcsetImg.setAttribute(
      'srcset',
      'https://example.com/images/srcset-small.jpg 400w, https://example.com/images/srcset-large.jpg 1200w'
    );
    expect(srcsetExtractor.extractFromSrcset(srcsetImg)).toBe(
      'https://example.com/images/srcset-large.jpg'
    );
    expect(srcsetExtractor.extractValidatedSrcsetUrl(srcsetImg)).toBe(
      'https://example.com/images/srcset-large.jpg'
    );

    globalThis.SrcsetParser = {
      parse: jest.fn(() => 'https://example.com/images/parser.jpg'),
    };
    expect(parseWithSrcsetParser('ignored.jpg 1x')).toBe('https://example.com/images/parser.jpg');
    expect(validateSrcsetUrl('https://example.com/images/parser.jpg')).toBe(
      'https://example.com/images/parser.jpg'
    );
    expect(validateSrcsetUrl('javascript:alert(1)')).toBeNull();
  });

  test('manual srcset parser handles density descriptors and malformed fallbacks', () => {
    expect(
      parseBestCandidateSrcsetUrl([
        'small-density.jpg 1x',
        'retina-density.jpg 2x',
        'lower-density.jpg 1.5x',
      ])
    ).toBe('retina-density.jpg');
    expect(
      parseBestCandidateSrcsetUrl([
        'invalid-leading-dot.jpg .5x',
        'invalid-trailing-dot.jpg 2.x',
        'invalid-multiple-dot.jpg 1.2.3x',
        'invalid-alpha.jpg 2ax',
        'fallback.jpg bogus',
        'data:image/png;base64,AAAA 9x',
      ])
    ).toBe('fallback.jpg');
    expect(parseBestCandidateSrcsetUrl(['data:image/png;base64,AAAA 2x', '   '])).toBeNull();
  });

  test('attribute and picture extractors read stable DOM image sources', () => {
    document.body.innerHTML = `
      <a id="image-link" href="https://example.com/images/linked.jpg"><img id="linked-img" alt=""></a>
      <picture>
        <source srcset="https://example.com/images/small.jpg 400w, https://example.com/images/large.jpg 1200w">
        <img id="picture-img" alt="">
      </picture>
      <img id="data-img" data-srcset="https://example.com/images/a.jpg 1x, https://example.com/images/b.jpg 2x" class="hero">
    `;

    const linkedImg = document.querySelector('#linked-img');
    const pictureImg = document.querySelector('#picture-img');
    const dataImg = document.querySelector('#data-img');
    const directImg = document.createElement('img');
    directImg.setAttribute('src', 'https://example.com/images/direct.jpg');

    expect(extractFromAnchor(linkedImg)).toBe('https://example.com/images/linked.jpg');
    expect(extractImageSrc(linkedImg)).toBe('https://example.com/images/linked.jpg');
    expect(extractFromPicture(pictureImg)).toBe('https://example.com/images/large.jpg');
    expect(extractImageSrc(pictureImg)).toBe('https://example.com/images/large.jpg');
    expect(attributeSource.extractFromAttributes(dataImg)).toBe('https://example.com/images/b.jpg');
    expect(attributeSource.extractFromAttributes(directImg)).toBe(
      'https://example.com/images/direct.jpg'
    );
    expect(attributeSource.generateImageCacheKey(dataImg)).toBe('||hero|data-img');
  });

  test('noscript and background extractors return safe image URLs', () => {
    document.body.innerHTML = `
      <div id="noscript-host"><img id="noscript-img"></div>
      <div id="background-host"><img id="background-img"></div>
      <div id="parent-background-host"><img id="parent-background-img"></div>
    `;
    const noscript = document.createElement('noscript');
    noscript.textContent = '<img src="https://example.com/images/noscript.jpg">';
    document.querySelector('#noscript-host').append(noscript);
    document.querySelector('#background-img').style.backgroundImage =
      'url("https://example.com/images/self-bg.jpg")';
    document.querySelector('#background-host').style.backgroundImage =
      'url("https://example.com/images/bg.jpg")';
    document.querySelector('#parent-background-host').style.backgroundImage =
      'url("https://example.com/images/parent-bg.jpg")';

    expect(extractFromNoscript(document.querySelector('#noscript-img'))).toBe(
      'https://example.com/images/noscript.jpg'
    );
    expect(extractFromBackgroundImage(document.querySelector('#background-img'))).toBe(
      'https://example.com/images/self-bg.jpg'
    );
    expect(extractFromBackgroundImage(document.querySelector('#parent-background-img'))).toBe(
      'https://example.com/images/parent-bg.jpg'
    );
  });

  test('mergeUniqueImages removes duplicate image blocks and keeps non-image blocks', () => {
    const existing = [makeImageBlock('https://example.com/images/existing.jpg')];
    const textBlock = { type: 'paragraph', paragraph: { rich_text: [] } };
    const merged = mergeUniqueImages(existing, [
      makeImageBlock('https://example.com/images/existing.jpg'),
      makeImageBlock('https://example.com/images/new.jpg'),
      textBlock,
    ]);

    expect(merged).toEqual([makeImageBlock('https://example.com/images/new.jpg'), textBlock]);
    expect(mergeUniqueImages(existing, [])).toEqual([]);
  });
});
