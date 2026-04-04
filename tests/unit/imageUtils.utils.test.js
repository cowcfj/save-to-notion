// 圖片處理工具函數測試
// 測試 scripts/utils/imageUtils.js 中的函數

jest.mock('../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// 先設置 Chrome Mock,再導入源碼
import '../mocks/chrome.js';
import Logger from '../../scripts/utils/Logger.js';

// 刪除 presetup.js 設定的 mock，讓 IIFE 能正常初始化
delete globalThis.ImageUtils;
delete globalThis.window?.ImageUtils;

// 載入原始 IIFE 模組（會將函數掛載到 global.ImageUtils）
require('../../scripts/utils/imageUtils.js');

// 從 global.ImageUtils 獲取函數
const {
  cleanImageUrl,
  isValidImageUrl,
  extractImageSrc,
  extractBestUrlFromSrcset,
  extractFromPicture,
  extractFromBackgroundImage,
  extractFromNoscript,
  isValidCleanedImageUrl,
  generateImageCacheKey,
  IMAGE_ATTRIBUTES,
  IMAGE_VALIDATION,
} = globalThis.ImageUtils || globalThis.window?.ImageUtils || {};

describe('ImageUtils - cleanImageUrl', () => {
  describe('基本功能', () => {
    test('應該返回有效的簡單圖片 URL', () => {
      const url = 'https://example.com/image.jpg';
      expect(cleanImageUrl(url)).toBe(url);
    });

    test('應該處理帶查詢參數的 URL', () => {
      const url = 'https://example.com/image.jpg?size=large&quality=80';
      expect(cleanImageUrl(url)).toContain('example.com/image.jpg');
      expect(cleanImageUrl(url)).toContain('size=large');
    });
  });

  describe('代理 URL 處理', () => {
    test('應該從代理 URL 提取原始圖片', () => {
      const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?u=https://example.com/real-image.jpg';
      expect(cleanImageUrl(proxyUrl)).toBe('https://example.com/real-image.jpg');
    });

    test('應該處理嵌套的代理 URL', () => {
      const url = 'https://proxy.com/photo.php?u=https://example.com/image.jpg?size=large';
      const result = cleanImageUrl(url);
      expect(result).toContain('example.com/image.jpg');
    });

    test('應該保留 Substack CDN URL 中嵌入的 percent-encoded URL（不破壞路徑結構）', () => {
      // Substack CDN 在路徑中嵌入另一個 percent-encoded URL
      // decodeURI 會把 %3A%2F%2F 解碼為 ://，破壞 CDN 路徑
      const substackUrl =
        'https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc123.jpeg';
      const result = cleanImageUrl(substackUrl);
      // 確保嵌入的 %3A%2F%2F 沒有被解碼為 ://
      expect(result).toContain('https%3A%2F%2F');
      expect(result).not.toContain('https://substack-post-media.s3.amazonaws.com%2Fpublic');
    });

    test('應該保留 Cloudinary 風格 CDN 代理 URL 中的嵌入 URL', () => {
      const cloudinaryUrl =
        'https://res.cloudinary.com/demo/image/fetch/https%3A%2F%2Fexample.com%2Fphoto.jpg';
      const result = cleanImageUrl(cloudinaryUrl);
      expect(result).toContain('https%3A%2F%2F');
    });

    test('應該在 CDN 代理 URL 路徑中編碼 Markdown 敏感字元', () => {
      const cdnUrl =
        "https://res.cloudinary.com/demo/image/fetch/https%3A%2F%2Fexample.com%2Fimage[1](draft)'copy'.jpg";
      const result = cleanImageUrl(cdnUrl);
      expect(result).toContain('%5B1%5D');
      expect(result).toContain('%28draft%29');
      expect(result).toContain('%27copy%27');
    });

    test('cleanImageUrl 對 Substack URL 應通過 isValidCleanedImageUrl 驗證', () => {
      const substackUrl =
        'https://substackcdn.com/image/fetch/f_auto,q_auto:good/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc123.jpeg';
      // /image/ 路徑匹配 IMAGE_PATH_PATTERNS，應為有效圖片 URL
      expect(isValidCleanedImageUrl(cleanImageUrl(substackUrl))).toBe(true);
    });
  });

  describe('重複參數處理', () => {
    test('應該移除重複的查詢參數', () => {
      const url = 'https://example.com/image.jpg?id=1&id=2&name=test';
      const result = cleanImageUrl(url);
      expect(result).toContain('id=');
      // 只保留第一個 id 參數
      const matches = result.match(/id=/g);
      expect(matches?.length).toBe(1);
    });
  });

  describe('錯誤處理', () => {
    test('應該處理 null', () => {
      expect(cleanImageUrl(null)).toBeNull();
    });

    test('應該處理 undefined', () => {
      expect(cleanImageUrl()).toBeNull();
    });

    test('應該處理空字串', () => {
      expect(cleanImageUrl('')).toBeNull();
    });

    test('應該處理無效的 URL', () => {
      expect(cleanImageUrl('not-a-url')).toBeNull();
    });

    test('應該處理非字串輸入', () => {
      expect(cleanImageUrl(123)).toBeNull();
      expect(cleanImageUrl({})).toBeNull();
      expect(cleanImageUrl([])).toBeNull();
    });
  });
});

describe('ImageUtils - isValidImageUrl', () => {
  describe('基本驗證', () => {
    test('應該接受標準圖片 URL', () => {
      expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
      expect(isValidImageUrl('https://example.com/photo.png')).toBe(true);
      expect(isValidImageUrl('https://example.com/pic.gif')).toBe(false);
    });

    test('應該接受帶查詢參數的圖片 URL', () => {
      expect(isValidImageUrl('https://example.com/image.jpg?size=large')).toBe(true);
    });

    test('應該接受 HTTP 和 HTTPS', () => {
      expect(isValidImageUrl('http://example.com/image.jpg')).toBe(true);
      expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
    });
  });

  describe('圖片格式支持', () => {
    const formats = [
      'jpg',
      'jpeg',
      'png',
      // 'gif' removed
      'webp',
      'svg',
      'bmp',
      'ico',
      'tiff',
      'tif',
      'avif',
      'heic',
      'heif',
    ];

    formats.forEach(format => {
      test(`應該支持 .${format} 格式`, () => {
        expect(isValidImageUrl(`https://example.com/image.${format}`)).toBe(true);
      });
    });
  });

  describe('路徑模式識別', () => {
    const validPaths = [
      '/images/photo.png',
      '/img/banner.jpg',
      '/photos/gallery.jpg',
      '/pictures/avatar.png',
      '/media/cover.jpg',
      '/uploads/file.jpg',
      '/assets/logo.png',
      '/files/image.jpg',
    ];

    validPaths.forEach(path => {
      test(`應該識別路徑: ${path}`, () => {
        expect(isValidImageUrl(`https://example.com${path}`)).toBe(true);
      });
    });
  });

  describe('無擴展名 CDN 圖片', () => {
    test('應該接受包含 /images/ 路徑的 URL', () => {
      expect(isValidImageUrl('https://cdn.example.com/images/abc123')).toBe(true);
    });

    test('應該接受包含 /media/ 路徑的 URL', () => {
      expect(isValidImageUrl('https://cdn.example.com/media/xyz789')).toBe(true);
    });
  });

  describe('排除非圖片 URL', () => {
    test('應該拒絕腳本文件', () => {
      expect(isValidImageUrl('https://example.com/script.js')).toBe(false);
    });

    test('應該拒絕樣式文件', () => {
      expect(isValidImageUrl('https://example.com/style.css')).toBe(false);
    });

    test('應該拒絕 HTML 頁面', () => {
      expect(isValidImageUrl('https://example.com/page.html')).toBe(false);
    });

    test('應該拒絕 API 端點', () => {
      expect(isValidImageUrl('https://example.com/api/data')).toBe(false);
    });

    test('應該拒絕 AJAX 請求', () => {
      expect(isValidImageUrl('https://example.com/ajax/load')).toBe(false);
    });
  });

  describe('URL 長度限制', () => {
    test('應該拒絕過長的 URL (>2000 字符)', () => {
      const longUrl = `https://example.com/image.jpg?${'a'.repeat(2000)}`;
      expect(isValidImageUrl(longUrl)).toBe(false);
    });

    test('應該接受正常長度的 URL', () => {
      const normalUrl = 'https://example.com/image.jpg?param=value';
      expect(isValidImageUrl(normalUrl)).toBe(true);
    });
  });

  describe('錯誤處理', () => {
    test('應該拒絕 null', () => {
      expect(isValidImageUrl(null)).toBe(false);
    });

    test('應該拒絕 undefined', () => {
      expect(isValidImageUrl()).toBe(false);
    });

    test('應該拒絕空字串', () => {
      expect(isValidImageUrl('')).toBe(false);
    });

    test('應該拒絕無效的 URL', () => {
      expect(isValidImageUrl('not-a-url')).toBe(false);
    });

    test('應該拒絕非 HTTP(S) 協議', () => {
      expect(isValidImageUrl('ftp://example.com/image.jpg')).toBe(false);
      expect(isValidImageUrl('file:///path/to/image.jpg')).toBe(false);
    });
  });

  describe('真實世界案例', () => {
    test('應該處理 CDN URL', () => {
      expect(isValidImageUrl('https://cdn.jsdelivr.net/gh/user/repo/image.png')).toBe(true);
    });

    test('應該處理圖床 URL', () => {
      expect(isValidImageUrl('https://i.imgur.com/abc123.jpg')).toBe(true);
    });

    test('應該處理 WordPress 媒體庫', () => {
      expect(isValidImageUrl('https://example.com/wp-content/uploads/2024/10/image.jpg')).toBe(
        true
      );
    });

    test('應該處理日期路徑', () => {
      expect(isValidImageUrl('https://example.com/2024/10/image.jpg')).toBe(true);
    });
  });
});

describe('ImageUtils - extractBestUrlFromSrcset', () => {
  test('應該從單個 URL 提取', () => {
    expect(extractBestUrlFromSrcset('image.jpg')).toBe('image.jpg');
  });

  test('應該從簡單 srcset 提取最高分辨率', () => {
    const srcset = 'image.jpg 1x, image2x.jpg 2x';
    expect(extractBestUrlFromSrcset(srcset)).toBe('image2x.jpg');
  });

  test('應該從寬度描述符中提取最大寬度', () => {
    const srcset = 'small.jpg 320w, medium.jpg 640w, large.jpg 1280w';
    expect(extractBestUrlFromSrcset(srcset)).toBe('large.jpg');
  });

  test('應該忽略 data URL', () => {
    const srcset =
      'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw== 1x, real.jpg 2x';
    expect(extractBestUrlFromSrcset(srcset)).toBe('real.jpg');
  });

  test('應該處理沒有描述符的條目', () => {
    const srcset = 'first.jpg, second.jpg 2x';
    expect(extractBestUrlFromSrcset(srcset)).toBe('second.jpg');
  });

  test('應該處理空或無效輸入', () => {
    expect(extractBestUrlFromSrcset(null)).toBeNull();
    expect(extractBestUrlFromSrcset('')).toBeNull();
    expect(extractBestUrlFromSrcset()).toBeNull();
  });
});

/**
 * Mock DOM 元素
 *
 * @param {object} attributes - 屬性
 * @returns {object} Mock 元素
 */
function createMockImg(attributes = {}) {
  const img = {
    getAttribute: jest.fn(name => attributes[name] || null),
    closest: jest.fn(() => null),
    dataset: attributes.dataset || {},
    className: attributes.className || '',
    id: attributes.id || '',
  };
  return img;
}

describe('ImageUtils - extractImageSrc', () => {
  test('應該提取標準 src 屬性', () => {
    const img = createMockImg({ src: 'image.jpg' });
    expect(extractImageSrc(img)).toBe('image.jpg');
  });

  test('應該優先使用 srcset 中的最佳 URL', () => {
    const img = createMockImg({
      srcset: 'small.jpg 320w, large.jpg 640w',
      src: 'fallback.jpg',
    });
    expect(extractImageSrc(img)).toBe('large.jpg');
  });

  test('當 srcset URL 含逗號導致截斷時，應回退到 src 屬性（Substack CDN 場景）', () => {
    // Substack CDN URL 的 transform 參數含逗號，會破壞 srcset 的逗號分割
    // 解析器會把 URL 截斷為 "fl_progressive:steep/https%3A%2F%2F..." 這類無效片段
    const substackSrcset =
      'https://substackcdn.com/image/fetch/$s_!aq2h!,w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ftest.heic 424w, https://substackcdn.com/image/fetch/$s_!aq2h!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ftest.heic 1456w';
    const fullSrcUrl =
      'https://substackcdn.com/image/fetch/$s_!aq2h!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ftest.heic';
    const img = createMockImg({
      srcset: substackSrcset,
      src: fullSrcUrl,
    });
    const result = extractImageSrc(img);
    // 應回退到完整的 src URL，而非截斷的 srcset 片段
    expect(result).toBe(fullSrcUrl);
    expect(result).toContain('substackcdn.com');
  });

  test('當 srcset 為 protocol-relative URL 且含逗號導致截斷時，應回退到 src 屬性（Substack protocol-relative 場景）', () => {
    // protocol-relative Substack CDN URL（//substackcdn.com/...）含 https%3A%2F%2F
    // 截斷後會產生含 https%3A%2F%2F 但不以 http(s):// 開頭的片段，
    // 修復後 _isPlausibleImageUrl 應識別 // 開頭的 URL 為合法 protocol-relative URL
    const protocolRelativeSrcset =
      '//substackcdn.com/image/fetch/$s_!aq2h!,w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ftest.heic 424w, //substackcdn.com/image/fetch/$s_!aq2h!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ftest.heic 1456w';
    const fullSrcUrl =
      'https://substackcdn.com/image/fetch/$s_!aq2h!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ftest.heic';
    const img = createMockImg({
      srcset: protocolRelativeSrcset,
      src: fullSrcUrl,
    });
    const result = extractImageSrc(img);
    // protocol-relative URL 截斷後的碎片不以 http(s):// 開頭，應回退到完整的 src URL
    expect(result).toBe(fullSrcUrl);
    expect(result).toContain('substackcdn.com');
  });

  test('應該優先使用 src 屬性', () => {
    const img = createMockImg({
      src: 'primary.jpg',
      'data-src': 'lazy-image.jpg',
    });
    expect(extractImageSrc(img)).toBe('primary.jpg');
  });

  test('應該處理 picture 元素中的 source', () => {
    const mockSource = {
      getAttribute: jest.fn(name => (name === 'srcset' ? 'source1.jpg 1x, source2.jpg 2x' : null)),
    };
    const mockPicture = {
      querySelectorAll: jest.fn(() => [mockSource]),
    };
    const img = createMockImg();
    img.closest.mockReturnValue(mockPicture);

    expect(extractImageSrc(img)).toBe('source2.jpg');
  });

  test('應該處理 null 或無效輸入', () => {
    expect(extractImageSrc(null)).toBeNull();
    expect(extractImageSrc()).toBeNull();
  });

  test('應該跳過 data: 和 blob: URL', () => {
    const img = createMockImg({
      src: 'data:image/gif;base64,test',
      'data-src': 'blob:http://example.com/test',
    });
    expect(extractImageSrc(img)).toBeNull();
  });
});

describe('ImageUtils - extractFromPicture / extractFromBackgroundImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  test('extractFromPicture 應該從 srcset 取得最佳 URL', () => {
    const picture = document.createElement('picture');
    const source = document.createElement('source');
    source.setAttribute('srcset', 'https://example.com/a.jpg 1x, https://example.com/b.jpg 2x');
    const img = document.createElement('img');

    picture.append(source, img);
    document.body.append(picture);

    expect(extractFromPicture(img)).toBe('https://example.com/b.jpg');
  });

  test('extractFromBackgroundImage 應該讀取元素本身背景圖', () => {
    const originalGetComputedStyle = globalThis.getComputedStyle;
    const target = document.createElement('div');

    globalThis.getComputedStyle = jest.fn(() => ({
      backgroundImage: 'url("https://example.com/bg.png")',
      getPropertyValue: jest.fn(() => 'url("https://example.com/bg.png")'),
    }));

    try {
      expect(extractFromBackgroundImage(target)).toBe('https://example.com/bg.png');
    } finally {
      globalThis.getComputedStyle = originalGetComputedStyle;
    }
  });

  test('extractFromBackgroundImage 應該讀取父節點背景圖', () => {
    const originalGetComputedStyle = globalThis.getComputedStyle;
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.append(child);

    globalThis.getComputedStyle = jest.fn(node => {
      if (node === child) {
        return {
          backgroundImage: 'none',
          getPropertyValue: jest.fn(() => 'none'),
        };
      }
      if (node === parent) {
        return {
          backgroundImage: 'url("https://example.com/parent.png")',
          getPropertyValue: jest.fn(() => 'url("https://example.com/parent.png")'),
        };
      }
      return {
        backgroundImage: 'none',
        getPropertyValue: jest.fn(() => 'none'),
      };
    });

    try {
      expect(extractFromBackgroundImage(child)).toBe('https://example.com/parent.png');
    } finally {
      globalThis.getComputedStyle = originalGetComputedStyle;
    }
  });
});

