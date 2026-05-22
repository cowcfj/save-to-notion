/**
 * @jest-environment node
 */

import { pMap } from '../../../scripts/utils/concurrencyUtils.js';

describe('concurrencyUtils', () => {
  describe('pMap', () => {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    test('順序保證：隨機延遲的 worker 其輸出結果的 index 必須與 input 順序對齊', async () => {
      const items = ['A', 'B', 'C', 'D', 'E'];
      const delays = [50, 10, 40, 20, 30];
      const worker = async (item, index) => {
        await delay(delays[index]);
        return `${item}-${index}`;
      };

      const result = await pMap(items, worker, { concurrency: 2 });
      expect(result).toEqual(['A-0', 'B-1', 'C-2', 'D-3', 'E-4']);
    });

    test('並行上限：同時運行的 worker 數量在任何時候都不能超過設定的 concurrency', async () => {
      const items = Array.from({ length: 10 }, (_, i) => i);
      let activeCount = 0;
      let maxActiveCount = 0;
      const concurrency = 3;

      const worker = async item => {
        activeCount++;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        await delay(10);
        activeCount--;
        return item * 2;
      };

      await pMap(items, worker, { concurrency });
      expect(maxActiveCount).toBeLessThanOrEqual(concurrency);
    });

    test('空陣列：若 items 為空陣列，應直接返回空陣列且 worker 不曾被呼叫', async () => {
      let called = false;
      const worker = async () => {
        called = true;
      };

      const result = await pMap([], worker, { concurrency: 3 });
      expect(result).toEqual([]);
      expect(called).toBe(false);
    });

    test('並行大於長度：當 concurrency 大於 items 長度時，能正常運作並返回正確結果', async () => {
      const items = ['X', 'Y'];
      const worker = async item => {
        await delay(5);
        return item.toLowerCase();
      };

      const result = await pMap(items, worker, { concurrency: 10 });
      expect(result).toEqual(['x', 'y']);
    });

    test('並行為 1：串行模式，worker 應循序執行且同一時間 max in-flight = 1', async () => {
      const items = [1, 2, 3];
      const orderOfExecution = [];
      const worker = async item => {
        orderOfExecution.push(`start-${item}`);
        await delay(15);
        orderOfExecution.push(`end-${item}`);
        return item;
      };

      await pMap(items, worker, { concurrency: 1 });
      expect(orderOfExecution).toEqual([
        'start-1',
        'end-1',
        'start-2',
        'end-2',
        'start-3',
        'end-3',
      ]);
    });

    test('Worker 異常（非同步）：若其中一個 item 執行拋錯，pMap 應 reject 並傳播該錯誤', async () => {
      const items = [1, 2, 3, 4];
      const worker = async item => {
        if (item === 3) {
          await delay(5);
          throw new Error('故意拋出的錯誤');
        }
        await delay(10);
        return item;
      };

      await expect(pMap(items, worker, { concurrency: 2 })).rejects.toThrow('故意拋出的錯誤');
    });

    test('Worker 異常（同步）：若 worker 內部同步拋出錯誤，pMap 應 reject 並傳播該錯誤', async () => {
      const items = [1, 2];
      const worker = async item => {
        if (item === 1) {
          throw new Error('同步錯誤');
        }
        return item;
      };

      await expect(pMap(items, worker, { concurrency: 2 })).rejects.toThrow('同步錯誤');
    });

    test('參數驗證：若 items 不是陣列，應拋出 TypeError', async () => {
      const worker = async () => {};
      await expect(pMap(null, worker, { concurrency: 2 })).rejects.toThrow(TypeError);
      await expect(pMap('not-an-array', worker, { concurrency: 2 })).rejects.toThrow(TypeError);
    });

    test('參數驗證：若 concurrency 不是正整數，應拋出 RangeError', async () => {
      const worker = async () => {};
      await expect(pMap([], worker, { concurrency: 0 })).rejects.toThrow(RangeError);
      await expect(pMap([], worker, { concurrency: -1 })).rejects.toThrow(RangeError);
      await expect(pMap([], worker, { concurrency: 1.5 })).rejects.toThrow(RangeError);
    });

    test('Worker 參數：worker callback 應正確接收 index 作為第二參數', async () => {
      const items = ['a', 'b', 'c'];
      const indicesPassed = [];
      const worker = async (item, index) => {
        indicesPassed.push(index);
        return item;
      };

      await pMap(items, worker, { concurrency: 2 });
      expect(indicesPassed).toEqual([0, 1, 2]);
    });
  });
});
