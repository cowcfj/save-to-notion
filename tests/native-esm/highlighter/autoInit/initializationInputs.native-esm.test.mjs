import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  warn: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
};

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

const {
  fetchHighlighterSettings,
  fetchPageStatus,
  resolveStyleMode,
} = await import('../../../../scripts/highlighter/autoInit/initializationInputs.js');

describe('initializationInputs native ESM mocking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('resolveStyleMode uses mocked Logger for invalid style', () => {
    expect(resolveStyleMode({ highlightStyle: 'invalid-style' })).toBe('background');

    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[Highlighter] highlightStyle 設定值無效',
      expect.objectContaining({
        action: 'initializeExtension',
        value: 'invalid-style',
      })
    );
  });

  test('fetch helpers keep async behavior under native ESM', async () => {
    const pageStatus = { isSaved: true, stableUrl: 'https://example.com' };
    const sendMessage = jest.fn().mockResolvedValue(pageStatus);
    const get = jest.fn().mockResolvedValue({ highlightStyle: 'background' });

    await expect(
      fetchPageStatus({
        globalScope: { chrome: { runtime: { sendMessage } } },
      })
    ).resolves.toBe(pageStatus);

    await expect(
      fetchHighlighterSettings({
        globalScope: { chrome: { storage: { sync: { get } } } },
      })
    ).resolves.toEqual({ highlightStyle: 'background' });
  });
});
