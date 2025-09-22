// 自動恢復標記的腳本
(function() {
    // 使用來自 utils.js 的共享函數
    const { normalizeUrl, StorageUtil, Logger } = window;

    // 等待頁面完全載入
    function waitForPageLoad() {
        return new Promise((resolve) => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                window.addEventListener('load', resolve);
            }
        });
    }

    // 恢復標記
    async function restoreHighlights() {
        await waitForPageLoad();
        
        // 等待一段時間確保頁面內容穩定
        setTimeout(async () => {
            try {
                Logger.info('Attempting to restore highlights for:', window.location.href);
                
                const highlights = await StorageUtil.loadHighlights(window.location.href);
                
                if (highlights && highlights.length > 0) {
                    Logger.info(`Found ${highlights.length} highlights to restore`);
                    applyRestore(highlights);
                } else {
                    Logger.info('No highlights found for this page');
                }
            } catch (error) {
                Logger.error('Error during highlight restoration:', error);
            }
        }, 1000); // 延遲 1 秒
    }

    function applyRestore(highlightData) {
        if (!Array.isArray(highlightData) || highlightData.length === 0) return;
        console.log(`Restoring ${highlightData.length} highlights...`);
        
        let restoredCount = 0;
        highlightData.forEach((data, index) => {
            setTimeout(() => {
                restoreHighlight(data);
                restoredCount++;
                
                // 當所有標記都恢復完成後，設置事件監聽器
                if (restoredCount === highlightData.length) {
                    setTimeout(() => {
                        if (window.simpleHighlighter && window.simpleHighlighter.setupExistingHighlights) {
                            window.simpleHighlighter.setupExistingHighlights();
                        }
                    }, 500); // 額外延遲確保DOM更新完成
                }
            }, index * 100);
        });
    }

    // 恢復單個標記
    function restoreHighlight(data) {
        if (!data || !data.text) return;

        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        for (const textNode of textNodes) {
            const text = textNode.textContent;
            const index = text.indexOf(data.text);
            
            if (index !== -1) {
                try {
                    const range = document.createRange();
                    range.setStart(textNode, index);
                    range.setEnd(textNode, index + data.text.length);
                    
                    const span = document.createElement('span');
                    span.className = 'simple-highlight';
                    span.style.backgroundColor = data.color || '#ffff00';
                    span.style.padding = '0 2px';
                    span.style.margin = '0 1px';
                    span.style.borderRadius = '2px';
                    
                    try {
                        range.surroundContents(span);
                        console.log('Successfully restored highlight:', data.text.substring(0, 50));
                        break;
                    } catch (e) {
                        console.warn('Failed to surround range, trying fallback method');
                        const contents = range.extractContents();
                        span.appendChild(contents);
                        range.insertNode(span);
                        break;
                    }
                } catch (e) {
                    console.warn('Failed to restore highlight:', e, data.text.substring(0, 50));
                }
            }
        }
    }

    // 開始恢復
    restoreHighlights();
})();