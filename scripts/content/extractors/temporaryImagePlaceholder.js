/**
 * temporaryImagePlaceholder
 *
 * 為 temporary / signed image URL 建立降級的 paragraph block。
 *
 * 與 isTemporaryImageUrl（位於 scripts/utils/imageUtils.js）不同，
 * 這個 helper 僅在 content side（ImageCollector）使用，因此放在
 * scripts/content/extractors/ 下，避免被 rollup 連同中文 placeholder
 * 字串一起打包進 background bundle。
 */

/**
 * 為 temporary image URL 建立降級的 paragraph block
 *
 * 取代 external image block，避免 Notion 伺服器端拉取失敗造成 broken image，
 * 同時保留使用者可理解的提示與原始連結。
 *
 * @param {string} url - 原始 temporary image URL
 * @param {object} [options] - 選項
 * @param {string} [options.alt] - 圖片 alt 描述（若有）
 * @returns {object} Notion paragraph block
 */
export function buildTemporaryImagePlaceholderBlock(url, options = {}) {
  const { alt = '' } = options;
  const altPart = typeof alt === 'string' && alt.trim() ? `「${alt.trim()}」` : '';
  const prefix = `🖼️ Patreon 圖片${altPart}（暫存連結，可能無法在 Notion 中顯示）：`;

  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        { type: 'text', text: { content: prefix } },
        { type: 'text', text: { content: '原始連結', link: { url } } },
      ],
    },
    _meta: {
      placeholder: true,
      placeholderReason: 'temporary_image_url',
      originalSrc: url,
      alt: typeof alt === 'string' ? alt : '',
    },
  };
}
