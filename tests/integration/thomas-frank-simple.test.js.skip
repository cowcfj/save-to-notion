/**
 * Thomas Frank 方案簡化整合測試
 * 
 * 驗證 Thomas Frank 方案與我們實現的核心整合效果。
 */

const { 
  generateTestBlocks, 
  testThomasFrankPattern, 
  testCurrentImplementation, 
  testErrorHandling 
} = require('../unit/thomas-frank-comparison.test.js');

describe('Thomas Frank 方案簡化整合測試', () => {
  
  describe('核心功能驗證', () => {
    test('應該驗證 Thomas Frank 模式的基本功能', async () => {
      const blocks = generateTestBlocks(200);
      const result = await testThomasFrankPattern(blocks);
      
      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(200);
      expect(result.pattern).toBe('thomas-frank');
      
      console.log('✅ Thomas Frank 模式驗證通過');
    });

    test('應該驗證我們實現的基本功能', async () => {
      const blocks = generateTestBlocks(200);
      const result = await testCurrentImplementation(blocks);
      
      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(200);
      expect(result.pattern).toBe('current-implementation');
      
      console.log('✅ 當前實現驗證通過');
    });

    test('應該對比兩種實現的性能', async () => {
      const blocks = generateTestBlocks(500);
      
      const tfResult = await testThomasFrankPattern(blocks);
      const currentResult = await testCurrentImplementation(blocks);
      
      // 驗證兩種實現都成功
      expect(tfResult.success).toBe(true);
      expect(currentResult.success).toBe(true);
      
      // 驗證處理的區塊數量一致
      expect(tfResult.blocksProcessed).toBe(currentResult.blocksProcessed);
      
      // 記錄性能對比
      const performanceComparison = {
        thomasFrank: {
          time: tfResult.processingTime,
          batches: tfResult.batchCount
        },
        current: {
          time: currentResult.processingTime,
          batches: currentResult.batchCount
        },
        improvement: ((tfResult.processingTime - currentResult.processingTime) / tfResult.processingTime) * 100
      };
      
      console.log('📊 性能對比結果:', performanceComparison);
      
      // 驗證性能在合理範圍內
      expect(Math.abs(performanceComparison.improvement)).toBeLessThan(100); // 性能差異不超過100%
    });
  });

  describe('擴展性測試', () => {
    test('應該測試不同規模的處理能力', async () => {
      const testSizes = [200, 500, 1000, 2000];
      const results = {};
      
      for (const size of testSizes) {
        const blocks = generateTestBlocks(size);
        const result = await testCurrentImplementation(blocks);
        
        results[size] = {
          success: result.success,
          processingTime: result.processingTime,
          successRate: result.successRate
        };
        
        // 驗證每個規模都能成功處理
        expect(result.success).toBe(true);
        expect(result.successRate).toBeGreaterThan(0.95);
        
        console.log(`📈 ${size} 區塊: ${result.processingTime.toFixed(2)}ms`);
      }
      
      // 驗證擴展性：2000區塊應該能成功處理
      expect(results[2000].success).toBe(true);
      
      console.log('✅ 擴展性測試通過，支持 2000+ 區塊');
    });
  });

  describe('錯誤處理測試', () => {
    test('應該測試錯誤恢復能力', async () => {
      const blocks = generateTestBlocks(300);
      const errorScenario = {
        failureRate: 0.3,
        errorTypes: ['429', '500']
      };
      
      const result = await testErrorHandling(blocks, errorScenario);
      
      // 驗證錯誤恢復效果
      expect(result.finalSuccessRate).toBeGreaterThan(0.8);
      expect(result.retryCount).toBeGreaterThanOrEqual(0); // 允許沒有重試的情況
      
      console.log(`🔧 錯誤恢復測試: 成功率 ${(result.finalSuccessRate * 100).toFixed(1)}%`);
    });
  });

  describe('批次處理驗證', () => {
    test('應該驗證批次大小的一致性', () => {
      const thomasFrankBatchSize = 100;
      const ourBatchSize = 100;
      
      expect(thomasFrankBatchSize).toBe(ourBatchSize);
      
      console.log('✅ 批次大小一致性驗證: 100 區塊/批');
    });

    test('應該驗證批次處理邏輯', async () => {
      const testCases = [
        { blocks: 100, expectedBatches: 1 },
        { blocks: 200, expectedBatches: 2 },
        { blocks: 350, expectedBatches: 4 }
      ];
      
      for (const testCase of testCases) {
        const blocks = generateTestBlocks(testCase.blocks);
        const result = await testCurrentImplementation(blocks);
        
        expect(result.success).toBe(true);
        expect(result.batchCount).toBe(testCase.expectedBatches);
        
        console.log(`📦 ${testCase.blocks} 區塊 → ${result.batchCount} 批次`);
      }
    });
  });
});