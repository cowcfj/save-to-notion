/**
 * 日誌導出驗證工具
 *
 * 負責驗證從 Background 返回的日誌導出數據結構與安全性。
 *
 * @module utils/LogExportValidator
 */

const LOG_EXPORT_FILENAME_PATTERN = /^[\w.-]+\.(?:json|txt)$/i;
const LOG_EXPORT_MIME_BY_EXTENSION = {
  json: 'application/json',
  txt: 'text/plain',
};

/**
 * 驗證日誌導出數據的安全性
 * 確保從 Background 返回的數據結構符合預期且不包含惡意內容
 *
 * @param {object} data - 待驗證的數據對象
 * @throws {Error} 如果驗證失敗，拋出具體錯誤
 */
export function validateLogExportData(data) {
  const validationError = _getLogExportValidationError(data);
  if (validationError) {
    throw validationError;
  }
}

const LOG_EXPORT_VALIDATION_RULES = [
  [_isMissingLogExportDataObject, () => new Error('Invalid response format: missing data object')],
  [
    data => !_isValidLogExportFilename(data.filename),
    () => new TypeError('Security check failed: Invalid filename format'),
  ],
  [
    data => typeof data.content !== 'string',
    () => new TypeError('Security check failed: Invalid content type'),
  ],
  [
    data => !_isValidLogExportMimeType(data.filename, data.mimeType),
    () => new Error('Security check failed: Invalid MIME type'),
  ],
];

function _getLogExportValidationError(data) {
  for (const [isInvalid, createError] of LOG_EXPORT_VALIDATION_RULES) {
    if (isInvalid(data)) {
      return createError();
    }
  }
  return null;
}

function _isMissingLogExportDataObject(data) {
  if (!data) {
    return true;
  }

  return typeof data !== 'object';
}

function _isValidLogExportFilename(filename) {
  if (!filename) {
    return false;
  }

  if (typeof filename !== 'string') {
    return false;
  }

  return LOG_EXPORT_FILENAME_PATTERN.test(filename);
}

function _isValidLogExportMimeType(filename, mimeType) {
  if (!_isValidLogExportFilename(filename)) {
    return false;
  }

  const extension = filename.split('.').pop().toLowerCase();
  return mimeType === LOG_EXPORT_MIME_BY_EXTENSION[extension];
}
