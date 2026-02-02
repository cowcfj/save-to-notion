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
    this.buffer = [];
  }

  /**
   * 添加一條日誌記錄
   * @param {Object} entry - 日誌對象
   */
  push(entry) {
    // 如果緩衝區已滿，移除最舊的（第一個）
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
    }

    // 確保有時間戳
    const entryWithTimestamp = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.buffer.push(entryWithTimestamp);
  }

  /**
   * 獲取所有日誌記錄的副本
   * @returns {Array<Object>} 按時間排序的日誌陣列
   */
  getAll() {
    // 返回淺拷貝，防止外部修改影響緩衝區
    // deep clone 開銷太大，且日誌通常不會被修改，淺拷貝 + 對象重建在 push 時通常足夠
    // 為了更安全，這裡做一個簡單的 map copy
    return this.buffer.map(entry => ({ ...entry }));
  }

  /**
   * 清空緩衝區
   */
  clear() {
    this.buffer = [];
  }

  /**
   * 獲取緩衝區統計信息
   * @returns {Object} { count, capacity, oldest, newest }
   */
  getStats() {
    const count = this.buffer.length;
    let oldest = null;
    let newest = null;

    if (count > 0) {
      oldest = this.buffer[0].timestamp;
      newest = this.buffer[count - 1].timestamp;
    }

    return {
      count,
      capacity: this.capacity,
      oldest,
      newest,
    };
  }
}
