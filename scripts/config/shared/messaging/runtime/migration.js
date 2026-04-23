/**
 * Migration Actions
 */

/**
 * @typedef {object} MigrationExecuteRequest
 * @property {'migration_execute'} action
 * @property {string} url
 */

/**
 * @typedef {object} MigrationExecuteResponse
 * @property {boolean} success
 * @property {string} [error]
 */

/**
 * @typedef {object} MigrationDeleteRequest
 * @property {'migration_delete'} action
 * @property {string} url
 */

/**
 * @typedef {object} MigrationDeleteResponse
 * @property {boolean} success
 * @property {string} [message]
 * @property {string} [error]
 */

/**
 * @typedef {object} MigrationBatchItemResult
 * @property {string} [url]
 * @property {string} [status]
 * @property {number} [count]
 * @property {string} [reason]
 */

/**
 * @typedef {object} MigrationBatchSummary
 * @property {number} success
 * @property {number} failed
 * @property {Array<MigrationBatchItemResult>} details
 */

/**
 * @typedef {object} MigrationBatchRequest
 * @property {'migration_batch'} action
 * @property {string[]} urls
 */

/**
 * @typedef {object} MigrationBatchResponse
 * @property {boolean} success
 * @property {MigrationBatchSummary} [results]
 * @property {string} [error]
 */

/**
 * @typedef {object} MigrationBatchDeleteRequest
 * @property {'migration_batch_delete'} action
 * @property {string[]} urls
 */

/**
 * @typedef {object} MigrationBatchDeleteResponse
 * @property {boolean} success
 * @property {number} [count]
 * @property {string} [error]
 */

/**
 * @typedef {object} MigrationPendingItem
 * @property {string} url
 * @property {number} totalCount
 * @property {number} pendingCount
 */

/**
 * @typedef {object} MigrationFailedItem
 * @property {string} url
 * @property {number} totalCount
 * @property {number} failedCount
 */

/**
 * @typedef {object} MigrationGetPendingRequest
 * @property {'migration_get_pending'} action
 */

/**
 * @typedef {object} MigrationGetPendingResponse
 * @property {boolean} success
 * @property {Array<MigrationPendingItem>} [items]
 * @property {Array<MigrationFailedItem>} [failedItems]
 * @property {number} [totalPages]
 * @property {number} [totalPending]
 * @property {number} [totalFailed]
 * @property {string} [error]
 */

/**
 * @typedef {object} MigrationDeleteFailedRequest
 * @property {'migration_delete_failed'} action
 * @property {string} url
 */

/**
 * @typedef {object} MigrationDeleteFailedResponse
 * @property {boolean} success
 * @property {number} [deletedCount]
 * @property {string} [error]
 */

export const MIGRATION_ACTIONS = {
  /**
   * Request: {@link MigrationExecuteRequest}
   * Response: {@link MigrationExecuteResponse}
   *
   * @type {MigrationExecuteRequest['action']}
   */
  MIGRATION_EXECUTE: 'migration_execute',
  /**
   * Request: {@link MigrationDeleteRequest}
   * Response: {@link MigrationDeleteResponse}
   *
   * @type {MigrationDeleteRequest['action']}
   */
  MIGRATION_DELETE: 'migration_delete',
  /**
   * Request: {@link MigrationBatchRequest}
   * Response: {@link MigrationBatchResponse}
   *
   * @type {MigrationBatchRequest['action']}
   */
  MIGRATION_BATCH: 'migration_batch',
  /**
   * Request: {@link MigrationBatchDeleteRequest}
   * Response: {@link MigrationBatchDeleteResponse}
   *
   * @type {MigrationBatchDeleteRequest['action']}
   */
  MIGRATION_BATCH_DELETE: 'migration_batch_delete',
  /**
   * Request: {@link MigrationGetPendingRequest}
   * Response: {@link MigrationGetPendingResponse}
   *
   * @type {MigrationGetPendingRequest['action']}
   */
  MIGRATION_GET_PENDING: 'migration_get_pending',
  /**
   * Request: {@link MigrationDeleteFailedRequest}
   * Response: {@link MigrationDeleteFailedResponse}
   *
   * @type {MigrationDeleteFailedRequest['action']}
   */
  MIGRATION_DELETE_FAILED: 'migration_delete_failed',
};
