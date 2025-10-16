/**
 * Background.js - 标注更新功能测试
 * 测试 updateHighlightsOnly 和相关的标注处理函数
 */

describe('Background Update Highlights', () => {
  let mockFetch;
  let originalFetch;

  beforeEach(() => {
    // 保存原始 fetch
    originalFetch = global.fetch;
    
    // 创建 fetch mock
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // 清理存储
    if (chrome._clearStorage) {
      chrome._clearStorage();
    }

    // 重置 console mocks
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // 恢复原始 fetch
    global.fetch = originalFetch;
    
    // 清理 mocks
    jest.restoreAllMocks();
  });

  describe('updateHighlightsOnly', () => {
    const mockApiKey = 'secret_test_key';
    const mockPageId = 'page-123';
    const mockPageUrl = 'https://example.com/article';

    it('应该成功更新标注到现有页面', async () => {
      // Arrange
      const highlights = [
        { text: '重要内容1', color: 'yellow' },
        { text: '重要内容2', color: 'green' }
      ];

      // Mock 获取现有内容的响应
      const existingBlocks = {
        results: [
          {
            id: 'block-1',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '原有内容' } }] }
          },
          {
            id: 'block-2',
            type: 'heading_3',
            heading_3: { rich_text: [{ text: { content: '📝 頁面標記' } }] }
          },
          {
            id: 'block-3',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '旧标注1' } }] }
          }
        ]
      };

      // Mock 删除区块的响应
      const deleteResponse = { ok: true, status: 200 };

      // Mock 添加新标注的响应
      const addResponse = {
        results: [
          { id: 'new-block-1', type: 'heading_3' },
          { id: 'new-block-2', type: 'paragraph' },
          { id: 'new-block-3', type: 'paragraph' }
        ]
      };

      mockFetch
        // 获取现有内容
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks)
        })
        // 删除旧标注区块
        .mockResolvedValueOnce(deleteResponse)
        .mockResolvedValueOnce(deleteResponse)
        // 添加新标注
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(addResponse)
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
      
      // 验证获取现有内容的调用
      expect(mockFetch).toHaveBeenNthCalledWith(1,
        `https://api.notion.com/v1/blocks/${mockPageId}/children?page_size=100`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockApiKey}`,
            'Notion-Version': '2022-06-28'
          })
        })
      );

      // 验证删除旧区块的调用
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        'https://api.notion.com/v1/blocks/block-2',
        expect.objectContaining({ method: 'DELETE' })
      );

      expect(mockFetch).toHaveBeenNthCalledWith(3,
        'https://api.notion.com/v1/blocks/block-3',
        expect.objectContaining({ method: 'DELETE' })
      );

      // 验证添加新标注的调用
      const addCall = mockFetch.mock.calls[3];
      expect(addCall[0]).toBe(`https://api.notion.com/v1/blocks/${mockPageId}/children`);
      expect(addCall[1].method).toBe('PATCH');
      
      const addBody = JSON.parse(addCall[1].body);
      expect(addBody.children).toHaveLength(3); // 标题 + 2个标注
      expect(addBody.children[0].type).toBe('heading_3');
      expect(addBody.children[1].type).toBe('paragraph');
      expect(addBody.children[2].type).toBe('paragraph');

      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('应该处理没有现有标注区域的页面', async () => {
      // Arrange
      const highlights = [
        { text: '新标注', color: 'blue' }
      ];

      // Mock 获取现有内容的响应（没有标注区域）
      const existingBlocks = {
        results: [
          {
            id: 'block-1',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '原有内容' } }] }
          }
        ]
      };

      // Mock 添加新标注的响应
      const addResponse = {
        results: [
          { id: 'new-block-1', type: 'heading_3' },
          { id: 'new-block-2', type: 'paragraph' }
        ]
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks)
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(addResponse)
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

    it('应该处理空标注列表', async () => {
      // Arrange
      const highlights = [];

      // Mock 获取现有内容的响应
      const existingBlocks = {
        results: [
          {
            id: 'block-1',
            type: 'heading_3',
            heading_3: { rich_text: [{ text: { content: '📝 頁面標記' } }] }
          },
          {
            id: 'block-2',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '旧标注' } }] }
          }
        ]
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks)
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
      expect(mockFetch).toHaveBeenCalledTimes(3); // 获取 + 2次删除，没有添加
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('应该处理超长标注文本（需要分割）', async () => {
      // Arrange
      const longText = 'A'.repeat(3000); // 超过 2000 字符限制
      const highlights = [
        { text: longText, color: 'red' }
      ];

      // Mock 获取现有内容的响应（没有标注区域）
      const existingBlocks = { results: [] };

      // Mock 添加新标注的响应
      const addResponse = {
        results: [
          { id: 'new-block-1', type: 'heading_3' },
          { id: 'new-block-2', type: 'paragraph' },
          { id: 'new-block-3', type: 'paragraph' } // 分割后的第二部分
        ]
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks)
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(addResponse)
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
      
      // 应该有标题 + 2个分割的段落
      expect(addBody.children).toHaveLength(3);
      expect(addBody.children[0].type).toBe('heading_3');
      expect(addBody.children[1].type).toBe('paragraph');
      expect(addBody.children[2].type).toBe('paragraph');

      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('应该处理获取现有内容失败的情况', async () => {
      // Arrange
      const highlights = [{ text: '测试', color: 'yellow' }];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ object: 'error', status: 404 })
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
          error: expect.stringContaining('Failed to get existing page content')
        })
      );
    });

    it('应该处理删除区块失败的情况', async () => {
      // Arrange
      const highlights = [{ text: '测试', color: 'yellow' }];

      // Mock 获取现有内容成功
      const existingBlocks = {
        results: [
          {
            id: 'block-1',
            type: 'heading_3',
            heading_3: { rich_text: [{ text: { content: '📝 頁面標記' } }] }
          }
        ]
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks)
        })
        // 删除失败
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ object: 'error', message: 'Delete failed' })
        })
        // 添加新标注成功
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [] })
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
      // 即使删除失败，也应该继续添加新标注
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('刪除區塊失敗'),
        expect.anything()
      );
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('应该处理添加新标注失败的情况', async () => {
      // Arrange
      const highlights = [{ text: '测试', color: 'yellow' }];

      // Mock 获取现有内容成功（没有标注区域）
      const existingBlocks = { results: [] };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks)
        })
        // 添加新标注失败
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ object: 'error', message: 'Add failed' })
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
          error: expect.stringContaining('Failed to add new highlights')
        })
      );
    });

    it('应该处理网络错误', async () => {
      // Arrange
      const highlights = [{ text: '测试', color: 'yellow' }];

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
          error: 'Network error'
        })
      );
    });

    it('应该正确识别和处理标注区域的边界', async () => {
      // Arrange
      const highlights = [{ text: '新标注', color: 'yellow' }];

      // Mock 复杂的页面结构
      const existingBlocks = {
        results: [
          {
            id: 'block-1',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '正文内容1' } }] }
          },
          {
            id: 'block-2',
            type: 'heading_3',
            heading_3: { rich_text: [{ text: { content: '📝 頁面標記' } }] }
          },
          {
            id: 'block-3',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '旧标注1' } }] }
          },
          {
            id: 'block-4',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '旧标注2' } }] }
          },
          {
            id: 'block-5',
            type: 'heading_2',
            heading_2: { rich_text: [{ text: { content: '其他章节' } }] }
          },
          {
            id: 'block-6',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '其他内容' } }] }
          }
        ]
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(existingBlocks)
        })
        // 删除标注区域的3个区块
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({ ok: true, status: 200 })
        // 添加新标注
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [] })
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
      expect(mockFetch).toHaveBeenCalledTimes(5); // 获取 + 3次删除 + 1次添加
      
      // 验证删除的是正确的区块
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

      // 不应该删除其他章节的内容
      expect(mockFetch).not.toHaveBeenCalledWith(
        'https://api.notion.com/v1/blocks/block-5',
        expect.objectContaining({ method: 'DELETE' })
      );

      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });
  });
});

