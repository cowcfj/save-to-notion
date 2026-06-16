/**
 * Migration 專用 runtime actions.
 *
 * Wire values MUST stay aligned with scripts/background/handlers/migrationHandlers.js
 * and .agents/.shared/knowledge/message_bus.json.
 */
export const MIGRATION_ACTIONS = Object.freeze({
  MIGRATION_EXECUTE: 'migration_execute',
  MIGRATION_DELETE: 'migration_delete',
  MIGRATION_BATCH: 'migration_batch',
  MIGRATION_BATCH_DELETE: 'migration_batch_delete',
  MIGRATION_GET_PENDING: 'migration_get_pending',
  MIGRATION_DELETE_FAILED: 'migration_delete_failed',
});
