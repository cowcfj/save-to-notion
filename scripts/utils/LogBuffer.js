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

// [Saturation Protection - issue #533]
// 同 fingerprint 的 buffer-resident 條目達 SUPPRESS_THRESHOLD 後改為更新既有條目 repeatCount。
// 達 ANOMALY_THRESHOLD 時 emit 一次 [ANOMALY] warn 條目；FIFO 驅逐到無同 fingerprint 條目時重置。
const SUPPRESS_THRESHOLD = 10;
const ANOMALY_THRESHOLD = 30;
const ANOMALY_MESSAGE_TRUNCATE = 200;

/**
 * 計算 entry 指紋。
 *
 * 使用 JSON.stringify([message, action]) 序列化 message 與 context.action 組成的 tuple,
 * 利用 JSON 的字串逸出語法消除分隔字元歧義 — 例如 message="a::" + action="b" 與
 * message="a" + action="::b" 在拼接式 fingerprint 下會碰撞,改成 JSON tuple 後可清楚區分。
 *
 * @param {object} entry - 日誌條目
 * @returns {string} fingerprint
 */
function generateFingerprint(entry) {
  return JSON.stringify([entry.message ?? '', entry.context?.action ?? '']);
}

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

    // [Saturation Protection] fingerprint 追蹤狀態（issue #533）
    this._fingerprintCounts = new Map(); // fp -> 當前實際 slot 數
    this._lastIndexByFingerprint = new Map(); // fp -> 最後寫入該 fp 的 buffer index
    this._anomalyEmitted = new Set(); // 已 emit 過 anomaly 的 fp

    // [Session Persistence] flush 判斷用
    this._dirty = false;

    // [Session Persistence] restore gate：restore 期間暫存 push 呼叫
    this._restoring = false;
    this._pendingWrites = [];
  }

  /**
   * 添加一條日誌記錄。當同一 fingerprint 在 buffer 中累計達 SUPPRESS_THRESHOLD 後，
   * 後續同 fingerprint 條目改為遞增既有條目的 context.repeatCount，不再消耗新 slot。
   *
   * 註：fingerprint 必須由最終 entryToStore（經 needsSizeCheck / _processOversizedEntry 處理後）
   * 衍生，以避免「SUPPRESS 檢查用原始 fp、計數累積在截斷後 fp」造成的 key split。
   *
   * @param {object} entry - 日誌對象
   */
  push(entry) {
    if (this._restoring) {
      this._pendingWrites.push(entry);
      return;
    }

    let entryToStore = { ...entry };

    // [Performance Optimization] 僅在需要時執行完整序列化檢查
    if (needsSizeCheck(entry)) {
      entryToStore = this._processOversizedEntry(entry, entryToStore);
    }

    const fp = generateFingerprint(entryToStore);
    const slotCount = this._fingerprintCounts.get(fp) ?? 0;

    if (slotCount >= SUPPRESS_THRESHOLD) {
      this._handleSuppressedPush(fp, entry);
      return;
    }

    this._writeRawEntry(entryToStore, fp);
    this._dirty = true;
  }

  /**
   * 將 entry 寫入 buffer slot 並維護 FIFO + fingerprint 計數。
   * 不執行 fingerprint 抑制檢查，供 push() happy path 與 _emitAnomaly 共用。
   *
   * @param {object} entryToStore - 已完成大小檢查的條目
   * @param {string} [fp] - 已預算好的 fingerprint；省略時由 entryToStore 重新計算
   *   （anomaly 路徑沒有預算 fp）
   * @private
   */
  _writeRawEntry(entryToStore, fp) {
    const writeIndex = (this.head + this.size) % this.capacity;
    const isFull = this.size === this.capacity;

    if (isFull) {
      const evictedFp = generateFingerprint(this.buffer[writeIndex]);
      this._handleEviction(evictedFp);
    }

    this.buffer[writeIndex] = entryToStore;

    if (this.size < this.capacity) {
      this.size++;
    } else {
      // 緩衝區已滿，覆蓋了最舊的，head 往前移
      this.head = (this.head + 1) % this.capacity;
    }

    const newFp = fp ?? generateFingerprint(entryToStore);
    this._fingerprintCounts.set(newFp, (this._fingerprintCounts.get(newFp) ?? 0) + 1);
    this._lastIndexByFingerprint.set(newFp, writeIndex);
  }

  /**
   * 抑制路徑：fingerprint 已達 SUPPRESS_THRESHOLD 時，更新最後一條同 fp 條目的 repeatCount，
   * 不寫入新 slot。當 repeatCount 首次達 ANOMALY_THRESHOLD 時 emit 一條 [ANOMALY] warn。
   *
   * @param {string} fp - 指紋
   * @param {object} originalEntry - 原始日誌對象（用於 anomaly 引用）
   * @private
   */
  _handleSuppressedPush(fp, originalEntry) {
    const lastIdx = this._lastIndexByFingerprint.get(fp);
    const lastEntry = this.buffer[lastIdx];
    const slotCount = this._fingerprintCounts.get(fp);
    const currentRepeat = lastEntry.context?.repeatCount ?? slotCount;
    const newRepeat = currentRepeat + 1;

    lastEntry.context = {
      ...lastEntry.context,
      repeatCount: newRepeat,
    };
    this._dirty = true;

    if (newRepeat === ANOMALY_THRESHOLD && !this._anomalyEmitted.has(fp)) {
      this._anomalyEmitted.add(fp);
      this._emitAnomaly(originalEntry, newRepeat);
    }
  }

  /**
   * Emit 一條 [ANOMALY] warn 條目記錄迴圈訊息。透過 _writeRawEntry 寫入，
   * 不經 push() 的 fingerprint 抑制路徑（anomaly 自身的 fp 與被觀察 fp 不同）。
   *
   * [Memory Safety] _writeRawEntry 不做 size check，因此這裡 MUST 使用已截斷的
   * `truncated` 作為 context.repeatedMessage，避免大 message 透過 anomaly entry
   * 繞過 MAX_ENTRY_SIZE 邊界。不可改回 originalEntry?.message。
   *
   * @param {object} originalEntry - 觸發 anomaly 的原始條目
   * @param {number} count - 已累計的 repeatCount
   * @private
   */
  _emitAnomaly(originalEntry, count) {
    const truncated = truncateMessage(
      String(originalEntry?.message ?? ''),
      ANOMALY_MESSAGE_TRUNCATE
    );
    this._writeRawEntry({
      level: 'warn',
      source: originalEntry?.source ?? 'unknown',
      message: `[ANOMALY] message looped ${count}× in buffer: "${truncated}"`,
      context: {
        anomaly: true,
        repeatedMessage: truncated,
        repeatedAction: originalEntry?.context?.action,
        repeatCount: count,
      },
    });
  }

  /**
   * 處理 FIFO 驅逐：遞減 evictedFp 的計數。
   * 若 evictedFp 在 buffer 中已無任何 slot，清理對應 anomaly state，允許未來重新觸發 anomaly。
   *
   * 不變式：lastIndexByFingerprint 永遠指向最新 slot，FIFO eviction 永遠發生在最舊 slot
   * （= head）。同 fp 的最後一個 slot 必為最舊一個，因此 lastIndex 被驅逐時 count 必同時降為 0
   * 走 early-cleanup 分支；不需要修補 lastIndex。
   *
   * @param {string} evictedFp - 被驅逐條目的指紋
   * @private
   */
  _handleEviction(evictedFp) {
    const newCount = this._fingerprintCounts.get(evictedFp) - 1;
    if (newCount <= 0) {
      this._fingerprintCounts.delete(evictedFp);
      this._lastIndexByFingerprint.delete(evictedFp);
      this._anomalyEmitted.delete(evictedFp);
      return;
    }
    this._fingerprintCounts.set(evictedFp, newCount);
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
    this._fingerprintCounts.clear();
    this._lastIndexByFingerprint.clear();
    this._anomalyEmitted.clear();
    this._dirty = true;
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

  isDirty() {
    return this._dirty;
  }

  markClean() {
    this._dirty = false;
  }

  /**
   * 標記即將進行 restore，期間 push() 暫存到 pending queue。
   */
  prepareRestore() {
    this._restoring = true;
  }

  /**
   * 從外部資料恢復 buffer 狀態（用於 session persistence restore）。
   * 先重置 buffer，再寫入快照，最後 flush 任何 restore 期間暫存的 pending writes。
   *
   * @param {Array<object>} entries - 先前 getAll() 的快照
   */
  restoreFrom(entries) {
    if (!Array.isArray(entries)) {
      this._restoring = false;
      this._drainPendingWrites();
      return;
    }
    this.clear();
    for (const entry of entries) {
      this.push(entry);
    }
    this._dirty = false;
    this._restoring = false;
    this._drainPendingWrites();
  }

  /** @private */
  _drainPendingWrites() {
    const pending = this._pendingWrites;
    this._pendingWrites = [];
    for (const entry of pending) {
      this.push(entry);
    }
  }
}
