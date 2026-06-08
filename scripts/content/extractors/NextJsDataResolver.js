import Logger from '../../utils/Logger.js';
import { NEXTJS_CONFIG } from '../../config/shared/content.js';

export function findArticleData(data) {
  if (!data) {
    return null;
  }

  const searchTargets = data.appRouterFragments ? [...data.appRouterFragments, data] : [data];
  const result = searchByKnownPaths(searchTargets);
  if (result) {
    return result;
  }

  Logger.log('NextJsExtractor: 使用啟發式搜索');
  return heuristicSearch(data);
}

function resultHasUsableContent(result) {
  if (!result) {
    return false;
  }

  const detectors = [
    () => Array.isArray(result.blocks),
    () => Array.isArray(result.content?.model?.blocks),
    () => typeof result.content === 'string',
    () => typeof result.body === 'string',
    () => typeof result.markup === 'string',
    () => Array.isArray(result.storyAtoms),
  ];

  return detectors.some(detect => detect());
}

function searchByKnownPaths(targets) {
  const match = targets.map(target => findKnownPathMatch(target)).find(Boolean);
  if (!match) {
    return null;
  }

  Logger.log(`NextJsExtractor: 使用路徑 "${match.path}" 提取成功`);
  return match.result;
}

function findKnownPathMatch(target) {
  if (!isSearchableTarget(target)) {
    return null;
  }

  return NEXTJS_CONFIG.ARTICLE_PATHS.map(path => ({
    path,
    result: getValueByPath(target, path),
  })).find(({ result }) => resultHasUsableContent(result));
}

function isSearchableTarget(target) {
  if (!target) {
    return false;
  }
  return typeof target === 'object';
}

export function getPagesRouterData(doc) {
  const script = doc.querySelector('#__NEXT_DATA__');
  if (!script) {
    return null;
  }

  const jsonData = script.textContent;
  if (!jsonData || jsonData.length > NEXTJS_CONFIG.MAX_JSON_SIZE) {
    Logger.warn('Next.js 數據過大或為空', {
      length: jsonData?.length,
    });
    return null;
  }

  try {
    return JSON.parse(jsonData);
  } catch (error) {
    Logger.warn('解析 __NEXT_DATA__ 失敗', { error: error.message });
    return null;
  }
}

export function getAppRouterData(doc) {
  const scripts = doc.querySelectorAll(NEXTJS_CONFIG.APP_ROUTER_SELECTOR);
  const fragments = [];

  scripts.forEach(script => {
    const scriptFragments = parseAppRouterScript(script.textContent);
    fragments.push(...scriptFragments);
  });

  if (fragments.length === 0) {
    return null;
  }

  return { appRouterFragments: fragments };
}

function extractAppRouterPushPayload(part) {
  const lastParen = part.lastIndexOf(')');
  if (lastParen === -1) {
    return null;
  }

  try {
    const args = JSON.parse(part.slice(0, lastParen));
    if (!hasAppRouterPushPayload(args)) {
      return null;
    }
    return args[1];
  } catch {
    return null;
  }
}

function hasAppRouterPushPayload(args) {
  if (!Array.isArray(args)) {
    return false;
  }
  return args.length > 1;
}

export function parseAppRouterScript(content) {
  if (!content?.includes('self.__next_f.push')) {
    return [];
  }

  return content
    .split('self.__next_f.push(')
    .slice(1)
    .map(part => extractAppRouterPushPayload(part))
    .filter(payload => payload !== null && payload !== undefined)
    .map(payload => parseRscPayload(payload));
}

function parseRscPayload(chunk) {
  if (typeof chunk !== 'string') {
    return chunk;
  }

  const objects = parseMultiLineRsc(chunk);

  if (objects.length > 1) {
    return { _rscItems: objects };
  }
  if (objects.length === 1) {
    return objects[0];
  }

  return fallbackParseRsc(chunk) || chunk;
}

export function parseMultiLineRsc(chunk) {
  const lines = chunk.split('\n').filter(line => line.trim());
  const objects = [];

  for (const line of lines) {
    const parsed = tryParseRscLine(line);
    if (parsed) {
      objects.push(parsed);
    }
  }
  return objects;
}

function extractColonPayload(chunk) {
  const colonIndex = chunk.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }
  return chunk.slice(colonIndex + 1);
}

