/**
 * Background.js - Notion API 操作测试
 * 测试与 Notion API 交互的核心函数
 */

describe('Background Notion API Operations', () => {
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

  describe('saveToNotion', () => {
    const mockApiKey = 'secret_test_key';
    const mockDataSourceId = 'db-123';
    const mockTitle = 'Test Article';
    const mockPageUrl = 'https://example.com/article';
    const mockBlocks = [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: 'Test content' } }]
        }
      }
    ];

    it('应该成功保存页面到 Notion', async () => {
      // Arrange
      const mockResponse = {
        id: 'page-123',
        url: 'https://notion.so/page123',
        properties: {}
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      const mockSendResponse = jest.fn();

      // Act
      await saveToNotionSimulated(
        mockTitle,
        mockBlocks,
        mockPageUrl,
        mockApiKey,
        mockDataSourceId,
        mockSendResponse
      );

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/pages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2025-09-03'
          })
        })
      );

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          notionPageId: 'page-123'
        })
      );
    });

    it('应该处理包含网站图标的保存请求', async () => {
      // Arrange
      const siteIcon = 'https://example.com/favicon.ico';
      const mockResponse = {
        id: 'page-456',
        url: 'https://notion.so/page456'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      const mockSendResponse = jest.fn();

      // Act
      await saveToNotionSimulated(
        mockTitle,
        mockBlocks,
        mockPageUrl,
        mockApiKey,
        mockDataSourceId,
        mockSendResponse,
        siteIcon
      );

      // Assert
      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.icon).toEqual({
        type: 'external',
        external: {
          url: siteIcon
        }
      });
    });

    it('应该过滤掉有问题的图片区块', async () => {
      // Arrange
      const blocksWithProblematicImages = [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: 'Normal content' } }]
          }
        },
        {
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: {
              url: 'https://example.com/image.jpg'
            }
          }
        },
        {
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: {
              url: 'https://example.com/' + 'x'.repeat(2000) + '.jpg' // 过长的URL
            }
          }
        },
        {
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: {
              url: 'https://example.com/image<script>.jpg' // 包含特殊字符
            }
          }
        }
      ];

      const mockResponse = {
        id: 'page-789',
        url: 'https://notion.so/page789'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      const mockSendResponse = jest.fn();

      // Act
      await saveToNotionSimulated(
        mockTitle,
        blocksWithProblematicImages,
        mockPageUrl,
        mockApiKey,
        mockDataSourceId,
        mockSendResponse
      );

      // Assert
      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      // 应该只保留正常的段落和有效的图片
      expect(requestBody.children).toHaveLength(2);
      expect(requestBody.children[0].type).toBe('paragraph');
      expect(requestBody.children[1].type).toBe('image');
      expect(requestBody.children[1].image.external.url).toBe('https://example.com/image.jpg');

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          warning: expect.stringContaining('2 image(s) were skipped')
        })
      );
    });

    it('应该处理超过100个区块的长文章', async () => {
      // Arrange
      const longBlocks = Array.from({ length: 150 }, (_, i) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `Paragraph ${i + 1}` } }]
        }
      }));

      const mockCreateResponse = {
        id: 'page-long',
        url: 'https://notion.so/pagelong'
      };

      const mockAppendResponse = {
        object: 'block',
        id: 'block-123'
      };

      // Mock 创建页面的响应
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockCreateResponse)
      });

      // Mock 分批添加的响应
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockAppendResponse)
      });

      const mockSendResponse = jest.fn();

      // Act
      await saveToNotionSimulated(
        mockTitle,
        longBlocks,
        mockPageUrl,
        mockApiKey,
        mockDataSourceId,
        mockSendResponse
      );

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      // 第一次调用：创建页面（前100个区块）
      const createCall = mockFetch.mock.calls[0];
      const createBody = JSON.parse(createCall[1].body);
      expect(createBody.children).toHaveLength(100);

      // 第二次调用：添加剩余区块
      const appendCall = mockFetch.mock.calls[1];
      expect(appendCall[0]).toBe('https://api.notion.com/v1/blocks/page-long/children');
      const appendBody = JSON.parse(appendCall[1].body);
      expect(appendBody.children).toHaveLength(50);
    });

    it('应该处理 Notion API 错误', async () => {
      // Arrange
      const mockErrorResponse = {
        object: 'error',
        status: 400,
        code: 'validation_error',
        message: 'Invalid request'
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(mockErrorResponse)
      });

      const mockSendResponse = jest.fn();

      // Act
      await saveToNotionSimulated(
        mockTitle,
        mockBlocks,
        mockPageUrl,
        mockApiKey,
        mockDataSourceId,
        mockSendResponse
      );

      // Assert
      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid request'
        })
      );
    });

    it('应该在图片验证错误时自动重试（排除所有图片）', async () => {
      // Arrange
      const blocksWithImages = [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: 'Text content' } }]
          }
        },
        {
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: {
              url: 'https://example.com/problematic.jpg'
            }
          }
        }
      ];

      const mockErrorResponse = {
        object: 'error',
        status: 400,
        code: 'validation_error',
        message: 'Invalid image URL'
      };

      const mockSuccessResponse = {
        id: 'page-retry',
        url: 'https://notion.so/pageretry'
      };

      // 第一次调用失败
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(mockErrorResponse)
      });

      // 第二次调用成功（无图片）
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSuccessResponse)
      });

      const mockSendResponse = jest.fn();

      // Act
      await saveToNotionSimulated(
        mockTitle,
        blocksWithImages,
        mockPageUrl,
        mockApiKey,
        mockDataSourceId,
        mockSendResponse
      );

      // 等待重试完成
      await new Promise(resolve => setTimeout(resolve, 600));

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      // 第二次调用应该不包含图片
      const retryCall = mockFetch.mock.calls[1];
      const retryBody = JSON.parse(retryCall[1].body);
      expect(retryBody.children).toHaveLength(1);
      expect(retryBody.children[0].type).toBe('paragraph');
    });

    it('应该处理网络错误', async () => {
      // Arrange
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const mockSendResponse = jest.fn();

      // Act
      await saveToNotionSimulated(
        mockTitle,
        mockBlocks,
        mockPageUrl,
        mockApiKey,
        mockDataSourceId,
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
  });

  describe('checkNotionPageExists', () => {
    const mockApiKey = 'secret_test_key';
    const mockPageId = 'page-123';

    it('应该返回 true 当页面存在且未归档时', async () => {
      // Arrange
      const mockResponse = {
        object: 'page',
        id: mockPageId,
        archived: false
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      // Act
      const result = await checkNotionPageExistsSimulated(mockPageId, mockApiKey);

      // Assert
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.notion.com/v1/pages/${mockPageId}`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockApiKey}`,
            'Notion-Version': '2025-09-03'
          })
        })
      );
    });

    it('应该返回 false 当页面已归档时', async () => {
      // Arrange
      const mockResponse = {
        object: 'page',
        id: mockPageId,
        archived: true
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      // Act
      const result = await checkNotionPageExistsSimulated(mockPageId, mockApiKey);

      // Assert
      expect(result).toBe(false);
    });

    it('应该返回 false 当页面不存在时（404）', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ object: 'error', status: 404 })
      });

      // Act
      const result = await checkNotionPageExistsSimulated(mockPageId, mockApiKey);

      // Assert
      expect(result).toBe(false);
    });

    it('应该处理网络错误', async () => {
      // Arrange
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Act
      const result = await checkNotionPageExistsSimulated(mockPageId, mockApiKey);

      // Assert
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Error checking page existence:',
        expect.any(Error)
      );
    });

    it('应该处理服务器错误（5xx）', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ object: 'error', status: 500 })
      });

      // Act
      const result = await checkNotionPageExistsSimulated(mockPageId, mockApiKey);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('appendBlocksInBatches', () => {
    const mockApiKey = 'secret_test_key';
    const mockPageId = 'page-123';

    it('应该成功分批添加区块', async () => {
      // Arrange
      const blocks = Array.from({ length: 250 }, (_, i) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `Block ${i + 1}` } }]
        }
      }));

      // Mock 3次成功的响应（250个区块需要3批）
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ object: 'block', id: `block-${i}` })
        });
      }

      // Act
      const result = await appendBlocksInBatchesSimulated(mockPageId, blocks, mockApiKey);

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(250);
      expect(result.totalCount).toBe(250);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // 验证每次调用的区块数量
      const calls = mockFetch.mock.calls;
      expect(JSON.parse(calls[0][1].body).children).toHaveLength(100);
      expect(JSON.parse(calls[1][1].body).children).toHaveLength(100);
      expect(JSON.parse(calls[2][1].body).children).toHaveLength(50);
    });

    it('应该处理部分批次失败的情况', async () => {
      // Arrange
      const blocks = Array.from({ length: 150 }, (_, i) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `Block ${i + 1}` } }]
        }
      }));

      // 第一批成功
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: 'block' })
      });

      // 第二批失败
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request')
      });

      // Act
      const result = await appendBlocksInBatchesSimulated(mockPageId, blocks, mockApiKey);

      // Assert
      expect(result.success).toBe(false);
      expect(result.addedCount).toBe(100); // 只有第一批成功
      expect(result.totalCount).toBe(150);
      expect(result.error).toContain('批次添加失敗');
    });

    it('应该处理空区块数组', async () => {
      // Act
      const result = await appendBlocksInBatchesSimulated(mockPageId, [], mockApiKey);

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('应该遵守速率限制（批次间延迟）', async () => {
      // Arrange
      const blocks = Array.from({ length: 200 }, (_, i) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `Block ${i + 1}` } }]
        }
      }));

      // Mock 2次成功响应
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: 'block' })
      });

      const startTime = Date.now();

      // Act
      await appendBlocksInBatchesSimulated(mockPageId, blocks, mockApiKey);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      // 应该至少有一次延迟（350ms）
      expect(duration).toBeGreaterThan(300);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * 模拟的 Notion API 函数（用于测试）
 */
