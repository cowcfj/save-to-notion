/**
 * Background.js - 標註更新功能測試
 * 測試 updateHighlightsOnly 和相關的標註處理函數
 */

describe('Background Update Highlights', () => {
  let mockFetch = null;
  let originalFetch = null;

  beforeEach(() => {
    // 保存原始 fetch
    originalFetch = globalThis.fetch;

    // 創建 fetch mock
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch;

    // 清理存儲
    if (chrome._clearStorage) {
      chrome._clearStorage();
    }
  });

  afterEach(() => {
    // 恢復原始 fetch
    globalThis.fetch = originalFetch;

    // 清理 mocks
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('updateHighlightsOnly', () => {
    const mockApiKey = 'secret_test_key';
    const mockPageId = 'page-123';
    const mockPageUrl = 'https://example.com/article';

    it('應該成功更新標註到現有頁面', async () => {
      // Arrange
      const highlights = [
        { text: '重要內容1', color: 'yellow' },
        { text: '重要內容2', color: 'green' },
      ];

      // Mock 獲取現有內容的響應
      const existingBlocks = {
        results: [
          {
            id: 'block-1',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '原有內容' } }] },
          },
          {
            id: 'block-2',
            type: 'heading_3',
            heading_3: { rich_text: [{ text: { content: '📝 頁面標記' } }] },
          },
          {
            id: 'block-3',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '舊標註1' } }] },
          },
        ],
      };

      // Mock 刪除區塊的響應
      const deleteResponse = { ok: true, status: 200 };

      // Mock 添加新標註的響應
      const addResponse = {
        results: [
          { id: 'new-block-1', type: 'heading_3' },
          { id: 'new-block-2', type: 'paragraph' },
          { id: 'new-block-3', type: 'paragraph' },
        ],
      };

      mockFetch
        // 獲取現有內容
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks),
        })
        // 刪除舊標註區塊
        .mockResolvedValueOnce(deleteResponse)
        .mockResolvedValueOnce(deleteResponse)
        // 添加新標註
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(addResponse),
        });

      const mockSendResponse = jest.fn();

      // Act
      await updateHighlightsOnlySimulated(
        mockPageId,
        highlights,
        mockPageUrl,
        mockApiKey,
        mockSendResponse
      );

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // 驗證獲取現有內容的調用
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `https://api.notion.com/v1/blocks/${mockPageId}/children?page_size=100`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
            'Notion-Version': '2025-09-03',
          }),
        })
      );

      // 驗證刪除舊區塊的調用
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.notion.com/v1/blocks/block-2',
        expect.objectContaining({ method: 'DELETE' })
      );

      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.notion.com/v1/blocks/block-3',
        expect.objectContaining({ method: 'DELETE' })
      );

      // 驗證添加新標註的調用
      const addCall = mockFetch.mock.calls[3];
      expect(addCall[0]).toBe(`https://api.notion.com/v1/blocks/${mockPageId}/children`);
      expect(addCall[1].method).toBe('PATCH');

      const addBody = JSON.parse(addCall[1].body);
      expect(addBody.children).toHaveLength(3); // 標題 + 2個標註
      expect(addBody.children[0].type).toBe('heading_3');
      expect(addBody.children[1].type).toBe('paragraph');
      expect(addBody.children[2].type).toBe('paragraph');

      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('應該處理沒有現有標註區域的頁面', async () => {
      // Arrange
      const highlights = [{ text: '新標註', color: 'blue' }];

      // Mock 獲取現有內容的響應（沒有標註區域）
      const existingBlocks = {
        results: [
          {
            id: 'block-1',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '原有內容' } }] },
          },
        ],
      };

      // Mock 添加新標註的響應
      const addResponse = {
        results: [
          { id: 'new-block-1', type: 'heading_3' },
          { id: 'new-block-2', type: 'paragraph' },
        ],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(addResponse),
        });

      const mockSendResponse = jest.fn();

      // Act
      await updateHighlightsOnlySimulated(
        mockPageId,
        highlights,
        mockPageUrl,
        mockApiKey,
        mockSendResponse
      );

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('應該處理空標註列表', async () => {
      // Arrange
      const highlights = [];

      // Mock 獲取現有內容的響應
      const existingBlocks = {
        results: [
          {
            id: 'block-1',
            type: 'heading_3',
            heading_3: { rich_text: [{ text: { content: '📝 頁面標記' } }] },
          },
          {
            id: 'block-2',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '舊標註' } }] },
          },
        ],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks),
        })
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const mockSendResponse = jest.fn();

      // Act
      await updateHighlightsOnlySimulated(
        mockPageId,
        highlights,
        mockPageUrl,
        mockApiKey,
        mockSendResponse
      );

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(3); // 獲取 + 2次刪除，沒有添加
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('應該處理超長標註文本（需要分割）', async () => {
      // Arrange
      const longText = 'A'.repeat(3000); // 超過 2000 字元限制
      const highlights = [{ text: longText, color: 'red' }];

      // Mock 獲取現有內容的響應（沒有標註區域）
      const existingBlocks = { results: [] };

      // Mock 添加新標註的響應
      const addResponse = {
        results: [
          { id: 'new-block-1', type: 'heading_3' },
          { id: 'new-block-2', type: 'paragraph' },
          { id: 'new-block-3', type: 'paragraph' }, // 分割後的第二部分
        ],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(addResponse),
        });

      const mockSendResponse = jest.fn();

      // Act
      await updateHighlightsOnlySimulated(
        mockPageId,
        highlights,
        mockPageUrl,
        mockApiKey,
        mockSendResponse
      );

      // Assert
      const addCall = mockFetch.mock.calls[1];
      const addBody = JSON.parse(addCall[1].body);

      // 應該有標題 + 2個分割的段落
      expect(addBody.children).toHaveLength(3);
      expect(addBody.children[0].type).toBe('heading_3');
      expect(addBody.children[1].type).toBe('paragraph');
      expect(addBody.children[2].type).toBe('paragraph');

      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('應該處理獲取現有內容失敗的情況', async () => {
      // Arrange
      const highlights = [{ text: '測試', color: 'yellow' }];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ object: 'error', status: 404 }),
      });

      const mockSendResponse = jest.fn();

      // Act
      await updateHighlightsOnlySimulated(
        mockPageId,
        highlights,
        mockPageUrl,
        mockApiKey,
        mockSendResponse
      );

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Failed to get existing page content'),
        })
      );
    });

    it('應該處理刪除區塊失敗的情況', async () => {
      // Arrange
      const highlights = [{ text: '測試', color: 'yellow' }];

      // Mock 獲取現有內容成功
      const existingBlocks = {
        results: [
          {
            id: 'block-1',
            type: 'heading_3',
            heading_3: { rich_text: [{ text: { content: '📝 頁面標記' } }] },
          },
        ],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks),
        })
        // 刪除失敗
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ object: 'error', message: 'Delete failed' }),
        })
        // 添加新標註成功
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [] }),
        });

      const mockSendResponse = jest.fn();

      // Act
      await updateHighlightsOnlySimulated(
        mockPageId,
        highlights,
        mockPageUrl,
        mockApiKey,
        mockSendResponse
      );

      // Assert
      // 即使刪除失敗，也應該繼續添加新標註
      expect(mockFetch).toHaveBeenCalledTimes(3);

      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('應該處理添加新標註失敗的情況', async () => {
      // Arrange
      const highlights = [{ text: '測試', color: 'yellow' }];

      // Mock 獲取現有內容成功（沒有標註區域）
      const existingBlocks = { results: [] };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks),
        })
        // 添加新標註失敗
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ object: 'error', message: 'Add failed' }),
        });

      const mockSendResponse = jest.fn();

      // Act
      await updateHighlightsOnlySimulated(
        mockPageId,
        highlights,
        mockPageUrl,
        mockApiKey,
        mockSendResponse
      );

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Failed to add new highlights'),
        })
      );
    });

    it('應該處理網路錯誤', async () => {
      // Arrange
      const highlights = [{ text: '測試', color: 'yellow' }];

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const mockSendResponse = jest.fn();

      // Act
      await updateHighlightsOnlySimulated(
        mockPageId,
        highlights,
        mockPageUrl,
        mockApiKey,
        mockSendResponse
      );

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Network error',
        })
      );
    });

    it('應該正確識別和處理標註區域的邊界', async () => {
      // Arrange
      const highlights = [{ text: '新標註', color: 'yellow' }];

      // Mock 複雜的頁面結構
      const existingBlocks = {
        results: [
          {
            id: 'block-1',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '正文內容1' } }] },
          },
          {
            id: 'block-2',
            type: 'heading_3',
            heading_3: { rich_text: [{ text: { content: '📝 頁面標記' } }] },
          },
          {
            id: 'block-3',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '舊標註1' } }] },
          },
          {
            id: 'block-4',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '舊標註2' } }] },
          },
          {
            id: 'block-5',
            type: 'heading_2',
            heading_2: { rich_text: [{ text: { content: '其他章節' } }] },
          },
          {
            id: 'block-6',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '其他內容' } }] },
          },
        ],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks),
        })
        // 刪除標註區域的3個區塊
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({ ok: true, status: 200 })
        // 添加新標註
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [] }),
        });

      const mockSendResponse = jest.fn();

      // Act
      await updateHighlightsOnlySimulated(
        mockPageId,
        highlights,
        mockPageUrl,
        mockApiKey,
        mockSendResponse
      );

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(5); // 獲取 + 3次刪除 + 1次添加

      // 驗證刪除的是正確的區塊
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/blocks/block-2',
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/blocks/block-3',
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/blocks/block-4',
        expect.objectContaining({ method: 'DELETE' })
      );

      // 不應該刪除其他章節的內容
      expect(mockFetch).not.toHaveBeenCalledWith(
        'https://api.notion.com/v1/blocks/block-5',
        expect.objectContaining({ method: 'DELETE' })
      );

      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });
  });
});

