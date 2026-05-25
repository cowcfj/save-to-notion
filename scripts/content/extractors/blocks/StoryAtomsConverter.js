/**
 * StoryAtomsConverter.js
 * 專門負責 Yahoo storyAtoms 格式轉換為 Notion 區塊的 pure functions 模組
 */

import Logger from '../../../utils/Logger.js';

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

  const blocks = [];

  for (const atom of atoms) {
    if (atom.type === 'text') {
      const block = createBlockFromTextAtom(atom, deps);
      if (block) {
        blocks.push(block);
      }
    } else if (atom.type === 'image') {
      const block = createBlockFromImageAtom(atom, deps);
      if (block) {
        blocks.push(block);
      }
    }
  }
  return blocks;
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
  // Yahoo 格式: atom.size.resized.url 或 atom.size.original.url
  // 通用格式: atom.url
  const imageUrl =
    atom.url || atom.size?.resized?.url || atom.size?.original?.url || atom.size?.lightbox?.url;

  if (!imageUrl) {
    Logger.debug('StoryAtomsConverter.createBlockFromImageAtom: 無法找到圖片 URL', {
      atomKeys: Object.keys(atom),
      // eslint-disable-next-line unicorn/explicit-length-check
      hasSize: Boolean(atom.size && Object.keys(atom.size).length > 0),
    });
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
