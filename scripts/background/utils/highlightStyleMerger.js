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

import {
  HIGHLIGHT_COLOR_WHITELIST,
  HIGHLIGHT_MATCH_SCORING,
} from '../../config/highlightConstants.js';

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
  BOLD: 'BOLD',
  NONE: 'NONE',
};

// ============================================================================
// 內部輔助函數
// ============================================================================

/**
 * 取得 highlight 去重鍵：優先使用可用 id，否則回退物件引用
 *
 * @param {object} highlight - 標註數據
 * @returns {string|object} 去重鍵
 */
function getHighlightKey(highlight) {
  const id =
    typeof highlight?.id === 'string' && highlight.id.trim().length > 0 ? highlight.id : null;
  return id ?? highlight;
}

/**
 * 創建 Notion rich_text 物件
 *
 * @param {string} content - 文字內容
 * @param {object} annotations - Notion annotation 物件
 * @returns {object} rich_text 物件
 */
function _createRichText(content, annotations) {
  return {
    type: 'text',
    text: { content },
    annotations: { ...annotations },
  };
}

/**
 * 獲取並驗證 highlight 的顏色，不合法的顏色回退到 yellow
 *
 * @private
 * @param {object} highlight - 標註數據
 * @returns {string} 驗證後的顏色
 */
function resolveHighlightColor(highlight) {
  const rawColor = highlight?.color || 'yellow';
  return VALID_HIGHLIGHT_COLORS.has(rawColor) ? rawColor : 'yellow';
}

/**
 * 根據 styleKey 和 highlight 數據獲取實際的 Notion annotation 樣式
 *
 * @param {string} styleKey - 用戶選擇的樣式類型（'COLOR_SYNC' | 'COLOR_TEXT' | 'BOLD' | 'NONE'）
 * @param {{ text: string, color: string, rangeInfo?: object }} highlight - 標註數據
 * @returns {object|null} Notion annotation 物件，或 null（關閉時）
 */
function resolveStyle(styleKey, highlight) {
  const resolvers = {
    [HIGHLIGHT_STYLE_OPTIONS.COLOR_SYNC]: () => {
      const color = resolveHighlightColor(highlight);
      return { color: `${color}_background` };
    },
    [HIGHLIGHT_STYLE_OPTIONS.COLOR_TEXT]: () => {
      const color = resolveHighlightColor(highlight);
      return { color };
    },
    [HIGHLIGHT_STYLE_OPTIONS.BOLD]: () => ({ bold: true }),
    [HIGHLIGHT_STYLE_OPTIONS.NONE]: () => null,
  };

  const resolver = resolvers[styleKey];
  return resolver ? resolver() : null;
}

// ============================================================================
// 消歧義輔助
// ============================================================================

/**
 * 計算單一候選位置的 prefix/suffix 比對分數
 *
 * 分數規則：
 * - prefix 完全匹配：EXACT_CONTEXT_SCORE；尾部 PARTIAL_CONTEXT_WINDOW 字符部分匹配：PARTIAL_CONTEXT_SCORE
 * - suffix 完全匹配：EXACT_CONTEXT_SCORE；首部 PARTIAL_CONTEXT_WINDOW 字符部分匹配：PARTIAL_CONTEXT_SCORE
 *
 * @param {string} fullText - 拼接後的純文本
 * @param {number} idx - 候選位置索引
 * @param {string} text - 標註文字
 * @param {{ prefix: string, suffix: string }} context - 消歧義上下文
 * @returns {number} 比對分數
 */
function scoreCandidate(fullText, idx, text, context) {
  const indexedFullText = buildSearchIndex(fullText);
  const normalizedText = normalizeTextForSearch(text);
  const candidate =
    findCandidateMatches(indexedFullText, normalizedText).find(match => match.start === idx) ??
    createFallbackCandidate(idx, normalizedText);

  return scoreCandidateMatch(indexedFullText, candidate, context);
}

/**
 * 計算前綴上下文匹配分數
 *
 * @private
 * @param {object} indexedFullText - 索引純文本
 * @param {number} candidateStart - 候選匹配起點
 * @param {string} prefix - 前綴
 * @returns {number} 前綴匹配分數
 */
