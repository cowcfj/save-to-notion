import {
  getToastCSS,
  injectToastStylesIntoShadowRoot,
} from '../../../../../scripts/highlighter/ui/styles/toastStyles.js';
import { UI_TOKENS } from '../../../../../styles/ui-token-constants.js';

const { status } = UI_TOKENS;

const toastStatusCases = [
  {
    modifier: 'success',
    statusKeys: {
      bg: 'successBg',
      text: 'successText',
      border: 'successBorder',
    },
  },
  {
    modifier: 'warning',
    statusKeys: {
      bg: 'warningBg',
      text: 'warningText',
      border: 'warningBorder',
    },
  },
  {
    modifier: 'error',
    statusKeys: {
      bg: 'errorBg',
      text: 'errorText',
      border: 'errorBorder',
    },
  },
];

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

    test.each(toastStatusCases)(
      '$modifier modifier 應於 :host 定義 status 變數並以無 fallback 的 var() 引用',
      ({ modifier, statusKeys }) => {
        expect(css).toContain(`--toast-color-${modifier}-bg: ${status[statusKeys.bg]}`);
        expect(css).toContain(`--toast-color-${modifier}-text: ${status[statusKeys.text]}`);
        expect(css).toContain(`--toast-color-${modifier}-border: ${status[statusKeys.border]}`);
        expect(css).toMatch(
          new RegExp(
            String.raw`\.toast--${modifier}\s*\{[\s\S]*?background:\s*var\(--toast-color-${modifier}-bg\)`
          )
        );
        expect(css).toMatch(
          new RegExp(
            String.raw`\.toast--${modifier}\s*\{[\s\S]*?color:\s*var\(--toast-color-${modifier}-text\)`
          )
        );
        expect(css).toMatch(
          new RegExp(
            String.raw`\.toast--${modifier}\s*\{[\s\S]*?border-color:\s*var\(--toast-color-${modifier}-border\)`
          )
        );
      }
    );

    test.each(toastStatusCases)(
      '$modifier modifier 規則不得殘留 raw hex（no-raw-hex-leak，色值只存在於 :host 變數定義）',
      ({ modifier }) => {
        const ruleBody = css.match(new RegExp(String.raw`\.toast--${modifier}\s*\{([\s\S]*?)\}`));
        expect(ruleBody).not.toBeNull();
        expect(ruleBody[1]).not.toMatch(/#[0-9a-fA-F]{3,6}/);
      }
    );

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
