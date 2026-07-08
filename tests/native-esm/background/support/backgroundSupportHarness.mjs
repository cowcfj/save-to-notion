import { jest } from '@jest/globals';
import { installChromeRuntime } from '../../utils/rootUtilsHarness.mjs';

export function installBackgroundSupportChrome(options = {}) {
  return installChromeRuntime({
    id: 'trusted-extension-id',
    activeTabs: [{ id: 55, url: 'https://example.com/background-support' }],
    ...options,
  });
}

export function createMockLogBuffer(entries = []) {
  return {
    entries: [...entries],
    getAll: jest.fn(() => [...entries]),
    push: jest.fn(entry => {
      entries.push(entry);
    }),
  };
}

export function makeParagraphBlock(text) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: { content: text },
          annotations: {},
        },
      ],
    },
  };
}
