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
// [Memory Safety] 單條日誌最大允許大小 (25KB)
const MAX_ENTRY_SIZE = 25_000;

// 結構開銷常量
const STRUCTURE_OVERHEAD = 300;
const FALLBACK_STRUCTURE_OVERHEAD = 350;

// 標準欄位列表
const STANDARD_FIELDS = new Set(['level', 'message', 'source', 'context']);

/**
 * 截斷訊息至指定長度
 *
 * @param {string} message - 原始訊息
 * @param {number} maxLength - 最大長度
 * @returns {string} 截斷後的訊息
 */
function truncateMessage(message, maxLength) {
  const safeMessage = message == null ? '' : String(message);
  if (safeMessage.length <= maxLength) {
    return safeMessage;
  }
  // 使用模板字串避免 prefer-template 警告
  // ... [截斷] = 8 characters (3 + 1 + 4)
  return `${safeMessage.slice(0, maxLength - 8)}... [截斷]`;
}

/**
 * 判斷日誌條目是否需要進行大小檢查
 *
 * @param {object} entry - 日誌對象
 * @returns {boolean} 是否需要大小檢查
 */
function needsSizeCheck(entry) {
  const hasContext = entry.context && Object.keys(entry.context).length > 0;
  const isLongMessage = (entry.message?.length || 0) > MAX_ENTRY_SIZE / 2;
  const hasExtraData = Object.keys(entry).some(k => !STANDARD_FIELDS.has(k));
  return hasContext || isLongMessage || hasExtraData;
}

/**
 * 創建截斷後的日誌條目
 *
 * @param {object} entry - 原始日誌對象
 * @param {number} originalSize - 原始序列化大小
 * @param {number} structureOverhead - 結構開銷
 * @returns {object} 截斷後的日誌條目
 */
function createTruncatedEntry(entry, originalSize, structureOverhead) {
  const maxMessageLength = Math.max(100, MAX_ENTRY_SIZE - structureOverhead);
  const originalMessage = entry.message || '';
  const needsTruncate = originalMessage.length > maxMessageLength;
  const truncatedMsg = truncateMessage(originalMessage, maxMessageLength);

  return {
    level: truncateMessage(entry.level, 50),
    message: truncatedMsg,
    source: truncateMessage(entry.source, 50),
    context: {
      truncated: true,
      reason: 'entry_exceeds_size_limit',
      originalSize,
      ...(needsTruncate && { originalMessageLength: originalMessage.length }),
    },
  };
}

// reason 欄位最大長度（保守估計，確保回退條目不超限）
const MAX_REASON_LENGTH = 500;

/**
 * 創建序列化失敗時的回退條目
 *
 * @param {object} entry - 原始日誌對象
 * @param {Error|string} error - 序列化錯誤
 * @returns {object} 回退日誌條目
 */
function createSerializationFailedEntry(entry, error) {
  const maxMessageLength = Math.max(
    100,
    MAX_ENTRY_SIZE - FALLBACK_STRUCTURE_OVERHEAD - MAX_REASON_LENGTH
  );
  const originalMessage = entry.message || '';
  const needsTruncate = originalMessage.length > maxMessageLength;
  const truncatedMsg = truncateMessage(originalMessage, maxMessageLength);

  // 截斷 reason 以確保回退條目不超過 MAX_ENTRY_SIZE
  const rawReason = error instanceof Error ? error.message : String(error);
  const reason = truncateMessage(rawReason, MAX_REASON_LENGTH);

  return {
    level: truncateMessage(entry.level, 50),
    message: truncatedMsg,
    source: truncateMessage(entry.source, 50),
    context: {
      error: 'serialization_failed',
      reason,
      ...(needsTruncate && { originalMessageLength: originalMessage.length }),
    },
  };
}

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

    // [Performance Optimization] 僅在需要時執行完整序列化檢查
    if (needsSizeCheck(entry)) {
      entryToStore = this._processOversizedEntry(entry, entryToStore);
    }

    // 計算寫入位置：(head + size) % capacity
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
   * 處理可能過大的日誌條目
   *
   * @param {object} entry - 原始日誌對象
   * @param {object} fallback - 回退對象
   * @returns {object} 處理後的日誌條目
   * @private
   */
  _processOversizedEntry(entry, fallback) {
    try {
      const serialized = JSON.stringify(fallback);
      if (serialized.length > MAX_ENTRY_SIZE) {
        return createTruncatedEntry(entry, serialized.length, STRUCTURE_OVERHEAD);
      }
      return fallback;
    } catch (error) {
      return createSerializationFailedEntry(entry, error);
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
