/**
 * HighlightManager Testable 版本
 * 注意：由於 HighlightManager 依賴許多瀏覽器 API 和全域對象，
 * 此版本主要用於基礎邏輯測試
 */

// 更新導入：使用源代碼替代已刪除的 testable 文件
const { serializeRange } = require('../core/Range.testable.js');
const { COLORS } = require('../../../../scripts/highlighter/utils/color.js');
const { supportsHighlightAPI } = require('../../../../scripts/highlighter/utils/dom.js');

class HighlightManager {
  constructor(options = {}) {
    this.highlights = new Map();
    this.nextId = 1;
    this.currentColor = options.defaultColor || 'yellow';
    this.colors = COLORS;
    this.highlightObjects = {};
    this.initializationComplete = null;
  }

  static initialize() {
    // 簡化版本，僅用於測試
    return Promise.resolve();
  }

  initializeHighlightStyles() {
    if (typeof Highlight === 'undefined' || !CSS?.highlights) {
      return;
    }

    Object.keys(this.colors).forEach(colorName => {
      try {
        this.highlightObjects[colorName] = new Highlight();
        CSS.highlights.set(`notion-${colorName}`, this.highlightObjects[colorName]);
      } catch {
        // 忽略錯誤
      }
    });
  }

  injectHighlightStyles() {
    if (document.querySelector('#notion-highlight-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'notion-highlight-styles';
    style.textContent = Object.entries(this.colors)
      .map(
        ([colorName, bgColor]) => `
                ::highlight(notion-${colorName}) {
                    background-color: ${bgColor};
                    cursor: pointer;
                }
            `
      )
      .join('\n');
    document.head.appendChild(style);
  }

  addHighlight(range, color = this.currentColor) {
    if (!range || range.collapsed) {
      return null;
    }

    const text = range.toString().trim();
    if (!text) {
      return null;
    }

    let id = `h${this.nextId++}`;
    while (this.highlights.has(id)) {
      id = `h${this.nextId++}`;
    }

    const highlightData = {
      id,
      range: range.cloneRange(),
      color,
      text,
      timestamp: Date.now(),
      rangeInfo: serializeRange(range),
    };

    this.highlights.set(id, highlightData);

    if (supportsHighlightAPI()) {
      this.applyHighlightAPI(id, range, color);
    }

    return id;
  }

  applyHighlightAPI(id, range, color) {
    if (this.highlightObjects[color]) {
      this.highlightObjects[color].add(range);
    }
  }

  removeHighlight(id) {
    const highlightData = this.highlights.get(id);
    if (!highlightData) {
      return false;
    }

    if (supportsHighlightAPI()) {
      const color = highlightData.color;
      if (this.highlightObjects[color] && highlightData.range) {
        this.highlightObjects[color].delete(highlightData.range);
      }
    }

    this.highlights.delete(id);
    return true;
  }

  clearAll() {
    if (supportsHighlightAPI()) {
      Object.values(this.highlightObjects).forEach(highlight => highlight.clear());
    }
    this.highlights.clear();
  }

  getHighlightAtPoint(x, y) {
    try {
      let range = null;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);
      }

      if (!range) {
        return null;
      }

      for (const [id, highlight] of this.highlights.entries()) {
        if (HighlightManager.rangesOverlap(range, highlight.range)) {
          return id;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

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

  handleDocumentClick(event) {
    if (!(event.ctrlKey || event.metaKey)) {
      return false;
    }

    const highlightId = this.getHighlightAtPoint(event.clientX, event.clientY);
    if (highlightId) {
      event.preventDefault();
      event.stopPropagation();
      this.removeHighlight(highlightId);
      return true;
    }

    return false;
  }

  setColor(color) {
    if (this.colors[color]) {
      this.currentColor = color;
    }
  }

  getCount() {
    return this.highlights.size;
  }

  static convertBgColorToName(bgColor) {
    const colorMap = {
      'rgb(255, 243, 205)': 'yellow',
      '#fff3cd': 'yellow',
      'rgb(212, 237, 218)': 'green',
      '#d4edda': 'green',
      'rgb(204, 231, 255)': 'blue',
      '#cce7ff': 'blue',
      'rgb(248, 215, 218)': 'red',
      '#f8d7da': 'red',
    };

    return colorMap[bgColor] || 'yellow';
  }

  collectHighlightsForNotion() {
    return Array.from(this.highlights.values()).map(highlight => ({
      text: highlight.text,
      color: highlight.color,
      timestamp: highlight.timestamp,
    }));
  }

  cleanup() {
    this.clearAll();

    if (typeof CSS !== 'undefined' && CSS?.highlights) {
      Object.keys(this.highlightObjects).forEach(color => {
        CSS.highlights.delete(`notion-${color}`);
      });
    }

    const styleEl = document.querySelector('#notion-highlight-styles');
    if (styleEl) {
      styleEl.remove();
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    HighlightManager,
  };
}
