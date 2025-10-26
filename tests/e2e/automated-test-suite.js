/**
 * Notion Smart Clipper - 自動化測試套件
 * 
 * 使用 Chrome DevTools MCP 進行完整的功能測試
 * 測試範圍：Icon 提取、內容提取、封面圖識別、頁面兼容性
 * 
 * @version 1.0.0
 * @date 2025-10-02
 */

// ==================== 測試配置 ====================

const TEST_CONFIG = {
    // 測試網站列表 - 涵蓋不同類型的網站
    testSites: [
        // 主流新聞網站
        {
            name: 'BBC News',
            url: 'https://www.bbc.com/news',
            type: 'news',
            expectedIcons: { min: 3, max: 10 },
            hasFeaturedImage: false, // 首頁通常沒有
            notes: '大型新聞網站，複雜 DOM 結構'
        },
        {
            name: 'CNN',
            url: 'https://www.cnn.com',
            type: 'news',
            expectedIcons: { min: 2, max: 8 },
            hasFeaturedImage: false,
            notes: '美國新聞網站'
        },
        {
            name: 'The Guardian',
            url: 'https://www.theguardian.com',
            type: 'news',
            expectedIcons: { min: 2, max: 8 },
            hasFeaturedImage: false,
            notes: '英國新聞網站'
        },
        
        // 技術/開發者網站
        {
            name: 'GitHub',
            url: 'https://github.com',
            type: 'tech',
            expectedIcons: { min: 1, max: 5 },
            hasFeaturedImage: false,
            notes: 'SVG icon, 簡潔設計'
        },
        {
            name: 'Stack Overflow',
            url: 'https://stackoverflow.com',
            type: 'tech',
            expectedIcons: { min: 2, max: 6 },
            hasFeaturedImage: false,
            notes: '技術問答網站'
        },
        {
            name: 'MDN Web Docs',
            url: 'https://developer.mozilla.org',
            type: 'tech',
            expectedIcons: { min: 2, max: 6 },
            hasFeaturedImage: false,
            notes: '開發者文檔'
        },
        
        // 內容平台
        {
            name: 'Medium',
            url: 'https://medium.com',
            type: 'blog',
            expectedIcons: { min: 3, max: 8 },
            hasFeaturedImage: false,
            notes: '多尺寸 Apple Touch Icons'
        },
        {
            name: 'WordPress.org',
            url: 'https://wordpress.org',
            type: 'cms',
            expectedIcons: { min: 2, max: 6 },
            hasFeaturedImage: false,
            notes: 'CMS 官網'
        },
        {
            name: 'Dev.to',
            url: 'https://dev.to',
            type: 'blog',
            expectedIcons: { min: 2, max: 6 },
            hasFeaturedImage: false,
            notes: '開發者社群'
        },
        
        // 社交媒體
        {
            name: 'Twitter/X',
            url: 'https://x.com',
            type: 'social',
            expectedIcons: { min: 2, max: 8 },
            hasFeaturedImage: false,
            notes: '社交媒體平台',
            requiresAuth: true
        },
        {
            name: 'Reddit',
            url: 'https://www.reddit.com',
            type: 'social',
            expectedIcons: { min: 2, max: 8 },
            hasFeaturedImage: false,
            notes: '社群討論平台'
        },
        
        // 電商網站
        {
            name: 'Amazon',
            url: 'https://www.amazon.com',
            type: 'ecommerce',
            expectedIcons: { min: 1, max: 5 },
            hasFeaturedImage: false,
            notes: '電商巨頭'
        },
        
        // 維基百科
        {
            name: 'Wikipedia',
            url: 'https://en.wikipedia.org',
            type: 'wiki',
            expectedIcons: { min: 2, max: 6 },
            hasFeaturedImage: false,
            notes: '百科全書'
        },
        
        // 影音平台
        {
            name: 'YouTube',
            url: 'https://www.youtube.com',
            type: 'video',
            expectedIcons: { min: 2, max: 8 },
            hasFeaturedImage: false,
            notes: '影音平台'
        },
        
        // 特殊案例：文章頁面（有封面圖）
        {
            name: 'Medium Article Sample',
            url: 'https://medium.com/@username/article-title',
            type: 'article',
            expectedIcons: { min: 3, max: 8 },
            hasFeaturedImage: true,
            notes: '測試文章封面圖提取',
            skipIfNotFound: true
        }
    ],
    
    // 測試超時設置
    timeout: {
        navigation: 30000, // 30秒
        scriptExecution: 10000 // 10秒
    },
    
    // 截圖設置
    screenshots: {
        enabled: true,
        saveOnError: true,
        directory: '/tmp/notion-clipper-tests'
    },
    
    // 測試報告
    report: {
        format: 'json', // json, html, markdown
        outputPath: './tests/results',
        includeScreenshots: true
    }
};

