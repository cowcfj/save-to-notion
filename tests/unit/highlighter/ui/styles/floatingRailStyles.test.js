import {
  getFloatingRailCSS,
  injectRailStylesIntoShadowRoot,
} from '../../../../../scripts/highlighter/ui/styles/floatingRailStyles.js';
import { UI_TOKENS } from '../../../../../styles/ui-token-constants.js';

function normalizeRailCSS(cssString) {
  return cssString.replaceAll(/\s+/g, ' ').trim();
}

const EXPECTED_FLOATING_RAIL_CSS_NORMALIZED =
  ':host { --rail-color-text: #1e293b; --rail-color-text-muted: #64748b; --rail-color-white: #ffffff; --rail-color-brand: #F47565; --rail-color-brand-hover: #E66651; --rail-color-icon-on-accent: #FFFFFF; --rail-color-action-save: #0A84FF; --rail-color-action-save-hover: #0070E5; --rail-color-action-manage: #8B5CF6; --rail-color-action-manage-hover: #7C3AED; --rail-color-primary: #2563eb; --rail-color-danger: #ef4444; --rail-glow-brand: rgba(244, 117, 101, 0.35); --rail-glow-action-save: rgba(10, 132, 255, 0.35); --rail-glow-action-manage: rgba(139, 92, 246, 0.35); --rail-color-primary-a40: rgba(37, 99, 235, 0.4); --rail-color-primary-a55: rgba(37, 99, 235, 0.55); --rail-ring-white-strong: rgba(255, 255, 255, 0.45); --rail-ring-white-weak: rgba(255, 255, 255, 0.25); --rail-shadow-black-a18: rgba(0, 0, 0, 0.18); --rail-border-white-a60: rgba(255, 255, 255, 0.6); --rail-border-white-a88: rgba(255, 255, 255, 0.88); --rail-surface: rgba(244, 244, 247, 0.82); --rail-border: rgba(0, 0, 0, 0.06); --rail-icon-muted: rgba(31, 33, 38, 0.78); } @media (prefers-color-scheme: dark) { :host { --rail-surface: rgba(22, 24, 30, 0.78); --rail-border: rgba(255, 255, 255, 0.10); --rail-icon-muted: rgba(240, 243, 247, 0.88); } } :host { all: initial; display: block; position: fixed; top: var(--rail-top, 50%); right: 0; transform: translateY(-50%); z-index: 2147483646; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: var(--rail-color-text); } :host *, :host *::before, :host *::after { box-sizing: border-box; margin: 0; padding: 0; } :host :where(button) { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; line-height: 1.5; font-family: inherit; font-size: inherit; } .rail-container { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px; background: var(--rail-surface); border: 1px solid var(--rail-border); border-right: none; border-radius: 12px 0 0 12px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); transition: opacity 0.2s ease, transform 0.2s ease; } .rail-close-btn { position: absolute; top: -6px; left: -6px; width: 16px; height: 16px; border-radius: 50%; background: var(--rail-color-text); color: var(--rail-color-white); display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.15s ease, transform 0.12s ease; z-index: 1; } .rail-container:hover .rail-close-btn { opacity: 0.7; pointer-events: auto; } .rail-close-btn:hover { opacity: 1 !important; transform: scale(1.15); } .rail-close-btn:focus-visible { opacity: 1 !important; pointer-events: auto; outline: 2px solid var(--rail-color-brand); outline-offset: 1px; } .rail-close-btn > .icon { display: inline-flex; align-items: center; justify-content: center; width: var(--rail-close-icon-size, 12px); height: var(--rail-close-icon-size, 12px); } .rail-close-btn svg { width: 100%; height: 100%; color: currentColor; fill: currentColor; stroke: currentColor; } @media (prefers-reduced-motion: reduce) { .rail-container { transition: none; } .rail-container.collapsed .rail-actions { transition: none; } .color-palette { transition: none; } .rail-close-btn { transition: none; } } .rail-container.collapsed .rail-actions { max-height: 0; opacity: 0; overflow: hidden; padding: 0; transition: max-height 0.2s ease, opacity 0.15s ease; } .rail-container.expanded .rail-actions, .rail-container.highlighting .rail-actions { max-height: 300px; opacity: 1; transition: max-height 0.2s ease, opacity 0.15s ease 0.05s; } .rail-trigger { width: var(--rail-btn-size, 34px); height: var(--rail-btn-size, 34px); border-radius: 9px; background: var(--rail-color-brand); color: var(--rail-color-icon-on-accent); display: flex; align-items: center; justify-content: center; cursor: grab; transition: background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease; --rail-brand-fill: var(--rail-color-brand); } .rail-trigger:hover, .rail-trigger:focus-visible { background: var(--rail-color-brand-hover); transform: translateY(-1px); box-shadow: 0 2px 6px var(--rail-glow-brand); } :host([data-dragging="true"]) .rail-trigger { cursor: grabbing; background: var(--rail-color-brand-hover); } .rail-trigger:hover { --rail-brand-fill: var(--rail-color-brand-hover); } .rail-trigger > .icon { display: inline-flex; align-items: center; justify-content: center; width: var(--rail-trigger-icon-size, 22px); height: var(--rail-trigger-icon-size, 22px); } .rail-trigger svg { width: 100%; height: 100%; color: currentColor; fill: currentColor; stroke: currentColor; } .rail-actions { position: relative; overflow: visible; display: flex; flex-direction: column; gap: 4px; padding: 4px 0; } .rail-highlight-group { position: relative; display: flex; align-items: center; justify-content: center; } .rail-action-btn { width: var(--rail-btn-size, 34px); height: var(--rail-btn-size, 34px); border-radius: 9px; position: relative; color: var(--rail-color-icon-on-accent); transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease; } .rail-action-btn[data-action="save"], .rail-action-btn[data-action="sync"] { background: var(--rail-color-action-save); } .rail-action-btn[data-action="save"]:hover, .rail-action-btn[data-action="save"]:focus-visible, .rail-action-btn[data-action="sync"]:hover, .rail-action-btn[data-action="sync"]:focus-visible { background: var(--rail-color-action-save-hover); transform: translateY(-1px); box-shadow: 0 2px 6px var(--rail-glow-action-save); } .rail-action-btn[data-action="manage"] { background: var(--rail-color-action-manage); } .rail-action-btn[data-action="manage"]:hover, .rail-action-btn[data-action="manage"]:focus-visible { background: var(--rail-color-action-manage-hover); transform: translateY(-1px); box-shadow: 0 2px 6px var(--rail-glow-action-manage); } .rail-action-btn > .icon { display: inline-flex; align-items: center; justify-content: center; width: var(--rail-action-icon-size, 18px); height: var(--rail-action-icon-size, 18px); } .rail-action-btn svg { width: 100%; height: 100%; color: currentColor; fill: currentColor; stroke: currentColor; } .rail-highlight-toggle { border: 1px solid transparent; } .rail-highlight-toggle[data-highlight-state="inactive"] { background: var(--rail-highlight-tint, var(--rail-color-primary-a40)); background: color-mix(in srgb, var(--rail-highlight-color, var(--rail-color-primary)) 40%, transparent); color: var(--rail-icon-muted); box-shadow: inset 0 0 0 1px var(--rail-ring-white-strong); } .rail-highlight-toggle[data-highlight-state="inactive"]:hover, .rail-highlight-toggle[data-highlight-state="inactive"]:focus-visible { background: var(--rail-highlight-tint, var(--rail-color-primary-a55)); background: color-mix(in srgb, var(--rail-highlight-color, var(--rail-color-primary)) 55%, transparent); transform: translateY(-1px); } .rail-highlight-toggle[data-highlight-state="active"] { background: var(--rail-highlight-color, var(--rail-color-primary)); border-color: var(--rail-highlight-color, var(--rail-color-primary)); color: rgba(0, 0, 0, 0.78); box-shadow: inset 0 0 0 1px var(--rail-ring-white-weak); transform: translateY(-1px); } .rail-highlight-toggle[data-highlight-state="active"]:hover, .rail-highlight-toggle[data-highlight-state="active"]:focus-visible { background: var(--rail-highlight-color, var(--rail-color-primary)); box-shadow: inset 0 0 0 1px var(--rail-ring-white-weak), 0 2px 6px var(--rail-shadow-black-a18); } .rail-highlight-toggle svg { color: currentColor; fill: currentColor; stroke: currentColor; } .rail-action-btn[aria-label]::after { content: attr(aria-label); position: absolute; right: calc(100% + 8px); top: 50%; transform: translateY(-50%); background: var(--rail-color-text); color: var(--rail-color-white); padding: 2px 8px; border-radius: 4px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.15s ease; } .rail-action-btn:hover[aria-label]::after, .rail-action-btn:focus-visible[aria-label]::after { opacity: 1; } .color-indicator { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--rail-border-white-a60); transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease; } .rail-highlight-toggle[data-highlight-state="active"] .color-indicator { border-color: var(--rail-border-white-a88); transform: scale(0.86); } .color-palette { position: absolute; right: calc(100% + 4px); top: 50%; transform: translateY(-50%); display: flex; gap: 4px; padding: 4px; background: var(--rail-surface); border: 1px solid var(--rail-border); border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); opacity: 0; pointer-events: none; transition: opacity 0.15s ease; } .color-palette.visible { opacity: 1; pointer-events: auto; } .color-swatch { width: 20px; height: 20px; border-radius: 8px; border: 2px solid transparent; cursor: pointer; } .color-swatch:hover, .color-swatch:focus-visible { border-color: var(--rail-color-brand); } .color-swatch.selected { border-color: var(--rail-color-brand); } .rail-status { font-size: 11px; color: var(--rail-color-text-muted); text-align: center; max-width: 34px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px; } .rail-error-tooltip { position: absolute; right: calc(100% + 8px); top: 50%; transform: translateY(-50%) translateX(4px); background: var(--rail-color-danger); color: var(--rail-color-white); padding: 4px 8px; border-radius: 4px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s ease, transform 0.2s ease; } .rail-error-tooltip.visible { opacity: 1; transform: translateY(-50%) translateX(0); pointer-events: auto; } @media (prefers-reduced-motion: reduce) { .rail-error-tooltip { transition: none; transform: translateY(-50%) translateX(0); } }';

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

    test('getFloatingRailCSS 輸出應與 Golden 等價 (characterization)', () => {
      expect(normalizeRailCSS(css)).toBe(EXPECTED_FLOATING_RAIL_CSS_NORMALIZED);
    });

    test('中段 reduced-motion 規則順序應早於後續 collapsed 狀態 transition 規則', () => {
      const normalized = normalizeRailCSS(css);
      const reducedMotionQuery = '@media (prefers-reduced-motion: reduce)';
      const collapsedRules = '.rail-container.collapsed .rail-actions';

      // 取得第一個 reduced motion 區塊的位置
      const firstReducedMotionIndex = normalized.indexOf(reducedMotionQuery);
      // 取得在第一個 reduced motion 之後的 collapsed actions 規則
      const subStringAfterReduced = normalized.slice(Math.max(0, firstReducedMotionIndex));
      const firstCollapsedActionsInReduced = subStringAfterReduced.indexOf(collapsedRules);

      // 確保 reduced motion 中包含對 collapsed actions 的 transition: none 覆蓋
      expect(firstReducedMotionIndex).toBeGreaterThan(-1);
      expect(firstCollapsedActionsInReduced).toBeGreaterThan(-1);

      // 取得在整個 CSS 串接中，常規 collapsed actions 規則 (位於 prefers-reduced-motion 外面)
      // 常規的規則在 CSS source 中應該是隨後出現的，此處利用 indexOf 的特性來驗證順序
      const lastCollapsedActionsIndex = normalized.lastIndexOf(collapsedRules);

      // 驗證常規的 collapsed actions (會帶 transition: max-height ...) 必須在 reduced motion 區塊之後
      expect(lastCollapsedActionsIndex).toBeGreaterThan(firstReducedMotionIndex);
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
