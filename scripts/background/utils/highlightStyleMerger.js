/**
 * Highlight Style Merger
 *
 * 在 Notion blocks 構建後、發送 API 前，
 * 根據用戶設定將標註文字套用指定樣式到原文內容中。
 *
 * 僅在首次保存時調用（由 processContentResult 觸發）。
 *
 * @module background/utils/highlightStyleMerger
 */

/* global Logger */

import { HIGHLIGHT_COLOR_WHITELIST } from '../../config/constants.js';

// ============================================================================
// 常量定義
// ============================================================================

/**
 * 合法的標註顏色白名單
 *
 * @type {Set<string>}
 */
const VALID_HIGHLIGHT_COLORS = new Set(HIGHLIGHT_COLOR_WHITELIST);

/**
 * 用戶設定的樣式選項
 *
 * COLOR_SYNC 為特殊值：根據每個 highlight 的 color 動態生成對應背景色。
 * BOLD 套用粗體。
 * NONE 不處理（功能關閉）。
 *
 * @type {object}
 */
const HIGHLIGHT_STYLE_OPTIONS = {
  COLOR_SYNC: 'COLOR_SYNC',
  COLOR_TEXT: 'COLOR_TEXT',
  BOLD: { bold: true },
  NONE: null,
};

// ============================================================================
// 內部輔助函數
// ============================================================================

/**
 * 創建 Notion rich_text 物件
 *
 * @param {string} content - 文字內容
 * @param {object} annotations - Notion annotation 物件
 * @returns {object} rich_text 物件
 */
function createRichText(content, annotations) {
  return {
    type: 'text',
    text: { content },
    annotations: { ...annotations },
  };
}

/**
 * 根據 styleKey 和 highlight 數據獲取實際的 Notion annotation 樣式
 *
 * @param {string} styleKey - 用戶選擇的樣式類型（'COLOR_SYNC' | 'BOLD' | 'NONE'）
 * @param {{ text: string, color: string, rangeInfo?: object }} highlight - 標註數據
 * @returns {object|null} Notion annotation 物件，或 null（關閉時）
 */
function resolveStyle(styleKey, highlight) {
  if (styleKey === HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC) {
    const rawColor = highlight.color || 'yellow';
    // 白名單驗證：不合法的顏色回退到 yellow
    const color = VALID_HIGHLIGHT_COLORS.has(rawColor) ? rawColor : 'yellow';
    return { color: `${color}_background` };
  }
  if (styleKey === HIGHLIGHT_STYLE_OPTIONS.COLOR_TEXT) {
    const rawColor = highlight.color || 'yellow';
    // 白名單驗證：文字顏色同樣回退到 yellow
    const color = VALID_HIGHLIGHT_COLORS.has(rawColor) ? rawColor : 'yellow';
    return { color };
  }
  return HIGHLIGHT_STYLE_OPTIONS[styleKey] || null;
}

// ============================================================================
// 消歧義輔助
// ============================================================================

/**
 * 計算單一候選位置的 prefix/suffix 比對分數
 *
 * 分數規則：
 * - prefix 完全匹配：+2 分；尾部 10 字符部分匹配：+1 分
 * - suffix 完全匹配：+2 分；首部 10 字符部分匹配：+1 分
 *
 * @param {string} fullText - 拼接後的純文本
 * @param {number} idx - 候選位置索引
 * @param {string} text - 標註文字
 * @param {string} prefix - 消歧義前綴
 * @param {string} suffix - 消歧義後綴
 * @returns {number} 比對分數
 */
function scoreCandidate(fullText, idx, text, prefix, suffix) {
  let score = 0;

  if (prefix) {
    const actualPrefix = fullText.slice(Math.max(0, idx - prefix.length), idx);
    if (actualPrefix.endsWith(prefix)) {
      score += 2;
    } else if (actualPrefix.endsWith(prefix.slice(-10))) {
      score += 1;
    }
  }

  if (suffix) {
    const actualSuffix = fullText.slice(idx + text.length, idx + text.length + suffix.length);
    if (actualSuffix.startsWith(suffix)) {
      score += 2;
    } else if (actualSuffix.startsWith(suffix.slice(0, 10))) {
      score += 1;
    }
  }

  return score;
}

// ============================================================================
// 核心算法
// ============================================================================

