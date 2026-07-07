/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  ready: jest.fn(),
  warn: jest.fn(),
};
const initiateNotionOAuthMock = jest.fn();
const exchangeNotionOAuthCodeMock = jest.fn();
const saveNotionOAuthTokenMock = jest.fn();
const startAccountLoginMock = jest.fn();

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../../scripts/auth/notionOAuthInitiator.js', () => ({
  initiateNotionOAuth: initiateNotionOAuthMock,
}));

await jest.unstable_mockModule('../../../../scripts/auth/notionOAuthCompleter.js', () => ({
  exchangeNotionOAuthCode: exchangeNotionOAuthCodeMock,
  saveNotionOAuthToken: saveNotionOAuthTokenMock,
}));

await jest.unstable_mockModule('../../../../scripts/auth/accountLoginInitiator.js', () => ({
  startAccountLogin: startAccountLoginMock,
}));

await jest.unstable_mockModule('../../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    ENABLE_ACCOUNT: true,
  },
}));

const controller = await import('../../../../pages/onboarding/onboardingController.js');

function buildStepRoot() {
  const root = document.createElement('div');
  root.innerHTML = `
    ${Array.from({ length: controller.TOTAL_STEPS }, (_, index) => `<section data-step="${index + 1}" hidden></section>`).join('')}
    ${Array.from({ length: controller.TOTAL_STEPS }, (_, index) => `<span class="progress-dot" data-dot="${index + 1}"></span>`).join('')}
  `;
  return root;
}

function installChrome({ storageData = {}, searchResponse = null } = {}) {
  const listeners = new Set();
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage: jest.fn((_message, callback) => {
        callback(
          searchResponse || {
            success: true,
            data: {
              results: [
                { object: 'data_source', id: 'ds-1', title: [{ plain_text: 'Inbox' }] },
                { object: 'page', id: 'page-1', title: [{ plain_text: 'Ignored' }] },
              ],
            },
          }
        );
      }),
    },
    storage: {
      local: {
        get: jest.fn(async key => {
          if (typeof key === 'string') {
            return { [key]: storageData[key] };
          }
          return storageData;
        }),
        set: jest.fn(async items => {
          Object.assign(storageData, items);
        }),
      },
      onChanged: {
        addListener: jest.fn(listener => listeners.add(listener)),
        removeListener: jest.fn(listener => listeners.delete(listener)),
      },
    },
    __emitStorageChange(changes, areaName = 'local') {
      for (const listener of listeners) {
        listener(changes, areaName);
      }
    },
  };
}

function renderOnboardingDom() {
  document.body.innerHTML = `
    <main id="onboarding-root">
      ${Array.from({ length: controller.TOTAL_STEPS }, (_, index) => `
        <section data-step="${index + 1}" hidden>
          <button data-action="next">Next</button>
        </section>
      `).join('')}
      ${Array.from({ length: controller.TOTAL_STEPS }, (_, index) => `<span class="progress-dot" data-dot="${index + 1}"></span>`).join('')}
      <p data-error="connect-notion" hidden></p>
      <p data-error="fetch-databases" hidden></p>
      <p data-error="login-account" hidden></p>
      <div data-step3-state="loading" hidden></div>
      <div data-step3-state="list" hidden><ul data-database-list></ul></div>
      <div data-step3-state="empty" hidden></div>
      <div data-step3-state="error" hidden></div>
      <div data-step3-state="needs-auth" hidden></div>
      <button data-step3-confirm data-action="confirm-database" disabled>Confirm</button>
      <div data-step4-state="waiting" hidden></div>
      <button data-action="connect-notion">Connect</button>
      <button data-action="login-account">Login</button>
      <button data-action="skip">Skip</button>
      <button data-action="finish">Finish</button>
    </main>
  `;
}

