/**
 * ToolbarContainer.js 單元測試
 */

import { TOOLBAR_SELECTORS } from '../../../../../scripts/config/contentSafe/toolbarSelectors.js';
import { createToolbarContainer } from '../../../../../scripts/highlighter/ui/components/ToolbarContainer.js';

describe('ToolbarContainer', () => {
  test('狀態區域應使用 output live region 且不設定顯式 role', () => {
    const toolbar = createToolbarContainer();
    const status = toolbar.querySelector(TOOLBAR_SELECTORS.STATUS_CONTAINER);

    expect(status).not.toBeNull();
    expect(status.tagName.toLowerCase()).toBe('output');
    expect(status.className).toBe('nh-status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(status.style.display).toBe('none');
    expect(status.hasAttribute('role')).toBe(false);
  });
});
