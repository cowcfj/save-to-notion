/**
 * Srcset 解析器
 * 專門處理 HTML srcset 屬性的解析和最佳 URL 選擇
 */
class SrcsetParser {
    /**
     * 解析 srcset 字符串並返回最佳 URL
     * @param {string} srcsetString - srcset 屬性值
     * @param {Object} options - 解析選項
     * @param {number} options.preferredWidth - 首選寬度
     * @param {number} options.preferredDensity - 首選像素密度
     * @returns {string|null} 最佳 URL 或 null
     */
    static parse(srcsetString, options = {}) {
        if (!srcsetString || typeof srcsetString !== 'string') {
            return null;
        }

        const entries = this.parseSrcsetEntries(srcsetString);
        if (entries.length === 0) {
            return null;
        }

        return this.selectBestUrl(entries, options);
    }

    /**
     * 解析 srcset 字符串為條目數組
     * @param {string} srcsetString - srcset 屬性值
     * @returns {Array} 解析後的條目數組
     */
    static parseSrcsetEntries(srcsetString) {
        if (!srcsetString) return [];

        return srcsetString
            .split(',')
            .map(entry => this.parseEntry(entry.trim()))
            .filter(entry => entry !== null);
    }

    /**
     * 解析單個 srcset 條目
     * @param {string} entryString - 單個條目字符串
     * @returns {Object|null} 解析後的條目對象
     */
    static parseEntry(entryString) {
        if (!entryString) return null;

        // 分割 URL 和描述符
        const parts = entryString.split(/\s+/);
        const url = parts[0];

        if (!url || url.startsWith('data:')) {
            return null;
        }

        const descriptor = parts[1] || '';
        const entry = {
            url,
            width: null,
            density: null,
            descriptor
        };

        // 解析寬度描述符 (例如: "800w")
        const widthMatch = descriptor.match(/^(\d+)w$/i);
        if (widthMatch) {
            entry.width = parseInt(widthMatch[1], 10);
            return entry;
        }

        // 解析像素密度描述符 (例如: "2x")
        const densityMatch = descriptor.match(/^(\d+(?:\.\d+)?|\.\d+)x$/i);
        if (densityMatch) {
            entry.density = parseFloat(densityMatch[1]);
            return entry;
        }

        // 沒有描述符的情況，默認為 1x
        if (!descriptor) {
            entry.density = 1.0;
        }

        return entry;
    }

    /**
     * 從條目數組中選擇最佳 URL
     * @param {Array} entries - 條目數組
     * @param {Object} options - 選擇選項
     * @returns {string|null} 最佳 URL
     */
    static selectBestUrl(entries, options = {}) {
        if (!entries || entries.length === 0) {
            return null;
        }

        // 如果只有一個條目，直接返回
        if (entries.length === 1) {
            return entries[0].url;
        }

        // 優先選擇寬度描述符的條目
        const widthEntries = entries.filter(entry => entry.width !== null);
        if (widthEntries.length > 0) {
            return this._selectBestByWidth(widthEntries, options.preferredWidth);
        }

        // 其次選擇密度描述符的條目
        const densityEntries = entries.filter(entry => entry.density !== null);
        if (densityEntries.length > 0) {
            return this._selectBestByDensity(densityEntries, options.preferredDensity);
        }

        // 回退到第一個條目
        return entries[0].url;
    }

    /**
     * 根據寬度選擇最佳條目
     * @private
     * @param {Array} entries - 有寬度信息的條目
     * @param {number} preferredWidth - 首選寬度
     * @returns {string} 最佳 URL
     */
    static _selectBestByWidth(entries, preferredWidth) {
        // 按寬度排序（從大到小）
        const sortedEntries = entries.sort((a, b) => b.width - a.width);

        // 如果沒有指定首選寬度，返回最大的
        if (!preferredWidth || preferredWidth <= 0) {
            return sortedEntries[0].url;
        }

        // 尋找最接近首選寬度且不小於首選寬度的條目
        for (const entry of sortedEntries) {
            if (entry.width >= preferredWidth) {
                return entry.url;
            }
        }

        // 如果沒有找到合適的，返回最大的
        return sortedEntries[0].url;
    }

    /**
     * 根據像素密度選擇最佳條目
     * @private
     * @param {Array} entries - 有密度信息的條目
     * @param {number} preferredDensity - 首選像素密度
     * @returns {string} 最佳 URL
     */
    static _selectBestByDensity(entries, preferredDensity = 2.0) {
        // 按密度排序（從大到小）
        const sortedEntries = entries.sort((a, b) => b.density - a.density);

        // 尋找最接近首選密度且不小於首選密度的條目
        for (const entry of sortedEntries) {
            if (entry.density >= preferredDensity) {
                return entry.url;
            }
        }

        // 如果沒有找到合適的，返回最大的
        return sortedEntries[0].url;
    }

    /**
     * 驗證 srcset 字符串格式
     * @param {string} srcsetString - 要驗證的 srcset 字符串
     * @returns {boolean} 格式是否有效
     */
    static isValidSrcset(srcsetString) {
        if (!srcsetString || typeof srcsetString !== 'string') {
            return false;
        }

        try {
            const entries = this.parseSrcsetEntries(srcsetString);
            return entries.length > 0;
        } catch (_error) {
            return false;
        }
    }

    /**
     * 獲取 srcset 的統計信息
     * @param {string} srcsetString - srcset 字符串
     * @returns {Object} 統計信息
     */
    static getStats(srcsetString) {
        const entries = this.parseSrcsetEntries(srcsetString);

        const stats = {
            totalEntries: entries.length,
            widthEntries: 0,
            densityEntries: 0,
            noDescriptorEntries: 0,
            maxWidth: null,
            maxDensity: null
        };

        entries.forEach(entry => {
            if (entry.width !== null) {
                stats.widthEntries++;
                stats.maxWidth = Math.max(stats.maxWidth || 0, entry.width);
            } else if (entry.density !== null) {
                stats.densityEntries++;
                stats.maxDensity = Math.max(stats.maxDensity || 0, entry.density);
            } else {
                stats.noDescriptorEntries++;
            }
        });

        return stats;
    }
}

// 導出類
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SrcsetParser;
} else if (typeof window !== 'undefined') {
    window.SrcsetParser = SrcsetParser;
}