/**
 * 模拟的 updateHighlightsOnly 函数（用于测试）
 */
async function updateHighlightsOnlySimulated(pageId, highlights, pageUrl, apiKey, sendResponse) {
  try {
    console.log('🔄 開始更新標記 - 頁面ID:', pageId, '標記數量:', highlights.length);

    // 获取现有页面内容
    const getResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28'
      }
    });

    if (!getResponse.ok) {
      const errorData = await getResponse.json();
      console.error('❌ 獲取頁面內容失敗:', errorData);
      throw new Error('Failed to get existing page content: ' + (errorData.message || getResponse.statusText));
    }

    const existingContent = await getResponse.json();
    const existingBlocks = existingContent.results;
    console.log('📋 現有區塊數量:', existingBlocks.length);

    // 查找并删除现有的标注区域
    const blocksToDelete = [];
    let foundHighlightSection = false;

    for (let i = 0; i < existingBlocks.length; i++) {
      const block = existingBlocks[i];

      if (block.type === 'heading_3' &&
          block.heading_3?.rich_text?.[0]?.text?.content === '📝 頁面標記') {
        foundHighlightSection = true;
        blocksToDelete.push(block.id);
        console.log(`🎯 找到標記區域標題 (索引 ${i}):`, block.id);
      } else if (foundHighlightSection) {
        if (block.type.startsWith('heading_')) {
          console.log(`🛑 遇到下一個標題，停止收集標記區塊 (索引 ${i})`);
          break;
        }
        if (block.type === 'paragraph') {
          blocksToDelete.push(block.id);
          console.log(`📝 標記為刪除的段落 (索引 ${i}):`, block.id);
        }
      }
    }

    console.log('🗑️ 需要刪除的區塊數量:', blocksToDelete.length);

    // 删除旧的标注区块
    let deletedCount = 0;
    for (const blockId of blocksToDelete) {
      try {
        console.log(`🗑️ 正在刪除區塊: ${blockId}`);
        const deleteResponse = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Notion-Version': '2022-06-28'
          }
        });

        if (deleteResponse.ok) {
          deletedCount++;
          console.log(`✅ 成功刪除區塊: ${blockId}`);
        } else {
          const errorData = await deleteResponse.json();
          console.error(`❌ 刪除區塊失敗 ${blockId}:`, errorData);
        }
      } catch (deleteError) {
        console.error(`❌ 刪除區塊異常 ${blockId}:`, deleteError);
      }
    }

    console.log(`🗑️ 實際刪除了 ${deletedCount}/${blocksToDelete.length} 個區塊`);

    // 添加新的标注（如果有）
    if (highlights.length > 0) {
      console.log('➕ 準備添加新的標記區域...');

      const highlightBlocks = [{
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{
            type: 'text',
            text: { content: '📝 頁面標記' }
          }]
        }
      }];

      highlights.forEach((highlight, index) => {
        console.log(`📝 準備添加標記 ${index + 1}: "${highlight.text.substring(0, 30)}..." (顏色: ${highlight.color})`);

        // 处理超长标注文本，需要分割成多个段落
        const textChunks = splitTextForNotionSimulated(highlight.text, 2000);

        textChunks.forEach((chunk, chunkIndex) => {
          highlightBlocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                type: 'text',
                text: { content: chunk },
                annotations: {
                  color: highlight.color
                }
              }]
            }
          });

          if (textChunks.length > 1) {
            console.log(`   └─ 分割片段 ${chunkIndex + 1}/${textChunks.length}: ${chunk.length} 字符`);
          }
        });
      });

      console.log('➕ 準備添加的區塊數量:', highlightBlocks.length);

      const addResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          children: highlightBlocks
        })
      });

      console.log('📡 API 響應狀態:', addResponse.status, addResponse.statusText);

      if (!addResponse.ok) {
        const errorData = await addResponse.json();
        console.error('❌ 添加標記失敗 - 錯誤詳情:', errorData);
        throw new Error('Failed to add new highlights: ' + (errorData.message || 'Unknown error'));
      }

      const addResult = await addResponse.json();
      console.log('✅ 成功添加新標記 - 響應:', addResult);
      console.log('✅ 添加的區塊數量:', addResult.results?.length || 0);
    } else {
      console.log('ℹ️ 沒有新標記需要添加');
    }

    // 更新本地存储
    console.log('💾 更新本地保存記錄...');
    await chrome.storage.local.set({
      [`saved_${pageUrl}`]: {
        savedAt: Date.now(),
        notionPageId: pageId,
        lastUpdated: Date.now()
      }
    });

    console.log('🎉 標記更新完成！');
    sendResponse({ success: true });
  } catch (error) {
    console.error('💥 標記更新錯誤:', error);
    console.error('💥 錯誤堆棧:', error.stack);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * 辅助函数：将长文本分割成符合 Notion 限制的片段
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