async function saveToNotionSimulated(title, blocks, pageUrl, apiKey, dataSourceId, sendResponse, siteIcon = null, excludeImages = false) {
  const startTime = performance.now();
  
  // 过滤图片区块的逻辑
  let validBlocks;
  if (excludeImages) {
    validBlocks = blocks.filter(block => block.type !== 'image');
  } else {
    validBlocks = blocks.filter(block => {
      if (block.type === 'image') {
        const imageUrl = block.image?.external?.url;
        if (!imageUrl) return false;
        
        // 检查 URL 长度
        if (imageUrl.length > 1500) return false;
        
        // 检查特殊字符
        const problematicChars = /[<>{}|\\^`\[\]]/;
        if (problematicChars.test(imageUrl)) return false;
        
        // 验证 URL 格式
        try {
          const urlObj = new URL(imageUrl);
          if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') return false;
          if (!urlObj.hostname || urlObj.hostname.length < 3) return false;
        } catch (error) {
          return false;
        }
      }
      return true;
    });
  }

  const skippedCount = blocks.length - validBlocks.length;

  const pageData = {
    parent: {
      type: 'data_source_id',
      data_source_id: dataSourceId
    },
    properties: {
      'Title': {
        title: [{ text: { content: title } }]
      },
      'URL': {
        url: pageUrl
      }
    },
    children: validBlocks.slice(0, 100)
  };

  if (siteIcon) {
    pageData.icon = {
      type: 'external',
      external: {
        url: siteIcon
      }
    };
  }

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2025-09-03'
      },
      body: JSON.stringify(pageData)
    });

    if (response.ok) {
      const responseData = await response.json();
      const notionPageId = responseData.id;

      // 如果区块数量超过 100，分批添加剩余区块
      if (validBlocks.length > 100) {
        const appendResult = await appendBlocksInBatchesSimulated(notionPageId, validBlocks, apiKey, 100);
        if (!appendResult.success) {
          console.warn(`部分区块添加失败: ${appendResult.addedCount}/${appendResult.totalCount}`, appendResult.error);
        }
      }

      // 构建 Notion 页面 URL
      let notionUrl = responseData.url;
      if (!notionUrl && notionPageId) {
        notionUrl = `https://www.notion.so/${notionPageId.replace(/-/g, '')}`;
      }

      // 模拟保存到存储
      await chrome.storage.local.set({
        [`saved_${pageUrl}`]: {
          title: title,
          savedAt: Date.now(),
          notionPageId: notionPageId,
          notionUrl: notionUrl
        }
      });

      const duration = performance.now() - startTime;
      console.log(`保存到 Notion 完成: ${duration.toFixed(2)}ms`);

      if (skippedCount > 0 || excludeImages) {
        const totalSkipped = excludeImages ? 'All images' : `${skippedCount} image(s)`;
        sendResponse({
          success: true,
          notionPageId: notionPageId,
          warning: `${totalSkipped} were skipped due to compatibility issues`
        });
      } else {
        sendResponse({ success: true, notionPageId: notionPageId });
      }
    } else {
      const errorData = await response.json();
      console.error('Notion API Error:', errorData);

      // 检查是否是图片验证错误，如果是则自动重试
      if (errorData.code === 'validation_error' && errorData.message && errorData.message.includes('image')) {
        console.log('Auto-retry: Saving without ANY images...');
        setTimeout(() => {
          saveToNotionSimulated(title, blocks, pageUrl, apiKey, dataSourceId, sendResponse, siteIcon, true);
        }, 500);
        return;
      }

      sendResponse({ success: false, error: errorData.message || 'Failed to save to Notion.' });
    }
  } catch (error) {
    console.error('Fetch Error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function checkNotionPageExistsSimulated(pageId, apiKey) {
  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2025-09-03'
      }
    });

    if (response.ok) {
      const pageData = await response.json();
      return !pageData.archived;
    } else if (response.status === 404) {
      return false;
    } else {
      return false;
    }
  } catch (error) {
    console.error('Error checking page existence:', error);
    return false;
  }
}

