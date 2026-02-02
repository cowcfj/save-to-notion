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
 */
export class LogBuffer {
  /**
   * @param {number} capacity - 緩衝區最大容量 (預設 500)
   */
  constructor(capacity = 500) {
    // 確保容量為正整數
    this.capacity = Math.max(1, Math.floor(capacity));
    this.buffer = new Array(this.capacity);
    this.head = 0; // 指向最舊記錄的索引
    this.size = 0; // 當前記錄數量
  }

  /**
   * 添加一條日誌記錄
   * @param {Object} entry - 日誌對象
   */
  push(entry) {
    // 確保有時間戳
    // 確保有時間戳
    const timestamp = entry.timestamp || new Date().toISOString();
    const entryWithTimestamp = {
      ...entry,
      timestamp,
    };

    // 計算寫入位置：(head + size) % capacity
    // 假如滿了，(head + size) 會剛好指回 head 所在位置，進行覆蓋
    const writeIndex = (this.head + this.size) % this.capacity;

    this.buffer[writeIndex] = entryWithTimestamp;

    if (this.size < this.capacity) {
      this.size++;
    } else {
      // 緩衝區已滿，覆蓋了最舊的，head 往前移
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * 獲取所有日誌記錄的副本
   * @returns {Array<Object>} 按時間排序的日誌陣列
   */
  getAll() {
    const result = new Array(this.size);
    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.capacity;
      // 返回淺拷貝
      result[i] = { ...this.buffer[index] };
    }
    return result;
  }

  /**
   * 清空緩衝區
   */
  clear() {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.size = 0;
  }

  /**
   * 獲取緩衝區統計信息
   * @returns {Object} { count, capacity, oldest, newest }
   */
  getStats() {
    let oldest = null;
    let newest = null;

    if (this.size > 0) {
      oldest = this.buffer[this.head].timestamp;
      const newestIndex = (this.head + this.size - 1) % this.capacity;
      newest = this.buffer[newestIndex].timestamp;
    }

    return {
      count: this.size,
      capacity: this.capacity,
      oldest,
      newest,
    };
  }
}
