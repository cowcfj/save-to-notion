// 自動恢復標記的腳本
(function() {
    function normalizeUrl(rawUrl) {
        try {
            const u = new URL(rawUrl);
            u.hash = '';
            const trackingParams = [
                'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
                'gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'
            ];
            trackingParams.forEach((p) => u.searchParams.delete(p));
            if (u.pathname !== '/' && u.pathname.endsWith('/')) {
                u.pathname = u.pathname.replace(/\/+$/, '');
            }
            return u.toString();
        } catch (e) {
            return rawUrl || '';
        }
    }
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
        setTimeout(() => {
            const pageKey = `highlights_${normalizeUrl(window.location.href)}`;
            try {
                // 優先從 chrome.storage 讀取
                chrome.storage?.local?.get([pageKey], (data) => {
                    const stored = data && data[pageKey];
                    if (stored && Array.isArray(stored) && stored.length > 0) {
                        applyRestore(stored);
                    } else {
                        // 兼容舊版：從 localStorage 回退
                        const legacy = localStorage.getItem(pageKey);
                        if (legacy) {
                            try { applyRestore(JSON.parse(legacy)); } catch (_) {}
                        }
                    }
                });
            } catch (e) {
                // 非擴充環境或 chrome.storage 不可用時，使用 localStorage
                const legacy = localStorage.getItem(pageKey);
                if (legacy) {
                    try { applyRestore(JSON.parse(legacy)); } catch (_) {}
                }
            }
            
            if (savedHighlights) {
                try {
                    const highlightData = JSON.parse(savedHighlights);
                    if (highlightData.length > 0) {
                        console.log(`Restoring ${highlightData.length} highlights...`);
                        
                        highlightData.forEach((data, index) => {
                            setTimeout(() => {
                                restoreHighlight(data);
                            }, index * 100); // 延遲恢復，避免衝突
                        });
                    }
                } catch (error) {
                    console.warn('Failed to parse saved highlights:', error);
                }
            }
        }, 1500); // 增加延遲時間
    }

    function applyRestore(highlightData) {
        if (!Array.isArray(highlightData) || highlightData.length === 0) return;
        console.log(`Restoring ${highlightData.length} highlights...`);
        highlightData.forEach((data, index) => {
            setTimeout(() => restoreHighlight(data), index * 100);
        });
    }

    // 恢復單個標記
    function restoreHighlight(data) {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // 跳過已經高亮的文字和特殊標籤
                    const parent = node.parentElement;
                    if (parent.classList.contains('simple-highlight') ||
                        parent.tagName === 'SCRIPT' ||
                        parent.tagName === 'STYLE' ||
                        parent.id === 'simple-highlighter' ||
                        parent.id === 'notion-clipper-toolbar') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            },
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent;
            const index = text.indexOf(data.text);
            
            if (index !== -1) {
                try {
                    const range = document.createRange();
                    range.setStart(node, index);
                    range.setEnd(node, index + data.text.length);
                    
                    const highlight = document.createElement('span');
                    highlight.className = 'simple-highlight';
                    highlight.style.backgroundColor = data.color;
                    highlight.style.cursor = 'pointer';
                    highlight.title = '雙擊刪除標記';
                    
                    // 綁定刪除事件
                    highlight.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        if (confirm('確定要刪除這個標記嗎？')) {
                            const parent = highlight.parentNode;
                            parent.insertBefore(document.createTextNode(highlight.textContent), highlight);
                            parent.removeChild(highlight);
                            parent.normalize();
                            
                            // 更新本地存儲
                            updateLocalStorage();
                        }
                    });

                    range.surroundContents(highlight);
                    console.log('Restored highlight:', data.text.substring(0, 50) + '...');
                    break;
                } catch (error) {
                    // 繼續尋找下一個匹配
                    continue;
                }
            }
        }
    }

    // 更新本地存儲
    function updateLocalStorage() {
        const highlights = document.querySelectorAll('.simple-highlight');
        const highlightData = [];
        
        highlights.forEach(highlight => {
            highlightData.push({
                text: highlight.textContent,
                color: highlight.style.backgroundColor
            });
        });
        
        const pageKey = `highlights_${normalizeUrl(window.location.href)}`;
        try {
            chrome.storage?.local?.set({ [pageKey]: highlightData });
        } catch (_) {
            localStorage.setItem(pageKey, JSON.stringify(highlightData));
        }
    }

    // 檢查頁面狀態並決定是否恢復標記
    function checkAndRestore() {
        // 檢查是否有保存的標記
        const pageKey = `highlights_${normalizeUrl(window.location.href)}`;
        try {
            chrome.storage?.local?.get([pageKey], (data) => {
                const stored = data && data[pageKey];
                if (stored && Array.isArray(stored)) {
                    restoreHighlightsFromData(stored);
                } else {
                    const legacy = localStorage.getItem(pageKey);
                    if (legacy) {
                        try { restoreHighlightsFromData(JSON.parse(legacy)); } catch (_) {}
                    }
                }
            });
        } catch (e) {
            const legacy = localStorage.getItem(pageKey);
            if (legacy) {
                try { restoreHighlightsFromData(JSON.parse(legacy)); } catch (_) {}
            }
        }
        
        function restoreHighlightsFromData(highlightData) {
            if (!highlightData) return;
            // 發送消息檢查頁面狀態
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                chrome.runtime.sendMessage({ action: 'checkPageStatus' }, (response) => {
                    if (response && response.success) {
                        if (response.wasDeleted) {
                            // 頁面已被刪除，清除本地標記
                            console.log('Notion page was deleted, clearing local highlights');
                            try { chrome.storage?.local?.remove([pageKey]); } catch (_) { localStorage.removeItem(pageKey); }
                        } else {
                            // 頁面正常，恢復標記
                            restoreHighlights();
                        }
                    } else {
                        // 無法檢查狀態，直接恢復標記
                        restoreHighlights();
                    }
                });
            } else {
                // 不在擴展環境中，直接恢復標記
                restoreHighlights();
            }
        }
    }

    // 自動執行檢查和恢復
    checkAndRestore();
})();
