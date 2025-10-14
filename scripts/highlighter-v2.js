// 使用 CSS Custom Highlight API 的新版標註功能
// v2.5.0 - 不修改DOM結構的標註實現
(function() {
    // 使用來自 utils.js 的共享函數 - 添加安全檢查
    const normalizeUrl = window.normalizeUrl;
    const StorageUtil = window.StorageUtil;

    // 確保必要的依賴存在
    if (typeof normalizeUrl !== 'function') {
        return;
    }
    if (typeof StorageUtil !== 'object' || !StorageUtil) {
        return;
    }

    /**
     * 檢查瀏覽器是否支持 CSS Custom Highlight API
     */
    function supportsHighlightAPI() {
        return 'highlights' in CSS && CSS.highlights !== undefined; // 可選鏈結不適用於 in 判斷，保留原寫法
    }

    /**
     * 標註管理器
     */
    class HighlightManager {
        constructor() {
            this.highlights = new Map(); // 存儲所有標註 ID -> {range, color, text}
            this.nextId = 1;
            this.currentColor = 'yellow';

            // 顏色配置
            this.colors = {
                yellow: '#fff3cd',
                green: '#d4edda',
                blue: '#cce7ff',
                red: '#f8d7da'
            };

            // 為每種顏色創建一個 Highlight 對象（CSS Highlight API 方式）
            this.highlightObjects = {};

            // 初始化 CSS Highlight Registry
            if (supportsHighlightAPI()) {
                this.initializeHighlightStyles();
            } else {
                // 靜默降級到傳統方法
            }

            // 🔧 修復：優先檢查並遷移 localStorage 中的舊標註數據
            this.initializationComplete = this.initialize();
        }

        /**
         * 異步初始化流程
         */
        async initialize() {
            try {
                // 步驟1：檢查並遷移 localStorage 數據
                await this.checkAndMigrateLegacyData();

                // 步驟2：從存儲恢復標註
                await this.restoreHighlights();

                // 步驟3：檢查並執行無痛自動遷移（處理 DOM 中的舊 span）
                await this.performSeamlessMigration();
            } catch (error) {
                // 初始化錯誤靜默處理
            }
        }

        /**
         * 執行無痛自動遷移
         */
        async performSeamlessMigration() {

    if (typeof window.SeamlessMigrationManager === 'undefined') {
                console.warn('⚠️ 無痛遷移管理器未加載');
                return;
            }

            try {
                const migrationManager = new window.SeamlessMigrationManager();
                const result = await migrationManager.performSeamlessMigration(this);

                if (result && result.completed) {
                } else if (result && result.phase) {
                } else if (result && result.rolledBack) {
                    console.warn(`⚠️ 遷移已回滾: ${result.reason}`);
                }

                // 無論如何，都重新保存當前狀態
                await this.saveToStorage();
            } catch (error) {
                console.error('❌ 無痛遷移過程出錯:', error);
            }
        }

        /**
         * 🔧 檢查並遷移 localStorage 中的舊標註數據
         */
        async checkAndMigrateLegacyData() {

            try {
                const currentUrl = window.location.href;
                const normalizedUrl = normalizeUrl(currentUrl);

                // 檢查可能的舊 key
                const possibleKeys = [
                    `highlights_${normalizedUrl}`,
                    `highlights_${currentUrl}`,
                    `highlights_${window.location.origin}${window.location.pathname}`
                ];

                let legacyData = null;
                let foundKey = null;

                // 嘗試所有可能的 key
                for (const key of possibleKeys) {
                    const raw = localStorage.getItem(key);
                    if (raw) {
                        try {
                            const data = JSON.parse(raw);
                            if (Array.isArray(data) && data.length > 0) {
                                legacyData = data;
                                foundKey = key;
                                break;
                            }
                        } catch (e) {
                            console.warn(`⚠️ [遷移] 解析失敗: ${key}`, e);
                        }
                    }
                }

                // 如果沒找到，遍歷所有 localStorage
                if (!legacyData) {
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith('highlights_')) {
                            const raw = localStorage.getItem(key);
                            try {
                                const data = JSON.parse(raw);
                                if (Array.isArray(data) && data.length > 0) {
                                    legacyData = data;
                                    foundKey = key;
                                    break;
                                }
                            } catch (e) {
                                // 忽略解析錯誤
                            }
                        }
                    }
                }

                if (legacyData && foundKey) {
                    // 檢查是否已經遷移過
                    const migrationKey = `migration_completed_${normalizedUrl}`;
                    const migrationStatus = await chrome.storage.local.get(migrationKey);

                    if (migrationStatus[migrationKey]) {
                        return;
                    }

                    // 執行數據遷移
                    await this.migrateLegacyDataToNewFormat(legacyData, foundKey);
                } else {
                }
            } catch (error) {
                console.error('❌ [遷移] 檢查舊數據失敗:', error);
            }
        }

        /**
         * 🔧 將舊格式數據遷移到新格式
         */
        async migrateLegacyDataToNewFormat(legacyData, oldKey) {

            try {
                const migratedHighlights = [];
                let successCount = 0;
                let failCount = 0;

                for (const oldItem of legacyData) {
                    try {
                        // 舊格式可能是多種形式：
                        // 1. { text: "...", color: "yellow", ... }
                        // 2. { text: "...", bgColor: "#fff3cd", ... }
                        // 3. 簡單字符串（極少見）

                        let textToFind = null;
                        let color = 'yellow';

                        if (typeof oldItem === 'object') {
                            textToFind = oldItem.text || oldItem.content;

                            // 處理顏色
                            if (oldItem.color) {
                                color = oldItem.color;
                            } else if (oldItem.bgColor || oldItem.backgroundColor) {
                                color = this.convertBgColorToName(oldItem.bgColor || oldItem.backgroundColor);
                            }
                        } else if (typeof oldItem === 'string') {
                            textToFind = oldItem;
                        }

                        if (!textToFind || textToFind.trim().length === 0) {
                            console.warn('⚠️ [遷移] 跳過空文本標註');
                            failCount++;
                            continue;
                        }

                        // 嘗試在頁面中找到這段文本
                        const range = this.findTextInPage(textToFind);

                        if (range) {
                            // v2.9.0: 使用更短的 ID 格式
                            const newId = `h${this.nextId++}`;
                            const rangeInfo = this.serializeRange(range);

                            migratedHighlights.push({
                                id: newId,
                                color: color,
                                text: textToFind,
                                timestamp: oldItem.timestamp || Date.now(),
                                rangeInfo: rangeInfo
                            });

                            successCount++;
                        } else {
                            failCount++;
                            console.warn(`  ⚠️ [遷移] 無法定位文本: ${textToFind.substring(0, 30)}...`);
                        }
                    } catch (error) {
                        failCount++;
                        console.error('  ❌ [遷移] 處理標註失敗:', error);
                    }
                }

                if (migratedHighlights.length > 0) {
                    // 保存到新存儲
                    const currentUrl = window.location.href;
                    await StorageUtil.saveHighlights(currentUrl, {
                        url: currentUrl,
                        highlights: migratedHighlights
                    });

                    console.log(`✅ [遷移] 已保存 ${migratedHighlights.length} 個標註到新存儲`);
                }

                // 標記遷移完成（無論成功多少）
                const normalizedUrl = normalizeUrl(window.location.href);
                await chrome.storage.local.set({
                    [`migration_completed_${normalizedUrl}`]: {
                        timestamp: Date.now(),
                        oldKey: oldKey,
                        totalCount: legacyData.length,
                        successCount: successCount,
                        failCount: failCount
                    }
                });

                // 刪除舊數據（謹慎操作）
                if (successCount > 0) {
                    localStorage.removeItem(oldKey);
                } else {
                    console.warn(`⚠️ [遷移] 保留舊數據（因為沒有成功遷移任何標註）`);
                }

                // 顯示用戶通知
                if (successCount > 0 || failCount > 0) {
                    this.showMigrationNotification(successCount, failCount, legacyData.length);
                }
            } catch (error) {
                console.error('❌ [遷移] 數據遷移失敗:', error);
            }
        }

        /**
         * 🔧 轉換背景顏色到顏色名稱
         */
        convertBgColorToName(bgColor) {
            const colorMap = {
                'rgb(255, 243, 205)': 'yellow',
                '#fff3cd': 'yellow',
                'rgb(212, 237, 218)': 'green',
                '#d4edda': 'green',
                'rgb(204, 231, 255)': 'blue',
                '#cce7ff': 'blue',
                'rgb(248, 215, 218)': 'red',
                '#f8d7da': 'red'
            };

            return colorMap[bgColor] || 'yellow';
        }

        /**
         * 🔧 在頁面中查找文本並返回 Range
         */
        findTextInPage(textToFind) {
            try {
                // 清理文本（移除多餘空白）
                const cleanText = textToFind.trim().replace(/\s+/g, ' ');

                // 方法1：使用 window.find() API（最快，但可能不夠精確）
                const selection = window.getSelection();
                selection.removeAllRanges();

                const found = window.find(cleanText, false, false, false, false, true, false);

                if (found && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0).cloneRange();
                    selection.removeAllRanges();
                    return range;
                }

                // 方法2：使用 TreeWalker 精確查找
                const range = this.findTextWithTreeWalker(cleanText);
                if (range) {
                    return range;
                }

                // 方法3：模糊匹配（處理空白字符差異）
                return this.findTextFuzzy(cleanText);
            } catch (error) {
                console.error('    ✗ 查找文本失敗:', error);
                return null;
            }
        }

        /**
         * 🔧 使用 TreeWalker 查找文本
         */
        findTextWithTreeWalker(textToFind) {
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        // 跳過腳本和樣式標籤
                        const parent = node.parentElement;
                        if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            let node;
            const textNodes = [];

            while (node = walker.nextNode()) {
                if (node.textContent.trim().length > 0) {
                    textNodes.push(node);
                }
            }

            // 在單個文本節點中查找
            for (const node of textNodes) {
                const text = node.textContent;
                const index = text.indexOf(textToFind);

                if (index !== -1) {
                    const range = document.createRange();
                    range.setStart(node, index);
                    range.setEnd(node, index + textToFind.length);
                    return range;
                }
            }

            // 嘗試跨文本節點匹配
            for (let i = 0; i < textNodes.length; i++) {
                let combinedText = '';
                const nodesInRange = [];

                for (let j = i; j < Math.min(i + 5, textNodes.length); j++) {
                    combinedText += textNodes[j].textContent;
                    nodesInRange.push(textNodes[j]);

                    const index = combinedText.indexOf(textToFind);
                    if (index !== -1) {
                        // 找到跨節點的匹配，創建跨節點 Range
                        const range = document.createRange();

                        // 找到起始節點和偏移
                        let currentLength = 0;
                        let startNode = null;
                        let startOffset = 0;

                        for (const n of nodesInRange) {
                            const nodeLength = n.textContent.length;
                            if (currentLength + nodeLength > index) {
                                startNode = n;
                                startOffset = index - currentLength;
                                break;
                            }
                            currentLength += nodeLength;
                        }

                        // 找到結束節點和偏移
                        currentLength = 0;
                        let endNode = null;
                        let endOffset = 0;
                        const endIndex = index + textToFind.length;

                        for (const n of nodesInRange) {
                            const nodeLength = n.textContent.length;
                            if (currentLength + nodeLength >= endIndex) {
                                endNode = n;
                                endOffset = endIndex - currentLength;
                                break;
                            }
                            currentLength += nodeLength;
                        }

                        if (startNode && endNode) {
                            try {
                                range.setStart(startNode, startOffset);
                                range.setEnd(endNode, endOffset);
                                return range;
                            } catch (e) {
                                console.warn('    ⚠️ 創建跨節點 Range 失敗:', e);
                            }
                        }
                    }
                }
            }

            return null;
        }

        /**
         * 🔧 模糊查找文本（處理空白字符差異）
         */
        findTextFuzzy(textToFind) {
            // 將文本轉換為更寬鬆的匹配模式
            const normalizedSearch = textToFind.replace(/\s+/g, '\\s+');
            const regex = new RegExp(normalizedSearch, 'i');

            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null
            );

            let node;
            while (node = walker.nextNode()) {
                if (regex.test(node.textContent)) {
                    const match = node.textContent.match(regex);
                    if (match) {
                        const index = match.index;
                        const range = document.createRange();
                        range.setStart(node, index);
                        range.setEnd(node, index + match[0].length);
                        return range;
                    }
                }
            }

            return null;
        }

        /**
         * 🔧 顯示遷移通知
         */
        showMigrationNotification(successCount, failCount, totalCount) {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 999999;
                max-width: 350px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: slideIn 0.3s ease-out;
            `;

            const successRate = Math.round((successCount / totalCount) * 100);
            const icon = successRate === 100 ? '✅' : successRate > 50 ? '⚠️' : '❌';

            notification.innerHTML = `
                <style>
                    @keyframes slideIn {
                        from { transform: translateX(400px); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                </style>
                <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #333;">
                    ${icon} 標註遷移完成
                </h3>
                <p style="margin: 0 0 5px 0; color: #666; font-size: 14px;">
                    ✅ 成功恢復: ${successCount} 個標註
                </p>
                ${failCount > 0 ? `
                    <p style="margin: 0 0 5px 0; color: #dc3545; font-size: 14px;">
                        ⚠️ 無法恢復: ${failCount} 個標註
                    </p>
                    <p style="margin: 0; color: #999; font-size: 12px;">
                        部分標註因頁面結構變化無法定位
                    </p>
                ` : ''}
                <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">
                    舊標註數據已自動遷移到新格式
                </p>
            `;

            document.body.appendChild(notification);

            // 5秒後自動消失
            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease-out';
                notification.style.transform = 'translateX(400px)';
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }, 5000);
        }

        /**
         * 初始化標註樣式
         */
        initializeHighlightStyles() {
            // 為每種顏色創建 Highlight 對象並註冊到 CSS.highlights
            Object.keys(this.colors).forEach(colorName => {
                // 創建 Highlight 對象
                this.highlightObjects[colorName] = new Highlight();

                // 註冊到 CSS.highlights（名稱格式：notion-yellow）
                CSS.highlights.set(`notion-${colorName}`, this.highlightObjects[colorName]);

                // 創建對應的 CSS 樣式
                const style = document.createElement('style');
                style.textContent = `
                    ::highlight(notion-${colorName}) {
                        background-color: ${this.colors[colorName]};
                        cursor: pointer;
                    }
                `;
                document.head.appendChild(style);
            });
        }

        /**
         * 添加標註
         */
        addHighlight(range, color = this.currentColor) {
            if (!range || range.collapsed) {
                return null;
            }

            const text = range.toString().trim();
            if (!text) {
                return null;
            }

            // v2.9.0: 使用更短的 ID 格式以節省存儲空間
            const id = `h${this.nextId++}`;

            // 保存標註信息
            const highlightData = {
                id: id,
                range: range.cloneRange(), // 克隆範圍以保持引用
                color: color,
                text: text,
                timestamp: Date.now(),
                // 保存範圍的序列化信息以便恢復
                rangeInfo: this.serializeRange(range)
            };

            this.highlights.set(id, highlightData);

            // 應用視覺高亮
            if (supportsHighlightAPI()) {
                this.applyHighlightAPI(id, range, color);
            } else {
                this.applyTraditionalHighlight(id, range, color);
            }

            // 保存到存儲
            this.saveToStorage();
            return id;
        }

        /**
         * 使用 CSS Highlight API 應用標註
         */
        applyHighlightAPI(id, range, color) {
            // 將 Range 添加到對應顏色的 Highlight 對象中
            if (this.highlightObjects[color]) {
                this.highlightObjects[color].add(range);
            } else {
                console.error(`❌ 未找到顏色 ${color} 的 Highlight 對象`);
            }
        }

        /**
         * 傳統方法應用標註（後備方案）
         */
        applyTraditionalHighlight(id, range, color) {
            try {
                const span = document.createElement('span');
                span.className = 'simple-highlight';
                span.dataset.highlightId = id;
                span.style.backgroundColor = this.colors[color];
                span.style.cursor = 'pointer';

                const contents = range.extractContents();
                span.appendChild(contents);
                range.insertNode(span);

                // 添加點擊刪除事件
                span.addEventListener('click', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.removeHighlight(id);
                    }
                });

                span.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    if (confirm('確定要刪除這個標記嗎？')) {
                        this.removeHighlight(id);
                    }
                });
            } catch (error) {
                console.error('傳統標註方法失敗:', error);
            }
        }

        /**
         * 刪除標註
         */
        removeHighlight(id) {
            const highlightData = this.highlights.get(id);
            if (!highlightData) {
                console.warn(`標註 ${id} 不存在`);
                return;
            }

            // 從 CSS Highlights 中移除
            if (supportsHighlightAPI()) {
                // 從對應顏色的 Highlight 對象中刪除這個 Range
                const color = highlightData.color;
                if (this.highlightObjects[color] && highlightData.range) {
                    this.highlightObjects[color].delete(highlightData.range);
                }
            } else {
                // 傳統方法：移除 DOM 元素
                const span = document.querySelector(`[data-highlight-id="${id}"]`);
                if (span) {
                    const parent = span.parentNode;
                    while (span.firstChild) {
                        parent.insertBefore(span.firstChild, span);
                    }
                    parent.removeChild(span);
                    parent.normalize();
                }
            }

            // 從存儲中移除
            this.highlights.delete(id);
            this.saveToStorage();
        }

        /**
         * 清除所有標註
         */
        clearAll() {
            if (supportsHighlightAPI()) {
                // 清除所有顏色的 Highlight 對象中的 Range
                Object.keys(this.highlightObjects).forEach(color => {
                    this.highlightObjects[color].clear();
                });
            } else {
                // 清除所有傳統標註元素
                document.querySelectorAll('.simple-highlight').forEach(span => {
                    const parent = span.parentNode;
                    while (span.firstChild) {
                        parent.insertBefore(span.firstChild, span);
                    }
                    parent.removeChild(span);
                    parent.normalize();
                });
            }

            this.highlights.clear();
            this.saveToStorage();
            console.log('✅ 所有標註已清除');
        }

        /**
         * 檢測點擊位置是否在標註內，並返回標註ID
         */
        getHighlightAtPoint(x, y) {
            try {
                // 從座標獲取 Range
                let range;
                if (document.caretRangeFromPoint) {
                    range = document.caretRangeFromPoint(x, y);
                } else if (document.caretPositionFromPoint) {
                    const pos = document.caretPositionFromPoint(x, y);
                    range = document.createRange();
                    range.setStart(pos.offsetNode, pos.offset);
                    range.setEnd(pos.offsetNode, pos.offset);
                }

                if (!range) return null;

                // 檢查這個點是否在任何已有標註內
                for (const [id, highlight] of this.highlights.entries()) {
                    if (this.rangesOverlap(range, highlight.range)) {
                        return id;
                    }
                }

                return null;
            } catch (error) {
                console.error('檢測標註位置失敗:', error);
                return null;
            }
        }

        /**
         * 檢測兩個 Range 是否重疊
         */
        rangesOverlap(range1, range2) {
            try {
                // 檢查 range2 的起點是否在 range1 內
                if (range1.isPointInRange(range2.startContainer, range2.startOffset)) {
                    return true;
                }
                // 檢查 range2 的終點是否在 range1 內
                if (range1.isPointInRange(range2.endContainer, range2.endOffset)) {
                    return true;
                }
                // 檢查 range1 是否完全在 range2 內
                if (range2.isPointInRange(range1.startContainer, range1.startOffset)) {
                    return true;
                }
                return false;
            } catch (error) {
                // 如果節點不在同一個文檔樹中，isPointInRange 會拋出錯誤
                return false;
            }
        }

        /**
         * 處理點擊事件，檢測是否要刪除標註
         */
        handleDocumentClick(event) {
            // 只在 Ctrl/Cmd + 點擊時處理
            if (!(event.ctrlKey || event.metaKey)) {
                return;
            }

            const highlightId = this.getHighlightAtPoint(event.clientX, event.clientY);
            if (highlightId) {
                event.preventDefault();
                event.stopPropagation();

                const highlight = this.highlights.get(highlightId);
                const text = highlight.text.substring(0, 30) + (highlight.text.length > 30 ? '...' : '');

                if (confirm(`確定要刪除這個標註嗎？\n\n"${text}"`)) {
                    this.removeHighlight(highlightId);
                    this.updateHighlightCount();
                }
            }
        }

        /**
         * 序列化範圍信息以便存儲
         * v2.8.0: 移除重複的 text 字段以節省存儲空間
         */
        serializeRange(range) {
            return {
                startContainerPath: this.getNodePath(range.startContainer),
                startOffset: range.startOffset,
                endContainerPath: this.getNodePath(range.endContainer),
                endOffset: range.endOffset
                // v2.8.0: 移除 text 字段（已在頂層保存）
            };
        }

        /**
         * 獲取節點的路徑
         * v2.9.0: 返回緊湊的字符串格式以節省存儲空間
         */
        getNodePath(node) {
            const pathSteps = [];
            let current = node;

            while (current && current !== document.body) {
                if (current.nodeType === Node.TEXT_NODE) {
                    // 文本節點：記錄在父節點中的索引
                    const parent = current.parentNode;
                    const textNodes = Array.from(parent.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
                    const index = textNodes.indexOf(current);
                    pathSteps.unshift(`text[${index}]`);
                    current = parent;
                } else if (current.nodeType === Node.ELEMENT_NODE) {
                    // 元素節點：記錄標籤名和在父節點中的索引
                    const parent = current.parentNode;
                    if (parent) {
                        const siblings = Array.from(parent.children);
                        const index = siblings.indexOf(current);
                        pathSteps.unshift(`${current.tagName.toLowerCase()}[${index}]`);
                    }
                    current = current.parentNode;
                }
            }

            // v2.9.0: 返回字符串格式 "div[0]/p[2]/text[0]"
            return pathSteps.join('/');
        }

        /**
         * 根據路徑獲取節點
         * v2.9.0: 支持字符串格式和舊的對象數組格式（向後兼容）
         */
        getNodeByPath(path) {
            // v2.9.0: 如果是字符串格式，先解析
            if (typeof path === 'string') {
                path = this.parsePathFromString(path);
                if (!path) return null;
            }

            // 確保 document.body 存在且可訪問
            if (!document || !document.body) {
                console.debug('無法訪問 document.body');
                return null;
            }

            let current = document.body;

            for (const step of path) {
                try {
                    if (step.type === 'element') {
                        // 確保 current 存在且有 children 屬性
                        if (!current || !current.children) {
                            console.debug('當前節點無效或沒有子元素:', step);
                            return null;
                        }
                        
                        const children = Array.from(current.children);
                        // 添加邊界檢查
                        if (step.index < 0 || step.index >= children.length) {
                            console.debug('元素索引超出範圍:', step, '可用子元素數量:', children.length);
                            // 嘗試模糊匹配：查找具有相同標籤名的元素
                            const matchingElements = children.filter(child => 
                                child.tagName && child.tagName.toLowerCase() === step.tag
                            );
                            if (matchingElements.length > 0) {
                                console.debug('  -> 使用模糊匹配找到元素:', step.tag);
                                current = matchingElements[0];
                                continue;
                            }
                            return null;
                        }
                        current = children[step.index];
                    } else if (step.type === 'text') {
                        // 確保 current 存在且有 childNodes 屬性
                        if (!current || !current.childNodes) {
                            console.debug('當前節點無效或沒有子節點:', step);
                            return null;
                        }
                        
                        const textNodes = Array.from(current.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
                        // 添加邊界檢查
                        if (step.index < 0 || step.index >= textNodes.length) {
                            console.debug('文本節點索引超出範圍:', step, '可用文本節點數量:', textNodes.length);
                            return null;
                        }
                        current = textNodes[step.index];
                    }
                } catch (error) {
                    console.debug('處理路徑步驟時出錯:', step, error);
                    return null;
                }
            }

            return current;
        }

        /**
         * 從字符串解析路徑
         * v2.9.0: 新增方法，用於解析緊湊格式的路徑字符串
         * @param {string} pathStr - 路徑字符串，格式：'div[0]/p[2]/text[0]'
         * @returns {Array|null} 路徑對象數組，或 null（解析失敗）
         */
        parsePathFromString(pathStr) {
            if (!pathStr || typeof pathStr !== 'string') {
                return null;
            }

            try {
                const steps = pathStr.split('/');
                const path = [];

                for (const step of steps) {
                    // 匹配格式：tagname[index] 或 text[index]
                    const match = step.match(/^([a-z0-9\-]+)\[(\d+)\]$/i);
                    if (!match) {
                        console.warn('無效的路徑步驟格式:', step);
                        return null;
                    }

                    const [, name, indexStr] = match;
                    const index = parseInt(indexStr, 10);

                    if (name === 'text') {
                        path.push({ type: 'text', index });
                    } else {
                        path.push({ type: 'element', tag: name, index });
                    }
                }

                return path;
            } catch (error) {
                console.error('路徑解析失敗:', pathStr, error);
                return null;
            }
        }

        /**
         * 將對象數組格式的路徑轉換為字符串格式
         * v2.9.0: 用於數據遷移
         * @param {Array} pathArray - 對象數組格式的路徑
         * @returns {string} 字符串格式的路徑
         */
        convertPathToString(pathArray) {
            if (!Array.isArray(pathArray)) {
                return '';
            }

            return pathArray.map(step => {
                if (step.type === 'text') {
                    return `text[${step.index}]`;
                } else if (step.type === 'element') {
                    return `${step.tag}[${step.index}]`;
                }
                return '';
            }).filter(Boolean).join('/');
        }

        /**
         * 反序列化範圍
         * v2.8.0: 使用外部文本參數進行驗證，避免重複存儲
         * @param {Object} rangeInfo - 序列化的範圍信息
         * @param {string} expectedText - 期望的文本內容（用於驗證）
         */
        deserializeRange(rangeInfo, expectedText) {
            try {
                // 檢查必要的參數
                if (!rangeInfo) {
                    console.debug('範圍信息無效');
                    return null;
                }

                const startContainer = this.getNodeByPath(rangeInfo.startContainerPath);
                const endContainer = this.getNodeByPath(rangeInfo.endContainerPath);

                // 如果無法找到容器節點，嘗試使用模糊查找
                if (!startContainer || !endContainer) {
                    console.debug('無法恢復範圍：找不到容器節點，嘗試模糊查找...');
                    
                    // 嘗試在整個文檔中查找包含目標文本的節點
                    if (expectedText) {
                        const foundRange = this.findTextInPage(expectedText);
                        if (foundRange) {
                            console.debug('  -> 使用模糊查找成功找到文本範圍');
                            return foundRange;
                        }
                    }
                    
                    return null;
                }

                // 驗證偏移量
                const startOffset = rangeInfo.startOffset || 0;
                const endOffset = rangeInfo.endOffset || 0;
                
                // 確保偏移量在有效範圍內
                const maxStartOffset = startContainer.textContent ? startContainer.textContent.length : 0;
                const maxEndOffset = endContainer.textContent ? endContainer.textContent.length : 0;
                
                if (startOffset < 0 || startOffset > maxStartOffset) {
                    console.debug('起始偏移量無效:', startOffset, '最大值:', maxStartOffset);
                    return null;
                }
                
                if (endOffset < 0 || endOffset > maxEndOffset) {
                    console.debug('結束偏移量無效:', endOffset, '最大值:', maxEndOffset);
                    return null;
                }

                const range = document.createRange();
                range.setStart(startContainer, startOffset);
                range.setEnd(endContainer, endOffset);

                // v2.8.0: 使用傳入的 expectedText 驗證
                // 向後兼容：如果 rangeInfo 中有 text（舊格式），優先使用它
                const textToVerify = rangeInfo.text || expectedText;

                if (range.toString() === textToVerify) {
                    return range;
                } else {
                    console.debug('範圍文本不匹配，可能頁面結構已改變');
                    console.debug('期望:', textToVerify?.substring(0, 50));
                    console.debug('實際:', range.toString().substring(0, 50));
                    
                    // 即使文本不匹配，也返回範圍（作為最後的回退）
                    console.debug('  -> 回退到返回範圍對象');
                    return range;
                }
            } catch (error) {
                console.debug('反序列化範圍失敗:', error);
                return null;
            }
        }

        /**
         * 保存到存儲
         */
        async saveToStorage() {
            const currentUrl = window.location.href;

            const data = {
                url: currentUrl,
                highlights: Array.from(this.highlights.values()).map(h => ({
                    id: h.id,
                    color: h.color,
                    text: h.text,
                    timestamp: h.timestamp,
                    rangeInfo: h.rangeInfo
                }))
            };

            try {
                await StorageUtil.saveHighlights(currentUrl, data);
                console.log(`💾 已保存 ${data.highlights.length} 個標註`);
            } catch (error) {
                console.error('保存標註失敗:', error);
            }
        }

        /**
         * 從存儲恢復標註
         */
        async restoreHighlights() {
            try {
                const url = window.location.href;
                console.log('   pathname:', window.location.pathname);
                console.log('   hash:', window.location.hash || '(無)');
                console.log('   search:', window.location.search || '(無)');

                const highlights = await StorageUtil.loadHighlights(url);

                if (!highlights || highlights.length === 0) {
                    return;
                }

                let restored = 0;
                let failed = 0;

                // v2.8.0 & v2.9.0: 檢查並遷移舊格式數據
                let needsMigration = false;

                for (const highlightData of highlights) {
                    console.log(`   恢復標註 ${highlightData.id}:`, {
                        text: highlightData.text?.substring(0, 30) + '...',
                        color: highlightData.color,
                        rangeInfo: highlightData.rangeInfo
                    });

                    // v2.8.0: 檢測並清理舊格式的重複文本
                    if (highlightData.rangeInfo && highlightData.rangeInfo.text) {
                        console.log(`   🔄 [v2.8.0] 檢測到重複文本，將自動清理`);
                        delete highlightData.rangeInfo.text;
                        needsMigration = true;
                    }

                    // v2.9.0: 檢測並轉換舊格式的路徑（對象數組 → 字符串）
                    if (highlightData.rangeInfo) {
                        const { startContainerPath, endContainerPath } = highlightData.rangeInfo;

                        // 如果是對象數組格式（舊格式），轉換為字符串
                        if (Array.isArray(startContainerPath)) {
                            console.log(`   🔄 [v2.9.0] 檢測到舊路徑格式，將自動轉換`);
                            highlightData.rangeInfo.startContainerPath = this.convertPathToString(startContainerPath);
                            highlightData.rangeInfo.endContainerPath = this.convertPathToString(endContainerPath);
                            needsMigration = true;
                        }
                    }

                    // v2.8.0: 傳入 text 參數用於驗證
                    const range = this.deserializeRange(highlightData.rangeInfo, highlightData.text);
                    if (range) {
                        const id = highlightData.id;

                        // 恢復標註
                        this.highlights.set(id, {
                            id: id,
                            range: range,
                            color: highlightData.color,
                            text: highlightData.text,
                            timestamp: highlightData.timestamp,
                            rangeInfo: highlightData.rangeInfo
                        });

                        // 應用視覺高亮
                        if (supportsHighlightAPI()) {
                            this.applyHighlightAPI(id, range, highlightData.color);
                        } else {
                            this.applyTraditionalHighlight(id, range, highlightData.color);
                        }

                        restored++;
                    } else {
                        failed++;
                        console.warn(`   ❌ 恢復失敗: ${highlightData.id} - Range 反序列化失敗`);
                    }
                }

                // v2.8.0 & v2.9.0: 如果有遷移，保存新格式
                if (needsMigration) {
                    await this.saveToStorage();
                }

                console.log(`✅ 恢復完成: 成功 ${restored}/${highlights.length}，失敗 ${failed}`);

                // 更新 nextId
                if (highlights.length > 0) {
                    const maxId = Math.max(...highlights.map(h =>
                        parseInt(h.id.replace('highlight-', '')) || 0
                    ));
                    this.nextId = maxId + 1;
                }

                // 驗證 CSS Highlights 狀態
                if (supportsHighlightAPI()) {
                    Object.keys(this.highlightObjects).forEach(color => {
                        const size = this.highlightObjects[color]?.size || 0;
                        console.log(`   ${color}: ${size} 個 Range`);
                    });
                }
            } catch (error) {
                console.error('❌ 恢復標註失敗:', error);
                console.error('錯誤堆棧:', error.stack);
            }
        }

        /**
         * 收集標註數據用於同步到 Notion
         */
        collectHighlightsForNotion() {

            const colorMap = {
                yellow: 'yellow_background',
                green: 'green_background',
                blue: 'blue_background',
                red: 'red_background'
            };

            const result = Array.from(this.highlights.values()).map(h => ({
                text: h.text,
                color: colorMap[h.color] || 'yellow_background'
            }));
            result.forEach((h, i) => {
                console.log(`   ${i+1}. "${h.text.substring(0, 50)}..." (${h.color})`);
            });

            return result;
        }

        /**
         * 設置當前顏色
         */
        setColor(color) {
            if (this.colors[color]) {
                this.currentColor = color;
            }
        }

        /**
         * 獲取標註數量
         */
        getCount() {
            return this.highlights.size;
        }

        /**
         * 強制恢復標註（用於頁面刷新後確保存儲的標註被正確加載）
         */
        async forceRestoreHighlights() {
            console.log('🔧 強制恢復標註');
            try {
                // 清除現有的標註
                this.clearAll();

                // 重新從存儲中加載
                await this.restoreHighlights();

                console.log('✅ 標註強制恢復完成');
                return true;
            } catch (error) {
                console.error('❌ 強制恢復標註失敗:', error);
                return false;
            }
        }
}

/**
 * 初始化標註工具
 */
    function initHighlighter() {
        // 如果已存在，顯示工具欄
        if (window.notionHighlighter && typeof window.notionHighlighter.show === 'function') {
            window.notionHighlighter.show();
            return;
        }

        // 創建標註管理器
        const manager = new HighlightManager();

        // 標註狀態
        let isActive = false;

        // 創建簡單工具欄（默認隱藏）
        const toolbar = createSimpleToolbar(manager);
        toolbar.style.display = 'none'; // 🔑 默認隱藏
        document.body.appendChild(toolbar);
        // Query helpers to support Shadow DOM
        const $ = (sel) => (toolbar.shadowRoot || toolbar).querySelector(sel);
        const $$ = (sel) => (toolbar.shadowRoot || toolbar).querySelectorAll(sel);

        // 切換標註模式
        function toggleHighlightMode() {
            isActive = !isActive;
            const btn = toolbar.querySelector('#toggle-highlight-v2');

            if (isActive) {
                btn.style.background = '#48bb78';
                btn.style.color = 'white';
                btn.textContent = '標註中...';
                document.body.style.cursor = 'crosshair';
            } else {
                btn.style.background = 'white';
                btn.style.color = '#333';
                btn.textContent = '開始標註';
                document.body.style.cursor = '';
            }
        }

        // 綁定切換按鈕
        toolbar.querySelector('#toggle-highlight-v2').addEventListener('click', toggleHighlightMode);

        // 綁定關閉按鈕
        toolbar.querySelector('#close-highlight-v2').addEventListener('click', () => {
            toolbar.style.display = 'none';
            if (isActive) {
                toggleHighlightMode(); // 關閉標註模式
            }
        });

        // 綁定管理標註按鈕
        toolbar.querySelector('#manage-highlights-v2').addEventListener('click', () => {
            const listDiv = toolbar.querySelector('#highlight-list-v2');
            const manageBtn = toolbar.querySelector('#manage-highlights-v2');

            if (listDiv.style.display === 'none') {
                // 顯示標註列表
                updateHighlightList();
                listDiv.style.display = 'block';
                manageBtn.textContent = '🔼 收起';
            } else {
                // 隱藏標註列表
                listDiv.style.display = 'none';
                manageBtn.textContent = '📋 管理';
            }
        });

        // 綁定顏色選擇按鈕
        toolbar.querySelectorAll('.color-btn-v2').forEach(btn => {
            btn.addEventListener('click', () => {
                const selectedColor = btn.dataset.color;
                manager.currentColor = selectedColor;

                // 更新所有顏色按鈕的邊框樣式
                toolbar.querySelectorAll('.color-btn-v2').forEach(b => {
                    if (b.dataset.color === selectedColor) {
                        b.style.border = '3px solid #333';
                        b.style.transform = 'scale(1.1)';
                    } else {
                        b.style.border = '2px solid #ddd';
                        b.style.transform = 'scale(1)';
                    }
                });
            });
        });

        // 綁定/解綁 全局點擊監聽器（用於 Ctrl+點擊刪除）
        const clickHandler = (e) => manager.handleDocumentClick(e);
        let listenerBound = false;
        const bindDeleteListener = () => {
            if (!listenerBound) {
                document.addEventListener('click', clickHandler, true);
                listenerBound = true;
            }
        };
        const unbindDeleteListener = () => {
            if (listenerBound) {
                document.removeEventListener('click', clickHandler, true);
                listenerBound = false;
            }
        };
        // 初始綁定一次
        bindDeleteListener();

        // 清理函數（當工具欄關閉時移除監聽器）
        const originalHide = () => {
            toolbar.style.display = 'none';
            unbindDeleteListener();
        };
        toolbar.querySelector('#close-highlight-v2').addEventListener('click', originalHide, { once: true });

        // 監控 toolbar 是否被移除，若被移除則自動重新掛載
        // 建立 MutationObserver 並在全域保留引用，避免被 GC
        const mo = new MutationObserver(() => {
            if (!document.body.contains(toolbar)) {
                try {
                    document.body.appendChild(toolbar);
                } catch (e) {
                    console.error('MutationObserver 重新掛載工具欄失敗:', e);
                }
            }
        });
        try {
            mo.observe(document.body, { childList: true, subtree: true });
            // 注意：稍後在 window.notionHighlighter 生成後，會把 mo 掛到 _observer 上
            window.addEventListener('unload', () => mo.disconnect(), { once: true });
        } catch (e) {
            console.warn('MutationObserver 初始化失敗:', e);
        }

        // 綁定同步按鈕
        toolbar.querySelector('#sync-to-notion-v2').addEventListener('click', async () => {
            const syncBtn = toolbar.querySelector('#sync-to-notion-v2');
            const statusDiv = toolbar.querySelector('#highlight-status-v2');
            const originalText = syncBtn.textContent;

            try {
                const highlights = manager.collectHighlightsForNotion();

                if (highlights.length === 0) {
                    statusDiv.textContent = '⚠️ 沒有標註可同步';
                    statusDiv.style.color = '#f59e0b';
                    setTimeout(() => {
                        updateHighlightCount();
                    }, 2000);
                    return;
                }

                // 更新按鈕狀態
                syncBtn.textContent = '⏳ 同步中...';
                syncBtn.disabled = true;
                syncBtn.style.opacity = '0.6';
                statusDiv.textContent = `正在同步 ${highlights.length} 段標註...`;
                statusDiv.style.color = '#2196F3';

                // 調用 background.js 的同步功能
                chrome.runtime.sendMessage({
                    action: 'syncHighlights',
                    highlights: highlights
                }, (response) => {
                    syncBtn.disabled = false;
                    syncBtn.style.opacity = '1';

                    if (response && response.success) {
                        syncBtn.textContent = '✅ 同步成功';
                        syncBtn.style.background = '#48bb78';
                        statusDiv.textContent = `✅ 已同步 ${highlights.length} 段標註`;
                        statusDiv.style.color = '#48bb78';

                        // 同步成功後更新 Open in Notion 按鈕狀態
                        updateOpenNotionButton();

                        setTimeout(() => {
                            syncBtn.textContent = originalText;
                            syncBtn.style.background = '#2196F3';
                            updateHighlightCount();
                        }, 3000);
                    } else {
                        syncBtn.textContent = '❌ 同步失敗';
                        syncBtn.style.background = '#ef4444';
                        statusDiv.textContent = response?.error || '同步失敗，請重試';
                        statusDiv.style.color = '#ef4444';

                        setTimeout(() => {
                            syncBtn.textContent = originalText;
                            syncBtn.style.background = '#2196F3';
                            updateHighlightCount();
                        }, 3000);
                    }
                });
            } catch (error) {
                console.error('同步標註失敗:', error);
                syncBtn.textContent = '❌ 同步失敗';
                syncBtn.disabled = false;
                syncBtn.style.opacity = '1';
                syncBtn.style.background = '#ef4444';
                statusDiv.textContent = '發生錯誤，請重試';
                statusDiv.style.color = '#ef4444';

                setTimeout(() => {
                    syncBtn.textContent = originalText;
                    syncBtn.style.background = '#2196F3';
                    updateHighlightCount();
                }, 3000);
            }
        });

        // 綁定 "Open in Notion" 按鈕
        toolbar.querySelector('#open-notion-v2').addEventListener('click', () => {
            // 獲取當前頁面的 Notion URL
            chrome.runtime.sendMessage({ action: 'checkPageStatus' }, (response) => {

                if (response && response.success && response.isSaved) {
                    // handleCheckPageStatus 會為舊版本數據生成 notionUrl
                    const notionUrl = response.notionUrl;
                    if (notionUrl) {
                        // 在新標籤頁中打開 Notion 頁面
                        chrome.runtime.sendMessage({
                            action: 'openNotionPage',
                            url: notionUrl
                        });
                    } else {
                        // 顯示錯誤信息
                        const statusDiv = toolbar.querySelector('#highlight-status-v2');
                        const originalText = statusDiv.innerHTML;
                        statusDiv.textContent = '❌ 無法獲取 Notion 頁面鏈接';
                        statusDiv.style.color = '#ef4444';
                        setTimeout(() => {
                            statusDiv.innerHTML = originalText;
                            statusDiv.style.color = '#666';
                        }, 3000);
                    }
                } else {
                    // 顯示錯誤信息
                    const statusDiv = toolbar.querySelector('#highlight-status-v2');
                    const originalText = statusDiv.innerHTML;
                    statusDiv.textContent = '❌ 頁面尚未保存到 Notion';
                    statusDiv.style.color = '#ef4444';
                    setTimeout(() => {
                        statusDiv.innerHTML = originalText;
                        statusDiv.style.color = '#666';
                    }, 3000);
                }
            });
        });

        // 檢查並更新 "Open in Notion" 按鈕狀態的函數
        function updateOpenNotionButton() {
            chrome.runtime.sendMessage({ action: 'checkPageStatus' }, (response) => {
                const openBtn = toolbar.querySelector('#open-notion-v2');
                const listOpenBtn = toolbar.querySelector('#list-open-notion-v2');

                // 更寬鬆的顯示邏輯：只要頁面已保存就顯示按鈕
                // notionUrl 會在 handleCheckPageStatus 中為舊版本數據自動生成
                if (response && response.success && response.isSaved) {
                    openBtn.style.display = 'block';
                    if (listOpenBtn) {
                        listOpenBtn.style.display = 'block';
                    }
                } else {
                    openBtn.style.display = 'none';
                    if (listOpenBtn) {
                        listOpenBtn.style.display = 'none';
                    }
                }
            });
        }

        // 初始檢查頁面狀態
        updateOpenNotionButton();

        // 更新標註計數的輔助函數
        function updateHighlightCount() {
            const countSpan = toolbar.querySelector('#highlight-count-v2');
            const statusDiv = toolbar.querySelector('#highlight-status-v2');
            if (countSpan) {
                const count = manager.getCount();
                countSpan.textContent = count;
                statusDiv.innerHTML = `已標註: <span id="highlight-count-v2">${count}</span> 段`;
                statusDiv.style.color = '#666';
            }
        }

        // 更新標註列表的輔助函數
        function updateHighlightList() {
            const listDiv = toolbar.querySelector('#highlight-list-v2');
            if (!listDiv || !manager) return;

            const highlights = Array.from(manager.highlights.values());

            if (highlights.length === 0) {
                listDiv.innerHTML = `
                    <div style="padding: 8px; text-align: center; color: #666; font-size: 11px;">
                        暫無標註
                    </div>
                `;
                return;
            }

            // 添加標註列表頭部，包含 Open in Notion 按鈕
            const headerHtml = `
                <div style="padding: 8px; border-bottom: 2px solid #e5e7eb; background: #f8f9fa; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; color: #333; font-size: 12px;">標註列表</span>
                    <button id="list-open-notion-v2" style="padding: 4px 8px; border: 1px solid #10b981; border-radius: 3px; background: #10b981; color: white; cursor: pointer; font-size: 10px; font-weight: 500; display: none;" title="在 Notion 中打開此頁面">
                        🔗 打開
                    </button>
                </div>
            `;

            const highlightsHtml = highlights.map((h, index) => {
                const text = h.text.substring(0, 40) + (h.text.length > 40 ? '...' : '');
                const colorName = { yellow: '黃', green: '綠', blue: '藍', red: '紅' }[h.color] || h.color;
                return `
                    <div style="display: flex; align-items: center; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="color: #333; font-weight: 500; margin-bottom: 2px;">${index + 1}. ${colorName}色標註</div>
                            <div style="color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${text}</div>
                        </div>
                        <button
                            data-highlight-id="${h.id}"
                            class="delete-highlight-btn-v2"
                            style="padding: 4px 8px; border: 1px solid #ef4444; border-radius: 3px; background: white; color: #ef4444; cursor: pointer; font-size: 11px; margin-left: 8px; flex-shrink: 0;"
                            title="刪除此標註"
                        >
                            🗑️
                        </button>
                    </div>
                `;
            }).join('');

            // 組合完整的 HTML
            listDiv.innerHTML = headerHtml + highlightsHtml;

            // 綁定刪除按鈕事件
            listDiv.querySelectorAll('.delete-highlight-btn-v2').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-highlight-id');
                    if (confirm('確定要刪除這個標註嗎？')) {
                        manager.removeHighlight(id);
                        updateHighlightCount();
                        updateHighlightList();
                    }
                });
            });

            // 綁定標註列表中的 "Open in Notion" 按鈕事件
            const listOpenBtn = listDiv.querySelector('#list-open-notion-v2');
            if (listOpenBtn) {
                listOpenBtn.addEventListener('click', () => {
                    // 獲取當前頁面的 Notion URL
                    chrome.runtime.sendMessage({ action: 'checkPageStatus' }, (response) => {

                        if (response && response.success && response.isSaved) {
                            // handleCheckPageStatus 會為舊版本數據生成 notionUrl
                            const notionUrl = response.notionUrl;
                            if (notionUrl) {
                                // 在新標籤頁中打開 Notion 頁面
                                chrome.runtime.sendMessage({
                                    action: 'openNotionPage',
                                    url: notionUrl
                                });
                            } else {
                                // 顯示錯誤信息
                                const statusDiv = toolbar.querySelector('#highlight-status-v2');
                                const originalText = statusDiv.innerHTML;
                                statusDiv.textContent = '❌ 無法獲取 Notion 頁面鏈接';
                                statusDiv.style.color = '#ef4444';
                                setTimeout(() => {
                                    statusDiv.innerHTML = originalText;
                                    statusDiv.style.color = '#666';
                                }, 3000);
                            }
                        } else {
                            // 顯示錯誤信息
                            const statusDiv = toolbar.querySelector('#highlight-status-v2');
                            const originalText = statusDiv.innerHTML;
                            statusDiv.textContent = '❌ 頁面尚未保存到 Notion';
                            statusDiv.style.color = '#ef4444';
                            setTimeout(() => {
                                statusDiv.innerHTML = originalText;
                                statusDiv.style.color = '#666';
                            }, 3000);
                        }
                    });
                });
            }

            // 更新標註列表中的 Open in Notion 按鈕狀態
            updateOpenNotionButton();
        }

        // 監聽選擇事件 - 只在標註模式開啟時處理
        document.addEventListener('mouseup', (e) => {
            // 如果標註模式未啟動，或點擊在工具欄上，不處理
            if (!isActive || e.target.closest('#notion-highlighter-v2')) {
                return;
            }

            // 延遲一點以確保選擇完成
            setTimeout(() => {
                const selection = window.getSelection();
                if (!selection.isCollapsed && selection.toString().trim()) {
                    const range = selection.getRangeAt(0);

                    // 創建標註（CSS Highlight API 不需要修改 DOM，所以不影響選擇）
                    const id = manager.addHighlight(range, manager.currentColor);
                    if (id) {
                        // 更新計數顯示
                        updateHighlightCount();
                    }

                    // 🔑 關鍵：不清除選擇！
                    // CSS Highlight API 的優勢就是可以讓標註和選擇共存
                    // 用戶可以繼續複製文字或進行其他操作
                    // 選擇會在用戶點擊其他地方時自然消失
                }
            }, 10);
        });

        // 全局引用
        // 保留 observer 與監聽器綁定狀態於全域對象，避免被 GC 或重複綁定
        window.notionHighlighter = {
            manager: manager,
            toolbar: toolbar,
            isActive: () => isActive,
            toggle: toggleHighlightMode,
            show: () => {
                try {
                    // 確保刪除監聽器已綁定（避免多次開關後失效）
                    try {
                        if (typeof bindDeleteListener === 'function') {
                            bindDeleteListener();
                        }
                    } catch (e) { /* ignore */ }
                    // If the toolbar was removed by the page, re-attach it
                    if (!toolbar.isConnected || !document.body.contains(toolbar)) {
                        document.body.appendChild(toolbar);
                    }
                    // Ensure core styles so site CSS can't easily override
                    toolbar.style.position = 'fixed';
                    toolbar.style.top = toolbar.style.top || '20px';
                    toolbar.style.right = toolbar.style.right || '20px';
                    toolbar.style.zIndex = '2147483647';
                    toolbar.style.display = 'block';
                    toolbar.style.visibility = 'visible';
                    toolbar.style.opacity = '1';
                } catch (e) {
                    console.error('顯示標註工具欄失敗:', e);
                }
            },
            hide: () => {
                try {
                    toolbar.style.display = 'none';
                } catch (e) {
                    console.error('隱藏標註工具欄失敗:', e);
                }
            },
            collectHighlights: () => manager.collectHighlightsForNotion(),
            _observer: mo,
            _listenerBound: () => listenerBound,
            _bindDeleteListener: bindDeleteListener,
            _unbindDeleteListener: unbindDeleteListener
        };

        //
    }

    /**
     * 創建簡單工具欄
     */
    function createSimpleToolbar(manager) {
        const toolbar = document.createElement('div');
        toolbar.id = 'notion-highlighter-v2';
        toolbar.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            /* Use a very high z-index to avoid being covered by site overlays */
            z-index: 2147483647;
            font-family: Arial, sans-serif;
            font-size: 14px;
            min-width: 200px;
        `;

        toolbar.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: bold; text-align: center; color: #333;">📝 標註工具</div>

            <!-- 標註控制按鈕 -->
            <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                <button id="toggle-highlight-v2" style="flex: 1; padding: 8px 12px; border: 1px solid #48bb78; border-radius: 4px; background: white; color: #48bb78; cursor: pointer; font-size: 13px; font-weight: 500;">
                    開始標註
                </button>
                <button id="close-highlight-v2" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; color: #666; cursor: pointer; font-size: 13px;">
                    ✕
                </button>
            </div>

            <!-- 顏色選擇器 -->
            <div style="display: flex; gap: 6px; justify-content: center; margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                <button class="color-btn-v2" data-color="yellow" style="width: 32px; height: 32px; background: #ffd93d; border: 3px solid #333; border-radius: 4px; cursor: pointer; transition: all 0.2s;" title="黃色標註"></button>
                <button class="color-btn-v2" data-color="green" style="width: 32px; height: 32px; background: #6bcf7f; border: 2px solid #ddd; border-radius: 4px; cursor: pointer; transition: all 0.2s;" title="綠色標註"></button>
                <button class="color-btn-v2" data-color="blue" style="width: 32px; height: 32px; background: #4d9de0; border: 2px solid #ddd; border-radius: 4px; cursor: pointer; transition: all 0.2s;" title="藍色標註"></button>
                <button class="color-btn-v2" data-color="red" style="width: 32px; height: 32px; background: #e15554; border: 2px solid #ddd; border-radius: 4px; cursor: pointer; transition: all 0.2s;" title="紅色標註"></button>
            </div>

            <!-- 操作按鈕 -->
            <div style="display: flex; gap: 6px; margin-bottom: 10px;">
                <button id="sync-to-notion-v2" style="flex: 1; padding: 8px 10px; border: 1px solid #2196F3; border-radius: 4px; background: #2196F3; color: white; cursor: pointer; font-size: 12px; font-weight: 500;">
                    🔄 同步
                </button>
                <button id="open-notion-v2" style="flex: 1; padding: 8px 10px; border: 1px solid #10b981; border-radius: 4px; background: #10b981; color: white; cursor: pointer; font-size: 12px; font-weight: 500; display: none;">
                    🔗 打開
                </button>
                <button id="manage-highlights-v2" style="flex: 1; padding: 8px 10px; border: 1px solid #f59e0b; border-radius: 4px; background: white; color: #f59e0b; cursor: pointer; font-size: 12px; font-weight: 500;">
                    📝 管理
                </button>
            </div>

            <!-- 標註列表（初始隱藏）-->
            <div id="highlight-list-v2" style="display: none; max-height: 300px; overflow-y: auto; margin-bottom: 10px; border: 1px solid #e5e7eb; border-radius: 4px; background: #f9fafb;">
                <div style="padding: 8px; text-align: center; color: #666; font-size: 11px;">
                    暫無標註
                </div>
            </div>

            <!-- 狀態顯示 -->
            <div id="highlight-status-v2" style="text-align: center; font-size: 11px; color: #666; padding: 4px;">
                已標註: <span id="highlight-count-v2">0</span> 段
            </div>

            <div style="text-align: center; font-size: 10px; color: #999; margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee;">
                💡 Ctrl+點擊標註可快速刪除
            </div>
        `;

        return toolbar;
    }

    // 導出函數供外部調用（兼容舊版API）
    window.initHighlighter = initHighlighter;
    window.initNotionHighlighter = initHighlighter; // 別名

    window.clearPageHighlights = () => {
        if (window.notionHighlighter && typeof window.notionHighlighter.show === 'function') {
            window.notionHighlighter.manager.clearAll();
        }
    };
    window.clearNotionHighlights = window.clearPageHighlights; // 別名

    window.collectHighlights = () => {
        if (window.notionHighlighter && typeof window.notionHighlighter.show === 'function') {
            return window.notionHighlighter.manager.collectHighlightsForNotion();
        }
        return [];
    };
    window.collectNotionHighlights = window.collectHighlights; // 別名

    // 🔑 暴露強制恢復函數
    window.forceRestoreHighlights = () => {
        if (window.notionHighlighter && typeof window.notionHighlighter.show === 'function') {
            return window.notionHighlighter.manager.forceRestoreHighlights();
        }
        return Promise.resolve(false);
    };

    // 🔑 關鍵：頁面加載時自動初始化
    // 這樣可以：
    // 1. 恢復之前保存的標註
    // 2. 確保 window.collectHighlights 等函數可用
    // 3. 工具欄保持隱藏，直到用戶點擊「開始標註」

    // 檢查是否有保存的標註需要恢復
    (async function autoInit() {
        try {
            const url = window.location.href;
            const highlights = await StorageUtil.loadHighlights(url);

            if (highlights && highlights.length > 0) {
                // 有保存的標註，自動初始化
                initHighlighter();
                // 等待標註管理器初始化完成後再恢復標註
                setTimeout(async () => {
                    if (window.notionHighlighter && window.notionHighlighter.manager) {
                        // 確保標註被正確恢復
                        await window.notionHighlighter.manager.initializationComplete;
                        // 保持工具欄隱藏狀態，但確保標註可見
                        window.notionHighlighter.hide();
                    }
                }, 100);
            } else {
                // 沒有保存的標註，但仍然初始化以便函數可用
                // 這樣 window.collectHighlights 等函數就存在了
                initHighlighter();
                // 隱藏工具欄
                if (window.notionHighlighter && typeof window.notionHighlighter.show === 'function') {
                    window.notionHighlighter.hide();
                }
            }
        } catch (error) {
            console.error('❌ 自動初始化失敗:', error);
            // 即使失敗也要初始化，確保基本功能可用
            initHighlighter();
            if (window.notionHighlighter && typeof window.notionHighlighter.show === 'function') {
                window.notionHighlighter.hide();
            }
        }
    })();

})();
