const { JSDOM } = require('jsdom');
const dom = new JSDOM(
  '<!DOCTYPE html><html><body><template id="page-card-template"><div class="page-card"><div class="page-card-header"><div class="page-title-group"><span class="title-icon"></span><p class="page-title"></p></div><div class="page-info"><span class="page-meta"></span></div><button class="page-open-button"></button></div><div class="page-card-previews"></div><span class="page-card-remaining"></span></div></template></body></html>'
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.chrome = {
  storage: {
    local: {
      get: async () => {
        const storageData = {};
        for (let i = 0; i < 15; i++) {
          storageData[`highlights_https://example.com/page${i}`] = {
            highlights: [{ id: '1', text: 'x', color: 'yellow' }],
            updatedAt: i,
          };
        }
        return storageData;
      },
    },
  },
  runtime: { getURL: p => p },
};
const HIGHLIGHTS_PREFIX = 'highlights_';
const URL_ALIAS_PREFIX = 'url_alias:';
const SAVED_PREFIX = 'saved_';
const PREVIEW_HIGHLIGHT_COUNT = 3;
const PREVIEW_TEXT_MAX_LENGTH = 80;

function isRootUrl(url) {
  try {
    const u = new URL(url);
    return (u.pathname === '/' || u.pathname === '') && u.search.length === 0;
  } catch {
    return false;
  }
}
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function getUnsyncedPages() {
  const all = await chrome.storage.local.get(null);
  const pages = [];
  const aliasMap = new Map();
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(URL_ALIAS_PREFIX)) {
      aliasMap.set(key.slice(URL_ALIAS_PREFIX.length), value);
    }
  }
  const seenCanonicalUrls = new Set();
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(HIGHLIGHTS_PREFIX)) {continue;}
    const url = key.slice(HIGHLIGHTS_PREFIX.length);
    if (isRootUrl(url)) {continue;}

    const canonicalUrl = aliasMap.get(url) || url;
    if (seenCanonicalUrls.has(canonicalUrl)) {continue;}

    seenCanonicalUrls.add(canonicalUrl);
    seenCanonicalUrls.add(url);

    const savedDataOriginal = all[`${SAVED_PREFIX}${url}`];
    const savedDataCanonical = all[`${SAVED_PREFIX}${canonicalUrl}`];
    if (savedDataOriginal?.notionPageId || savedDataCanonical?.notionPageId) {continue;}

    const savedData = savedDataOriginal || savedDataCanonical;
    const highlights = value?.highlights || [];
    const previewHighlights = highlights.slice(0, PREVIEW_HIGHLIGHT_COUNT).map(hl => ({
      text: (hl.text || '').slice(0, PREVIEW_TEXT_MAX_LENGTH),
      color: hl.color || 'yellow',
    }));

    pages.push({
      url,
      storageKey: key,
      title: savedData?.title || value?.title || extractDomain(url),
      highlightCount: highlights.length,
      lastUpdated: value?.updatedAt || 0,
      previewHighlights,
      remainingCount: Math.max(0, highlights.length - PREVIEW_HIGHLIGHT_COUNT),
    });
  }
  return pages.toSorted((pa, pb) => pb.lastUpdated - pa.lastUpdated);
}
getUnsyncedPages()
  .then(pages => console.log('Pages length:', pages.length))
  .catch(console.error);