describe('ImageUtils - coverage 補強', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('extractBestUrlFromSrcset 應該處理 SrcsetParser 錯誤', () => {
    const originalParser = globalThis.SrcsetParser;
    try {
      globalThis.SrcsetParser = {
        parse: jest.fn(() => {
          throw new Error('Parser Error');
        }),
      };

      const srcset = 'image.jpg 100w';
      const result = extractBestUrlFromSrcset(srcset);

      expect(result).toBe('image.jpg');
      expect(Logger.error).toHaveBeenCalledWith(
        'SrcsetParser 失敗',
        expect.objectContaining({ error: 'Parser Error' })
      );
    } finally {
      globalThis.SrcsetParser = originalParser;
    }
  });

  test('extractBestUrlFromSrcset 應該使用 SrcsetParser 成功結果', () => {
    const originalParser = globalThis.SrcsetParser;
    const expectedUrl = 'best-image.jpg';
    try {
      globalThis.SrcsetParser = {
        parse: jest.fn(() => expectedUrl),
      };

      const srcset = 'image.jpg 100w';
      const result = extractBestUrlFromSrcset(srcset);

      expect(result).toBe(expectedUrl);
    } finally {
      globalThis.SrcsetParser = originalParser;
    }
  });

  test('cleanImageUrl 應該處理 URL 建構錯誤', () => {
    const originalURL = globalThis.URL;

    try {
      globalThis.URL = jest.fn(() => {
        throw new Error('URL Error');
      });

      const result = cleanImageUrl('https://example.com');

      expect(result).toBeNull();
      expect(Logger.error).toHaveBeenCalledWith(
        'URL 轉換失敗',
        expect.objectContaining({ action: 'cleanImageUrl', url: expect.any(String) })
      );
    } finally {
      globalThis.URL = originalURL;
    }
  });

  test('cleanImageUrl 應該處理遞迴深度限制', () => {
    const url = 'https://example.com/image.jpg';
    const result = cleanImageUrl(url, IMAGE_VALIDATION.MAX_RECURSION_DEPTH);

    expect(result).toBe(url);
    expect(Logger.warn).toHaveBeenCalledWith(
      '達到最大遞迴深度',
      expect.objectContaining({ depth: IMAGE_VALIDATION.MAX_RECURSION_DEPTH })
    );
  });

  test('isValidImageUrl 應該處理 _checkUrlPatterns 例外', () => {
    const originalURL = globalThis.URL;
    const initialUrl = 'https://example.com/initial.jpg';
    const cleanedUrl = 'https://example.com/cleaned.jpg';

    try {
      globalThis.URL = jest.fn((url, base) => {
        const urlStr = url.toString();

        if (urlStr === initialUrl || (base && urlStr === initialUrl)) {
          return {
            protocol: 'https:',
            hostname: 'example.com',
            pathname: '/initial.jpg',
            searchParams: new URLSearchParams(),
            href: cleanedUrl,
            search: '',
            hash: '',
          };
        }

        if (urlStr === cleanedUrl || (base && urlStr === cleanedUrl)) {
          throw new Error('Pattern check failed');
        }

        return new originalURL(url, base);
      });

      const result = isValidImageUrl(initialUrl);
      expect(result).toBe(false);
    } finally {
      globalThis.URL = originalURL;
    }
  });

  test('cleanImageUrl 應該處理 decodeURI 例外', () => {
    const malformedUrl = 'https://example.com/%';
    expect(() => cleanImageUrl(malformedUrl)).not.toThrow();
  });

  const NEXTJS_WIDTH = 128;
  const NEXTJS_QUALITY = 75;

  test('isValidImageUrl 應該解包 Next.js 影像 URL（絕對）', () => {
    const validTarget = 'https://example.com/foo.png';
    const nextJsUrl = `https://vercel.com/_next/image?url=${encodeURIComponent(
      validTarget
    )}&w=${NEXTJS_WIDTH}&q=${NEXTJS_QUALITY}`;

    const cleaned = cleanImageUrl(nextJsUrl);
    expect(cleaned).toBe(validTarget);
    expect(isValidImageUrl(nextJsUrl)).toBe(true);
  });

  test('isValidImageUrl 應該解包 Next.js 影像 URL（相對）', () => {
    const relativeTarget = '/assets/bar.jpg';
    const origin = 'https://vercel.com';
    const nextJsUrl = `${origin}/_next/image?url=${encodeURIComponent(relativeTarget)}&w=${NEXTJS_WIDTH}&q=${NEXTJS_QUALITY}`;

    const expected = `${origin}${relativeTarget}`;
    const cleaned = cleanImageUrl(nextJsUrl);
    expect(cleaned).toBe(expected);
    expect(isValidImageUrl(nextJsUrl)).toBe(true);
  });

  test('isValidImageUrl 應該接受白名單 Avatar URL', () => {
    const githubAvatar = 'https://avatars.githubusercontent.com/u/14985020?v=4';
    expect(isValidImageUrl(githubAvatar)).toBe(true);

    const genericAvatar = 'https://example.com/avatars/user123';
    expect(isValidImageUrl(genericAvatar)).toBe(true);
  });
});

