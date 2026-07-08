import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { installChromeRuntime, snapshotGlobals } from './rootUtilsHarness.mjs';

let restoreGlobals;

describe('root utility runtime-surface native ESM siblings', () => {
  beforeEach(() => {
    restoreGlobals = snapshotGlobals(['chrome', 'ImageUtils']);
    installChromeRuntime({
      localData: {
        notionAuthMode: 'oauth',
        notionOAuthToken: 'oauth-token-native',
      },
      syncData: {
        notionApiKey: 'manual-token-native',
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreGlobals();
  });

  test('LogExporter serializes Logger buffer entries through Chrome runtime metadata', async () => {
    const { default: Logger } = await import('../../../scripts/utils/Logger.js');
    const { LogExporter } = await import('../../../scripts/utils/LogExporter.js');
    const buffer = {
      getAll: jest.fn(() => [
        {
          timestamp: '2026-06-28T12:00:00.000Z',
          level: 'info',
          message: 'native log entry',
        },
      ]),
    };

    jest.spyOn(Logger, 'getBuffer').mockReturnValue(buffer);

    const jsonExport = LogExporter.exportLogs({ format: 'json' });
    const textExport = LogExporter.exportLogs({ format: 'txt' });
    const parsed = JSON.parse(jsonExport.content);

    expect(jsonExport).toEqual(
      expect.objectContaining({
        filename: 'notion-debug.json',
        mimeType: 'application/json',
        count: 1,
      })
    );
    expect(parsed.extensionVersion).toBe('9.9.9-test');
    expect(parsed.logs[0].message).toBe('native log entry');
    expect(textExport.content).toContain('native log entry');
    expect(() => LogExporter.exportLogs({ format: 'csv' })).toThrow(/Unsupported format/);
  });

  test('notionAuth resolves OAuth before manual token and migrates legacy data source keys', async () => {
    const {
      ensureNotionApiKey,
      getActiveNotionToken,
      getNextAuthEpoch,
      isNonEmptyString,
      migrateDataSourceKeys,
    } = await import('../../../scripts/utils/notionAuth.js');

    expect(isNonEmptyString(' token ')).toBe(true);
    expect(isNonEmptyString('   ')).toBe(false);
    await expect(getActiveNotionToken()).resolves.toEqual({
      token: 'oauth-token-native',
      mode: 'oauth',
    });
    await expect(ensureNotionApiKey()).resolves.toBe('oauth-token-native');
    await expect(getNextAuthEpoch()).resolves.toBe(1);

    const storageArea = { set: jest.fn(async () => {}) };
    await expect(
      migrateDataSourceKeys({
        localData: {},
        syncData: { notionDatabaseId: 'legacy-db' },
        storageArea,
        logger: { success: jest.fn(), warn: jest.fn() },
        action: 'native-runtime-test',
        retryContext: 'native',
      })
    ).resolves.toBe(true);
    expect(storageArea.set).toHaveBeenCalledWith({
      notionDataSourceId: 'legacy-db',
      notionDatabaseId: 'legacy-db',
    });
  });

  test('securityUtils validates extension senders, Notion URLs, SVG, and backup payloads', async () => {
    const {
      createSafeIcon,
      isValidNotionUrl,
      isValidUrl,
      separateIconAndText,
      validateBackupData,
      validateContentScriptRequest,
      validateInternalRequest,
      validateSafeSvg,
    } = await import('../../../scripts/utils/securityUtils.js');
    const { default: Logger } = await import('../../../scripts/utils/Logger.js');
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});

    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidNotionUrl('https://team.notion.so/page')).toBe(true);
    expect(isValidNotionUrl('http://notion.so/page')).toBe(false);
    expect(validateInternalRequest({ id: 'native-esm-extension-id' })).toBeNull();
    expect(
      validateInternalRequest({
        id: 'native-esm-extension-id',
        tab: { id: 1 },
        url: 'https://evil.example.com',
      })
    ).toEqual(expect.objectContaining({ success: false }));
    expect(
      validateContentScriptRequest({
        id: 'native-esm-extension-id',
        tab: { id: 7 },
      })
    ).toBeNull();
    expect(separateIconAndText('<svg></svg> Saved')).toEqual({
      icon: '<svg></svg>',
      text: ' Saved',
    });
    expect(validateSafeSvg('<svg><script>alert(1)</script></svg>')).toBe(false);
    expect(createSafeIcon('<svg><circle cx="8" cy="8" r="8"></circle></svg>').className).toBe(
      'icon'
    );
    expect(() =>
      validateBackupData({
        version: '1',
        timestamp: '2026-06-28T00:00:00.000Z',
        data: { pages: {} },
      })
    ).not.toThrow();
  });

  test('uiUtils and named image helpers execute without relying on CJS global contracts', async () => {
    const { createSpriteIcon } = await import('../../../scripts/utils/uiUtils.js');
    const { mergeUniqueImages } = await import('../../../scripts/utils/imageUtils.js');

    const icon = createSpriteIcon('Save');
    const use = icon.querySelector('use');
    const placeholderBlock = {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [] },
      _meta: { placeholder: true, placeholderReason: 'temporary_image_url' },
    };

    expect(icon.getAttribute('width')).toBe('16');
    expect(use.getAttribute('href')).toBe('#icon-save');
    expect(
      mergeUniqueImages(
        [{ type: 'image', image: { external: { url: 'https://img.example.com/one.png' } } }],
        [
          { type: 'image', image: { external: { url: 'https://img.example.com/one.png' } } },
          { type: 'image', image: { external: { url: 'https://img.example.com/two.png' } } },
          placeholderBlock,
        ]
      )
    ).toEqual([
      { type: 'image', image: { external: { url: 'https://img.example.com/two.png' } } },
      placeholderBlock,
    ]);
  });
});
