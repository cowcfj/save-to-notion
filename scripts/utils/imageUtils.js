/**
 * 圖片處理工具函數庫 - 統一入口與相容層
 * 作為相容聚合入口，導出公用介面並掛載全域 ImageUtils 對象
 */

import { IMAGE_VALIDATION } from '../config/shared/content.js';
import * as imageUrl from './image/imageUrl.js';
import * as srcsetExtractor from './image/srcsetExtractor.js';
import * as imageSourceExtractor from './image/imageSourceExtractor.js';
import * as imageBlockMerge from './image/imageBlockMerge.js';

// 註：isTemporaryImageUrl 已搬到 scripts/utils/temporaryImageUrl.js
// 註：buildTemporaryImagePlaceholderBlock 已搬到 scripts/content/extractors/temporaryImagePlaceholder.js
// 原因：imageUtils.js 結尾有 `globalThis.ImageUtils = ImageUtils` side-effect，
// 一旦 ImageUtils 物件包含的函數從 background-side 被 named import，
// rollup 會被迫保留整個 ImageUtils 物件（含所有 image 處理函數），
// 導致 background bundle 大幅膨脹超過 size gate。
// 把 background 端唯一需要的 isTemporaryImageUrl 拆到獨立模組，
// 即可讓原本被 tree-shake 的函數繼續被 tree-shake。
//
// 註：7 個 helper 函數（extractBestUrlFromSrcset, generateImageCacheKey, extractFromSrcset,
// extractFromAttributes, extractFromPicture, extractFromBackgroundImage, extractFromNoscript）
// 僅保留於 global/runtime ImageUtils 物件中作為相容層，不再作為 module named exports 導出。

const ImageUtils = {
  cleanImageUrl: imageUrl.cleanImageUrl,
  isValidImageUrl: imageUrl.isValidImageUrl,
  isValidCleanedImageUrl: imageUrl.isValidCleanedImageUrl,
  extractImageSrc: imageSourceExtractor.extractImageSrc,
  extractBestUrlFromSrcset: srcsetExtractor.extractBestUrlFromSrcset,
  generateImageCacheKey: imageSourceExtractor.generateImageCacheKey,
  IMAGE_ATTRIBUTES: imageSourceExtractor.IMAGE_ATTRIBUTES,
  IMAGE_VALIDATION,
  extractFromSrcset: srcsetExtractor.extractFromSrcset,
  extractFromAttributes: imageSourceExtractor.extractFromAttributes,
  extractFromPicture: imageSourceExtractor.extractFromPicture,
  extractFromBackgroundImage: imageSourceExtractor.extractFromBackgroundImage,
  extractFromNoscript: imageSourceExtractor.extractFromNoscript,
  mergeUniqueImages: imageBlockMerge.mergeUniqueImages,
};

// Global assignment for backward compatibility
if (globalThis.window !== undefined) {
  globalThis.ImageUtils = ImageUtils;
}

export {
  IMAGE_EXTENSIONS,
  IMAGE_PATH_PATTERNS,
  cleanImageUrl,
  isValidImageUrl,
  isValidCleanedImageUrl,
} from './image/imageUrl.js';

export { IMAGE_ATTRIBUTES, extractImageSrc } from './image/imageSourceExtractor.js';

export { mergeUniqueImages } from './image/imageBlockMerge.js';
