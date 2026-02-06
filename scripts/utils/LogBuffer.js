/**
 * LogBuffer
 *
 * 一個簡單的環形緩衝區 (Circular Buffer / Ring Buffer) 實作，
 * 用於在記憶體中暫存最新的 N 條日誌。
 *
 * 特性：
 * -固定容量 (Fixed Capacity)
 * -先進先出 (FIFO)：當緩衝區滿時，自動移除最舊的記錄
 * -防禦性拷貝：導出數據時返回副本
 * -不處理時間戳：FIFO 結構已隱含時間順序
 */
export class LogBuffer {
  /**
   * @param {number} capacity - 緩衝區最大容量 (預設 500)
   */
  constructor(capacity = 500) {
    // 確保容量為正整數
    this.capacity = Math.max(1, Math.floor(capacity));
    this.buffer = Array.from({ length: this.capacity });
    this.head = 0; // 指向最舊記錄的索引
    this.size = 0; // 當前記錄數量
  }

  /**
   * 添加一條日誌記錄
   *
   * @param {object} entry - 日誌對象
   */
  push(entry) {
    let entryToStore = { ...entry };

    // [Memory Safety] 檢查單條日誌大小
    // 簡單估算：JSON序列化長度。限制為 25KB (約 25000 字符)
    const MAX_ENTRY_SIZE = 25_000;

    try {
      const serialized = JSON.stringify(entryToStore);
      if (serialized.length > MAX_ENTRY_SIZE) {
        // 如果過大，移除 context 並標記
        entryToStore = {
          level: entry.level,
          message: entry.message,
          source: entry.source,
          context: {
            truncated: true,
            reason: 'entry_exceeds_size_limit',
            originalSize: serialized.length,
          },
        };
      }
    } catch {
      // 序列化失敗
      entryToStore = {
        ...entryToStore,
        context: {
          error: 'serialization_failed_during_size_check',
        },
      };
    }

    // 計算寫入位置：(head + size) % capacity
    // 假如滿了，(head + size) 會剛好指回 head 所在位置，進行覆蓋
    const writeIndex = (this.head + this.size) % this.capacity;

    this.buffer[writeIndex] = entryToStore;

    if (this.size < this.capacity) {
      this.size++;
    } else {
      // 緩衝區已滿，覆蓋了最舊的，head 往前移
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * 獲取所有日誌記錄的副本
   *
   * @returns {Array<object>} 按時間排序的日誌陣列
   */
  getAll() {
    const result = Array.from({ length: this.size });
    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.capacity;
      // [Security] 返回副本防止外部修改內部 buffer
      // 雖然是淺拷貝，但對於日誌導出用途通常足夠。
      // 若需要完全不可變，需要做 Deep Clone，但考量效能暫時維持淺拷貝
      result[i] = { ...this.buffer[index] };
    }
    return result;
  }

  /**
   * 清空緩衝區
   */
  clear() {
    this.buffer = Array.from({ length: this.capacity });
    this.head = 0;
    this.size = 0;
  }

  /**
   * 獲取緩衝區統計信息
   *
   * @returns {object} { count, capacity }
   */
  getStats() {
    return {
      count: this.size,
      capacity: this.capacity,
    };
  }
}
