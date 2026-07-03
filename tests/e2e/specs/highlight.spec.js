import { test, expect } from '../fixtures.js';
import {
  ensureHighlighterReadyInTab,
  getServiceWorker,
  SHOW_TOOLBAR_RETRY_COUNT,
  SHOW_TOOLBAR_RETRY_DELAY_MS,
} from '../toolbarRetryHelper.js';

const EXAMPLE_URL = 'https://example.com';
const EXAMPLE_URL_WITH_SLASH = 'https://example.com/';
const OPTIONS_PAGE_PATH = 'pages/options/options.html';
const FLOATING_RAIL_SELECTOR = '[id^="notion-floating-rail-host-"][data-rail-owner="true"]';

const getOptionsPageUrl = extensionId => `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`;

const seedHighlightStateAndResolveTabId = async ({ context, extensionId }) => {
  const optionsPage = await context.newPage();
  await optionsPage.goto(getOptionsPageUrl(extensionId));

  const targetTabId = await optionsPage.evaluate(async mockUrl => {
    const mockPageId = 'test-page-id';

    await chrome.storage.sync.set({
      notionApiKey: 'notion_test_key',
      notionDatabaseId: 'test_db_id',
    });

    await chrome.storage.local.set({
      [`saved_${mockUrl}`]: {
        notionPageId: mockPageId,
        notionUrl: 'https://notion.so/test-page',
        title: 'Example Domain',
        savedAt: Date.now(),
        lastVerifiedAt: Date.now(),
      },
    });

    const tabs = await chrome.tabs.query({});
    const target = tabs.find(tab => tab.url?.includes('example.com'));
    return target ? target.id : null;
  }, EXAMPLE_URL_WITH_SLASH);

  await optionsPage.close();
  return targetTabId;
};

const injectContentBundleAndShowToolbar = async (serviceWorker, targetTabId) => {
  try {
    return await serviceWorker.evaluate(ensureHighlighterReadyInTab, {
      tabId: targetTabId,
      retryCount: SHOW_TOOLBAR_RETRY_COUNT,
      retryDelayMs: SHOW_TOOLBAR_RETRY_DELAY_MS,
      bundleInjectionMode: 'always',
      throwOnFailure: true,
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const readToastWireState = async (serviceWorker, targetTabId) => {
  return serviceWorker.evaluate(async tabId => {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const v2 = globalThis.HighlighterV2;
        return {
          hasV2: Boolean(v2),
          hasToast: Boolean(v2?.toast),
          toastShowIsFn: typeof v2?.toast?.show === 'function',
          managerToastIsSameInstance: v2?.manager?.toast === v2?.toast,
        };
      },
    });
    return result.result;
  }, targetTabId);
};

test.describe('Highlighting Feature', () => {
  test('should inject highlighter script via direct Service Worker injection', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(EXAMPLE_URL);

    const targetTabId = await seedHighlightStateAndResolveTabId({ context, extensionId });
    expect(targetTabId).not.toBeNull();

    const serviceWorker = await getServiceWorker(context);
    const injectionResult = await injectContentBundleAndShowToolbar(serviceWorker, targetTabId);

    expect(injectionResult.success, `Injection failed: ${injectionResult.error}`).toBe(true);

    await page.waitForSelector(FLOATING_RAIL_SELECTOR, {
      timeout: 5000,
      state: 'attached',
    });

    const toastWireResult = await readToastWireState(serviceWorker, targetTabId);

    expect(toastWireResult.hasV2).toBe(true);
    expect(toastWireResult.hasToast).toBe(true);
    expect(toastWireResult.toastShowIsFn).toBe(true);
    expect(toastWireResult.managerToastIsSameInstance).toBe(true);
  });
});
