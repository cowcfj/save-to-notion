/**
 * MessageHandler 單元測試
 */

const { MessageHandler } = require('../../../../scripts/background/handlers/MessageHandler');

describe('MessageHandler', () => {
  let handler = null;
  let mockLogger = null;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    };
    handler = new MessageHandler({ logger: mockLogger });
  });

  describe('constructor', () => {
    it('應該正確初始化', () => {
      expect(handler.handlers).toBeInstanceOf(Map);
      expect(handler.handlers.size).toBe(0);
    });

    it('應該接受預設的處理函數', () => {
      const handlerWithPresets = new MessageHandler({
        handlers: {
          testAction: jest.fn(),
          anotherAction: jest.fn(),
        },
      });
      expect(handlerWithPresets.handlers.size).toBe(2);
    });
  });

  describe('register', () => {
    it('應該註冊處理函數', () => {
      const mockHandler = jest.fn();
      handler.register('testAction', mockHandler);
      expect(handler.handlers.get('testAction')).toBe(mockHandler);
    });

    it('應該拋出錯誤當處理函數不是函數時', () => {
      expect(() => handler.register('testAction', 'not a function')).toThrow(
        "Handler for action 'testAction' must be a function"
      );
    });
  });

  describe('registerAll', () => {
    it('應該批量註冊處理函數', () => {
      handler.registerAll({
        action1: jest.fn(),
        action2: jest.fn(),
        action3: jest.fn(),
      });
      expect(handler.handlers.size).toBe(3);
    });
  });

  describe('handle', () => {
    it('應該調用對應的處理函數', () => {
      const mockHandler = jest.fn((req, sender, sendResponse) => {
        sendResponse({ success: true });
      });
      handler.register('testAction', mockHandler);

      const sendResponse = jest.fn();
      handler.handle({ action: 'testAction' }, {}, sendResponse);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('應該處理未知動作', () => {
      const sendResponse = jest.fn();
      handler.handle({ action: 'unknownAction' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown action: unknownAction',
      });
    });

    it('應該處理異步處理函數', async () => {
      const asyncHandler = jest.fn(async (req, sender, sendResponse) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        sendResponse({ success: true, data: 'async result' });
      });
      handler.register('asyncAction', asyncHandler);

      const sendResponse = jest.fn();
      const result = handler.handle({ action: 'asyncAction' }, {}, sendResponse);

      expect(result).toBe(true); // 異步響應標記

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(sendResponse).toHaveBeenCalledWith({ success: true, data: 'async result' });
    });

    it('應該捕獲處理函數拋出的錯誤並返回結構化響應', async () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Test error');
      });
      handler.register('errorAction', errorHandler);

      const sendResponse = jest.fn();
      handler.handle({ action: 'errorAction' }, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Test error',
        errorType: 'internal',
        action: 'errorAction',
      });
    });
  });

  describe('getRegisteredActions', () => {
    it('應該返回已註冊的動作列表', () => {
      handler.register('action1', jest.fn());
      handler.register('action2', jest.fn());

      const actions = handler.getRegisteredActions();
      expect(actions).toContain('action1');
      expect(actions).toContain('action2');
      expect(actions.length).toBe(2);
    });
  });
});
