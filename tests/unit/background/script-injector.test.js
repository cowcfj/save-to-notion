/**
 * Background.js - ScriptInjector 类测试
 * 测试脚本注入管理器的各种方法
 */

describe('Background ScriptInjector Class', () => {
  let mockExecuteScript;
  let originalChrome;

  beforeEach(() => {
    // 保存原始 chrome 对象
    originalChrome = global.chrome;

    // 创建 chrome.scripting mock
    mockExecuteScript = jest.fn();
    global.chrome = {
      ...global.chrome,
      scripting: {
        executeScript: mockExecuteScript
      },
      runtime: {
        lastError: null
      }
    };

    // 重置 console mocks
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // 恢复原始 chrome 对象
    global.chrome = originalChrome;
    
    // 清理 mocks
    jest.restoreAllMocks();
  });

  describe('injectAndExecute', () => {
    const mockTabId = 123;

    it('应该成功注入文件并执行函数', async () => {
      // Arrange
      const mockFiles = ['scripts/utils.js', 'scripts/highlighter-v2.js'];
      const mockFunc = () => { return 'test result'; };

      // Mock 文件注入成功
      mockExecuteScript
        .mockImplementationOnce((options, callback) => {
          callback();
        })
        // Mock 函数执行成功
        .mockImplementationOnce((options, callback) => {
          callback([{ result: 'test result' }]);
        });

      // Act
      const result = await ScriptInjectorSimulated.injectAndExecute(
        mockTabId,
        mockFiles,
        mockFunc,
        { returnResult: true }
      );

      // Assert
      expect(mockExecuteScript).toHaveBeenCalledTimes(2);
      
      // 第一次调用：注入文件
      expect(mockExecuteScript).toHaveBeenNthCalledWith(1,
        {
          target: { tabId: mockTabId },
          files: mockFiles
        },
        expect.any(Function)
      );

      // 第二次调用：执行函数
      expect(mockExecuteScript).toHaveBeenNthCalledWith(2,
        {
          target: { tabId: mockTabId },
          func: mockFunc
        },
        expect.any(Function)
      );

      expect(result).toBe('test result');
    });

    it('应该处理文件注入错误', async () => {
      // Arrange
      const mockFiles = ['scripts/nonexistent.js'];
      
      global.chrome.runtime.lastError = { message: 'File not found' };
      mockExecuteScript.mockImplementationOnce((options, callback) => {
        callback();
      });

      // Act & Assert
      await expect(
        ScriptInjectorSimulated.injectAndExecute(mockTabId, mockFiles, null)
      ).rejects.toThrow('File not found');

      // 清理
      global.chrome.runtime.lastError = null;
    });

    it('应该处理函数执行错误', async () => {
      // Arrange
      const mockFunc = () => { throw new Error('Function error'); };
      
      global.chrome.runtime.lastError = { message: 'Function execution failed' };
      mockExecuteScript.mockImplementationOnce((options, callback) => {
        callback();
      });

      // Act & Assert
      await expect(
        ScriptInjectorSimulated.injectAndExecute(mockTabId, [], mockFunc)
      ).rejects.toThrow('Function execution failed');

      // 清理
      global.chrome.runtime.lastError = null;
    });

    it('应该处理异常错误', async () => {
      // Arrange
      mockExecuteScript.mockImplementationOnce(() => {
        throw new Error('Unexpected error');
      });

      // Act & Assert
      await expect(
        ScriptInjectorSimulated.injectAndExecute(mockTabId, ['test.js'], null)
      ).rejects.toThrow('Unexpected error');
    });

    it('应该在没有文件和函数时解析', async () => {
      // Act
      const result = await ScriptInjectorSimulated.injectAndExecute(mockTabId, [], null);

      // Assert
      expect(result).toBeUndefined();
      expect(mockExecuteScript).not.toHaveBeenCalled();
    });
  });

  describe('injectHighlighter', () => {
    const mockTabId = 456;

    it('应该正确调用 injectAndExecute 来注入标记工具', async () => {
      // Arrange
      mockExecuteScript
        .mockImplementationOnce((options, callback) => callback())
        .mockImplementationOnce((options, callback) => callback());

      // Act
      await ScriptInjectorSimulated.injectHighlighter(mockTabId);

      // Assert
      expect(mockExecuteScript).toHaveBeenCalledTimes(2);
      
      // 验证注入的文件
      const fileCall = mockExecuteScript.mock.calls[0];
      expect(fileCall[0].files).toEqual([
        'scripts/utils.js',
        'scripts/seamless-migration.js',
        'scripts/highlighter-v2.js'
      ]);

      // 验证执行的函数
      const funcCall = mockExecuteScript.mock.calls[1];
      expect(funcCall[0].func).toBeDefined();
      expect(typeof funcCall[0].func).toBe('function');
    });
  });

  describe('collectHighlights', () => {
    const mockTabId = 789;

    it('应该正确调用 injectAndExecute 来收集标记', async () => {
      // Arrange
      const mockHighlights = [
        { text: '测试标记1', color: 'yellow' },
        { text: '测试标记2', color: 'green' }
      ];

      mockExecuteScript
        .mockImplementationOnce((options, callback) => callback())
        .mockImplementationOnce((options, callback) => {
          callback([{ result: mockHighlights }]);
        });

      // Act
      const result = await ScriptInjectorSimulated.collectHighlights(mockTabId);

      // Assert
      expect(mockExecuteScript).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockHighlights);

      // 验证注入的文件
      const fileCall = mockExecuteScript.mock.calls[0];
      expect(fileCall[0].files).toEqual([
        'scripts/utils.js',
        'scripts/seamless-migration.js',
        'scripts/highlighter-v2.js'
      ]);
    });

    it('应该处理空标记结果', async () => {
      // Arrange
      mockExecuteScript
        .mockImplementationOnce((options, callback) => callback())
        .mockImplementationOnce((options, callback) => {
          callback([{ result: [] }]);
        });

      // Act
      const result = await ScriptInjectorSimulated.collectHighlights(mockTabId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('clearPageHighlights', () => {
    const mockTabId = 101;

    it('应该正确调用 injectAndExecute 来清除页面标记', async () => {
      // Arrange
      mockExecuteScript
        .mockImplementationOnce((options, callback) => callback())
        .mockImplementationOnce((options, callback) => callback());

      // Act
      await ScriptInjectorSimulated.clearPageHighlights(mockTabId);

      // Assert
      expect(mockExecuteScript).toHaveBeenCalledTimes(2);

      // 验证注入的文件
      const fileCall = mockExecuteScript.mock.calls[0];
      expect(fileCall[0].files).toEqual([
        'scripts/utils.js',
        'scripts/seamless-migration.js',
        'scripts/highlighter-v2.js'
      ]);

      // 验证执行的函数
      const funcCall = mockExecuteScript.mock.calls[1];
      expect(funcCall[0].func).toBeDefined();
    });
  });

  describe('injectHighlightRestore', () => {
    const mockTabId = 202;

    it('应该正确调用 injectAndExecute 来注入标记恢复脚本', async () => {
      // Arrange
      mockExecuteScript.mockImplementationOnce((options, callback) => callback());

      // Act
      await ScriptInjectorSimulated.injectHighlightRestore(mockTabId);

      // Assert
      expect(mockExecuteScript).toHaveBeenCalledTimes(1);

      // 验证注入的文件
      const fileCall = mockExecuteScript.mock.calls[0];
      expect(fileCall[0].files).toEqual([
        'scripts/utils.js',
        'scripts/highlight-restore.js'
      ]);
    });
  });

  describe('injectWithResponse', () => {
    const mockTabId = 303;

    it('应该注入文件并执行函数，返回结果', async () => {
      // Arrange
      const mockFiles = ['scripts/test.js'];
      const mockFunc = () => { return { success: true }; };
      const mockResult = { success: true };

      mockExecuteScript
        .mockImplementationOnce((options, callback) => callback())
        .mockImplementationOnce((options, callback) => {
          callback([{ result: mockResult }]);
        });

      // Act
      const result = await ScriptInjectorSimulated.injectWithResponse(
        mockTabId,
        mockFunc,
        mockFiles
      );

      // Assert
      expect(result).toEqual(mockResult);
      expect(mockExecuteScript).toHaveBeenCalledTimes(2);
    });

    it('应该处理只注入文件的情况', async () => {
      // Arrange
      const mockFiles = ['scripts/test.js'];

      mockExecuteScript.mockImplementationOnce((options, callback) => callback());

      // Act
      const result = await ScriptInjectorSimulated.injectWithResponse(
        mockTabId,
        null,
        mockFiles
      );

      // Assert
      expect(result).toEqual([{ result: { success: true } }]);
      expect(mockExecuteScript).toHaveBeenCalledTimes(1);
    });

    it('应该处理注入失败的情况', async () => {
      // Arrange
      const mockFiles = ['scripts/test.js'];
      
      global.chrome.runtime.lastError = { message: 'Injection failed' };
      mockExecuteScript.mockImplementationOnce((options, callback) => callback());

      // Act & Assert
      await expect(
        ScriptInjectorSimulated.injectWithResponse(mockTabId, null, mockFiles)
      ).rejects.toThrow('Injection failed');

      // 清理
      global.chrome.runtime.lastError = null;
    });
  });

  describe('inject', () => {
    const mockTabId = 404;

    it('应该简单注入脚本（不返回结果）', async () => {
      // Arrange
      const mockFiles = ['scripts/simple.js'];
      const mockFunc = () => { console.log('executed'); };

      mockExecuteScript
        .mockImplementationOnce((options, callback) => callback())
        .mockImplementationOnce((options, callback) => callback());

      // Act
      await ScriptInjectorSimulated.inject(mockTabId, mockFunc, mockFiles);

      // Assert
      expect(mockExecuteScript).toHaveBeenCalledTimes(2);
    });

    it('应该处理注入失败', async () => {
      // Arrange
      const mockFunc = () => {};
      
      mockExecuteScript.mockImplementationOnce(() => {
        throw new Error('Injection failed');
      });

      // Act & Assert
      await expect(
        ScriptInjectorSimulated.inject(mockTabId, mockFunc, [])
      ).rejects.toThrow('Injection failed');
    });
  });

  describe('错误处理和边界情况', () => {
    const mockTabId = 505;

    it('应该处理 chrome.runtime.lastError 为 null 的情况', async () => {
      // Arrange
      global.chrome.runtime.lastError = null;
      mockExecuteScript.mockImplementationOnce((options, callback) => callback());

      // Act
      const result = await ScriptInjectorSimulated.injectAndExecute(
        mockTabId,
        ['test.js'],
        null
      );

      // Assert
      expect(result).toBeUndefined();
    });

    it('应该处理回调函数中的异步错误', async () => {
      // Arrange
      mockExecuteScript.mockImplementationOnce((options, callback) => {
        setTimeout(() => {
          global.chrome.runtime.lastError = { message: 'Async error' };
          callback();
        }, 10);
      });

      // Act & Assert
      await expect(
        ScriptInjectorSimulated.injectAndExecute(mockTabId, ['test.js'], null)
      ).rejects.toThrow('Async error');

      // 清理
      global.chrome.runtime.lastError = null;
    });

    it('应该处理无效的 tabId', async () => {
      // Arrange
      const invalidTabId = null;
      
      mockExecuteScript.mockImplementationOnce((options, callback) => {
        global.chrome.runtime.lastError = { message: 'Invalid tab ID' };
        callback();
      });

      // Act & Assert
      await expect(
        ScriptInjectorSimulated.injectAndExecute(invalidTabId, ['test.js'], null)
      ).rejects.toThrow('Invalid tab ID');

      // 清理
      global.chrome.runtime.lastError = null;
    });
  });
});

/**
 * 模拟的 ScriptInjector 类（用于测试）
 */
class ScriptInjectorSimulated {
  static async injectAndExecute(tabId, files = [], func = null, options = {}) {
    const {
      errorMessage = 'Script injection failed',
      successMessage = 'Script executed successfully',
      logErrors = true,
      returnResult = false
    } = options;

    try {
      // 首先注入文件
      if (files.length > 0) {
        await new Promise((resolve, reject) => {
          chrome.scripting.executeScript({
            target: { tabId },
            files: files
          }, () => {
            if (chrome.runtime.lastError) {
              if (logErrors) {
                console.error(`File injection failed:`, chrome.runtime.lastError);
              }
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      }

      // 然后执行函数
      if (func) {
        return new Promise((resolve, reject) => {
          chrome.scripting.executeScript({
            target: { tabId },
            func: func
          }, (results) => {
            if (chrome.runtime.lastError) {
              if (logErrors) {
                console.error(`Function execution failed:`, chrome.runtime.lastError);
              }
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              if (successMessage && logErrors) {
                console.log(successMessage);
              }
              const result = returnResult && results && results[0] ? results[0].result : null;
              resolve(result);
            }
          });
        });
      }

      return Promise.resolve();
    } catch (error) {
      if (logErrors) {
        console.error(errorMessage, error);
      }
      throw error;
    }
  }

  static async injectHighlighter(tabId) {
    return this.injectAndExecute(
      tabId,
      ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
      () => {
        if (window.initHighlighter) {
          window.initHighlighter();
        }
        if (window.notionHighlighter) {
          window.notionHighlighter.show();
          console.log('✅ 工具欄已顯示');
        }
      },
      {
        errorMessage: 'Failed to inject highlighter',
        successMessage: 'Highlighter v2 injected and initialized successfully'
      }
    );
  }

  static async collectHighlights(tabId) {
    return this.injectAndExecute(
      tabId,
      ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
      () => {
        if (window.collectHighlights) {
          return window.collectHighlights();
        }
        return [];
      },
      {
        errorMessage: 'Failed to collect highlights',
        returnResult: true
      }
    );
  }

  static async clearPageHighlights(tabId) {
    return this.injectAndExecute(
      tabId,
      ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
      () => {
        if (window.clearPageHighlights) {
          window.clearPageHighlights();
        }
      },
      {
        errorMessage: 'Failed to clear page highlights'
      }
    );
  }

  static async injectHighlightRestore(tabId) {
    return this.injectAndExecute(
      tabId,
      ['scripts/utils.js', 'scripts/highlight-restore.js'],
      null,
      {
        errorMessage: 'Failed to inject highlight restore script',
        successMessage: 'Highlight restore script injected successfully'
      }
    );
  }

  static async injectWithResponse(tabId, func, files = []) {
    try {
      // 如果有文件需要注入，先注入文件
      if (files && files.length > 0) {
        await this.injectAndExecute(tabId, files, null, { logErrors: true });
      }

      // 执行函数并返回结果
      if (func) {
        return this.injectAndExecute(tabId, [], func, {
          returnResult: true,
          logErrors: true
        });
      } else if (files && files.length > 0) {
        // 如果只注入文件而不执行函数，返回成功标记
        return Promise.resolve([{ result: { success: true } }]);
      }

      return Promise.resolve(null);
    } catch (error) {
      console.error('injectWithResponse failed:', error);
      throw error;
    }
  }

  static async inject(tabId, func, files = []) {
    try {
      return this.injectAndExecute(tabId, files, func, {
        returnResult: false,
        logErrors: true
      });
    } catch (error) {
      console.error('inject failed:', error);
      throw error;
    }
  }
}