function scorePrefixContextMatch(indexedFullText, candidateStart, prefix) {
  if (!prefix) {
    return 0;
  }
  const actualPrefix = indexedFullText.text.slice(
    Math.max(0, candidateStart - prefix.length),
    candidateStart
  );
  if (actualPrefix.endsWith(prefix)) {
    return HIGHLIGHT_MATCH_SCORING.EXACT_CONTEXT_SCORE;
  }
  const partialPrefixTarget = prefix.slice(-HIGHLIGHT_MATCH_SCORING.PARTIAL_CONTEXT_WINDOW);
  if (actualPrefix.endsWith(partialPrefixTarget)) {
    return HIGHLIGHT_MATCH_SCORING.PARTIAL_CONTEXT_SCORE;
  }
  return 0;
}

/**
 * 計算後綴上下文匹配分數
 *
 * @private
 * @param {object} indexedFullText - 索引純文本
 * @param {number} candidateEnd - 候選匹配終點
 * @param {string} suffix - 後綴
 * @returns {number} 後綴匹配分數
 */
function scoreSuffixContextMatch(indexedFullText, candidateEnd, suffix) {
  if (!suffix) {
    return 0;
  }
  const actualSuffix = indexedFullText.text.slice(candidateEnd, candidateEnd + suffix.length);
  if (actualSuffix.startsWith(suffix)) {
    return HIGHLIGHT_MATCH_SCORING.EXACT_CONTEXT_SCORE;
  }
  const partialSuffixTarget = suffix.slice(0, HIGHLIGHT_MATCH_SCORING.PARTIAL_CONTEXT_WINDOW);
  if (actualSuffix.startsWith(partialSuffixTarget)) {
    return HIGHLIGHT_MATCH_SCORING.PARTIAL_CONTEXT_SCORE;
  }
  return 0;
}

function scoreCandidateMatch(indexedFullText, candidate, context) {
  const prefix = normalizeTextForSearch(context.prefix, { trim: false });
  const suffix = normalizeTextForSearch(context.suffix, { trim: false });

  return (
    scorePrefixContextMatch(indexedFullText, candidate.normalizedStart, prefix) +
    scoreSuffixContextMatch(indexedFullText, candidate.normalizedEnd, suffix)
  );
}

function normalizeTextForSearch(text, options = {}) {
  if (typeof text !== 'string') {
    return '';
  }

  const normalized = text.replaceAll(/\s+/g, ' ');
  return options.trim === false ? normalized : normalized.trim();
}

function createFallbackCandidate(idx, normalizedText) {
  return {
    start: idx,
    end: idx + normalizedText.length,
    normalizedStart: idx,
    normalizedEnd: idx + normalizedText.length,
  };
}

function buildSearchIndex(fullText) {
  const charMap = [];
  let text = '';
  let index = 0;

  while (index < fullText.length) {
    if (/\s/.test(fullText[index])) {
      const whitespaceStart = index;
      while (index < fullText.length && /\s/.test(fullText[index])) {
        index++;
      }
      text += ' ';
      charMap.push({ start: whitespaceStart, end: index });
      continue;
    }

    text += fullText[index];
    charMap.push({ start: index, end: index + 1 });
    index++;
  }

  return { text, charMap };
}

function findCandidateMatches(indexedFullText, normalizedText) {
  const candidates = [];
  let searchStart = 0;
  while (searchStart < indexedFullText.text.length) {
    const idx = indexedFullText.text.indexOf(normalizedText, searchStart);
    if (idx === -1) {
      break;
    }
    const lastCharMap = indexedFullText.charMap[idx + normalizedText.length - 1];
    candidates.push({
      start: indexedFullText.charMap[idx].start,
      end: lastCharMap.end,
      normalizedStart: idx,
      normalizedEnd: idx + normalizedText.length,
    });
    searchStart = idx + 1;
  }
  return candidates;
}

/**
 * 從 highlight.rangeInfo 抽取 prefix / suffix 與 hasContext 旗標
 *
 * 把零散的 optional chaining 與 short-circuit 集中,讓主函數無需自行處理
 * rangeInfo 缺失時的 fallback。
 *
 * @param {object|undefined} rangeInfo - 標註的 rangeInfo 子物件
 * @returns {{ prefix: string, suffix: string, hasContext: boolean }}
 */
function extractContextFromRangeInfo(rangeInfo) {
  const prefix = rangeInfo?.prefix || '';
  const suffix = rangeInfo?.suffix || '';
  return {
    prefix,
    suffix,
    hasContext: Boolean(normalizeTextForSearch(prefix) || normalizeTextForSearch(suffix)),
  };
}