// ==================== 測試腳本 ====================

/**
 * Icon 提取測試腳本（在頁面中執行）
 */
const ICON_EXTRACTION_SCRIPT = `
(function() {
    const icons = [];
    
    // 1. Apple Touch Icon
    document.querySelectorAll('link[rel*="apple-touch-icon"]').forEach(link => {
        icons.push({
            type: 'apple-touch-icon',
            href: link.href,
            sizes: link.sizes ? link.sizes.toString() : null
        });
    });
    
    // 2. Standard Favicon
    document.querySelectorAll('link[rel*="icon"]').forEach(link => {
        if (!link.rel.includes('apple')) {
            icons.push({
                type: link.rel,
                href: link.href,
                sizes: link.sizes ? link.sizes.toString() : null,
                mimeType: link.type || null
            });
        }
    });
    
    // 3. Mask Icon (Safari)
    const maskIcon = document.querySelector('link[rel="mask-icon"]');
    if (maskIcon) {
        icons.push({
            type: 'mask-icon',
            href: maskIcon.href,
            color: maskIcon.getAttribute('color')
        });
    }
    
    // 4. Manifest
    const manifest = document.querySelector('link[rel="manifest"]');
    
    return {
        icons: icons,
        iconCount: icons.length,
        hasManifest: !!manifest,
        manifestUrl: manifest ? manifest.href : null
    };
})();
`;

/**
 * 封面圖提取測試腳本
 */
const FEATURED_IMAGE_SCRIPT = `
(function() {
    const result = {
        ogImage: null,
        twitterImage: null,
        schemaImage: null
    };
    
    // 1. Open Graph Image
    const ogImageMeta = document.querySelector('meta[property="og:image"]');
    if (ogImageMeta) {
        result.ogImage = ogImageMeta.content;
    }
    
    // 2. Twitter Card Image
    const twitterImageMeta = document.querySelector('meta[name="twitter:image"]');
    if (twitterImageMeta) {
        result.twitterImage = twitterImageMeta.content;
    }
    
    // 3. Schema.org Image
    const schemaScript = document.querySelector('script[type="application/ld+json"]');
    if (schemaScript) {
        try {
            const schema = JSON.parse(schemaScript.textContent);
            if (schema.image) {
                result.schemaImage = Array.isArray(schema.image) ? schema.image[0] : schema.image;
            }
        } catch (e) {
            // 忽略解析錯誤
        }
    }
    
    return result;
})();
`;

/**
 * 頁面元數據提取測試腳本
 */
const METADATA_SCRIPT = `
(function() {
    return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || null,
        author: document.querySelector('meta[name="author"]')?.content || null,
        publishedTime: document.querySelector('meta[property="article:published_time"]')?.content || null,
        modifiedTime: document.querySelector('meta[property="article:modified_time"]')?.content || null,
        keywords: document.querySelector('meta[name="keywords"]')?.content || null,
        canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || null,
        lang: document.documentElement.lang || null
    };
})();
`;

// ==================== 測試結果結構 ====================

class TestResult {
    constructor(siteName) {
        this.siteName = siteName;
        this.timestamp = new Date().toISOString();
        this.status = 'pending'; // pending, passed, failed, skipped
        this.duration = 0;
        this.errors = [];
        this.warnings = [];
        this.data = {};
    }
    
    pass(data = {}) {
        this.status = 'passed';
        this.data = data;
    }
    
    fail(error) {
        this.status = 'failed';
        this.errors.push(error);
    }
    
    skip(reason) {
        this.status = 'skipped';
        this.warnings.push(reason);
    }
    
    addWarning(warning) {
        this.warnings.push(warning);
    }
}

