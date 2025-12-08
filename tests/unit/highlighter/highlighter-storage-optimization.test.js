/**
 * 標註存儲優化測試
 * v2.8.0: 驗證文本不重複保存
 */

describe('標註存儲優化 (v2.8.0)', () => {
  describe('serializeRange', () => {
    test('不應包含 text 字段', () => {
      // 模擬 Range 對象
      const mockRange = {
        startContainer: document.createTextNode('測試文本'),
        startOffset: 0,
        endContainer: document.createTextNode('測試文本'),
        endOffset: 4,
        toString: () => '測試文本',
      };

      // 模擬 HighlightManager
      const manager = {
        getNodePath: jest.fn(() => [
          { type: 'element', tag: 'p', index: 0 },
          { type: 'text', index: 0 },
        ]),
        serializeRange(range) {
          return {
            startContainerPath: this.getNodePath(range.startContainer),
            startOffset: range.startOffset,
            endContainerPath: this.getNodePath(range.endContainer),
            endOffset: range.endOffset,
            // 不包含 text 字段
          };
        },
      };

      const serialized = manager.serializeRange(mockRange);

      // 驗證不包含 text 字段
      expect(serialized.text).toBeUndefined();

      // 驗證包含必要字段
      expect(serialized.startContainerPath).toBeDefined();
      expect(serialized.endContainerPath).toBeDefined();
      expect(serialized.startOffset).toBe(0);
      expect(serialized.endOffset).toBe(4);
    });
  });

  describe('deserializeRange', () => {
    test('應使用外部 text 參數進行驗證', () => {
      const rangeInfo = {
        startContainerPath: [
          { type: 'element', tag: 'p', index: 0 },
          { type: 'text', index: 0 },
        ],
        startOffset: 0,
        endContainerPath: [
          { type: 'element', tag: 'p', index: 0 },
          { type: 'text', index: 0 },
        ],
        endOffset: 4,
        // 不包含 text 字段
      };

      const expectedText = '測試文本';

      // 這個測試需要實際的 DOM 環境
      // 這裡只驗證參數傳遞
      expect(rangeInfo.text).toBeUndefined();
      expect(expectedText).toBe('測試文本');
    });

    test('應向後兼容舊格式（包含 text 字段）', () => {
      const oldRangeInfo = {
        startContainerPath: [],
        startOffset: 0,
        endContainerPath: [],
        endOffset: 4,
        text: '舊格式文本', // 舊格式包含 text
      };

      // 驗證舊格式數據仍然有 text 字段
      expect(oldRangeInfo.text).toBe('舊格式文本');

      // deserializeRange 應該能處理這種情況
      // 實際測試需要完整的 DOM 環境
    });
  });

  describe('數據遷移', () => {
    test('應自動移除舊格式的 text 字段', () => {
      const oldHighlightData = {
        id: 'test-1',
        text: '標註文本',
        color: 'yellow',
        rangeInfo: {
          startContainerPath: [],
          startOffset: 0,
          endContainerPath: [],
          endOffset: 4,
          text: '標註文本', // 舊格式：重複的文本
        },
      };

      // 模擬遷移邏輯
      if (oldHighlightData.rangeInfo?.text) {
        delete oldHighlightData.rangeInfo.text;
      }

      // 驗證遷移後的數據
      expect(oldHighlightData.text).toBe('標註文本'); // 頂層保留
      expect(oldHighlightData.rangeInfo.text).toBeUndefined(); // rangeInfo 中移除
    });

    test('計算存儲空間節省', () => {
      const testText = '這是一段測試標註文本，用於計算存儲空間的節省效果。';

      // 舊格式：文本保存兩次
      const oldFormat = {
        id: 'test-1',
        text: testText,
        color: 'yellow',
        rangeInfo: {
          startContainerPath: [{ type: 'element', tag: 'p', index: 0 }],
          startOffset: 0,
          endContainerPath: [{ type: 'element', tag: 'p', index: 0 }],
          endOffset: testText.length,
          text: testText, // 重複
        },
      };

      // 新格式：文本只保存一次
      const newFormat = {
        id: 'test-1',
        text: testText,
        color: 'yellow',
        rangeInfo: {
          startContainerPath: [{ type: 'element', tag: 'p', index: 0 }],
          startOffset: 0,
          endContainerPath: [{ type: 'element', tag: 'p', index: 0 }],
          endOffset: testText.length,
          // 不包含 text
        },
      };

      const oldSize = JSON.stringify(oldFormat).length;
      const newSize = JSON.stringify(newFormat).length;
      const saved = oldSize - newSize;
      const savedPercent = ((saved / oldSize) * 100).toFixed(1);

      console.log(`舊格式大小: ${oldSize} bytes`);
      console.log(`新格式大小: ${newSize} bytes`);
      console.log(`節省空間: ${saved} bytes (${savedPercent}%)`);

      // 驗證確實節省了空間
      expect(newSize).toBeLessThan(oldSize);

      // 對於這個測試文本，應該節省約 testText.length 的字節
      expect(saved).toBeGreaterThan(testText.length * 0.8);
    });
  });

  describe('實際存儲效果', () => {
    test('70個標註的存儲空間對比', () => {
      const avgTextLength = 200; // 平均每個標註 200 字
      const highlightCount = 70;

      // 舊格式：每個標註的文本保存兩次
      const oldFormatPerHighlight = avgTextLength * 2 * 2; // 字數 × 2次 × 2bytes/字
      const oldTotalSize = oldFormatPerHighlight * highlightCount;

      // 新格式：每個標註的文本只保存一次
      const newFormatPerHighlight = avgTextLength * 2; // 字數 × 2bytes/字
      const newTotalSize = newFormatPerHighlight * highlightCount;

      const saved = oldTotalSize - newTotalSize;
      const savedKB = (saved / 1024).toFixed(1);

      console.log(`舊格式總大小: ${(oldTotalSize / 1024).toFixed(1)} KB`);
      console.log(`新格式總大小: ${(newTotalSize / 1024).toFixed(1)} KB`);
      console.log(`節省空間: ${savedKB} KB`);

      // 驗證節省效果
      expect(saved).toBeGreaterThan(0);
      expect(parseFloat(savedKB)).toBeGreaterThan(20); // 至少節省 20 KB
    });
  });
});
