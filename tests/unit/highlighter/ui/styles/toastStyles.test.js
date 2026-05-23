import {
  getToastCSS,
  injectToastStylesIntoShadowRoot,
} from '../../../../../scripts/highlighter/ui/styles/toastStyles.js';
import { UI_TOKENS } from '../../../../../styles/ui-token-constants.js';

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

    test('success modifier 應使用 status.successBg/Text/Border', () => {
      expect(css).toContain(UI_TOKENS.status.successBg);
      expect(css).toContain(UI_TOKENS.status.successText);
      expect(css).toContain(UI_TOKENS.status.successBorder);
    });

    test('warning modifier 應使用 status.warningBg/Text/Border', () => {
      expect(css).toContain(UI_TOKENS.status.warningBg);
      expect(css).toContain(UI_TOKENS.status.warningText);
      expect(css).toContain(UI_TOKENS.status.warningBorder);
    });

    test('error modifier 應使用 status.errorBg/Text/Border', () => {
      expect(css).toContain(UI_TOKENS.status.errorBg);
      expect(css).toContain(UI_TOKENS.status.errorText);
      expect(css).toContain(UI_TOKENS.status.errorBorder);
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
