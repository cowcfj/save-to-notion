import { beforeEach, describe, expect, test } from '@jest/globals';

describe('root URL and page complexity native ESM siblings', () => {
  beforeEach(() => {
    document.title = '';
    document.body.innerHTML = '';
    history.replaceState(null, '', '/');
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
});