/**
 * 從唯一候選位置決定最終回傳值
 *
 * 無上下文資訊時直接接受;有上下文資訊時要求 prefix/suffix 至少部分重合,
 * 否則視為跨段落殘留誤命中而拒絕。
 *
 * @param {{ text: string, charMap: Array<{start: number, end: number}> }} indexedFullText - 正規化文字索引
 * @param {{ start: number, end: number, normalizedStart: number, normalizedEnd: number }} candidate - 候選匹配
 * @param {{ prefix: string, suffix: string, hasContext: boolean }} context - 消歧義上下文
 * @returns {object|null} 接受時為候選匹配，拒絕時為 null
 */
function resolveSingleCandidate(indexedFullText, candidate, context) {
  if (!context.hasContext) {
    return candidate;
  }
  return scoreCandidateMatch(indexedFullText, candidate, context) > 0 ? candidate : null;
}

/**
 * 從多個候選位置中以 prefix/suffix 計分挑出最佳匹配
 *
 * 相同分數回退到第一個候選;有上下文資訊但全部候選評分為 0 時拒絕匹配。
 *
 * @param {{ text: string, charMap: Array<{start: number, end: number}> }} indexedFullText - 正規化文字索引
 * @param {Array<{ start: number, end: number, normalizedStart: number, normalizedEnd: number }>} candidates - 候選匹配陣列(MUST length > 0)
 * @param {{ prefix: string, suffix: string, hasContext: boolean }} context - 消歧義上下文
 * @returns {object|null} 最佳候選匹配;若有上下文但無任何候選分數 > 0 則回 null
 */
function resolveBestScoringCandidate(indexedFullText, candidates, context) {
  let bestCandidate = candidates[0];
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = scoreCandidateMatch(indexedFullText, candidate, context);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (context.hasContext && bestScore === 0) {
    return null;
  }
  return bestCandidate;
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
  const match = findHighlightMatch(richTextArray, highlight, fullText);
  return match ? match.start : -1;
}

function findHighlightMatch(richTextArray, highlight, fullText) {
  if (!Array.isArray(richTextArray)) {
    return null;
  }
  if (typeof fullText !== 'string') {
    throw new TypeError('[HighlightMerger] fullText is required');
  }

  const { text, rangeInfo } = highlight;
  const normalizedText = normalizeTextForSearch(text);
  if (!normalizedText || fullText.length === 0) {
    return null;
  }

  const context = extractContextFromRangeInfo(rangeInfo);
  const indexedFullText = buildSearchIndex(fullText);

  // 2. 找出所有匹配位置
  const candidates = findCandidateMatches(indexedFullText, normalizedText);

  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return resolveSingleCandidate(indexedFullText, candidates[0], context);
  }

  // 3. prefix/suffix 計分消歧義：取最高分的候選
  return resolveBestScoringCandidate(indexedFullText, candidates, context);
}

/**
 * 處理單個 rich_text 片段中與 match 的交集部分
 *
 * @param {{ text: string, baseAnnotations: object, start: number, end: number }} segment - 當前片段上下文物件
 * @param {object} match - 當前匹配 { start, end, highlight }
 * @param {number} localCursor - 片段內的游標位置
 * @param {string} styleKey - 樣式鍵
 * @returns {{ parts: Array<object>, newCursor: number }} 新增的 rich_text 片段與更新後的游標
 */
function processMatchInSegment(segment, match, localCursor, styleKey) {
  const parts = [];
  const overlapStart = Math.max(match.start - segment.start, localCursor);
  const overlapEnd = Math.min(match.end - segment.start, segment.text.length);

  // 前段（未標註部分）
  if (overlapStart > localCursor) {
    parts.push(
      _createRichText(segment.text.slice(localCursor, overlapStart), segment.baseAnnotations)
    );
  }

  // 標註段（帶樣式）
  const style = resolveStyle(styleKey, match.highlight);
  parts.push(
    _createRichText(segment.text.slice(overlapStart, overlapEnd), {
      ...segment.baseAnnotations,
      ...style,
    })
  );

  return { parts, newCursor: overlapEnd };
}

/**
 * 處理單個 rich_text 片段（用於 splitRichTextByMatches）
 *
 * @param {{ text: string, baseAnnotations: object, start: number, end: number }} segment - 當前片段上下文物件
 * @param {Array<{start: number, end: number, highlight: object}>} matches - 排序後的匹配陣列
 * @param {{ idx: number }} state - 可變狀態物件，持有當前 matchIdx
 * @param {string} styleKey - 樣式鍵
 * @returns {Array<object>} 此片段產生的 rich_text 陣列
 */
