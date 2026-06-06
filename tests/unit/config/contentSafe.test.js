import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  TOOLBAR_SELECTORS as SHARED_TOOLBAR_SELECTORS,
  UI_ICONS,
} from '../../../scripts/config/shared/ui.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';

describe('contentSafe config', () => {
  const projectRoot = path.resolve(__dirname, '../../..');
  const contentSafeDir = path.join(projectRoot, 'scripts/config/contentSafe');

  test('應提供 contentSafe toolbar config 檔案', () => {
    const expectedFiles = [
      'toolbarSelectors.js',
      'toolbarIcons.js',
      'toolbarMessages.js',
      'contentExtractionMessages.js',
      'highlighterMessages.js',
    ];

    const missingFiles = expectedFiles
      .map(file => path.join(contentSafeDir, file))
      // Test-owned static filenames are resolved under the repo-local contentSafe config dir.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      .filter(filePath => !fs.existsSync(filePath))
      .map(filePath => path.relative(projectRoot, filePath));

    expect(missingFiles).toEqual([]);
  });

  test('toolbarSelectors 應只暴露 highlighter toolbar 需要的 selector', async () => {
    const modulePath = path.join(contentSafeDir, 'toolbarSelectors.js');
    const moduleUrl = pathToFileURL(modulePath);
    const { TOOLBAR_SELECTORS } = await import(moduleUrl.href);

    expect(Object.isFrozen(TOOLBAR_SELECTORS)).toBe(true);
    expect(TOOLBAR_SELECTORS).toBe(SHARED_TOOLBAR_SELECTORS);
  });

  test('toolbarIcons 應只暴露 status rendering 需要的 icon', async () => {
    const modulePath = path.join(contentSafeDir, 'toolbarIcons.js');
    const moduleUrl = pathToFileURL(modulePath);
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
    const moduleUrl = pathToFileURL(modulePath);
    const { TOOLBAR_MESSAGES } = await import(moduleUrl.href);

    expect(Object.isFrozen(TOOLBAR_MESSAGES)).toBe(true);
    expect(TOOLBAR_MESSAGES).toEqual({
      SYNCING: UI_MESSAGES.TOOLBAR.SYNCING,
      SYNC_SUCCESS: UI_MESSAGES.TOOLBAR.SYNC_SUCCESS,
      SYNC_FAILED: UI_MESSAGES.TOOLBAR.SYNC_FAILED,
      DELETED_PAGE: UI_MESSAGES.POPUP.DELETED_PAGE,
      DELETION_PENDING: UI_MESSAGES.POPUP.DELETION_PENDING,
      PAGE_NOT_SAVED_HINT: UI_MESSAGES.TOOLBAR.PAGE_NOT_SAVED_HINT,
    });
    expect(TOOLBAR_MESSAGES).not.toHaveProperty('LOADING');
    expect(TOOLBAR_MESSAGES).not.toHaveProperty('OAUTH_ACTION_CONNECT');
  });

  test('contentExtractionMessages 應只暴露內容提取 fallback 訊息', async () => {
    const modulePath = path.join(contentSafeDir, 'contentExtractionMessages.js');
    const moduleUrl = pathToFileURL(modulePath);
    const { CONTENT_EXTRACTION_MESSAGES } = await import(moduleUrl.href);

    expect(Object.isFrozen(CONTENT_EXTRACTION_MESSAGES)).toBe(true);
    expect(CONTENT_EXTRACTION_MESSAGES).toEqual({
      EMPTY_FALLBACK: '擷取內容失敗。頁面可能為空白或受保護。',
      ERROR_FALLBACK: '擷取發生錯誤，請稍後再試。',
    });
    expect(CONTENT_EXTRACTION_MESSAGES.EMPTY_FALLBACK).not.toMatch(/content extraction failed/i);
    expect(CONTENT_EXTRACTION_MESSAGES.ERROR_FALLBACK).not.toMatch(/extraction error/i);
  });

  test('highlighterMessages 應只暴露 highlighter 需要的訊息', async () => {
    const modulePath = path.join(contentSafeDir, 'highlighterMessages.js');
    const moduleUrl = pathToFileURL(modulePath);
    const { HIGHLIGHTER_MESSAGES } = await import(moduleUrl.href);

    expect(Object.isFrozen(HIGHLIGHTER_MESSAGES)).toBe(true);
    expect(Object.isFrozen(HIGHLIGHTER_MESSAGES.FLOATING_RAIL)).toBe(true);
    expect(Object.isFrozen(HIGHLIGHTER_MESSAGES.TOOLBAR)).toBe(true);
    expect(Object.isFrozen(HIGHLIGHTER_MESSAGES.TOOLBAR.COLOR_PICKER_NAMES)).toBe(true);
    expect(Object.isFrozen(HIGHLIGHTER_MESSAGES.TOAST)).toBe(true);
    expect(HIGHLIGHTER_MESSAGES.FLOATING_RAIL).toEqual(UI_MESSAGES.FLOATING_RAIL);
    expect(HIGHLIGHTER_MESSAGES.TOOLBAR.COLOR_PICKER_NAMES).toEqual(
      UI_MESSAGES.TOOLBAR.COLOR_PICKER_NAMES
    );
    expect(HIGHLIGHTER_MESSAGES.POPUP.DELETED_PAGE).toEqual(UI_MESSAGES.POPUP.DELETED_PAGE);
    expect(HIGHLIGHTER_MESSAGES.POPUP.DELETION_PENDING).toEqual(UI_MESSAGES.POPUP.DELETION_PENDING);
    expect(HIGHLIGHTER_MESSAGES.TOAST).toEqual(UI_MESSAGES.TOAST);

    expect(HIGHLIGHTER_MESSAGES).not.toHaveProperty('OPTIONS');
    expect(HIGHLIGHTER_MESSAGES).not.toHaveProperty('CLOUD_SYNC');
    expect(HIGHLIGHTER_MESSAGES).not.toHaveProperty('AUTH_BRIDGE');
    expect(HIGHLIGHTER_MESSAGES).not.toHaveProperty('STORAGE');
    expect(HIGHLIGHTER_MESSAGES).not.toHaveProperty('ACCOUNT');
  });
});