async function appendBlocksInBatchesSimulated(pageId, blocks, apiKey, startIndex = 0) {
  const BLOCKS_PER_BATCH = 100;
  const DELAY_BETWEEN_BATCHES = 350;

  let addedCount = 0;
  const totalBlocks = blocks.length - startIndex;

  if (totalBlocks <= 0) {
    return { success: true, addedCount: 0, totalCount: 0 };
  }

  console.log(`准备分批添加区块: 总共 ${totalBlocks} 个，从索引 ${startIndex} 开始`);

  try {
    for (let i = startIndex; i < blocks.length; i += BLOCKS_PER_BATCH) {
      const batch = blocks.slice(i, i + BLOCKS_PER_BATCH);
      const batchNumber = Math.floor((i - startIndex) / BLOCKS_PER_BATCH) + 1;
      const totalBatches = Math.ceil(totalBlocks / BLOCKS_PER_BATCH);

      console.log(`发送批次 ${batchNumber}/${totalBatches}: ${batch.length} 个区块`);

      const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2025-09-03'
        },
        body: JSON.stringify({
          children: batch
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`批次 ${batchNumber} 失败:`, errorText);
        throw new Error(`批次添加失敗: ${response.status} - ${errorText}`);
      }

      addedCount += batch.length;
      console.log(`批次 ${batchNumber} 成功: 已添加 ${addedCount}/${totalBlocks} 个区块`);

      // 如果还有更多批次，添加延迟
      if (i + BLOCKS_PER_BATCH < blocks.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    console.log(`所有区块添加完成: ${addedCount}/${totalBlocks}`);
    return { success: true, addedCount, totalCount: totalBlocks };

  } catch (error) {
    console.error("分批添加区块失败:", error);
    return { success: false, addedCount, totalCount: totalBlocks, error: error.message };
  }
}
