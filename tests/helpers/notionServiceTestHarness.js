/**
 * NotionService 測試專用輔助模組 (Test Support Boundary)
 */

/**
 * 建立 401 錯誤
 */
export const buildUnauthorizedError = (overrides = {}) => {
  const err = new Error(overrides.message || 'Unauthorized');
  err.status = 401;
  Object.assign(err, overrides);
  return err;
};

/**
 * Mock 獲取 Active Token
 */
export const mockActiveToken = (getActiveNotionTokenMock, { token, mode }) => {
  getActiveNotionTokenMock.mockResolvedValueOnce({ token, mode });
};

/**
 * Mock Token 刷新
 */
export const mockRefreshToken = (refreshOAuthTokenMock, valueOrError) => {
  if (valueOrError instanceof Error) {
    refreshOAuthTokenMock.mockRejectedValueOnce(valueOrError);
  } else {
    refreshOAuthTokenMock.mockResolvedValueOnce(valueOrError);
  }
};

/**
 * 建立段落區塊
 */
export const paragraphBlock = id => ({ id, type: 'paragraph' });

/**
 * 建立標題區塊
 */
export const headingBlock = (id, level = 3, content = '') => {
  const type = `heading_${level}`;
  return {
    id,
    type,
    [type]: { rich_text: content ? [{ text: { content } }] : [] },
  };
};

/**
 * 建立基礎 Page Data 參數 fixture
 */
export const buildPageDataOptions = (overrides = {}) => {
  return {
    title: 'Test Title',
    pageUrl: 'https://example.com/test',
    dataSourceId: 'ds-123',
    blocks: [],
    ...overrides,
  };
};

/**
 * 斷言 Logger 的 Warn 方法被呼叫且包含特定訊息
 */
export const expectWarnContaining = (mockLogger, messageFragment, context = null) => {
  expect(mockLogger.warn).toHaveBeenCalledWith(
    expect.stringContaining(messageFragment),
    context ? expect.objectContaining(context) : expect.any(Object)
  );
};
