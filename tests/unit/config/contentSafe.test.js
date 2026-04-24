import fs from 'node:fs';
import path from 'node:path';
import {
  TOOLBAR_SELECTORS as SHARED_TOOLBAR_SELECTORS,
  UI_ICONS,
} from '../../../scripts/config/shared/ui.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';

describe('contentSafe config', () => {
  const projectRoot = path.resolve(__dirname, '../../..');
  const contentSafeDir = path.join(projectRoot, 'scripts/config/contentSafe');

  test('應提供 contentSafe toolbar config 檔案', () => {
    const expectedFiles = ['toolbarSelectors.js', 'toolbarIcons.js', 'toolbarMessages.js'];

    const missingFiles = expectedFiles
      .map(file => path.join(contentSafeDir, file))
      .filter(filePath => !fs.existsSync(filePath))
      .map(filePath => path.relative(projectRoot, filePath));

    expect(missingFiles).toEqual([]);
  });

  test('toolbarSelectors 應只暴露 highlighter toolbar 需要的 selector', async () => {
    const modulePath = path.join(contentSafeDir, 'toolbarSelectors.js');
    const moduleUrl = new URL(`file://${modulePath}`);
    const { TOOLBAR_SELECTORS } = await import(moduleUrl.href);

    expect(Object.isFrozen(TOOLBAR_SELECTORS)).toBe(true);
    expect(TOOLBAR_SELECTORS).toEqual(SHARED_TOOLBAR_SELECTORS);
  });

  test('toolbarIcons 應只暴露 status rendering 需要的 icon', async () => {
    const modulePath = path.join(contentSafeDir, 'toolbarIcons.js');
    const moduleUrl = new URL(`file://${modulePath}`);
    const { TOOLBAR_ICONS } = await import(moduleUrl.href);

    expect(Object.isFrozen(TOOLBAR_ICONS)).toBe(true);
    expect(TOOLBAR_ICONS).toEqual({
      INFO: UI_ICONS.INFO,
      REFRESH: UI_ICONS.REFRESH,
      SUCCESS: UI_ICONS.SUCCESS,
      ERROR: UI_ICONS.ERROR,
    });
    expect(TOOLBAR_ICONS).not.toHaveProperty('GENERAL');
    expect(TOOLBAR_ICONS).not.toHaveProperty('SETUP_GUIDE');
  });

  test('toolbarMessages 應只暴露 toolbar/content 路徑需要的訊息', async () => {
    const modulePath = path.join(contentSafeDir, 'toolbarMessages.js');
    const moduleUrl = new URL(`file://${modulePath}`);
    const { TOOLBAR_MESSAGES } = await import(moduleUrl.href);

    expect(Object.isFrozen(TOOLBAR_MESSAGES)).toBe(true);
    expect(TOOLBAR_MESSAGES).toEqual({
      SYNCING: UI_MESSAGES.TOOLBAR.SYNCING,
      SYNC_SUCCESS: UI_MESSAGES.TOOLBAR.SYNC_SUCCESS,
      SYNC_FAILED: UI_MESSAGES.TOOLBAR.SYNC_FAILED,
      DELETED_PAGE: UI_MESSAGES.POPUP.DELETED_PAGE,
      DELETION_PENDING: UI_MESSAGES.POPUP.DELETION_PENDING,
    });
    expect(TOOLBAR_MESSAGES).not.toHaveProperty('LOADING');
    expect(TOOLBAR_MESSAGES).not.toHaveProperty('OAUTH_ACTION_CONNECT');
  });
});
