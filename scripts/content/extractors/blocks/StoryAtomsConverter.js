/**
 * StoryAtomsConverter.js
 * 專門負責 Yahoo storyAtoms 格式轉換為 Notion 區塊的 pure functions 模組
 */

import Logger from '../../../utils/Logger.js';

const STORY_ATOM_BUILDERS = {
  text: (atom, deps) => createBlockFromTextAtom(atom, deps),
  image: (atom, deps) => createBlockFromImageAtom(atom, deps),
};

/**
 * 轉換 Yahoo storyAtoms 為 Notion Blocks
 *
 * @param {Array} atoms
 * @param {object} deps
 * @param {Function} deps.richTextChunkBuilder
 * @param {Function} deps.stripHtml
 * @returns {Array}
 */
export function convertStoryAtoms(atoms, deps) {
  if (!Array.isArray(atoms)) {
    return [];
  }
  return atoms.map(atom => buildStoryAtomBlock(atom, deps)).filter(Boolean);
}

function buildStoryAtomBlock(atom, deps) {
  if (!atom || typeof atom !== 'object') {
    return null;
  }
  const builder = STORY_ATOM_BUILDERS[atom.type];
  return builder ? builder(atom, deps) : null;
}

/**
 * 根據文本 Atom 創建 Block
 *
 * @param {object} atom
 * @param {object} deps
 * @returns {object|null}
 */
export function createBlockFromTextAtom(atom, deps) {
  if (!atom.content) {
    return null;
  }

  const text = deps.stripHtml(atom.content).trim();
  if (!text) {
    return null;
  }

  let type = 'paragraph';
  const tagName = (atom.tagName || 'p').toLowerCase();

  switch (tagName) {
    case 'h1': {
      type = 'heading_1';
      break;
    }
    case 'h2': {
      type = 'heading_2';
      break;
    }
    case 'h3': {
      type = 'heading_3';
      break;
    }
    case 'blockquote': {
      type = 'quote';
      break;
    }
  }

  return {
    object: 'block',
    type,
    [type]: {
      rich_text: deps.richTextChunkBuilder(text),
    },
  };
}

/**
 * 根據圖片 Atom 創建 Block
 *
 * @param {object} atom
 * @param {object} deps
 * @returns {object|null}
 */
export function createBlockFromImageAtom(atom, deps) {
  const imageUrl = extractImageAtomUrl(atom);
  if (!imageUrl) {
    logMissingImageUrl(atom);
    return null;
  }

  return {
    object: 'block',
    type: 'image',
    image: {
      type: 'external',
      external: {
        url: imageUrl,
      },
      caption: deps.richTextChunkBuilder(atom.caption),
    },
  };
}

const IMAGE_SIZE_KEYS = ['resized', 'original', 'lightbox'];

function extractImageAtomUrl(atom) {
  // 通用格式: atom.url
  if (atom.url) {
    return atom.url;
  }
  // Yahoo 格式: atom.size.<resized|original|lightbox>.url
  // atom.size 是物件而非 length-like 數值；停用 unicorn/explicit-length-check 的誤判
  // eslint-disable-next-line unicorn/explicit-length-check
  if (!atom.size || typeof atom.size !== 'object') {
    return null;
  }
  for (const key of IMAGE_SIZE_KEYS) {
    const url = atom.size[key]?.url;
    if (url) {
      return url;
    }
  }
  return null;
}

function logMissingImageUrl(atom) {
  Logger.debug('StoryAtomsConverter.createBlockFromImageAtom: 無法找到圖片 URL', {
    action: 'StoryAtomsConverter.createBlockFromImageAtom',
    result: 'missing_image_url',
    atomKeys: Object.keys(atom),
    // eslint-disable-next-line unicorn/explicit-length-check
    hasSize: Boolean(atom.size && Object.keys(atom.size).length > 0),
  });
}