function processSegment(segment, matches, state, styleKey) {
  const parts = [];
  let localCursor = 0;

  while (state.idx < matches.length) {
    const match = matches[state.idx];

    if (match.start >= segment.end) {
      break; // 此 match 在後面的片段中
    }

    if (match.end <= segment.start + localCursor) {
      state.idx++;
      continue; // 已處理完的 match
    }

    const { parts: newParts, newCursor } = processMatchInSegment(
      segment,
      match,
      localCursor,
      styleKey
    );

    for (const part of newParts) {
      parts.push(part);
    }
    localCursor = newCursor;

    if (match.end <= segment.end) {
      state.idx++;
    } else {
      break; // match 延伸到下一個片段
    }
  }

  // 片段尾段（未被任何 match 覆蓋的部分）
  if (localCursor < segment.text.length) {
    parts.push(_createRichText(segment.text.slice(localCursor), segment.baseAnnotations));
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
    const segment = {
      text,
      baseAnnotations,
      start: globalOffset,
      end: globalOffset + text.length,
    };
    const parts = processSegment(segment, matches, state, styleKey);
    for (const part of parts) {
      result.push(part);
    }
    globalOffset += text.length;
  }

  return result;
}

/**
 * 收集並記錄此 block 中所有匹配的標註位置，並標記為已消耗
 *
 * @private
 * @param {Array<object>} richTextArray - block 的 rich_text 陣列
 * @param {Array<object>} highlights - 標註數據陣列
 * @param {string} fullText - 拼接後的純文本
 * @param {Set<string|object>} consumed - 已消耗標註的去重 Set
 * @returns {Array<{start: number, end: number, highlight: object}>} 匹配的 offset 陣列
 */
function collectBlockHighlightMatches(richTextArray, highlights, fullText, consumed) {
  const matches = [];
  for (const hl of highlights) {
    const key = getHighlightKey(hl);
    if (consumed.has(key)) {
      continue;
    }
    const match = findHighlightMatch(richTextArray, hl, fullText);
    if (match) {
      matches.push({ start: match.start, end: match.end, highlight: hl });
      consumed.add(key);
    }
  }
  return matches;
}

/**
 * 在單個 block 上套用標註樣式
 *
 * @param {object} block - Notion block 物件
 * @param {Array<{text: string, color: string, rangeInfo?: object}>} highlights - 標註數據
 * @param {string} styleKey - 樣式鍵
 * @param {Set<string|object>} consumed - 已消耗的 highlight 集合
 * @returns {object} 處理後的 block
 */
function applyHighlightsToBlock(block, highlights, styleKey, consumed) {
  const richTextArray = block[block.type]?.rich_text;
  if (!richTextArray || richTextArray.length === 0) {
    return block;
  }

  const fullText = richTextArray.map(rt => rt.text.content).join('');
  const matches = collectBlockHighlightMatches(richTextArray, highlights, fullText, consumed);

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
 * 安全地在單個 block 上套用標註樣式，出錯時降級返回原始 block
 *
 * @private
 * @param {object} block - Notion block 物件
 * @param {Array<object>} highlights - 標註數據
 * @param {string} styleKey - 樣式鍵
 * @param {Set<string|object>} consumed - 已消耗的 highlight 集合
 * @returns {object} 處理後的 block 或原始 block
 */
function safelyApplyHighlightsToBlock(block, highlights, styleKey, consumed) {
  try {
    return applyHighlightsToBlock(block, highlights, styleKey, consumed);
  } catch {
    return block;
  }
}

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
 * @param {string} [styleKey='COLOR_SYNC'] - 樣式鍵（'COLOR_SYNC' | 'COLOR_TEXT' | 'BOLD' | 'NONE'）
 * @returns {Array<object>} 處理後的區塊陣列
 */
function mergeHighlightsWithStyle(blocks, highlights, styleKey = 'COLOR_SYNC') {
  // 快速退出：功能關閉或無標註
  if (styleKey === 'NONE' || !highlights?.length || !blocks?.length) {
    return blocks;
  }

  const consumed = new Set();

  try {
    return blocks.map(block => safelyApplyHighlightsToBlock(block, highlights, styleKey, consumed));
  } catch (error) {
    if (typeof Logger !== 'undefined') {
      Logger.warn('[HighlightMerger] 標註樣式合併失敗，使用原始模式:', {
        action: 'mergeHighlightsWithStyle',
        result: 'fallback_to_original',
        error,
      });
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
  scoreCandidate,

  // 常量
  VALID_HIGHLIGHT_COLORS,
  HIGHLIGHT_STYLE_OPTIONS,
};
