import {
  getToastCSS,
  injectToastStylesIntoShadowRoot,
} from '../../../../../scripts/highlighter/ui/styles/toastStyles.js';
import { UI_TOKENS } from '../../../../../styles/ui-token-constants.js';

const { status } = UI_TOKENS;

function normalizeToastCSS(cssString) {
  return cssString.replaceAll(/\s+/g, ' ').trim();
}

function extractBlockAt(normalizedCss, blockStartIndex) {
  const openingBraceIndex = normalizedCss.indexOf('{', blockStartIndex);

  if (openingBraceIndex === -1) {
    return '';
  }

  let depth = 0;

  for (let index = openingBraceIndex; index < normalizedCss.length; index += 1) {
    if (normalizedCss[index] === '{') {
      depth += 1;
    } else if (normalizedCss[index] === '}') {
      depth -= 1;
    }

    if (depth === 0) {
      return normalizedCss.slice(blockStartIndex, index + 1);
    }
  }

  return '';
}

function extractRuleBlock(css, selector, startIndex = 0) {
  const normalizedCss = normalizeToastCSS(css);
  const rulePrefix = `${selector} {`;
  const startIndexFound = normalizedCss.indexOf(rulePrefix, startIndex);

  if (startIndexFound === -1) {
    throw new Error(`CSS rule not found for selector: ${selector}`);
  }

  const block = extractBlockAt(normalizedCss, startIndexFound);
  if (!block) {
    throw new Error(`CSS rule block could not be extracted for selector: ${selector}`);
  }

  return { index: startIndexFound, block };
}

function extractMediaBlock(css, mediaQuery) {
  const normalizedCss = normalizeToastCSS(css);
  const mediaPrefix = `@media ${mediaQuery}`;
  const startIndex = normalizedCss.indexOf(mediaPrefix);

  if (startIndex === -1) {
    throw new Error(`CSS media block not found: ${mediaQuery}`);
  }

  const block = extractBlockAt(normalizedCss, startIndex);
  if (!block) {
    throw new Error(`CSS media block could not be extracted: ${mediaQuery}`);
  }

  return { index: startIndex, block };
}

function expectRuleContains(cssBlock, selector, declarationPattern) {
  const { block } = extractRuleBlock(cssBlock, selector);
  expect({ selector, block }).toEqual({
    selector,
    block: expect.stringMatching(declarationPattern),
  });
}

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
        const { block: hostBlock } = extractRuleBlock(css, ':host');
        expect(hostBlock).toContain(`--toast-color-${modifier}-bg: ${status[statusKeys.bg]}`);
        expect(hostBlock).toContain(`--toast-color-${modifier}-text: ${status[statusKeys.text]}`);
        expect(hostBlock).toContain(
          `--toast-color-${modifier}-border: ${status[statusKeys.border]}`
        );
        expectRuleContains(
          css,
          `.toast--${modifier}`,
          new RegExp(String.raw`background:\s*var\(--toast-color-${modifier}-bg\)`)
        );
        expectRuleContains(
          css,
          `.toast--${modifier}`,
          new RegExp(String.raw`color:\s*var\(--toast-color-${modifier}-text\)`)
        );
        expectRuleContains(
          css,
          `.toast--${modifier}`,
          new RegExp(String.raw`border-color:\s*var\(--toast-color-${modifier}-border\)`)
        );
      }
    );

    test.each(toastStatusCases)(
      '$modifier modifier 規則不得殘留 raw hex（no-raw-hex-leak，色值只存在於 :host 變數定義）',
      ({ modifier }) => {
        const { block: modifierRuleBlock } = extractRuleBlock(css, `.toast--${modifier}`);
        expect(modifierRuleBlock).not.toMatch(/#[0-9a-fA-F]{3,6}/);
      }
    );

    test('應定義 .toast--success/.toast--warning/.toast--error 三組 modifier', () => {
      expect(css).toMatch(/\.toast--success\s*\{/);
      expect(css).toMatch(/\.toast--warning\s*\{/);
      expect(css).toMatch(/\.toast--error\s*\{/);
    });

    test('container 應使用 transition + .toast--visible modifier 控制顯示', () => {
      expect(css).toContain('.toast-container');
      expectRuleContains(css, '.toast-container', /transition:/);
      expectRuleContains(css, '.toast-container.toast--visible', /opacity:\s*1/);
    });

    test('應有 prefers-reduced-motion 降級且位於 media block 內', () => {
      const normalized = normalizeToastCSS(css);
      const { index: reducedMotionIndex, block: reducedMotionBlock } = extractMediaBlock(
        css,
        '(prefers-reduced-motion: reduce)'
      );
      const regularContainerRule = extractRuleBlock(normalized, '.toast-container');
      const reducedContainerRule = extractRuleBlock(reducedMotionBlock, '.toast-container');

      expect(reducedMotionIndex).toBeGreaterThan(regularContainerRule.index);
      expect(regularContainerRule.block).toMatch(/transition:\s*(?!none)/);
      expect(reducedContainerRule.block).toMatch(/transition:\s*none/);
      expect(reducedContainerRule.block).toMatch(/transform:\s*none/);
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
