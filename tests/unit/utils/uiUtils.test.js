import { createSpriteIcon } from '../../../scripts/utils/uiUtils.js';

describe('uiUtils', () => {
  describe('createSpriteIcon', () => {
    // 模擬 DOM 環境（如果測試環境沒有提供的話）
    beforeAll(() => {
      if (typeof document === 'undefined') {
        const { JSDOM } = require('jsdom');
        const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
        globalThis.document = dom.window.document;
      }
    });

    it('應該為傳入的名稱生成帶有 icon- 前綴的小寫 href', () => {
      const iconName = 'GENERAL';
      const svg = createSpriteIcon(iconName);
      const use = svg.querySelector('use');

      expect(use).not.toBeNull();
      expect(use.getAttribute('href')).toBe('#icon-general');
    });

    it('應該支援已經是小寫的名稱', () => {
      const iconName = 'trash';
      const svg = createSpriteIcon(iconName);
      const use = svg.querySelector('use');

      expect(use.getAttribute('href')).toBe('#icon-trash');
    });

    it('應該支援混合大小寫的名稱', () => {
      const iconName = 'SaveIcon';
      const svg = createSpriteIcon(iconName);
      const use = svg.querySelector('use');

      expect(use.getAttribute('href')).toBe('#icon-saveicon');
    });
  });
});
