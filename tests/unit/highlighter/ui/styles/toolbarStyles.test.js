import { TOOLBAR_SELECTORS } from '../../../../../scripts/config/shared/ui.js';
import * as toolbarStylesModule from '../../../../../scripts/highlighter/ui/styles/toolbarStyles.js';

const { getToolbarCSS, injectStylesIntoShadowRoot } = toolbarStylesModule;

describe('toolbarStyles', () => {
  let originalCSSStyleSheet = null;
  let originalAdoptedStyleSheetsDescriptor = null;

  const createShadowRoot = () => {
    const host = document.createElement('div');
    document.body.append(host);
    return host.attachShadow({ mode: 'open' });
  };

  beforeEach(() => {
    originalCSSStyleSheet = globalThis.CSSStyleSheet;
    originalAdoptedStyleSheetsDescriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'adoptedStyleSheets'
    );
    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (originalCSSStyleSheet === undefined) {
      delete globalThis.CSSStyleSheet;
    } else {
      globalThis.CSSStyleSheet = originalCSSStyleSheet;
    }

    if (originalAdoptedStyleSheetsDescriptor) {
      Object.defineProperty(
        Document.prototype,
        'adoptedStyleSheets',
        originalAdoptedStyleSheetsDescriptor
      );
    } else {
      delete Document.prototype.adoptedStyleSheets;
    }

    document.body.innerHTML = '';
  });

  test('getToolbarCSS 應包含 Shadow DOM 與工具欄關鍵選擇器', () => {
    const css = getToolbarCSS();

    expect(css).toContain(':host');
    expect(css).toContain(':host :where(button)');
    expect(css).not.toContain(':host button {');
    expect(css).toContain(TOOLBAR_SELECTORS.CONTAINER);
    expect(css).toContain(TOOLBAR_SELECTORS.MINI_ICON);
    expect(css).toContain(`${TOOLBAR_SELECTORS.MINI_ICON}:hover`);
    expect(css).toContain('transform: scale(1.1) rotate(15deg);');
    expect(css).toContain('box-shadow: 0 8px 24px rgba(0,0,0,0.2);');
  });

  test('getToolbarCSS 應透過 TOOLBAR_SELECTORS.MINI_ICON 生成 hover selector', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(TOOLBAR_SELECTORS, 'MINI_ICON');
    Object.defineProperty(TOOLBAR_SELECTORS, 'MINI_ICON', {
      value: '#test-mini-icon',
      writable: true,
      enumerable: true,
      configurable: true,
    });

    try {
      const css = getToolbarCSS();
      expect(css).toContain('#test-mini-icon:hover');
      expect(css).toContain('transform: scale(1.1) rotate(15deg);');
      expect(css).toContain('box-shadow: 0 8px 24px rgba(0,0,0,0.2);');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(TOOLBAR_SELECTORS, 'MINI_ICON', originalDescriptor);
      }
    }
  });

  test('injectStylesIntoShadowRoot 應在 adoptedStyleSheets 可用時寫入樣式表', () => {
    Object.defineProperty(Document.prototype, 'adoptedStyleSheets', {
      value: [],
      writable: true,
      configurable: true,
    });

    class MockStyleSheet {
      replaceSync = jest.fn();
    }
    globalThis.CSSStyleSheet = MockStyleSheet;

    const shadowRoot = createShadowRoot();
    injectStylesIntoShadowRoot(shadowRoot);

    expect(shadowRoot.adoptedStyleSheets).toHaveLength(1);
    expect(shadowRoot.adoptedStyleSheets[0]).toBeInstanceOf(MockStyleSheet);
    expect(shadowRoot.adoptedStyleSheets[0].replaceSync).toHaveBeenCalledWith(
      expect.stringContaining(':host')
    );
    expect(shadowRoot.querySelector('style')).toBeNull();
  });

  test('injectStylesIntoShadowRoot 應在 replaceSync 失敗時 fallback 建立 style 元素', () => {
    Object.defineProperty(Document.prototype, 'adoptedStyleSheets', {
      value: [],
      writable: true,
      configurable: true,
    });

    class MockStyleSheetThrow {
      replaceSync() {
        throw new Error('replaceSync failed');
      }
    }
    globalThis.CSSStyleSheet = MockStyleSheetThrow;

    const shadowRoot = createShadowRoot();
    injectStylesIntoShadowRoot(shadowRoot);

    const styleElement = shadowRoot.querySelector('style');
    expect(styleElement).toBeTruthy();
    expect(styleElement.textContent).toContain(':host');
  });

  test('injectStylesIntoShadowRoot 應在 CSSStyleSheet 不可用時直接 fallback', () => {
    delete globalThis.CSSStyleSheet;
    delete Document.prototype.adoptedStyleSheets;

    const shadowRoot = createShadowRoot();
    injectStylesIntoShadowRoot(shadowRoot);

    const styleElement = shadowRoot.querySelector('style');
    expect(styleElement).toBeTruthy();
    expect(styleElement.textContent).toContain(':host');
  });

  test('injectGlobalStyles 應保持 no-op 且不拋錯', () => {
    const headChildrenCount = document.head.children.length;
    // 透過 any 取得 legacy API，避免 IDE 對 @deprecated 簽名噪音
    const legacyInjectGlobalStyles = /** @type {any} */ (toolbarStylesModule).injectGlobalStyles;

    expect(() => legacyInjectGlobalStyles()).not.toThrow();
    expect(document.head.children).toHaveLength(headChildrenCount);
  });
});
