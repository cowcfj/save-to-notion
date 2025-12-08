import './imageUtils.js';
import { IMAGE_VALIDATION, IMAGE_ATTRIBUTES } from '../config/index.js';

// Retrieve global ImageUtils (set by side effect)
const GlobalImageUtils =
  (typeof self !== 'undefined' ? self.ImageUtils : null) ||
  (typeof window !== 'undefined' ? window.ImageUtils : null) ||
  globalThis.ImageUtils;

// Ensure GlobalImageUtils uses the shared configuration if not already set
if (GlobalImageUtils) {
  if (!GlobalImageUtils.IMAGE_ATTRIBUTES) {
    GlobalImageUtils.IMAGE_ATTRIBUTES = IMAGE_ATTRIBUTES;
  }
}

const ImageUtils = GlobalImageUtils;

export default ImageUtils;

export const {
  cleanImageUrl,
  isValidImageUrl,
  isNotionCompatibleImageUrl,
  extractFirstImage,
  validateAndCleanImages,
  processBlockImages,
  extractImageSrc,
  extractBestUrlFromSrcset,
  generateImageCacheKey,
  extractFromSrcset,
  extractFromAttributes,
  extractFromPicture,
  extractFromBackgroundImage,
  extractFromNoscript,
} = ImageUtils || {}; // Prevent destructuring error if null

export { IMAGE_VALIDATION, IMAGE_ATTRIBUTES };
