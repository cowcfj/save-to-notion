let createSpriteIcon;
let injectIcons;
let Logger;
let validateSafeSvg;

jest.mock('../../../scripts/utils/securityUtils.js', () => ({
  validateSafeSvg: jest.fn().mockReturnValue(true),
  isSafeSvgAttribute: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

const loadUiUtilsModules = () => {
  ({ default: Logger } = require('../../../scripts/utils/Logger.js'));
  ({ validateSafeSvg } = require('../../../scripts/utils/securityUtils.js'));
  ({ createSpriteIcon, injectIcons } = require('../../../scripts/utils/uiUtils.js'));
};

describe('uiUtils', () => {
  beforeAll(() => {
    if (typeof document === 'undefined') {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
      globalThis.document = dom.window.document;
    }
    if (globalThis.CSS === undefined) {
      globalThis.CSS = { escape: str => str };
    }
  });

  describe('createSpriteIcon', () => {
    beforeEach(() => {
      jest.resetModules();
      loadUiUtilsModules();
      jest.clearAllMocks();
    });

    it('應為傳入名稱產生帶有 icon- 前綴的小寫 href', () => {
      const iconName = 'GENERAL';
      const svg = createSpriteIcon(iconName);
      const use = svg.querySelector('use');

      expect(use).not.toBeNull();
      expect(use.getAttribute('href')).toBe('#icon-general');
    });

    it('應支援已經是小寫的名稱', () => {
      const iconName = 'trash';
      const svg = createSpriteIcon(iconName);
      const use = svg.querySelector('use');

      expect(use.getAttribute('href')).toBe('#icon-trash');
    });

    it('應支援混合大小寫的名稱', () => {
      const iconName = 'SaveIcon';
      const svg = createSpriteIcon(iconName);
      const use = svg.querySelector('use');

      expect(use.getAttribute('href')).toBe('#icon-saveicon');
    });

    it('應處理無效的名稱輸入', () => {
      const svg1 = createSpriteIcon(null);
      const use1 = svg1.querySelector('use');
      expect(use1).toBeNull();
      expect(Logger.warn).toHaveBeenCalledWith('Invalid icon name provided to createSpriteIcon', {
        name: null,
      });

      const svg2 = createSpriteIcon('');
      const use2 = svg2.querySelector('use');
      expect(use2).toBeNull();
      expect(Logger.warn).toHaveBeenCalledWith('Invalid icon name provided to createSpriteIcon', {
        name: '',
      });
    });
  });

  describe('injectIcons', () => {
    beforeEach(() => {
      jest.resetModules();
      loadUiUtilsModules();
      document.body.innerHTML = '';
      jest.clearAllMocks();
      Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('應處理 undefined 或無效的 icons 物件', () => {
      injectIcons(null);
      injectIcons('string');

      expect(Logger.warn).toHaveBeenCalledTimes(2);
      expect(Logger.warn).toHaveBeenNthCalledWith(
        1,
        'Invalid icons object provided to injectIcons',
        expect.objectContaining({
          action: 'injectIcons',
          icons: null,
        })
      );
      expect(Logger.warn).toHaveBeenNthCalledWith(
        2,
        'Invalid icons object provided to injectIcons',
        expect.objectContaining({
          action: 'injectIcons',
          icons: 'string',
        })
      );
    });

    it('應成功注入基礎 SVG icon，且保持冪等', () => {
      const icons = {
        test: '<svg width="24" height="24"><path d="M1 1"/></svg>',
      };

      injectIcons(icons);

      const sprite = document.querySelector('#svg-sprite-definitions');
      expect(sprite).not.toBeNull();
      expect(sprite.tagName.toLowerCase()).toBe('svg');

      const defs = sprite.querySelector('defs');
      expect(defs).not.toBeNull();

      const symbol = defs.querySelector('#icon-test');
      expect(symbol).not.toBeNull();
      expect(symbol.querySelector('path').getAttribute('d')).toBe('M1 1');

      injectIcons(icons);
      const symbols = defs.querySelectorAll('#icon-test');
      expect(symbols).toHaveLength(1);
    });

    it('應阻擋不安全的 SVG', () => {
      validateSafeSvg.mockReturnValueOnce(false);

      const icons = {
        bad: '<script>alert("xss")</script><svg></svg>',
      };

      injectIcons(icons);

      const sprite = document.querySelector('#svg-sprite-definitions');
      const defs = sprite ? sprite.querySelector('defs') : null;
      if (defs) {
        expect(defs.querySelector('#icon-bad')).toBeNull();
      }

      expect(Logger.warn).toHaveBeenCalledTimes(1);
      expect(Logger.warn).toHaveBeenNthCalledWith(
        1,
        'Blocked unsafe SVG icon during injection',
        expect.objectContaining({
          action: 'injectIcons',
          key: 'bad',
        })
      );
    });

    it('應與既有 sprite 容器合併，並補上缺少的 defs', () => {
      const existingSprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      existingSprite.id = 'svg-sprite-definitions';
      document.body.append(existingSprite);

      const icons = {
        merge: '<svg><circle r="5"/></svg>',
      };

      injectIcons(icons);

      const sprite = document.querySelector('#svg-sprite-definitions');
      const defs = sprite.querySelector('defs');
      expect(defs).not.toBeNull();
      expect(defs.querySelector('#icon-merge')).not.toBeNull();
    });

    it('當 document 尚在 loading 時應延後掛載', () => {
      Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });

      const addEventSpy = jest.spyOn(document, 'addEventListener');
      const icons = {
        delay: '<svg><rect width="10"/></svg>',
      };

      injectIcons(icons);

      expect(addEventSpy).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function), {
        once: true,
      });
      expect(document.querySelector('#svg-sprite-definitions')).toBeNull();

      const eventHandler = addEventSpy.mock.calls.find(call => call[0] === 'DOMContentLoaded')[1];
      Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
      eventHandler();

      expect(document.querySelector('#svg-sprite-definitions')).not.toBeNull();
      addEventSpy.mockRestore();
    });

    it('當 document 尚在 loading 且已排程時應避免重複註冊', () => {
      Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });

      const addEventSpy = jest.spyOn(document, 'addEventListener');

      injectIcons({ icon1: '<svg></svg>' });
      injectIcons({ icon2: '<svg></svg>' });

      expect(addEventSpy).toHaveBeenCalledTimes(1);

      const eventHandler = addEventSpy.mock.calls.find(call => call[0] === 'DOMContentLoaded')[1];
      eventHandler();

      const defs = document.querySelector('#svg-sprite-definitions').querySelector('defs');
      expect(defs.querySelector('#icon-icon1')).not.toBeNull();
      expect(defs.querySelector('#icon-icon2')).not.toBeNull();
      addEventSpy.mockRestore();
    });

    it('當 DOMParser 拋出例外時應記錄 Failed to parse icon', () => {
      const parseSpy = jest.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(() => {
        throw new Error('Parse failed');
      });

      injectIcons({
        error: '<svg><path d="M1 1"/></svg>',
      });

      expect(document.querySelector('#icon-error')).toBeNull();

      const parseWarning = Logger.warn.mock.calls.find(
        ([message]) => message === 'Failed to parse icon'
      );
      expect(parseWarning).toBeDefined();
      expect(parseWarning[1]).toEqual(
        expect.objectContaining({
          action: 'injectIcons',
          key: 'error',
          error: expect.any(Error),
        })
      );

      parseSpy.mockRestore();
    });
  });
});
