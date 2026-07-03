export const SHOW_TOOLBAR_RETRY_COUNT = 15;
export const SHOW_TOOLBAR_RETRY_DELAY_MS = 200;

export const getServiceWorker = async context => {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  return serviceWorker;
};

export async function ensureHighlighterReadyInTab({
  tabId,
  retryCount = 15,
  retryDelayMs = 200,
  contentBundlePath = 'dist/content.bundle.js',
  bundleInjectionMode = 'when-missing',
  throwOnFailure = false,
}) {
  const isMissingContentScriptConnection = error => {
    const message = error?.message ?? '';
    return message.includes('Could not establish connection');
  };

  const getBundleReadyStatus = async () => {
    try {
      const ping = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      return ping?.status === 'bundle_ready';
    } catch (error) {
      if (isMissingContentScriptConnection(error)) {
        return false;
      }
      throw error;
    }
  };

  const injectContentBundle = async () => {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [contentBundlePath],
    });
  };

  const ensureContentBundle = async () => {
    if (bundleInjectionMode === 'always') {
      await injectContentBundle();
      return;
    }

    if (await getBundleReadyStatus()) {
      return;
    }
    await injectContentBundle();
  };

  const waitForRetry = async attempt => {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  };

  const sendShowToolbarMessage = async () => {
    try {
      return await chrome.tabs.sendMessage(tabId, { action: 'showToolbar' });
    } catch (error) {
      if (isMissingContentScriptConnection(error)) {
        return null;
      }
      throw error;
    }
  };

  const requestToolbarWithRetry = async () => {
    let lastResult = null;
    for (let attempt = 0; attempt < retryCount; attempt++) {
      await waitForRetry(attempt);
      lastResult = await sendShowToolbarMessage();
      if (lastResult?.success) {
        return lastResult;
      }
    }
    return lastResult;
  };

  await ensureContentBundle();
  const result = await requestToolbarWithRetry();
  const success = Boolean(result?.success);

  if (!success && throwOnFailure) {
    throw new Error(`showToolbar 重試後仍失敗：${result?.error ?? '沒有回應'}`);
  }

  return { ok: success, success, last: result };
}