class TestReport {
    constructor() {
        this.startTime = new Date();
        this.endTime = null;
        this.results = [];
        this.summary = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0
        };
    }
    
    addResult(result) {
        this.results.push(result);
    }
    
    finalize() {
        this.endTime = new Date();
        this.summary.duration = this.endTime - this.startTime;
        this.summary.total = this.results.length;
        this.summary.passed = this.results.filter(r => r.status === 'passed').length;
        this.summary.failed = this.results.filter(r => r.status === 'failed').length;
        this.summary.skipped = this.results.filter(r => r.status === 'skipped').length;
    }
    
    toJSON() {
        return {
            startTime: this.startTime.toISOString(),
            endTime: this.endTime ? this.endTime.toISOString() : null,
            summary: this.summary,
            results: this.results
        };
    }
    
    toMarkdown() {
        let md = '# Notion Smart Clipper 測試報告\n\n';
        md += `**測試時間：** ${this.startTime.toLocaleString('zh-TW')}\n`;
        md += `**總耗時：** ${(this.summary.duration / 1000).toFixed(2)} 秒\n\n`;
        
        md += '## 📊 測試摘要\n\n';
        md += "| 總計 | ✅ 通過 | ❌ 失敗 | ⏭️ 跳過 |\n";
        md += "|------|--------|--------|--------|\n";
        md += `| ${this.summary.total} | ${this.summary.passed} | ${this.summary.failed} | ${this.summary.skipped} |\n\n`;
        
        md += '## 📝 詳細結果\n\n';
        
        this.results.forEach((result, index) => {
            const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
            md += `### ${icon} ${index + 1}. ${result.siteName}\n\n`;
            md += `**狀態：** ${result.status}\n`;
            md += `**耗時：** ${(result.duration / 1000).toFixed(2)} 秒\n\n`;
            
            if (result.status === 'passed' && result.data.icons) {
                md += `**Icons 數量：** ${result.data.icons.iconCount}\n`;
                md += "**Icons 詳情：**\n";
                result.data.icons.icons.forEach(icon => {
                    md += `- ${icon.type}: \`${icon.href}\`\n`;
                });
                md += '\n';
            }
            
            if (result.errors.length > 0) {
                md += "**錯誤：**\n";
                result.errors.forEach(error => {
                    md += `- ${error}\n`;
                });
                md += '\n';
            }
            
            if (result.warnings.length > 0) {
                md += "**警告：**\n";
                result.warnings.forEach(warning => {
                    md += `- ${warning}\n`;
                });
                md += '\n';
            }
        });
        
        return md;
    }
}

// ==================== 使用說明 ====================

/**
 * 測試套件使用說明
 * 
 * 這個測試套件需要配合 Chrome DevTools MCP 使用
 * 
 * ## 執行方式：
 * 
 * 1. 確保已經設置好 Chrome DevTools MCP
 * 2. 在 VS Code 中啟用 GitHub Copilot
 * 3. 請求 AI 執行測試：
 *    "請使用這個測試套件對所有網站進行測試"
 * 
 * ## 測試流程：
 * 
 * 對於每個測試網站：
 * 1. 導航到目標 URL
 * 2. 執行 Icon 提取腳本
 * 3. 執行封面圖提取腳本（如果適用）
 * 4. 執行元數據提取腳本
 * 5. 驗證結果是否符合預期
 * 6. 記錄測試結果
 * 7. 如果啟用，保存截圖
 * 
 * ## 驗證標準：
 * 
 * - Icon 數量在預期範圍內
 * - Icon URL 格式正確且可訪問
 * - 封面圖提取正確（如果頁面有）
 * - 頁面元數據提取完整
 * - 無 JavaScript 執行錯誤
 * 
 * ## 測試報告：
 * 
 * 測試完成後會生成：
 * - JSON 格式的詳細報告
 * - Markdown 格式的可讀報告
 * - 失敗案例的截圖（如果啟用）
 * 
 * ## 擴展測試：
 * 
 * 可以通過修改 TEST_CONFIG.testSites 添加更多測試網站
 * 可以通過修改測試腳本添加更多測試項目
 */

// ==================== 導出 ====================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TEST_CONFIG,
        ICON_EXTRACTION_SCRIPT,
        FEATURED_IMAGE_SCRIPT,
        METADATA_SCRIPT,
        TestResult,
        TestReport
    };
}

console.log('✅ 測試套件已載入');
console.log(`📋 測試網站數量: ${TEST_CONFIG.testSites.length}`);
console.log('📖 使用說明: 請查看文件底部的使用說明區段');
