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

    test('trigger tile 應套用 brand 色與 white icon 色變數並以 var() 引用', () => {
      expect(css).toMatch(/--rail-color-brand:\s*#F47565/i);
      expect(css).toMatch(/--rail-color-icon-on-accent:\s*#FFFFFF/i);
      expect(css).toMatch(/\.rail-trigger\s*\{[\s\S]*?background:\s*var\(--rail-color-brand\)/);
      expect(css).toMatch(/\.rail-trigger\s*\{[\s\S]*?color:\s*var\(--rail-color-icon-on-accent\)/);
    });

    test('save / sync tile 應套用 actionSave 色變數並以 var() 引用', () => {
      expect(css).toMatch(/--rail-color-action-save:\s*#0A84FF/i);
      expect(css).toMatch(
        /\.rail-action-btn\[data-action="save"\][^{]*,\s*\.rail-action-btn\[data-action="sync"\][^{]*\{[\s\S]*?background:\s*var\(--rail-color-action-save\)/
      );
    });

    test('manage tile 應套用 actionManage violet 色變數並以 var() 引用，避免與 light/dark 容器底色混同', () => {
      expect(css).toMatch(/--rail-color-action-manage:\s*#8B5CF6/i);
      expect(css).toMatch(
        /\.rail-action-btn\[data-action="manage"\]\s*\{[\s\S]*?background:\s*var\(--rail-color-action-manage\)/
      );
    });

    test('rail-action-btn svg 應顯式宣告 color/fill/stroke 為 currentColor 以修正 stroke 染色 bug', () => {
      expect(css).toMatch(
        /\.rail-action-btn\s+svg\s*\{[\s\S]*?color:\s*currentColor;[\s\S]*?fill:\s*currentColor;[\s\S]*?stroke:\s*currentColor;/
      );
    });

    test('highlight tile inactive 應使用 0.40 alpha tint 變數、muted icon 色變數與 ring 變數', () => {
      expect(css).toMatch(/--rail-color-primary-a40:\s*rgba\(37,\s*99,\s*235,\s*0\.4\)/i);
      expect(css).toMatch(/--rail-ring-white-strong:\s*rgba\(255,\s*255,\s*255,\s*0\.45\)/i);
      expect(css).toMatch(
        /\[data-highlight-state="inactive"\]\s*\{[\s\S]*?background:\s*var\(--rail-highlight-tint,\s*var\(--rail-color-primary-a40\)\)/
      );
      expect(css).toMatch(
        /\[data-highlight-state="inactive"\]\s*\{[\s\S]*?box-shadow:\s*inset\s+0\s+0\s+0\s+1px\s+var\(--rail-ring-white-strong\)/
      );
      expect(css).toMatch(
        /\[data-highlight-state="inactive"\]\s*\{[\s\S]*?color:\s*var\(--rail-icon-muted/
      );
    });

    test('highlight tile active 應使用實色背景與深色 icon stroke', () => {
      expect(css).toMatch(
        /\[data-highlight-state="active"\]\s*\{[\s\S]*?background:\s*var\(--rail-highlight-color,\s*var\(--rail-color-primary\)\)/
      );
      expect(css).toMatch(
        /\[data-highlight-state="active"\]\s*\{[\s\S]*?color:\s*rgba\(0,\s*0,\s*0,\s*0\.78\)/
      );
    });

    test('color-swatch selected 應使用 brand 色變數並以 var() 引用', () => {
      expect(css).toMatch(
        /\.color-swatch\.selected\s*\{[\s\S]*?border-color:\s*var\(--rail-color-brand\)/
      );
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

  describe('CSS variable fallbacks', () => {
    test('host top uses var(--rail-top, 50%)', () => {
      const css = getFloatingRailCSS();
      expect(css).toMatch(/top:\s*var\(--rail-top,\s*50%\)/);
    });

    test('rail-trigger and rail-action-btn use var(--rail-btn-size, 34px)', () => {
      const css = getFloatingRailCSS();
      const matches = css.match(/var\(--rail-btn-size,\s*34px\)/g);
      expect(matches).not.toBeNull();
      expect(matches.length).toBeGreaterThanOrEqual(4);
    });

    test('rail-trigger svg uses var(--rail-trigger-icon-size, 22px)', () => {
      const css = getFloatingRailCSS();
      const matches = css.match(/var\(--rail-trigger-icon-size,\s*22px\)/g);
      expect(matches).not.toBeNull();
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    test('rail-action-btn svg uses var(--rail-action-icon-size, 18px)', () => {
      const css = getFloatingRailCSS();
      const matches = css.match(/var\(--rail-action-icon-size,\s*18px\)/g);
      expect(matches).not.toBeNull();
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    test('[REGRESSION] rail-trigger > .icon wrapper 應跟著 trigger icon size CSS variable，避免 small 模式錯位', () => {
      const css = getFloatingRailCSS();
      expect(css).toMatch(
        /\.rail-trigger\s*>\s*\.icon\s*\{[\s\S]*?width:\s*var\(--rail-trigger-icon-size,\s*22px\)[\s\S]*?height:\s*var\(--rail-trigger-icon-size,\s*22px\)/
      );
    });

    test('[REGRESSION] rail-action-btn > .icon wrapper 應跟著 action icon size CSS variable，避免 small 模式錯位', () => {
      const css = getFloatingRailCSS();
      expect(css).toMatch(
        /\.rail-action-btn\s*>\s*\.icon\s*\{[\s\S]*?width:\s*var\(--rail-action-icon-size,\s*18px\)[\s\S]*?height:\s*var\(--rail-action-icon-size,\s*18px\)/
      );
    });
  });
});
