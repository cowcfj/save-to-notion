/**
 * Background.js - 標註更新功能測試
 * 測試 updateHighlightsOnly 和相關的標註處理函數
 */

describe('Background Update Highlights', () => {
  let mockFetch = null;
  let originalFetch = null;

  beforeEach(() => {
    // 保存原始 fetch
    originalFetch = global.fetch;

    // 創建 fetch mock
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // 清理存儲
    if (chrome._clearStorage) {
      chrome._clearStorage();
    }

    // 重置 console mocks
    jest.spyOn(console, 'log').mockImplementation(jest.fn());
    jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    // 恢復原始 fetch
    global.fetch = originalFetch;

    // 清理 mocks
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
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('刪除區塊失敗'),
        expect.anything()
      );
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
    // console.log('🔄 開始更新標記 - 頁面ID:', pageId, '標記數量:', highlights.length);

    // 獲取現有頁面內容
    const getResponse = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Notion-Version': '2025-09-03',
        },
      }
    );

    if (!getResponse.ok) {
      const errorData = await getResponse.json();
      // console.error('❌ 獲取頁面內容失敗:', errorData);
      throw new Error(
        `Failed to get existing page content: ${errorData.message || getResponse.statusText}`
      );
    }

    const existingContent = await getResponse.json();
    const existingBlocks = existingContent.results;
    // console.log('📋 現有區塊數量:', existingBlocks.length);

    // 查找並刪除現有的標註區域
    const blocksToDelete = [];
    let foundHighlightSection = false;

    for (let i = 0; i < existingBlocks.length; i++) {
      const block = existingBlocks[i];

      if (
        block.type === 'heading_3' &&
        block.heading_3?.rich_text?.[0]?.text?.content === '📝 頁面標記'
      ) {
        foundHighlightSection = true;
        blocksToDelete.push(block.id);
        // console.log(`🎯 找到標記區域標題 (索引 ${i}):`, block.id);
      } else if (foundHighlightSection) {
        if (block.type.startsWith('heading_')) {
          // console.log(`🛑 遇到下一個標題，停止收集標記區塊 (索引 ${i})`);
          break;
        }
        if (block.type === 'paragraph') {
          blocksToDelete.push(block.id);
          // console.log(`📝 標記為刪除的段落 (索引 ${i}):`, block.id);
        }
      }
    }

    // console.log('🗑️ 需要刪除的區塊數量:', blocksToDelete.length);

    // 刪除舊的標註區塊
    // let deletedCount = 0;
    if (blocksToDelete.length > 0) {
      // console.log('🗑️ 準備刪除舊標記區塊:', blocksToDelete.length);
      for (const blockId of blocksToDelete) {
        try {
          // console.log(`🗑️ 正在刪除區塊: ${blockId}`);
          const deleteResponse = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Notion-Version': '2025-09-03',
            },
          });

          if (deleteResponse.ok) {
            // deletedCount++;
            // console.log(`✅ 成功刪除區塊: ${blockId}`);
          } else {
            const errorData = await deleteResponse.json();

            console.error(`❌ 刪除區塊失敗 ${blockId}:`, JSON.stringify(errorData));
          }
        } catch (_deleteError) {
          // console.error(`❌ 刪除區塊異常 ${blockId}:`, deleteError);
        }
      }
    }

    // console.log(`🗑️ 實際刪除了 ${deletedCount}/${blocksToDelete.length} 個區塊`);

    // 添加新的標註（如果有）
    if (highlights.length > 0) {
      // console.log('➕ 準備添加新的標記區域...');

      const highlightBlocks = [
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [
              {
                type: 'text',
                text: { content: '📝 頁面標記' },
              },
            ],
          },
        },
      ];

      highlights.forEach((highlight, _index) => {
        // 處理超長標註文本，需要分割成多個段落
        const textChunks = splitTextForNotionSimulated(highlight.text, 2000);

        textChunks.forEach((chunk, _chunkIndex) => {
          highlightBlocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: chunk },
                  annotations: {
                    color: highlight.color,
                  },
                },
              ],
            },
          });
        });
      });

      const addResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2025-09-03',
        },
        body: JSON.stringify({
          children: highlightBlocks,
        }),
      });

      // console.log('📡 API 響應狀態:', addResponse.status, addResponse.statusText);
      if (!addResponse.ok) {
        const errorData = await addResponse.json();
        throw new Error(`Failed to add new highlights: ${errorData.message || 'Unknown error'}`);
      }
      await addResponse.json();
    }

    // 更新本地存儲
    await chrome.storage.local.set({
      [`saved_${pageUrl}`]: {
        savedAt: Date.now(),
        notionPageId: pageId,
        lastUpdated: Date.now(),
      },
    });

    sendResponse({ success: true });
  } catch (error) {
    console.error('💥 標記更新錯誤:', JSON.stringify(error.message));
    if (error.stack) {
      console.error('💥 錯誤堆疊:', JSON.stringify(error.stack));
    }
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * 輔助函數：將長文本分割成符合 Notion 限制的片段
 */
function splitTextForNotionSimulated(text, maxLength = 2000) {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = -1;
    const punctuation = ['.', '。', '?', '？', '!', '！', '\n'];

    for (const punct of punctuation) {
      const lastIndex = remaining.lastIndexOf(punct, maxLength);
      if (lastIndex > maxLength * 0.5) {
        splitIndex = lastIndex + 1;
        break;
      }
    }

    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
        splitIndex = maxLength;
      }
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}