function parseRscJsonPayload(payload) {
  if (!payload) {
    return null;
  }
  if (!isRscJsonPayload(payload)) {
    return null;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function isRscJsonPayload(payload) {
  return ['{', '['].includes(payload[0]);
}

function parseStructuredRscPayload(chunk) {
  const payload = extractColonPayload(chunk);
  const parsed = parseRscJsonPayload(payload);
  if (parsed === null) {
    return null;
  }
  return extractRscDataObject(parsed) || parsed;
}

export function tryParseRscLine(line) {
  const parsed = parseStructuredRscPayload(line);
  if (!parsed) {
    return null;
  }
  if (typeof parsed !== 'object') {
    return null;
  }
  return parsed;
}

export function fallbackParseRsc(chunk) {
  return parseStructuredRscPayload(chunk);
}

export function extractRscDataObject(parsed) {
  if (!Array.isArray(parsed)) {
    return null;
  }

  const indexedData = getIndexedRscDataObject(parsed);
  if (indexedData) {
    return indexedData;
  }
  return parsed.find(item => isMeaningfulObject(item)) ?? null;
}

function getIndexedRscDataObject(parsed) {
  if (parsed.length < 4) {
    return null;
  }
  if (!isMeaningfulObject(parsed[3])) {
    return null;
  }
  return parsed[3];
}

function isMeaningfulObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function heuristicSearch(root, depth = 0, maxDepth = 6) {
  if (depth > maxDepth) {
    return null;
  }
  if (!isObjectLike(root)) {
    return null;
  }

  const score = calculateScore(root);

  if (score >= 35) {
    Logger.log(`NextJsExtractor: 找到高可信度節點 (分數=${score})`);
    return root;
  }

  return searchChildren(root, depth, maxDepth);
}

function searchChildren(root, depth, maxDepth) {
  let matchedCandidate = null;
  getSearchableChildValues(root).some(value => {
    matchedCandidate = heuristicSearch(value, depth + 1, maxDepth);
    return Boolean(matchedCandidate);
  });
  return matchedCandidate;
}

function getSearchableChildValues(root) {
  return Object.entries(root)
    .filter(([key]) => !shouldSkipKey(key))
    .map(([, value]) => value)
    .filter(value => isObjectLike(value));
}

function isObjectLike(value) {
  if (value === null) {
    return false;
  }
  return typeof value === 'object';
}

function shouldSkipKey(key) {
  const lowerKey = key.toLowerCase();
  return NEXTJS_CONFIG.HEURISTIC_PATTERNS.EXCLUDE_KEYS.some(exclude => {
    const lowerExclude = exclude.toLowerCase();
    return lowerKey === lowerExclude || lowerKey.includes(lowerExclude);
  });
}

function calculateScore(node) {
  if (!node || typeof node !== 'object') {
    return 0;
  }

  let score = 0;
  score += scoreStandardBlocks(node);
  score += scoreStructureAndText(node);
  score += scoreSpecialCmsFields(node);

  return score;
}

function scoreStandardBlocks(node) {
  let score = 0;
  if (Array.isArray(node.blocks) && node.blocks.length > 0) {
    score += 50;
  }
  if (Array.isArray(node.htmlTokens) && node.htmlTokens.length > 0) {
    score += 60;
  }
  if (Array.isArray(node.rich_text)) {
    score += 30;
  }
  return score;
}

export function scoreKeysDimension(node) {
  if (!node || typeof node !== 'object') {
    return 0;
  }

  let score = 0;
  if (node.title && typeof node.title === 'string') {
    score += 10;
  }
  if (node.author) {
    score += 5;
  }
  return score;
}

export function scoreStructuralDimension(node) {
  if (!node || typeof node !== 'object') {
    return 0;
  }

  let score = 0;
  if (Array.isArray(node.paragraphs) && node.paragraphs.length > 0) {
    score += 40;
  }
  return score;
}

export function scoreContentDimension(node) {
  if (!node || typeof node !== 'object') {
    return 0;
  }

  let score = 0;
  if (hasIdentifiedText(node)) {
    score += 15;
  }
  if (hasLongContent(node)) {
    score += 20;
  }
  return score;
}

function hasIdentifiedText(node) {
  return node.text && typeof node.text === 'string' && node.id;
}

function hasLongContent(node) {
  return node.content && typeof node.content === 'string' && node.content.length > 100;
}

export function scoreStructureAndText(node) {
  let score = 0;
  score += scoreKeysDimension(node);
  score += scoreStructuralDimension(node);
  score += scoreContentDimension(node);
  return score;
}

function scoreSpecialCmsFields(node) {
  let score = 0;
  if (hasLongBody(node)) {
    score += 40;
  }
  if (hasMarkup(node)) {
    score += 35;
  }
  if (hasStoryAtoms(node)) {
    score += 60;
  }
  return score;
}

function hasLongBody(node) {
  return node.body && typeof node.body === 'string' && node.body.length > 200;
}

function hasMarkup(node) {
  return node.markup && typeof node.markup === 'string';
}

function hasStoryAtoms(node) {
  return Array.isArray(node.storyAtoms) && node.storyAtoms.length > 0;
}

export function getValueByPath(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}