describe('ImageUtils - extractFromNoscript / isValidCleanedImageUrl', () => {
  test('extractFromNoscript 應該提取 noscript 內的圖片 URL', () => {
    const div = document.createElement('div');
    const noscript = document.createElement('noscript');
    noscript.textContent = '<img src="https://example.com/img.jpg">';
    div.append(noscript);

    const result = extractFromNoscript(div);
    expect(result).toBe('https://example.com/img.jpg');
  });

  test('isValidCleanedImageUrl 應該驗證 HTTPS 並拒絕 data:', () => {
    expect(isValidCleanedImageUrl('https://example.com/image.jpg')).toBe(true);
    expect(isValidCleanedImageUrl('data:image/jpeg;base64,123')).toBe(false);
  });
});

describe('ImageUtils - generateImageCacheKey', () => {
  test('應該生成基於屬性的緩存鍵', () => {
    const img = createMockImg({
      src: 'image.jpg',
      'data-src': 'data-image.jpg',
      className: 'lazy-image',
      id: 'img-1',
      dataset: { src: 'data-image.jpg' },
    });
    const key = generateImageCacheKey(img);
    expect(key).toBe('image.jpg|data-image.jpg|lazy-image|img-1');
  });

  test('應該處理缺少屬性的情況', () => {
    const img = createMockImg({ src: 'image.jpg' });
    const key = generateImageCacheKey(img);
    expect(key).toBe('image.jpg|||');
  });

  test('應該處理 null 輸入', () => {
    expect(generateImageCacheKey(null)).toBe('');
    expect(generateImageCacheKey()).toBe('');
  });
});

describe('ImageUtils - IMAGE_ATTRIBUTES', () => {
  test('應該包含所有必要的圖片屬性', () => {
    expect(IMAGE_ATTRIBUTES).toContain('src');
    expect(IMAGE_ATTRIBUTES).toContain('data-src');
    expect(IMAGE_ATTRIBUTES).toContain('data-lazy-src');
    expect(IMAGE_ATTRIBUTES).toContain('data-original');
    expect(IMAGE_ATTRIBUTES).toContain('data-srcset');
    expect(IMAGE_ATTRIBUTES.length).toBeGreaterThan(20);
  });

  test('應該包含所有懶加載屬性變體', () => {
    // 檢查是否包含常見的懶加載屬性
    const lazyAttributes = IMAGE_ATTRIBUTES.filter(
      attr => attr.includes('lazy') || attr.includes('src')
    );
    expect(lazyAttributes.length).toBeGreaterThan(10);
  });
});