async function flushMicrotasks(times = 6) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
  installChrome();
  initiateNotionOAuthMock.mockResolvedValue({ code: 'code-1', redirectUri: 'https://ext.test/auth' });
  exchangeNotionOAuthCodeMock.mockResolvedValue({ accessToken: 'notion-token' });
  saveNotionOAuthTokenMock.mockResolvedValue(undefined);
  startAccountLoginMock.mockResolvedValue({ success: true });
  globalThis.close = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
  delete globalThis.chrome;
});

describe('onboarding native ESM diagnostics', () => {
  test('onboardingController executes wizard, OAuth, search, and storage helpers', async () => {
    const root = buildStepRoot();

    expect(controller.showStep(root, 3)).toBe(3);
    expect(controller.getCurrentStep(root)).toBe(3);
    expect(controller.nextStep(root)).toBe(4);
    expect(controller.skipToEnd(root)).toBe(controller.TOTAL_STEPS);

    await controller.markCompleted(globalThis.chrome.storage.local);
    await expect(controller.isNotionConnected(globalThis.chrome.storage.local)).resolves.toBe(false);

    const tokenData = await controller.runNotionOAuthFlow();
    expect(tokenData).toEqual({ accessToken: 'notion-token' });
    expect(exchangeNotionOAuthCodeMock).toHaveBeenCalledWith({
      code: 'code-1',
      redirectUri: 'https://ext.test/auth',
    });
    expect(saveNotionOAuthTokenMock).toHaveBeenCalledWith({ accessToken: 'notion-token' });

    const databases = await controller.fetchNotionDatabases({
      sendMessage: globalThis.chrome.runtime.sendMessage.mock.calls.length
        ? undefined
        : message =>
            Promise.resolve({
              success: true,
              data: {
                results: [
                  { object: 'data_source', id: 'ds-2', title: [{ text: { content: 'Tasks' } }] },
                  { object: 'page', id: 'page-2' },
                ],
              },
              message,
            }),
    });
    expect(databases).toEqual([{ id: 'ds-2', title: 'Tasks' }]);

    await controller.selectDataSource({
      storage: globalThis.chrome.storage.local,
      dataSourceId: 'ds-2',
    });
    await expect(controller.isAccountLoggedIn(globalThis.chrome.storage.local)).resolves.toBe(false);
    expect(controller.extractDatabaseTitle({ title: [] })).toBe('（未命名）');
    expect(controller.isAccountFeatureEnabled()).toBe(true);
  });

  test('onboarding entry binds DOM actions and renders database selection under native ESM', async () => {
    renderOnboardingDom();

    await import('../../../../pages/onboarding/onboarding.js');
    expect(loggerMock.ready).toHaveBeenCalledWith('[Onboarding] entry loaded', {
      action: 'onboarding_init',
      result: 'success',
    });

    document.querySelector('[data-action="connect-notion"]').click();
    await flushMicrotasks();
    expect(initiateNotionOAuthMock).toHaveBeenCalled();
    expect(document.querySelector('section[data-step="2"]').hidden).toBe(false);

    await globalThis.chrome.storage.local.set({ notionOAuthToken: 'notion-token' });
    document.querySelector('section[data-step="2"] [data-action="next"]').click();
    await flushMicrotasks();
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalled();
    expect(document.querySelectorAll('.database-item')).toHaveLength(1);

    const databaseItem = document.querySelector('.database-item');
    databaseItem.click();
    expect(databaseItem.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[data-step3-confirm]').disabled).toBe(false);

    document.querySelector('[data-step3-confirm]').click();
    await flushMicrotasks();
    expect(globalThis.chrome.storage.local.set).toHaveBeenCalledWith({ notionDataSourceId: 'ds-1' });

    document.querySelector('[data-action="login-account"]').click();
    await flushMicrotasks();
    expect(startAccountLoginMock).toHaveBeenCalled();
    expect(document.querySelector('[data-step4-state="waiting"]').hidden).toBe(false);

    globalThis.chrome.__emitStorageChange({ accountEmail: { newValue: 'user@example.test' } });
    await flushMicrotasks();
    expect(globalThis.chrome.storage.onChanged.removeListener).toHaveBeenCalled();
  });
});
