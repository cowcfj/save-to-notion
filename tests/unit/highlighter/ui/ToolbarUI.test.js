import { UI_MESSAGES } from '../../../../scripts/config/messages.js';
import { renderStatusIcon } from '../../../../scripts/highlighter/ui/ToolbarUI.js';

describe('ToolbarUI', () => {
  describe('renderStatusIcon', () => {
    test('當訊息 key 無對應值且未提供自定義訊息時，不應渲染 undefined 文字', () => {
      const statusDiv = document.createElement('div');

      renderStatusIcon(statusDiv, 'SYNC', 'UNKNOWN_MESSAGE_KEY');

      expect(statusDiv.querySelector('svg')).not.toBeNull();
      expect(statusDiv.textContent.trim()).toBe('');
      expect(statusDiv.textContent).not.toContain('undefined');
    });

    test('當存在有效 messageKey 時，應渲染對應文字', () => {
      const statusDiv = document.createElement('div');

      renderStatusIcon(statusDiv, 'SYNC', 'SYNCING');

      expect(statusDiv.textContent).toContain(UI_MESSAGES.TOOLBAR.SYNCING);
    });
  });
});
