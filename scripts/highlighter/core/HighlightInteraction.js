/**
 * HighlightInteraction - 用戶交互處理
 *
 * 從 HighlightManager 抽取的交互相關邏輯
 * 負責處理點擊事件、檢測點擊位置是否在標註內
 *
 * @version 2.19.0
 */

/**
 * HighlightInteraction
 * 處理用戶與標註的交互行為
 */
export class HighlightInteraction {
  /**
   * @param {Object} manager - HighlightManager 實例（需要具備 highlights Map 和 removeHighlight 方法）
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
   * @param {number} x - X 座標
   * @param {number} y - Y 座標
   * @returns {string|null} 標註 ID 或 null
   */
  getHighlightAtPoint(x, y) {
    try {
      let range = null;

      // 使用 caretRangeFromPoint (Chrome/Safari) 或 caretPositionFromPoint (Firefox)
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.setEnd(pos.offsetNode, pos.offset);
        }
      }

      if (!range) {
        return null;
      }

      // 遍歷所有標註，檢查是否與點擊位置重疊
      for (const [id, highlight] of this.manager.highlights.entries()) {
        if (highlight.range && HighlightInteraction.rangesOverlap(range, highlight.range)) {
          return id;
        }
      }

      return null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * 檢測兩個 Range 是否重疊
   * @param {Range} range1 - 第一個 Range
   * @param {Range} range2 - 第二個 Range
   * @returns {boolean} 是否重疊
   */
  static rangesOverlap(range1, range2) {
    try {
      return (
        range1.isPointInRange(range2.startContainer, range2.startOffset) ||
        range1.isPointInRange(range2.endContainer, range2.endOffset) ||
        range2.isPointInRange(range1.startContainer, range1.startOffset)
      );
    } catch {
      return false;
    }
  }
}
