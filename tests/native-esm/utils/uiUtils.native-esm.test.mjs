import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const warnMock = jest.fn();

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: {
    warn: warnMock,
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

async function loadUiUtils() {
  jest.resetModules();
  warnMock.mockClear();
  return import('../../../scripts/utils/uiUtils.js');
}

function setReadyState(value) {
  Object.defineProperty(document, 'readyState', {
    value,
    configurable: true,
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  setReadyState('complete');
  if (globalThis.CSS === undefined) {
    globalThis.CSS = { escape: value => String(value).replaceAll('.', String.raw`\.`) };
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('uiUtils native ESM depth coverage', () => {
  test('createSpriteIcon creates lower-case sprite references and rejects invalid names', async () => {
    const { createSpriteIcon } = await loadUiUtils();

    const icon = createSpriteIcon('SaveIcon');
    expect(icon.classList.contains('icon-svg')).toBe(true);
    expect(icon.getAttribute('width')).toBe('16');
    expect(icon.getAttribute('height')).toBe('16');
    expect(icon.querySelector('use')?.getAttribute('href')).toBe('#icon-saveicon');

    const invalidIcon = createSpriteIcon('');
    expect(invalidIcon.querySelector('use')).toBeNull();
    expect(warnMock).toHaveBeenCalledWith('Invalid icon name provided to createSpriteIcon', {
      name: '',
    });
  });

  test('injectIcons injects safe SVG symbols and strips disallowed child attributes', async () => {
    const { injectIcons } = await loadUiUtils();

    injectIcons({
      Save: '<svg viewBox="0 0 16 16" data-root="drop"><g data-private="drop"><path d="M1 1h14v14H1z"></path></g></svg>',
    });

    const symbol = document.querySelector('#svg-sprite-definitions symbol#icon-save');
    expect(symbol).not.toBeNull();
    expect(symbol.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(symbol.dataset.root).toBeUndefined();
    const group = symbol.querySelector('g');
    expect(group).not.toBeNull();
    expect(group.dataset.private).toBeUndefined();
    expect(symbol.querySelector('path')?.getAttribute('d')).toBe('M1 1h14v14H1z');
  });

  test('injectIcons blocks unsafe SVG payloads before parsing symbols', async () => {
    const { injectIcons } = await loadUiUtils();

    injectIcons({
      bad: '<svg><script>alert("xss")</script><path d="M1 1"></path></svg>',
    });

    expect(document.querySelector('#icon-bad')).toBeNull();
    expect(warnMock).toHaveBeenCalledWith(
      'Blocked unsafe SVG icon during injection',
      expect.objectContaining({
        action: 'injectIcons',
        key: 'bad',
      })
    );
  });

  test('injectIcons merges into existing sprites, adds missing defs, and skips duplicates', async () => {
    const { injectIcons } = await loadUiUtils();
    const existingSprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    existingSprite.id = 'svg-sprite-definitions';
    const existingDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const existingSymbol = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
    existingSymbol.id = 'icon-existing';
    existingDefs.append(existingSymbol);
    existingSprite.append(existingDefs);
    document.body.append(existingSprite);

    injectIcons({
      existing: '<svg><path d="M0 0"></path></svg>',
      added: '<svg><circle r="5"></circle></svg>',
    });

    expect(existingDefs.querySelectorAll('#icon-existing')).toHaveLength(1);
    expect(existingDefs.querySelector('#icon-added circle')?.getAttribute('r')).toBe('5');
  });

  test('injectIcons delays attachment while DOMContentLoaded is pending and coalesces calls', async () => {
    const { injectIcons } = await loadUiUtils();
    setReadyState('loading');
    const addEventSpy = jest.spyOn(document, 'addEventListener');

    injectIcons({ first: '<svg><rect width="10"></rect></svg>' });
    injectIcons({ second: '<svg><rect width="20"></rect></svg>' });

    expect(addEventSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#svg-sprite-definitions')).toBeNull();

    const [, handler] = addEventSpy.mock.calls[0];
    setReadyState('complete');
    handler();

    const defs = document.querySelector('#svg-sprite-definitions defs');
    expect(defs.querySelector('#icon-first rect')?.getAttribute('width')).toBe('10');
    expect(defs.querySelector('#icon-second rect')?.getAttribute('width')).toBe('20');
  });

  test('injectIcons warns and safely returns when parser access throws', async () => {
    const { injectIcons } = await loadUiUtils();
    const parseSpy = jest.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(() => {
      throw new Error('Parse failed');
    });

    injectIcons({ broken: '<svg><path d="M1 1"></path></svg>' });

    expect(document.querySelector('#icon-broken')).toBeNull();
    expect(warnMock).toHaveBeenCalledWith(
      'Failed to parse icon',
      expect.objectContaining({
        action: 'injectIcons',
        key: 'broken',
        error: expect.any(Error),
      })
    );
    parseSpy.mockRestore();
  });

  test('injectIcons warns for invalid icon maps', async () => {
    const { injectIcons } = await loadUiUtils();

    injectIcons(null);

    expect(warnMock).toHaveBeenCalledWith(
      'Invalid icons object provided to injectIcons',
      expect.objectContaining({
        action: 'injectIcons',
        icons: null,
      })
    );
  });
});