/**
 * 模擬的 updateHighlightsOnly 函數（用於測試）
 */
async function updateHighlightsOnlySimulated(pageId, highlights, pageUrl, apiKey, sendResponse) {
  try {
    const existingBlocks = await fetchExistingBlocksSimulated(pageId, apiKey);
    const blocksToDelete = collectHighlightBlockIds(existingBlocks);

    await deleteBlocksSimulated(blocksToDelete, apiKey);
    await addHighlightsIfPresentSimulated(pageId, highlights, apiKey);
    await updateSavedPageMetadataSimulated(pageUrl, pageId);

    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

const NOTION_API_VERSION = '2025-09-03';
const HIGHLIGHT_SECTION_TITLE = '📝 頁面標記';
const NOTION_TEXT_LIMIT = 2000;

function createNotionHeaders(apiKey, extraHeaders = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Notion-Version': NOTION_API_VERSION,
    ...extraHeaders,
  };
}

async function fetchExistingBlocksSimulated(pageId, apiKey) {
  const getResponse = await fetch(
    `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
    {
      method: 'GET',
      headers: createNotionHeaders(apiKey),
    }
  );

  if (!getResponse.ok) {
    const errorData = await getResponse.json();
    throw new Error(
      `Failed to get existing page content: ${errorData.message || getResponse.statusText}`
    );
  }

  const existingContent = await getResponse.json();
  return existingContent.results ?? [];
}

function isHighlightSectionHeading(block) {
  return (
    block.type === 'heading_3' &&
    block.heading_3?.rich_text?.[0]?.text?.content === HIGHLIGHT_SECTION_TITLE
  );
}

function collectHighlightBlockIds(existingBlocks) {
  const blocksToDelete = [];
  let foundHighlightSection = false;

  for (const block of existingBlocks) {
    if (isHighlightSectionHeading(block)) {
      foundHighlightSection = true;
      blocksToDelete.push(block.id);
      continue;
    }

    if (!foundHighlightSection) {
      continue;
    }

    if (block.type.startsWith('heading_') || block.type !== 'paragraph') {
      break;
    }

    blocksToDelete.push(block.id);
  }

  return blocksToDelete;
}

async function deleteBlocksSimulated(blockIds, apiKey) {
  for (const blockId of blockIds) {
    try {
      await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
        method: 'DELETE',
        headers: createNotionHeaders(apiKey),
      });
    } catch {
      // Ignore errors during simulated deletion in tests
    }
  }
}

function createHighlightSectionHeadingBlock() {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [
        {
          type: 'text',
          text: { content: HIGHLIGHT_SECTION_TITLE },
        },
      ],
    },
  };
}

function createHighlightParagraphBlock(text, color) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: { content: text },
          annotations: {
            color,
          },
        },
      ],
    },
  };
}

function buildHighlightBlocksSimulated(highlights) {
  const highlightBlocks = [createHighlightSectionHeadingBlock()];

  for (const highlight of highlights) {
    const textChunks = splitTextForNotionSimulated(highlight.text, NOTION_TEXT_LIMIT);

    for (const chunk of textChunks) {
      highlightBlocks.push(createHighlightParagraphBlock(chunk, highlight.color));
    }
  }

  return highlightBlocks;
}

async function addHighlightsIfPresentSimulated(pageId, highlights, apiKey) {
  if (!Array.isArray(highlights) || highlights.length === 0) {
    return;
  }

  const addResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: createNotionHeaders(apiKey, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      children: buildHighlightBlocksSimulated(highlights),
    }),
  });

  if (!addResponse.ok) {
    const errorData = await addResponse.json();
    throw new Error(`Failed to add new highlights: ${errorData.message || 'Unknown error'}`);
  }
}

async function updateSavedPageMetadataSimulated(pageUrl, pageId) {
  const now = Date.now();

  await chrome.storage.local.set({
    [`saved_${pageUrl}`]: {
      savedAt: now,
      notionPageId: pageId,
      lastUpdated: now,
    },
  });
}

/**
 * 輔助函數：將長文本分割成符合 Notion 限制的片段
 */
// 標點符號優先順序（提升至函數外，避免每次迭代重建陣列）
const SPLIT_PUNCTUATION = ['.', '。', '?', '？', '!', '！', '\n'];

function findSplitIndexSimulated(text, limit) {
  for (const punct of SPLIT_PUNCTUATION) {
    const lastIndex = text.lastIndexOf(punct, limit - 1);
    if (lastIndex > limit * 0.5) {
      return lastIndex + 1;
    }
  }

  const spaceIndex = text.lastIndexOf(' ', limit - 1);
  if (spaceIndex >= limit * 0.5) {
    return spaceIndex;
  }

  return limit;
}

function processNextChunkSimulated(remaining, limit, chunks) {
  if (remaining.length <= limit) {
    chunks.push(remaining);
    return '';
  }

  const splitIndex = findSplitIndexSimulated(remaining, limit);
  const chunk = remaining.slice(0, splitIndex).trim();
  const nextRemaining = remaining.slice(splitIndex).trim();

  if (chunk) {
    chunks.push(chunk);
  } else if (remaining === nextRemaining) {
    // 無法前進，防止無限迴圈：強制硬切剩餘內容
    chunks.push(remaining.slice(0, limit));
    return remaining.slice(limit).trim();
  }

  return nextRemaining;
}

function splitTextForNotionSimulated(text, maxLength = 2000) {
  if (!text) {
    return [];
  }

  // 防禦 maxLength <= 0 的非法輸入，確保每次至少切 1 個字元
  const limit = Math.max(1, maxLength);

  if (text.length <= limit) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    remaining = processNextChunkSimulated(remaining, limit, chunks);
  }

  return chunks;
}
