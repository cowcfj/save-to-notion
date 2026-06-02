/**
 * @jest-environment jsdom
 */

import {
  imageCollectorTestModules,
  setupImageCollectorTestLifecycle,
  trackSpy,
} from './ImageCollectorTestSetup.js';

const { ImageCollector, cachedQuery, extractImageSrc, isTemporaryImageUrl } =
  imageCollectorTestModules;

describe('ImageCollector temporary image URL handling', () => {
  setupImageCollectorTestLifecycle();

  const PATREON_URL =
    'https://c10.patreonusercontent.com/4/patreon-media/p/post/157239355/abc/eyJ3IjoxMDgwfQ==/1.png?token-hash=ABC123&token-time=1700000000';

  test('processImageForCollection 應為 Patreon signed URL 回傳 paragraph block 而非 external image block', () => {
    const mockImg = document.createElement('img');
    mockImg.src = PATREON_URL;
    mockImg.alt = 'Patreon image';
    Object.defineProperty(mockImg, 'naturalWidth', { value: 800 });
    Object.defineProperty(mockImg, 'naturalHeight', { value: 600 });

    extractImageSrc.mockReturnValue(PATREON_URL);
    isTemporaryImageUrl.mockImplementation(
      url => url.includes('patreonusercontent.com') && url.includes('token-hash')
    );

    const result = ImageCollector.processImageForCollection(mockImg, 0, null);

    expect(result).toBeDefined();
    // 不應為 external image block
    expect(result.image?.external).toBeUndefined();
    // 應為 paragraph block
    expect(result.type).toBe('paragraph');
    expect(Array.isArray(result.paragraph?.rich_text)).toBe(true);
    // rich_text 應包含指向原始 URL 的 link
    const hasLink = result.paragraph.rich_text.some(rt => rt.text?.link?.url === PATREON_URL);
    expect(hasLink).toBe(true);
  });

  test('processImageForCollection 對非 temporary URL 應維持原有 external image block 行為', () => {
    const mockImg = document.createElement('img');
    mockImg.src = 'https://example.com/normal.jpg';
    Object.defineProperty(mockImg, 'naturalWidth', { value: 800 });
    Object.defineProperty(mockImg, 'naturalHeight', { value: 600 });

    extractImageSrc.mockReturnValue('https://example.com/normal.jpg');
    isTemporaryImageUrl.mockReturnValue(false);

    const result = ImageCollector.processImageForCollection(mockImg, 0, null);

    expect(result?.type).toBe('image');
    expect(result?.image?.external?.url).toBe('https://example.com/normal.jpg');
  });

  test('collectFeaturedImage 應對 Patreon signed URL (Meta source) 回傳 null', () => {
    const mockMeta = document.createElement('meta');
    mockMeta.content = PATREON_URL;

    trackSpy(document, 'querySelector').mockImplementation(selector => {
      if (selector === 'meta[property="og:image"]') {
        return mockMeta;
      }
      return null;
    });
    isTemporaryImageUrl.mockImplementation(url => url.includes('patreonusercontent.com'));

    const result = ImageCollector.collectFeaturedImage();
    expect(result).toBeNull();
  });

  test('collectFeaturedImage 應對 Patreon signed URL (DOM fallback) 回傳 null', () => {
    const mockImg = document.createElement('img');
    mockImg.src = PATREON_URL;
    extractImageSrc.mockReturnValue(PATREON_URL);
    isTemporaryImageUrl.mockImplementation(url => url.includes('patreonusercontent.com'));

    cachedQuery.mockImplementation((selector, context, options) => {
      if (selector.includes('meta')) {
        return null;
      }
      if (options?.single) {
        return mockImg;
      }
      return null;
    });

    const result = ImageCollector.collectFeaturedImage();
    expect(result).toBeNull();
  });

  test('collectAdditionalImages 同時存在 temporary URL 與 gallery 圖時應安全合併兩種 block 不拋錯', async () => {
    const patreonImg = document.createElement('img');
    patreonImg.src = PATREON_URL;
    patreonImg.alt = 'Patreon image';
    Object.defineProperty(patreonImg, 'naturalWidth', { value: 800 });
    Object.defineProperty(patreonImg, 'naturalHeight', { value: 600 });

    const galleryImg = document.createElement('img');
    galleryImg.src = 'https://example.com/gallery1.jpg';
    Object.defineProperty(galleryImg, 'naturalWidth', { value: 1024 });
    Object.defineProperty(galleryImg, 'naturalHeight', { value: 768 });

    extractImageSrc.mockImplementation(img => img?.src ?? null);
    isTemporaryImageUrl.mockImplementation(
      url => typeof url === 'string' && url.includes('patreonusercontent.com')
    );

    cachedQuery.mockImplementation((selector, _context, options) => {
      if (options?.all) {
        if (selector === '.gallery img') {
          return [galleryImg];
        }
        if (selector === 'img') {
          return [patreonImg];
        }
      }
      return null;
    });

    const contentElement = document.createElement('div');

    const result = await ImageCollector.collectAdditionalImages(contentElement);

    // 兩種 block 應同時保留:Patreon 降級為 paragraph,gallery 維持 image block
    expect(result.images).toHaveLength(2);

    const placeholderBlock = result.images.find(b => b.type === 'paragraph');
    expect(placeholderBlock).toBeDefined();
    expect(placeholderBlock._meta?.originalSrc).toBe(PATREON_URL);

    const galleryBlock = result.images.find(b => b.type === 'image');
    expect(galleryBlock).toBeDefined();
    expect(galleryBlock.image?.external?.url).toBe('https://example.com/gallery1.jpg');
  });
});
