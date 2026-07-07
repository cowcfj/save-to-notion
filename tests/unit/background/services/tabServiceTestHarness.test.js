/*
 * @jest-environment jsdom
 */

import {
  mockInjectionService,
  mockUrlUtils,
  resetTabServiceTestState,
} from './tabServiceTestHarness.js';

describe('tabServiceTestHarness', () => {
  beforeEach(() => {
    resetTabServiceTestState();
  });

  it('defaults chrome storage get mocks to empty objects', async () => {
    await expect(chrome.storage.local.get(['missing'])).resolves.toEqual({});
    await expect(chrome.storage.sync.get(['missing'])).resolves.toEqual({});
  });

  it('resetTabServiceTestState restores overridden mock implementations', async () => {
    const target = {
      readValue: () => 'real',
    };
    jest.spyOn(target, 'readValue').mockReturnValue('mocked');
    chrome.storage.local.get.mockResolvedValue({ stale: true });
    chrome.storage.sync.get.mockResolvedValue({ floatingRailEnabled: false });
    chrome.tabs.query.mockResolvedValue([{ id: 1 }]);
    mockInjectionService.injectWithResponse.mockResolvedValue({ migrated: true });
    mockUrlUtils.resolveStorageUrl.mockImplementation(() => 'stale-url');

    resetTabServiceTestState();

    expect(target.readValue()).toBe('real');
    await expect(chrome.storage.local.get('stale')).resolves.toEqual({});
    await expect(chrome.storage.sync.get('floatingRailEnabled')).resolves.toEqual({});
    await expect(chrome.tabs.query({ active: true })).resolves.toEqual([]);
    await expect(mockInjectionService.injectWithResponse()).resolves.toEqual({ migrated: false });
    expect(mockUrlUtils.resolveStorageUrl('https://example.com')).toBe('https://example.com');
  });
});