/**
 * 使用 prefix/suffix 上下文在 block 的完整純文本中精確定位標註
 *
 * 策略：先拼接整個 block 的 rich_text 為純文本，再用 prefix/suffix 計分消歧義。
 * 唯一匹配直接返回，多個匹配取最高分候選，相同分數回退到第一個。
 *
 * @param {Array<{text: {content: string}, annotations: object}>} richTextArray - block 的 rich_text 陣列
 * @param {{ text: string, rangeInfo?: { prefix?: string, suffix?: string } }} highlight - 標註數據
 * @param {string} fullText - 拼接後的純文本（必填）
 * @returns {number} 匹配到的字符偏移量（在拼接純文本中），-1 表示未找到
 */
function findHighlightPosition(richTextArray, highlight, fullText) {
  if (!Array.isArray(richTextArray)) {
    return -1;
  }
  if (typeof fullText !== 'string') {
    throw new TypeError('[HighlightMerger] fullText is required');
  }

  const { text, rangeInfo } = highlight;
  if (!text || fullText.length === 0) {
    return -1;
  }

  const prefix = rangeInfo?.prefix || '';
  const suffix = rangeInfo?.suffix || '';

  // 2. 找出所有匹配位置
  const candidates = [];
  let searchStart = 0;
  while (searchStart < fullText.length) {
    const idx = fullText.indexOf(text, searchStart);
    if (idx === -1) {
      break;
    }
    candidates.push(idx);
    searchStart = idx + 1;
  }

  if (candidates.length === 0) {
    return -1;
  }
  if (candidates.length === 1) {
    return candidates[0]; // 唯一匹配，無需消歧義
  }

  // 3. prefix/suffix 計分消歧義：取最高分的候選
  let bestIdx = candidates[0]; // 回退：第一個
  let bestScore = -1;

  for (const idx of candidates) {
    const score = scoreCandidate(fullText, idx, text, prefix, suffix);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }

  return bestIdx;
}

/**
 * 處理單個 rich_text 片段中與 match 的交集部分
 *
 * @param {string} text - 當前片段的文字內容
 * @param {object} baseAnnotations - 當前片段的原有樣式
 * @param {object} match - 當前匹配 { start, end, highlight }
 * @param {number} segStart - 當前片段在拼接文本中的起始位置
 * @param {number} localCursor - 片段內的游標位置
 * @param {string} styleKey - 樣式鍵
 * @returns {{ parts: Array<object>, newCursor: number }} 新增的 rich_text 片段與更新後的游標
 */
function processMatchInSegment(text, baseAnnotations, match, segStart, localCursor, styleKey) {
  const parts = [];
  const overlapStart = Math.max(match.start - segStart, localCursor);
  const overlapEnd = Math.min(match.end - segStart, text.length);

  // 前段（未標註部分）
  if (overlapStart > localCursor) {
    parts.push(createRichText(text.slice(localCursor, overlapStart), baseAnnotations));
  }

  // 標註段（帶樣式）
  const style = resolveStyle(styleKey, match.highlight);
  parts.push(
    createRichText(text.slice(overlapStart, overlapEnd), { ...baseAnnotations, ...style })
  );

  return { parts, newCursor: overlapEnd };
}

/**
 * 處理單個 rich_text 片段（用於 splitRichTextByMatches）
 *
 * @param {string} text - 當前片段的文字內容
 * @param {object} baseAnnotations - 當前片段的原有樣式
 * @param {number} segStart - 當前片段在拼接文本中的起始位置
 * @param {Array<{start: number, end: number, highlight: object}>} matches - 排序後的匹配陣列
 * @param {{ idx: number }} state - 可變狀態物件，持有當前 matchIdx
 * @param {string} styleKey - 樣式鍵
 * @returns {Array<object>} 此片段產生的 rich_text 陣列
 */
function processSegment(text, baseAnnotations, segStart, matches, state, styleKey) {
  const segEnd = segStart + text.length;
  const parts = [];
  let localCursor = 0;

  while (state.idx < matches.length) {
    const match = matches[state.idx];

    if (match.start >= segEnd) {
      break; // 此 match 在後面的片段中
    }

    if (match.end <= segStart + localCursor) {
      state.idx++;
      continue; // 已處理完的 match
    }

    const { parts: newParts, newCursor } = processMatchInSegment(
      text,
      baseAnnotations,
      match,
      segStart,
      localCursor,
      styleKey
    );

    for (const part of newParts) {
      parts.push(part);
    }
    localCursor = newCursor;

    if (match.end <= segEnd) {
      state.idx++;
    } else {
      break; // match 延伸到下一個片段
    }
  }

  // 片段尾段（未被任何 match 覆蓋的部分）
  if (localCursor < text.length) {
    parts.push(createRichText(text.slice(localCursor), baseAnnotations));
  }

  return parts;
}

