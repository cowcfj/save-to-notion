import { test, expect } from '../fixtures';

test('Should save page to Notion successfully', async ({ page, extensionId, context }) => {
  // 1. Mock Notion API
  // Use context.route to intercept service worker requests
  await context.route('https://api.notion.com/v1/pages', async route => {
    const request = route.request();
    const postData = request.postDataJSON();

    if (postData.parent && postData.properties) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'page',
          id: 'mock-page-id',
          url: 'https://www.notion.so/mock-page-id',
          properties: postData.properties,
        }),
      });
    } else {
      await route.abort();
    }
  });

  // 2. Seed Storage
  const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
  const optionsPage = await context.newPage();
  await optionsPage.goto(optionsUrl);
  await optionsPage.evaluate(async () => {
    await chrome.storage.sync.set({
      notionApiKey: 'secret_mock_key',
      notionDataSourceId: 'mock-db-id',
      notionDatabaseId: 'mock-db-id',
    });
  });
  await optionsPage.close();

  // 3. Navigate target page
  await page.goto('https://example.com');
  await page.bringToFront();

  // 4. Trigger Save via Exposed Handler
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }

  // Invoke the exposed handler directly
  const response = await worker.evaluate(() => {
    if (!self.actionHandlers || !self.actionHandlers.savePage) {
      throw new Error('actionHandlers not exposed');
    }

    return new Promise(resolve => {
      // Mock sendResponse to resolve the promise
      const sendResponse = response => {
        resolve(response);
      };

      // Call the handler
      self.actionHandlers.savePage(
        { action: 'savePage' }, // request
        {}, // sender (unused)
        sendResponse
      );
    });
  });

  // 5. Assertions
  // 5. Assertions
  if (!response.success) {
    console.log('Save Failed Error:', response.error);
  }
  expect(response.success).toBe(true);
  expect(response.created).toBe(true);
  expect(response.blockCount).toBeGreaterThan(0);
});
