import {
  getToastCSS,
  injectToastStylesIntoShadowRoot,
} from '../../../../../scripts/highlighter/ui/styles/toastStyles.js';

describe('toastStyles', () => {
  describe('getToastCSS', () => {
    const css = getToastCSS();

    test(':host 應為 fixed 定位且使用最高 z-index', () => {
      expect(css).toMatch(/:host\s*\{[\s\S]*?all:\s*initial/);
      expect(css).toMatch(/:host\s*\{[\s\S]*?position:\s*fixed/);
      expect(css).toMatch(/:host\s*\{[\s\S]*?z-index:\s*2147483647/);
    });

    test(':host 應 pointer-events: none，內部 container 應 pointer-events: auto', () => {
      expect(css).toMatch(/:host\s*\{[\s\S]*?pointer-events:\s*none/);
      expect(css).toMatch(/\.toast-container\s*\{[\s\S]*?pointer-events:\s*auto/);
    });

    test('success modifier 應使用 status.successBg/Text/Border 變數並以 var() 引用', () => {
      // 驗證 :host 內的變數定義
      expect(css).toMatch(/--toast-color-success-bg:\s*#dcfce7/i);
      expect(css).toMatch(/--toast-color-success-text:\s*#166534/i);
      expect(css).toMatch(/--toast-color-success-border:\s*#bbf7d0/i);
      // 驗證類別內的 var() 引用
      expect(css).toMatch(
        /\.toast--success\s*\{[\s\S]*?background:\s*var\(--toast-color-success-bg\)/
      );
      expect(css).toMatch(
        /\.toast--success\s*\{[\s\S]*?color:\s*var\(--toast-color-success-text\)/
      );
      expect(css).toMatch(
        /\.toast--success\s*\{[\s\S]*?border-color:\s*var\(--toast-color-success-border\)/
      );
    });

    test('warning modifier 應使用 status.warningBg/Text/Border 變數並以 var() 引用', () => {
      // 驗證 :host 內的變數定義
      expect(css).toMatch(/--toast-color-warning-bg:\s*#fef3c7/i);
      expect(css).toMatch(/--toast-color-warning-text:\s*#92400e/i);
      expect(css).toMatch(/--toast-color-warning-border:\s*#fcd34d/i);
      // 驗證類別內的 var() 引用
      expect(css).toMatch(
        /\.toast--warning\s*\{[\s\S]*?background:\s*var\(--toast-color-warning-bg\)/
      );
      expect(css).toMatch(
        /\.toast--warning\s*\{[\s\S]*?color:\s*var\(--toast-color-warning-text\)/
      );
      expect(css).toMatch(
        /\.toast--warning\s*\{[\s\S]*?border-color:\s*var\(--toast-color-warning-border\)/
      );
    });

    test('error modifier 應使用 status.errorBg/Text/Border 變數並以 var() 引用', () => {
      // 驗證 :host 內的變數定義
      expect(css).toMatch(/--toast-color-error-bg:\s*#fee2e2/i);
      expect(css).toMatch(/--toast-color-error-text:\s*#991b1b/i);
      expect(css).toMatch(/--toast-color-error-border:\s*#fecaca/i);
      // 驗證類別內的 var() 引用
      expect(css).toMatch(/\.toast--error\s*\{[\s\S]*?background:\s*var\(--toast-color-error-bg\)/);
      expect(css).toMatch(/\.toast--error\s*\{[\s\S]*?color:\s*var\(--toast-color-error-text\)/);
      expect(css).toMatch(
        /\.toast--error\s*\{[\s\S]*?border-color:\s*var\(--toast-color-error-border\)/
      );
    });

    test('應定義 .toast--success/.toast--warning/.toast--error 三組 modifier', () => {
      expect(css).toMatch(/\.toast--success\s*\{/);
      expect(css).toMatch(/\.toast--warning\s*\{/);
      expect(css).toMatch(/\.toast--error\s*\{/);
    });

    test('container 應使用 transition + .toast--visible modifier 控制顯示', () => {
      expect(css).toMatch(/\.toast-container\s*\{[\s\S]*?transition:/);
      expect(css).toMatch(/\.toast-container\.toast--visible\s*\{[\s\S]*?opacity:\s*1/);
    });

    test('應有 prefers-reduced-motion 降級', () => {
      expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    });
  });

  describe('injectToastStylesIntoShadowRoot', () => {
    test('應將 style 元素加入 shadow root', () => {
      const host = document.createElement('div');
      document.body.append(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });

      injectToastStylesIntoShadowRoot(shadowRoot);

      const styleEl = shadowRoot.querySelector('style');
      expect(styleEl).not.toBeNull();
      expect(styleEl.textContent.length).toBeGreaterThan(0);
      expect(styleEl.textContent).toContain('.toast-container');
    });
  });
});
