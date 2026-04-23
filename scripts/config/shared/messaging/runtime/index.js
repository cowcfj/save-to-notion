/**
 * Runtime Actions Registry — Aggregation Entry
 *
 * Re-exports a single frozen RUNTIME_ACTIONS with the exact same shape
 * as the original monolithic file.
 */

import { PAGE_STATUS_ACTIONS } from './pageStatus.js';
import { SAVE_ACTIONS } from './save.js';
import { HIGHLIGHT_ACTIONS } from './highlight.js';
import { MIGRATION_ACTIONS } from './migration.js';
import { AUTH_ACTIONS } from './auth.js';
import { DRIVE_SYNC_ACTIONS } from './driveSync.js';
import { SIDEPANEL_ACTIONS } from './sidepanel.js';
import { DIAGNOSTICS_ACTIONS } from './diagnostics.js';

export const RUNTIME_ACTIONS = Object.freeze({
  ...PAGE_STATUS_ACTIONS,
  ...SAVE_ACTIONS,
  ...HIGHLIGHT_ACTIONS,
  ...MIGRATION_ACTIONS,
  ...AUTH_ACTIONS,
  ...DRIVE_SYNC_ACTIONS,
  ...SIDEPANEL_ACTIONS,
  ...DIAGNOSTICS_ACTIONS,
});

export const RUNTIME_ERROR_MESSAGES = Object.freeze({
  EXTENSION_UNAVAILABLE: '無法連接擴展',
});
