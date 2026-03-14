/**
 * HighlightInteraction - 用戶交互處理
 *
 * 從 HighlightManager 抽取的交互相關邏輯
 * 負責處理點擊事件、檢測點擊位置是否在標註內
 */

/**
 * HighlightInteraction
 * 處理用戶與標註的交互行為
 */
export class HighlightInteraction {
  /**
   * @param {object} manager - HighlightManager 實例（需要具備 highlights Map 和 removeHighlight 方法）
   */
  constructor(manager) {
    this.manager = manager;
  }

  /**
   * 處理文檔點擊事件
   * 當用戶按住 Ctrl/Cmd 並點擊標註時，刪除該標註
   *
   * @param {MouseEvent} event - 滑鼠事件
   * @returns {boolean} 是否處理了點擊
   */
  handleClick(event) {
    if (!(event.ctrlKey || event.metaKey)) {
      return false;
    }

    const highlightId = this.getHighlightAtPoint(event.clientX, event.clientY);
    if (highlightId) {
      event.preventDefault();
      event.stopPropagation();
      this.manager.removeHighlight(highlightId);
      return true;
    }

    return false;
  }

  /**
   * 檢測點擊位置是否在標註內
   * 透過 Range.getClientRects() 做點位命中判斷
   *
   * @param {number} x - X 座標
   * @param {number} y - Y 座標
   * @returns {string|null} 標註 ID 或 null
   */
  getHighlightAtPoint(x, y) {
    try {
      // 遍歷所有標註，檢查是否與點擊位置重疊
      for (const [id, highlight] of this.manager.highlights.entries()) {
        if (!highlight.range) {
          continue;
        }

        if (HighlightInteraction.isPointInRange(highlight.range, x, y)) {
          return id;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 檢測兩個 Range 是否重疊
   *
   * @param {Range} range1 - 第一個 Range
   * @param {Range} range2 - 第二個 Range
   * @returns {boolean} 是否重疊
   */
  static rangesOverlap(range1, range2) {
    try {
      // compareBoundaryPoints 的方向容易誤讀。以 range1 作為 this 呼叫時：
      // END_TO_START < 0  等價於 range1.end > range2.start
      // START_TO_END > 0  等價於 range1.start < range2.end
      // 因此重疊條件是 < 0 && > 0；若改成 > 0 && < 0 會把結果顛倒。
      return (
        range1.compareBoundaryPoints(Range.END_TO_START, range2) < 0 &&
        range1.compareBoundaryPoints(Range.START_TO_END, range2) > 0
      );
    } catch {
      return false;
    }
  }

  /**
   * 檢查點位是否落在 Range 的任何矩形區塊內
   *
   * @param {Range} range - 目標 Range
   * @param {number} x - X 座標
   * @param {number} y - Y 座標
   * @returns {boolean} 是否命中
   */
  static isPointInRange(range, x, y) {
    try {
      const rects = range.getClientRects();
      for (const rect of rects) {
        if (HighlightInteraction.isPointInRect(rect, x, y)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 檢查點位是否落在單一矩形內
   *
   * @param {DOMRect} rect - 矩形
   * @param {number} x - X 座標
   * @param {number} y - Y 座標
   * @returns {boolean} 是否命中
   */
  static isPointInRect(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }
}
