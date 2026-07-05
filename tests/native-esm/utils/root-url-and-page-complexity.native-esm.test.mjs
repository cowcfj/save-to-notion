import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const originalAnalytics = globalThis.analytics;

function restoreAnalytics() {
  globalThis.analytics = originalAnalytics;
}

function createComplexity(overrides = {}) {
  const {
    metrics: metricOverrides = {},
    technicalFeatures: technicalOverrides = {},
    ...rest
  } = overrides;

  return {
    isClean: false,
    hasMarkdownFeatures: false,
    hasTechnicalContent: false,
    hasAds: false,
    isComplexLayout: false,
    hasRichMedia: false,
    isLongForm: false,
    metrics: {
      isDocSite: false,
      markdownContainers: 0,
      textLength: 1000,
      ...metricOverrides,
    },
    technicalFeatures: {
      isTechnical: false,
      ...technicalOverrides,
    },
    ...rest,
  };
}

describe('root URL and page complexity native ESM siblings', () => {
  beforeEach(() => {
    document.title = '';
    document.body.innerHTML = '';
    history.replaceState(null, '', '/');
    restoreAnalytics();
  });

  afterEach(() => {
    restoreAnalytics();
  });

  test('urlUtils normalizes noisy URLs and resolves stable storage URLs', async () => {
    const {
      buildStableUrlFromNextData,
      computeStableUrl,
      hasSameOrigin,
      isRootUrl,
      isSafeStableUrl,
      normalizeUrl,
      resolveStorageUrl,
    } = await import('../../../scripts/utils/urlUtils.js');

    expect(normalizeUrl('https://example.com/path/?utm_source=news#section')).toBe(
      'https://example.com/path'
    );
    expect(
      computeStableUrl(
        'https://www.hk01.com/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801/title-slug?utm_medium=x'
      )
    ).toBe('https://www.hk01.com/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801');
    expect(
      buildStableUrlFromNextData(
        {
          page: '/news/[category]/[id]/[slug]',
          query: { category: 'local', id: '12345', slug: 'breaking-title' },
        },
        'https://news.example.com/news/local/12345/breaking-title?utm_campaign=x'
      )
    ).toBe('https://news.example.com/news/local/12345');
    expect(
      resolveStorageUrl('https://blog.example.com/article-title', {
        shortlink: 'https://blog.example.com/?p=77',
      })
    ).toBe('https://blog.example.com/?p=77');
    expect(hasSameOrigin('https://example.com/a', 'https://example.com/b')).toBe(true);
    expect(isRootUrl('https://example.com/')).toBe(true);
    expect(isSafeStableUrl('https://example.com/article', { requireNormalized: true })).toBe(true);
  });

  test('pageComplexityDetector selects markdown for documentation-like pages', async () => {
    const { detectPageComplexity, getAnalysisReport, isDocumentation, selectExtractor } =
      await import('../../../scripts/utils/pageComplexityDetector.js');

    history.replaceState(null, '', '/guide/native-esm');
    document.title = 'Native ESM API Reference';
    document.body.innerHTML = `
      <main class="markdown-body">
        <article>
          <h1>Native ESM API Reference</h1>
          <p>${'JavaScript API module import export Promise async function class object. '.repeat(
            12
          )}</p>
          <pre><code>import { test } from '@jest/globals';</code></pre>
          <pre><code>export function run() { return true; }</code></pre>
          <pre><code>await import('./module.js');</code></pre>
        </article>
      </main>
    `;

    const documentation = isDocumentation({
      url: 'https://docs.example.com/guide/native-esm',
      title: document.title,
    });
    const complexity = detectPageComplexity(document);
    const selection = selectExtractor(complexity);
    const report = getAnalysisReport(complexity, selection);

    expect(documentation).toEqual(
      expect.objectContaining({
        isDoc: true,
        isTechnical: true,
      })
    );
    expect(complexity.metrics.markdownContainers).toBeGreaterThan(0);
    expect(complexity.hasMarkdownFeatures).toBe(true);
    expect(selection).toEqual(
      expect.objectContaining({
        extractor: 'markdown',
        fallbackRequired: false,
      })
    );
    expect(report.selection.extractor).toBe('markdown');
  });

  test('pageComplexityDetector routes cluttered media pages to readability', async () => {
    const { detectPageComplexity, selectExtractor } =
      await import('../../../scripts/utils/pageComplexityDetector.js');

    document.body.innerHTML = `
      <header></header><nav></nav><aside></aside><footer></footer>
      <main><article>${Array.from({ length: 12 }, (_, index) => `<img src="/${index}.png">`).join(
        ''
      )}<p>${'long text '.repeat(600)}</p></article></main>
      <iframe src="https://youtube.com/embed/demo"></iframe>
      <iframe src="https://vimeo.com/demo"></iframe>
      <iframe src="https://youtube.com/embed/demo-2"></iframe>
    `;

    const complexity = detectPageComplexity(document);
    const selection = selectExtractor(complexity);

    expect(complexity.hasRichMedia).toBe(true);
    expect(selection.extractor).toBe('readability');
    expect(selection.reasons).toContain('大量媒體內容');
  });

  test('pageComplexityDetector resolves relative documentation URLs in native ESM coverage', async () => {
    const { detectPageComplexity, isDocumentation } =
      await import('../../../scripts/utils/pageComplexityDetector.js');
    const documentLike = {
      URL: 'https://fallback.example.com/manual/native-esm',
      body: { textContent: 'plain native ESM article content' },
      title: 'Native ESM Manual',
      querySelectorAll: () => [],
    };

    const relativeDocumentation = isDocumentation({
      url: '/docs/native-esm',
      title: 'Native ESM Guide',
    });
    const metricsFromUrlFallback = detectPageComplexity(documentLike).metrics;

    expect(relativeDocumentation).toEqual(
      expect.objectContaining({
        isDoc: true,
        isTechnical: true,
        matched: expect.objectContaining({
          path: true,
          techUrl: true,
        }),
      })
    );
    expect(metricsFromUrlFallback).toEqual(
      expect.objectContaining({
        isDocSite: true,
        textLength: documentLike.body.textContent.length,
      })
    );
  });

  test('pageComplexityDetector reports markdown reasons without a markdown container shortcut', async () => {
    const { selectExtractor } = await import('../../../scripts/utils/pageComplexityDetector.js');
    const selection = selectExtractor(
      createComplexity({
        isClean: true,
        hasMarkdownFeatures: true,
        hasTechnicalContent: true,
      })
    );

    expect(selection).toEqual(
      expect.objectContaining({
        extractor: 'markdown',
        confidence: 100,
        fallbackRequired: false,
        reasons: expect.arrayContaining(['頁面簡潔', '包含代碼/列表且佈局乾淨', '技術文檔內容']),
      })
    );
  });

  test('pageComplexityDetector keeps a general markdown reason for plain low-risk pages', async () => {
    const { selectExtractor } = await import('../../../scripts/utils/pageComplexityDetector.js');
    const selection = selectExtractor(createComplexity());

    expect(selection).toEqual(
      expect.objectContaining({
        extractor: 'markdown',
        reasons: ['一般頁面'],
      })
    );
  });

  test('pageComplexityDetector reports all readability reasons for high-risk pages', async () => {
    const { selectExtractor } = await import('../../../scripts/utils/pageComplexityDetector.js');
    const selection = selectExtractor(
      createComplexity({
        hasAds: true,
        isComplexLayout: true,
        hasRichMedia: true,
        isLongForm: true,
        metrics: { textLength: 6000 },
      })
    );

    expect(selection).toEqual(
      expect.objectContaining({
        extractor: 'readability',
        confidence: 100,
        reasons: ['包含廣告元素', '複雜頁面佈局', '大量媒體內容', '長文內容'],
      })
    );
  });

  test('pageComplexityDetector recommends fallback for ambiguous and ad-heavy technical pages', async () => {
    const { selectExtractor } = await import('../../../scripts/utils/pageComplexityDetector.js');

    const shortPageSelection = selectExtractor(createComplexity({ metrics: { textLength: 100 } }));
    const adHeavyTechnicalSelection = selectExtractor(
      createComplexity({
        hasAds: true,
        hasTechnicalContent: true,
      })
    );

    expect(shortPageSelection).toEqual(
      expect.objectContaining({
        extractor: 'markdown',
        fallbackRequired: true,
      })
    );
    expect(adHeavyTechnicalSelection).toEqual(
      expect.objectContaining({
        extractor: 'readability',
        fallbackRequired: true,
      })
    );
  });

  test('pageComplexityDetector generates recommendations for low-confidence selections', async () => {
    const { getAnalysisReport, selectExtractor } =
      await import('../../../scripts/utils/pageComplexityDetector.js');
    const cleanLongFormComplexity = createComplexity({
      isClean: true,
      isLongForm: true,
      metrics: {
        isDocSite: true,
        textLength: 6000,
      },
    });

    const selection = selectExtractor(cleanLongFormComplexity);
    const report = getAnalysisReport(cleanLongFormComplexity, selection);

    expect(selection).toEqual(
      expect.objectContaining({
        extractor: 'readability',
        confidence: 45,
      })
    );
    expect(report.recommendations).toEqual([
      '建議使用備用提取器驗證結果品質',
      '簡潔頁面建議優先嘗試 @markdown 以獲得更好速度',
    ]);
  });

  test('pageComplexityDetector warns when markdown is selected for ad-heavy content', async () => {
    const { getAnalysisReport } = await import('../../../scripts/utils/pageComplexityDetector.js');
    const report = getAnalysisReport(
      createComplexity({
        hasAds: true,
        metrics: { textLength: 1000 },
      }),
      {
        extractor: 'markdown',
        reasons: ['manual override'],
        confidence: 80,
        fallbackRequired: false,
      }
    );

    expect(report.recommendations).toEqual(['檢測到廣告內容，@markdown 可能無法完全過濾']);
  });

  test('pageComplexityDetector sends analytics payloads for extraction analysis', async () => {
    const { logAnalysis } = await import('../../../scripts/utils/pageComplexityDetector.js');
    globalThis.analytics = { track: jest.fn() };

    logAnalysis(
      createComplexity({ metrics: { textLength: 1500 } }),
      { extractor: 'markdown', confidence: 88 },
      {
        success: true,
        contentLength: 1500,
        processingTime: 25,
        fallbackUsed: false,
      }
    );

    expect(globalThis.analytics.track).toHaveBeenCalledWith(
      'content_extraction_analysis',
      expect.objectContaining({
        extractor: 'markdown',
        confidence: 88,
        success: true,
        contentLength: 1500,
        processingTime: 25,
        fallbackUsed: false,
      })
    );
  });
});