/**
 * 跨 rich_text 片段的分割與樣式套用
 *
 * 遍歷每個 rich_text 片段，根據字符偏移量判斷匹配是否落在當前片段內。
 * 若匹配跨越多個片段邊界，在邊界處切割並分別套用樣式。
 *
 * @param {Array<{text: {content: string}, annotations: object}>} richTextArray - block 的 rich_text 陣列
 * @param {Array<{start: number, end: number, highlight: object}>} matches - 排序後的匹配位置陣列
 * @param {string} styleKey - 樣式鍵
 * @returns {Array<object>} 新的 rich_text 陣列
 */
function splitRichTextByMatches(richTextArray, matches, styleKey) {
  const result = [];
  let globalOffset = 0;
  const state = { idx: 0 }; // 共享 matchIdx 狀態

  for (const rt of richTextArray) {
    const text = rt.text.content;
    const baseAnnotations = rt.annotations || {};
    const parts = processSegment(text, baseAnnotations, globalOffset, matches, state, styleKey);
    for (const part of parts) {
      result.push(part);
    }
    globalOffset += text.length;
  }

  return result;
}

/**
 * 在單個 block 上套用標註樣式
 *
 * @param {object} block - Notion block 物件
 * @param {Array<{text: string, color: string, rangeInfo?: object}>} highlights - 標註數據
 * @param {string} styleKey - 樣式鍵
 * @returns {object} 處理後的 block
 */
function applyHighlightsToBlock(block, highlights, styleKey) {
  const richTextArray = block[block.type]?.rich_text;
  if (!richTextArray || richTextArray.length === 0) {
    return block;
  }

  const fullText = richTextArray.map(rt => rt.text.content).join('');

  // 收集所有在此 block 中匹配的標註位置（block 層級操作）
  const matches = [];
  for (const hl of highlights) {
    const pos = findHighlightPosition(richTextArray, hl, fullText);
    if (pos !== -1) {
      matches.push({ start: pos, end: pos + hl.text.length, highlight: hl });
    }
  }

  if (matches.length === 0) {
    return block;
  }

  // 排序後跨片段分割套用樣式
  matches.sort((matchA, matchB) => matchA.start - matchB.start);
  const newRichText = splitRichTextByMatches(richTextArray, matches, styleKey);

  return {
    ...block,
    [block.type]: { ...block[block.type], rich_text: newRichText },
  };
}

// ============================================================================
// 主入口函數
// ============================================================================

/**
 * 將標註樣式合併到 Notion blocks（僅首次保存時調用）
 *
 * 核心策略：block 層級「先拼後找」
 * 1. 拼接整個 block 的 rich_text 為純文本
 * 2. 用 findHighlightPosition (prefix/suffix) 在純文本中定位標註
 * 3. 將匹配位置映射回 rich_text 片段，支援跨片段分割
 *
 * 降級安全：任何錯誤均不阻斷保存流程
 * - 單個 block 失敗：保留原始 block
 * - 整體失敗：返回原始 blocks
 *
 * @param {Array<object>} blocks - Notion API 格式的區塊陣列
 * @param {Array<{text: string, color: string, rangeInfo?: object}>} highlights - 標註數據陣列
 * @param {string} [styleKey='COLOR_SYNC'] - 樣式鍵（'COLOR_SYNC' | 'BOLD' | 'NONE'）
 * @returns {Array<object>} 處理後的區塊陣列
 */
function mergeHighlightsWithStyle(blocks, highlights, styleKey = 'COLOR_SYNC') {
  // 快速退出：功能關閉或無標註
  if (styleKey === 'NONE' || !highlights?.length || !blocks?.length) {
    return blocks;
  }

  try {
    return blocks.map(block => {
      try {
        return applyHighlightsToBlock(block, highlights, styleKey);
      } catch {
        return block; // 單個 block 失敗：保留原始
      }
    });
  } catch (error) {
    if (typeof Logger !== 'undefined') {
      Logger.warn('[HighlightMerger] 標註樣式合併失敗，使用原始模式:', error);
    }
    return blocks; // 整體失敗：降級為原始 blocks
  }
}

// ============================================================================
// 模組導出
// ============================================================================

export {
  // 主入口
  mergeHighlightsWithStyle,

  // 測試用（內部函數）
  findHighlightPosition,
  splitRichTextByMatches,
  resolveStyle,
  createRichText,
  scoreCandidate,

  // 常量
  VALID_HIGHLIGHT_COLORS,
  HIGHLIGHT_STYLE_OPTIONS,
};
