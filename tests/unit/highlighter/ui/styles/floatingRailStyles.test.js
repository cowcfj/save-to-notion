import {
  getFloatingRailCSS,
  injectRailStylesIntoShadowRoot,
} from '../../../../../scripts/highlighter/ui/styles/floatingRailStyles.js';
import { UI_TOKENS } from '../../../../../styles/ui-token-constants.js';

describe('floatingRailStyles', () => {
  describe('getFloatingRailCSS', () => {
    const css = getFloatingRailCSS();

    test('應為容器套用玻璃化容器（surface + backdrop-filter）', () => {
      expect(css).toMatch(/\.rail-container\s*\{[\s\S]*?backdrop-filter:\s*blur\(12px\)/);
      expect(css).toMatch(/-webkit-backdrop-filter:\s*blur\(12px\)/);
      expect(css).toContain(UI_TOKENS.theme.light.surface);
    });

    test('應有 prefers-color-scheme: dark media query 並切換 surface', () => {
      expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
      expect(css).toContain(UI_TOKENS.theme.dark.surface);
      expect(css).toContain(UI_TOKENS.theme.dark.border);
    });

    test('trigger tile 應套用 brand 色與 white icon 色', () => {
      expect(css).toMatch(/\.rail-trigger\s*\{[\s\S]*?background:\s*#F47565/);
      expect(css).toMatch(/\.rail-trigger\s*\{[\s\S]*?color:\s*#FFFFFF/);
    });

    test('save / sync tile 應套用 actionSave 色', () => {
      expect(css).toMatch(
        /\.rail-action-btn\[data-action="save"\][^{]*,\s*\.rail-action-btn\[data-action="sync"\][^{]*\{[\s\S]*?background:\s*#0A84FF/
      );
    });

    test('manage tile 應套用 actionManage violet 色，避免與 light/dark 容器底色混同', () => {
      expect(css).toMatch(
        /\.rail-action-btn\[data-action="manage"\]\s*\{[\s\S]*?background:\s*#8B5CF6/
      );
    });

    test('rail-action-btn svg 應顯式宣告 color/fill/stroke 為 currentColor 以修正 stroke 染色 bug', () => {
      expect(css).toMatch(
        /\.rail-action-btn\s+svg\s*\{[\s\S]*?color:\s*currentColor;[\s\S]*?fill:\s*currentColor;[\s\S]*?stroke:\s*currentColor;/
      );
    });

    test('highlight tile inactive 應使用 0.40 alpha tint 與 muted icon 色', () => {
      expect(css).toMatch(/\[data-highlight-state="inactive"\]\s*\{[\s\S]*?background:[^;]*0\.4/);
      expect(css).toMatch(
        /\[data-highlight-state="inactive"\]\s*\{[\s\S]*?color:\s*var\(--rail-icon-muted/
      );
    });

    test('highlight tile active 應使用實色背景與深色 icon stroke', () => {
      expect(css).toMatch(
        /\[data-highlight-state="active"\]\s*\{[\s\S]*?background:\s*var\(--rail-highlight-color/
      );
      expect(css).toMatch(
        /\[data-highlight-state="active"\]\s*\{[\s\S]*?color:\s*rgba\(0,\s*0,\s*0,\s*0\.78\)/
      );
    });

    test('color-swatch selected 應使用 brand 色而非 text 色', () => {
      expect(css).toMatch(/\.color-swatch\.selected\s*\{[\s\S]*?border-color:\s*#F47565/);
    });

    test('應包含 .rail-error-tooltip 樣式', () => {
      expect(css).toContain('.rail-error-tooltip');
      expect(css).toContain('position: absolute');
      expect(css).toContain('opacity: 0');
      expect(css).toContain('pointer-events: none');
    });
  });

  describe('injectRailStylesIntoShadowRoot', () => {
    test('應將 style 元素加入 shadow root', () => {
      const host = document.createElement('div');
      document.body.append(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });

      injectRailStylesIntoShadowRoot(shadowRoot);

      const styleEl = shadowRoot.querySelector('style');
      expect(styleEl).not.toBeNull();
      expect(styleEl.textContent).toContain('.rail-container');
    });
  });
});
