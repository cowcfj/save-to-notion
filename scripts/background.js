// This script runs in the background and handles the core logic.

// URL normalization for consistent keys and deduplication.
function normalizeUrl(rawUrl) {
    try {
        const u = new URL(rawUrl);
        // Drop fragment
        u.hash = '';
        // Remove common tracking params
        const trackingParams = [
            'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
            'gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'
        ];
        trackingParams.forEach((p) => u.searchParams.delete(p));
        // Normalize trailing slash (keep root "/")
        if (u.pathname !== '/' && u.pathname.endsWith('/')) {
            u.pathname = u.pathname.replace(/\/+$/, '');
        }
        return u.toString();
    } catch (e) {
        return rawUrl || '';
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkPageStatus') {
        // 檢查頁面是否已保存到 Notion
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.id) {
                sendResponse({ success: false, error: 'Could not get active tab.' });
                return;
            }

            // 檢查本地存儲中是否有該頁面的保存記錄
            const normUrl = normalizeUrl(activeTab.url || '');
            chrome.storage.local.get([`saved_${normUrl}`], (result) => {
                const savedData = result[`saved_${normUrl}`];
                
                if (savedData && savedData.notionPageId) {
                    // 如果有保存記錄，檢查 Notion 頁面是否還存在
                    chrome.storage.sync.get(['notionApiKey'], (config) => {
                        if (config.notionApiKey) {
                            checkNotionPageExists(savedData.notionPageId, config.notionApiKey).then(pageExists => {
                                if (!pageExists) {
                                    // 頁面已被刪除，清除本地狀態
                                    console.log('Notion page was deleted, clearing local state');
                                    clearPageState(normUrl);
                                    
                                    // 清除頁面上的標記
                                    chrome.scripting.executeScript({
                                        target: { tabId: activeTab.id },
                                        func: clearPageHighlights
                                    }).catch(error => {
                                        console.warn('Failed to clear page highlights:', error);
                                    });
                                    
                                    sendResponse({ 
                                        success: true, 
                                        isSaved: false,
                                        url: normUrl,
                                        title: activeTab.title,
                                        wasDeleted: true
                                    });
                                } else {
                                    sendResponse({ 
                                        success: true, 
                                        isSaved: true,
                                        url: normUrl,
                                        title: activeTab.title
                                    });
                                }
                            }).catch(error => {
                                console.error('Error checking page status:', error);
                                // 檢查失敗時，假設頁面存在
                                sendResponse({ 
                                    success: true, 
                                    isSaved: true,
                                    url: normUrl,
                                    title: activeTab.title
                                });
                            });
                        } else {
                            // 沒有 API Key，無法檢查
                            sendResponse({ 
                                success: true, 
                                isSaved: !!savedData,
                                url: normUrl,
                                title: activeTab.title
                            });
                        }
                    });
                } else {
                    sendResponse({ 
                        success: true, 
                        isSaved: false,
                        url: normUrl,
                        title: activeTab.title
                    });
                }
            });
        });
        return true;
    } else if (request.action === 'startHighlight') {
        // 啟動標記功能
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.id) {
                sendResponse({ success: false, error: 'Could not get active tab.' });
                return;
            }

            // 注入標記腳本
            chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                func: initHighlighter
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Highlighter injection failed:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: 'Failed to inject highlighter.' });
                    return;
                }
                sendResponse({ success: true });
            });
        });
        return true;
    } else if (request.action === 'updateHighlights') {
        // 只更新標記，不重新保存整個頁面
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.id) {
                sendResponse({ success: false, error: 'Could not get active tab.' });
                return;
            }

            // 獲取設置和保存狀態
            chrome.storage.sync.get(['notionApiKey'], (config) => {
                if (!config.notionApiKey) {
                    sendResponse({ success: false, error: 'API Key is not set.' });
                    return;
                }

                const normUrl = normalizeUrl(activeTab.url || '');
                chrome.storage.local.get([`saved_${normUrl}`], (savedData) => {
                    const existingPage = savedData[`saved_${normUrl}`];
                    
                    if (!existingPage || !existingPage.notionPageId) {
                        sendResponse({ success: false, error: 'Page not saved yet. Please save the page first.' });
                        return;
                    }

                    // 收集標記信息
                    chrome.scripting.executeScript({
                        target: { tabId: activeTab.id },
                        func: collectHighlights
                    }, (highlightResults) => {
                        const highlights = highlightResults && highlightResults[0] ? highlightResults[0].result : [];
                        
                        // 只更新標記部分
                        updateHighlightsOnly(existingPage.notionPageId, highlights, normUrl, config.notionApiKey, (response) => {
                            if (response.success) {
                                response.highlightsUpdated = true;
                                response.highlightCount = highlights.length;
                            }
                            sendResponse(response);
                        });
                    });
                });
            });
        });
        return true;
    } else if (request.action === 'savePage') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab || !activeTab.id) {
                sendResponse({ success: false, error: 'Could not get active tab.' });
                return;
            }

            // 獲取設置和保存狀態
            chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId'], (config) => {
                if (!config.notionApiKey || !config.notionDatabaseId) {
                    sendResponse({ success: false, error: 'API Key or Database ID is not set.' });
                    return;
                }

                // 檢查頁面是否已保存
                const normUrl = normalizeUrl(activeTab.url || '');
                chrome.storage.local.get([`saved_${normUrl}`], (savedData) => {
                    const existingPage = savedData[`saved_${normUrl}`];
                    
                    // 先收集標記信息
                chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: collectHighlights
                }, (highlightResults) => {
                    const highlights = highlightResults && highlightResults[0] ? highlightResults[0].result : [];
                    
                    // 然後提取內容
                    chrome.scripting.executeScript({
                        target: { tabId: activeTab.id },
                        files: ['lib/Readability.js', 'scripts/content.js']
                    }, (injectionResults) => {
                        if (chrome.runtime.lastError || !injectionResults || injectionResults.length === 0) {
                            console.error('Script injection failed:', chrome.runtime.lastError);
                            sendResponse({ success: false, error: 'Failed to inject content script.' });
                            return;
                        }
                        
                        const result = injectionResults[0].result;
                        console.log('Content extraction result:', result);

                        if (result && result.blocks) {
                            // 添加標記到內容中
                            if (highlights.length > 0) {
                                const highlightBlocks = [{
                                    object: 'block',
                                    type: 'heading_3',
                                    heading_3: {
                                        rich_text: [{
                                            type: 'text',
                                            text: { content: '📝 頁面標記' }
                                        }]
                                    }
                                }];

                                highlights.forEach((highlight) => {
                                    highlightBlocks.push({
                                        object: 'block',
                                        type: 'paragraph',
                                        paragraph: {
                                            rich_text: [{
                                                type: 'text',
                                                text: { content: highlight.text },
                                                annotations: {
                                                    color: highlight.color
                                                }
                                            }]
                                        }
                                    });
                                });
                                
                                result.blocks.push(...highlightBlocks);
                            }

                            const imageCount = result.blocks.filter(b => b.type === 'image').length;
                            
                            if (existingPage && existingPage.notionPageId) {
                                // 先檢查頁面是否還存在
                                checkNotionPageExists(existingPage.notionPageId, config.notionApiKey).then(pageExists => {
                                    if (pageExists) {
                                        // 頁面存在，檢查是否有標記需要更新
                                        if (highlights.length > 0) {
                                            // 有標記，只更新標記部分
                                            updateHighlightsOnly(existingPage.notionPageId, highlights, normUrl, config.notionApiKey, (response) => {
                                                if (response.success) {
                                                    response.highlightCount = highlights.length;
                                                    response.highlightsUpdated = true;
                                                }
                                                sendResponse(response);
                                            });
                                        } else {
                                            // 沒有標記，完整更新頁面內容
                                            updateNotionPage(existingPage.notionPageId, result.title, result.blocks, normUrl, config.notionApiKey, (response) => {
                                                if (response.success) {
                                                    response.imageCount = imageCount;
                                                    response.blockCount = result.blocks.length;
                                                    response.updated = true;
                                                }
                                                sendResponse(response);
                                            });
                                        }
                                    } else {
                                        // 頁面已被刪除，清除本地狀態並創建新頁面
                                        console.log('Notion page was deleted, clearing local state and creating new page');
                                        clearPageState(normUrl);
                                        
                                        // 清除頁面上的標記
                                        chrome.scripting.executeScript({
                                            target: { tabId: activeTab.id },
                                            func: clearPageHighlights
                                        }).catch(error => {
                                            console.warn('Failed to clear page highlights:', error);
                                        });
                                        
                                        // 創建新頁面
                                        saveToNotion(result.title, result.blocks, normUrl, config.notionApiKey, config.notionDatabaseId, (response) => {
                                            if (response.success) {
                                                response.imageCount = imageCount;
                                                response.blockCount = result.blocks.length;
                                                response.created = true;
                                                response.recreated = true; // 標記為重新創建
                                            }
                                            sendResponse(response);
                                        });
                                    }
                                }).catch(error => {
                                    console.error('Error checking page existence:', error);
                                    // 檢查失敗時，嘗試更新，如果失敗則創建新頁面
                                    updateNotionPage(existingPage.notionPageId, result.title, result.blocks, normUrl, config.notionApiKey, (response) => {
                                        if (response.success) {
                                            response.imageCount = imageCount;
                                            response.blockCount = result.blocks.length;
                                            response.updated = true;
                                        } else {
                                            // 更新失敗，清除狀態並創建新頁面
                                            clearPageState(normUrl);
                                            
                                            // 清除頁面上的標記
                                            chrome.scripting.executeScript({
                                                target: { tabId: activeTab.id },
                                                func: clearPageHighlights
                                            }).catch(error => {
                                                console.warn('Failed to clear page highlights:', error);
                                            });
                                            
                                            saveToNotion(result.title, result.blocks, normUrl, config.notionApiKey, config.notionDatabaseId, (newResponse) => {
                                                if (newResponse.success) {
                                                    newResponse.imageCount = imageCount;
                                                    newResponse.blockCount = result.blocks.length;
                                                    newResponse.created = true;
                                                    newResponse.recreated = true;
                                                }
                                                sendResponse(newResponse);
                                            });
                                        }
                                    });
                                });
                            } else {
                                // 創建新頁面
                                saveToNotion(result.title, result.blocks, normUrl, config.notionApiKey, config.notionDatabaseId, (response) => {
                                    if (response.success) {
                                        response.imageCount = imageCount;
                                        response.blockCount = result.blocks.length;
                                        response.created = true;
                                    }
                                    sendResponse(response);
                                });
                            }
                        } else {
                            sendResponse({ success: false, error: 'Could not parse the article content.' });
                        }
                        });
                    });
                });
            });
        });

        return true; // Indicates asynchronous response
    }
});

// 動態注入標記恢復腳本：頁面載入完成後，若存在對應標記資料才注入
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab && tab.url) {
        const normUrl = normalizeUrl(tab.url);
        const key = `highlights_${normUrl}`;
        chrome.storage.local.get([key], (data) => {
            const highlights = data[key];
            if (highlights && Array.isArray(highlights) && highlights.length > 0) {
                // 已有新儲存，直接注入還原腳本
                chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['scripts/highlight-restore.js']
                }, () => {});
            } else {
                // 嘗試從頁面 localStorage 遷移舊資料
                chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => {
                        try {
                            const normalize = (raw) => {
                                try {
                                    const u = new URL(raw);
                                    u.hash = '';
                                    const params = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'];
                                    params.forEach((p) => u.searchParams.delete(p));
                                    if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
                                    return u.toString();
                                } catch (e) { return raw || ''; }
                            };
                            const norm = normalize(window.location.href);
                            const k1 = `highlights_${norm}`;
                            const k2 = `highlights_${window.location.href}`;
                            let key = null;
                            let raw = localStorage.getItem(k1);
                            if (raw) key = k1; else {
                                raw = localStorage.getItem(k2);
                                if (raw) key = k2;
                            }
                            if (!raw) {
                                // 退一步，找任何以 highlights_ 開頭的鍵（保險）
                                for (let i = 0; i < localStorage.length; i++) {
                                    const k = localStorage.key(i);
                                    if (k && k.startsWith('highlights_')) { key = k; raw = localStorage.getItem(k); break; }
                                }
                            }
                            if (raw) {
                                try {
                                    const data = JSON.parse(raw);
                                    if (Array.isArray(data) && data.length > 0) {
                                        localStorage.removeItem(key);
                                        return { migrated: true, data };
                                    }
                                } catch (_) {}
                            }
                        } catch (_) {}
                        return { migrated: false };
                    }
                }, (results) => {
                    try {
                        const res = results && results[0] ? results[0].result : null;
                        if (res && res.migrated && Array.isArray(res.data) && res.data.length > 0) {
                            chrome.storage.local.set({ [key]: res.data }, () => {
                                // 遷移完成後注入還原腳本
                                chrome.scripting.executeScript({
                                    target: { tabId },
                                    files: ['scripts/highlight-restore.js']
                                }, () => {});
                            });
                        }
                    } catch (_) { /* ignore */ }
                });
            }
        });
    }
});

// 收集頁面標記的函數
function collectHighlights() {
    const highlights = document.querySelectorAll('.simple-highlight');
    const highlightData = [];
    
    // 顏色映射表
    const colorMap = {
        '#fff3cd': 'yellow_background',
        'rgb(255, 243, 205)': 'yellow_background',
        '#d4edda': 'green_background', 
        'rgb(212, 237, 218)': 'green_background',
        '#cce7ff': 'blue_background',
        'rgb(204, 231, 255)': 'blue_background',
        '#f8d7da': 'red_background',
        'rgb(248, 215, 218)': 'red_background'
    };
    
    highlights.forEach((highlight, index) => {
        const color = highlight.style.backgroundColor;
        const text = highlight.textContent.trim();
        
        // 使用映射表查找顏色
        let notionColor = colorMap[color] || 'yellow_background';
        
        // 如果映射表沒有找到，嘗試部分匹配
        if (!colorMap[color]) {
            for (const [key, value] of Object.entries(colorMap)) {
                if (color.includes(key.replace(/[^\d,]/g, '')) || key.includes(color.replace(/[^\d,]/g, ''))) {
                    notionColor = value;
                    break;
                }
            }
        }

        if (text.length > 0) {
            highlightData.push({
                text: text,
                color: notionColor
            });
        }
    });
    
    return highlightData;
}

// 初始化標記功能的函數
function initHighlighter() {
    if (window.simpleHighlighter) {
        window.simpleHighlighter.show();
        return;
    }

    window.simpleHighlighter = {
        isActive: false,
        currentColor: 'yellow',
        colors: {
            yellow: '#fff3cd',
            green: '#d4edda',
            blue: '#cce7ff',
            red: '#f8d7da'
        },



        init() {
            this.createToolbar();
            this.bindEvents();
        },

        createToolbar() {
            if (document.getElementById('simple-highlighter')) return;

            const toolbar = document.createElement('div');
            toolbar.id = 'simple-highlighter';
            toolbar.innerHTML = `
                <div style="position: fixed; top: 20px; right: 20px; background: white; border: 1px solid #ddd; border-radius: 8px; padding: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; font-family: Arial, sans-serif; font-size: 14px;">
                    <div style="margin-bottom: 8px; font-weight: bold; text-align: center;">📝 標記工具</div>
                    <div id="highlight-count" style="text-align: center; font-size: 11px; color: #666; margin-bottom: 8px;">已標記: 0 個</div>
                    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
                        <button id="toggle-highlight" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">
                            <span id="toggle-text">開始標記</span>
                        </button>
                        <div style="display: flex; gap: 4px;">
                            <button class="color-btn" data-color="yellow" style="width: 20px; height: 20px; background: #fff3cd; border: 2px solid #333; border-radius: 3px; cursor: pointer;"></button>
                            <button class="color-btn" data-color="green" style="width: 20px; height: 20px; background: #d4edda; border: 1px solid #ddd; border-radius: 3px; cursor: pointer;"></button>
                            <button class="color-btn" data-color="blue" style="width: 20px; height: 20px; background: #cce7ff; border: 1px solid #ddd; border-radius: 3px; cursor: pointer;"></button>
                            <button class="color-btn" data-color="red" style="width: 20px; height: 20px; background: #f8d7da; border: 1px solid #ddd; border-radius: 3px; cursor: pointer;"></button>
                        </div>
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button id="sync-highlights" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: #48bb78; color: white; cursor: pointer; font-size: 12px;">同步</button>
                        <button id="clear-highlights" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 12px;">清除</button>
                        <button id="close-highlighter" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 12px;">關閉</button>
                    </div>
                </div>
            `;
            document.body.appendChild(toolbar);
        },

        bindEvents() {
            document.getElementById('toggle-highlight').addEventListener('click', () => {
                this.toggle();
            });

            document.querySelectorAll('.color-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.selectColor(btn.dataset.color);
                });
            });

            document.getElementById('sync-highlights').addEventListener('click', () => {
                this.syncHighlights();
            });

            document.getElementById('clear-highlights').addEventListener('click', () => {
                this.clearAll();
            });

            document.getElementById('close-highlighter').addEventListener('click', () => {
                this.hide();
            });

            document.addEventListener('mouseup', (e) => {
                if (this.isActive && !e.target.closest('#simple-highlighter')) {
                    this.handleSelection();
                }
            });
        },

        toggle() {
            this.isActive = !this.isActive;
            const btn = document.getElementById('toggle-highlight');
            const text = document.getElementById('toggle-text');
            
            if (this.isActive) {
                btn.style.background = '#48bb78';
                btn.style.color = 'white';
                text.textContent = '標記中...';
                document.body.style.cursor = 'crosshair';
            } else {
                btn.style.background = 'white';
                btn.style.color = 'black';
                text.textContent = '開始標記';
                document.body.style.cursor = '';
            }
        },

        selectColor(color) {
            this.currentColor = color;
            document.querySelectorAll('.color-btn').forEach(btn => {
                btn.style.border = btn.dataset.color === color ? '2px solid #333' : '1px solid #ddd';
            });
        },

        handleSelection() {
            const selection = window.getSelection();
            if (selection.rangeCount === 0 || selection.isCollapsed) return;

            const range = selection.getRangeAt(0);
            const selectedText = selection.toString().trim();
            
            if (selectedText.length === 0) return;

            try {
                const highlight = document.createElement('span');
                highlight.className = 'simple-highlight';
                highlight.style.backgroundColor = this.colors[this.currentColor];
                highlight.style.cursor = 'pointer';
                highlight.title = '雙擊刪除標記';
                
                highlight.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    if (confirm('確定要刪除這個標記嗎？')) {
                        const parent = highlight.parentNode;
                        parent.insertBefore(document.createTextNode(highlight.textContent), highlight);
                        parent.removeChild(highlight);
                        parent.normalize();
                        this.updateHighlightCount();
                        this.saveHighlights();
                    }
                });

                range.surroundContents(highlight);
                selection.removeAllRanges();
                this.updateHighlightCount();
                this.saveHighlights();
            } catch (error) {
                console.warn('無法標記選中的文字:', error);
            }
        },

        clearAll() {
            const highlights = document.querySelectorAll('.simple-highlight');
            if (highlights.length === 0) return;

            if (confirm(`確定要清除所有 ${highlights.length} 個標記嗎？`)) {
                highlights.forEach(element => {
                    const parent = element.parentNode;
                    parent.insertBefore(document.createTextNode(element.textContent), element);
                    parent.removeChild(element);
                    parent.normalize();
                });
                this.updateHighlightCount();
                this.saveHighlights();
            }
        },

        // 同步標記到 Notion
        syncHighlights() {
            const syncButton = document.getElementById('sync-highlights');
            const originalText = syncButton.textContent;
            
            syncButton.textContent = '同步中...';
            syncButton.disabled = true;
            
            // 發送更新標記的消息
            chrome.runtime.sendMessage({ action: 'updateHighlights' }, (response) => {
                if (response && response.success) {
                    syncButton.textContent = '已同步';
                    syncButton.style.background = '#28a745';
                    setTimeout(() => {
                        syncButton.textContent = originalText;
                        syncButton.style.background = '#48bb78';
                        syncButton.disabled = false;
                    }, 2000);
                } else {
                    syncButton.textContent = '同步失敗';
                    syncButton.style.background = '#dc3545';
                    setTimeout(() => {
                        syncButton.textContent = originalText;
                        syncButton.style.background = '#48bb78';
                        syncButton.disabled = false;
                    }, 2000);
                    console.error('Sync failed:', response ? response.error : 'No response');
                }
            });
        },

        updateHighlightCount() {
            const count = document.querySelectorAll('.simple-highlight').length;
            const countElement = document.getElementById('highlight-count');
            if (countElement) {
                countElement.textContent = `已標記: ${count} 個`;
            }
        },



        // 保存標記到儲存（優先 chrome.storage.local）
        saveHighlights() {
            const highlights = document.querySelectorAll('.simple-highlight');
            const highlightData = [];
            
            highlights.forEach(highlight => {
                const rect = highlight.getBoundingClientRect();
                const range = document.createRange();
                range.selectNode(highlight);
                
                highlightData.push({
                    text: highlight.textContent,
                    color: highlight.style.backgroundColor,
                    xpath: this.getXPath(highlight),
                    startOffset: this.getTextOffset(highlight),
                    endOffset: this.getTextOffset(highlight) + highlight.textContent.length
                });
            });
            
            const normalize = (raw) => {
                try {
                    const u = new URL(raw);
                    u.hash = '';
                    const params = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'];
                    params.forEach((p) => u.searchParams.delete(p));
                    if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
                    return u.toString();
                } catch (e) { return raw || ''; }
            };
            const pageKey = `highlights_${normalize(window.location.href)}`;
            try {
                chrome.storage?.local?.set({ [pageKey]: highlightData });
            } catch (_) {
                localStorage.setItem(pageKey, JSON.stringify(highlightData));
            }
        },

        // 載入標記（優先 chrome.storage.local）
        loadHighlights() {
            const normalize = (raw) => {
                try {
                    const u = new URL(raw);
                    u.hash = '';
                    const params = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'];
                    params.forEach((p) => u.searchParams.delete(p));
                    if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
                    return u.toString();
                } catch (e) { return raw || ''; }
            };
            const pageKey = `highlights_${normalize(window.location.href)}`;
            try {
                chrome.storage?.local?.get([pageKey], (data) => {
                    const stored = data && data[pageKey];
                    if (stored && Array.isArray(stored)) {
                        this.restoreHighlights(stored);
                    } else {
                        const legacy = localStorage.getItem(pageKey);
                        if (legacy) {
                            try { this.restoreHighlights(JSON.parse(legacy)); } catch (error) { console.warn('Failed to load highlights:', error); }
                        }
                    }
                });
            } catch (_) {
                const legacy = localStorage.getItem(pageKey);
                if (legacy) {
                    try { this.restoreHighlights(JSON.parse(legacy)); } catch (error) { console.warn('Failed to load highlights:', error); }
                }
            }
        },

        // 改進的恢復標記邏輯
        restoreHighlights(highlightData) {
            let restoredCount = 0;
            
            highlightData.forEach((data, index) => {
                try {
                    // 使用更精確的文字匹配
                    this.findAndHighlightText(data.text, data.color, () => {
                        restoredCount++;
                        if (restoredCount === highlightData.length) {
                            this.updateHighlightCount();
                            console.log(`Restored ${restoredCount} highlights`);
                        }
                    });
                } catch (error) {
                    console.warn(`Failed to restore highlight ${index}:`, error);
                }
            });
        },

        // 查找並高亮文字
        findAndHighlightText(searchText, color, callback) {
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        // 跳過已經高亮的文字和腳本標籤
                        if (node.parentElement.classList.contains('simple-highlight') ||
                            node.parentElement.tagName === 'SCRIPT' ||
                            node.parentElement.tagName === 'STYLE' ||
                            node.parentElement.id === 'simple-highlighter') {
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
                const index = text.indexOf(searchText);
                
                if (index !== -1) {
                    try {
                        const range = document.createRange();
                        range.setStart(node, index);
                        range.setEnd(node, index + searchText.length);
                        
                        const highlight = document.createElement('span');
                        highlight.className = 'simple-highlight';
                        highlight.style.backgroundColor = color;
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
                                this.updateHighlightCount();
                                this.saveHighlights();
                            }
                        });

                        range.surroundContents(highlight);
                        if (callback) callback();
                        break; // 找到一個匹配就停止
                    } catch (error) {
                        // 如果無法包圍內容，繼續尋找下一個匹配
                        continue;
                    }
                }
            }
        },

        // 獲取元素的 XPath
        getXPath(element) {
            const parts = [];
            while (element && element.nodeType === Node.ELEMENT_NODE) {
                let index = 0;
                let sibling = element.previousSibling;
                while (sibling) {
                    if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
                        index++;
                    }
                    sibling = sibling.previousSibling;
                }
                const tagName = element.nodeName.toLowerCase();
                const pathIndex = index > 0 ? `[${index + 1}]` : '';
                parts.unshift(tagName + pathIndex);
                element = element.parentNode;
            }
            return parts.length ? '/' + parts.join('/') : null;
        },

        // 獲取文字偏移量
        getTextOffset(element) {
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            let offset = 0;
            let node;
            while (node = walker.nextNode()) {
                if (node.parentElement === element || element.contains(node)) {
                    break;
                }
                offset += node.textContent.length;
            }
            return offset;
        },

        show() {
            const toolbar = document.getElementById('simple-highlighter');
            if (toolbar) {
                toolbar.style.display = 'block';
                this.updateHighlightCount();
                // 不在這裡載入標記，因為已經在初始化時載入了
            }
        },

        hide() {
            const toolbar = document.getElementById('simple-highlighter');
            if (toolbar) toolbar.style.display = 'none';
            this.isActive = false;
            document.body.style.cursor = '';
        }
    };

    window.simpleHighlighter.init();
}

// 檢查 Notion 頁面是否存在
async function checkNotionPageExists(pageId, apiKey) {
    try {
        const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28'
            }
        });

        if (response.ok) {
            const pageData = await response.json();
            // 檢查頁面是否被歸檔（刪除到垃圾箱）
            return !pageData.archived;
        } else if (response.status === 404) {
            // 頁面不存在（已從垃圾箱徹底刪除）
            return false;
        } else {
            // 其他錯誤，假設頁面不可用
            return false;
        }
    } catch (error) {
        console.error('Error checking page existence:', error);
        return false;
    }
}

// 清除頁面的本地狀態
function clearPageState(pageUrl) {
    // 清除保存狀態
    chrome.storage.local.remove([`saved_${pageUrl}`]);
    
    console.log('Cleared local state for:', pageUrl);
}

// 清除頁面標記狀態（需要在頁面上下文中執行）
function clearPageHighlights() {
    // 清除頁面上的標記
    const highlights = document.querySelectorAll('.simple-highlight');
    highlights.forEach(highlight => {
        const parent = highlight.parentNode;
        parent.insertBefore(document.createTextNode(highlight.textContent), highlight);
        parent.removeChild(highlight);
        parent.normalize();
    });
    
    // 清除本地存儲（優先 chrome.storage）
    try {
        const normalize = (raw) => {
            try {
                const u = new URL(raw);
                u.hash = '';
                const params = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'];
                params.forEach((p) => u.searchParams.delete(p));
                if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
                return u.toString();
            } catch (e) { return raw || ''; }
        };
        const pageKey = `highlights_${normalize(window.location.href)}`;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.remove([pageKey]);
        } else {
            localStorage.removeItem(pageKey);
        }
    } catch (_) {}
    
    // 更新工具欄計數（如果存在）
    if (window.simpleHighlighter) {
        window.simpleHighlighter.updateHighlightCount();
    }
    
    console.log('Cleared page highlights and local storage');
}

// 簡化的標記更新函數
async function updateHighlightsOnly(pageId, highlights, pageUrl, apiKey, sendResponse) {
    try {
        console.log('🔄 開始更新標記 - 頁面ID:', pageId, '標記數量:', highlights.length);
        
        // 獲取現有頁面內容
        console.log('📥 正在獲取現有頁面內容...');
        const getResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28'
            }
        });

        if (!getResponse.ok) {
            const errorData = await getResponse.json();
            console.error('❌ 獲取頁面內容失敗:', errorData);
            throw new Error('Failed to get existing page content: ' + (errorData.message || getResponse.statusText));
        }

        const existingContent = await getResponse.json();
        const existingBlocks = existingContent.results;
        console.log('📋 現有區塊數量:', existingBlocks.length);

        // 詳細記錄現有區塊
        existingBlocks.forEach((block, index) => {
            if (block.type === 'heading_3') {
                console.log(`📝 區塊 ${index}: ${block.type} - "${block.heading_3?.rich_text?.[0]?.text?.content}"`);
            } else if (block.type === 'paragraph') {
                const text = block.paragraph?.rich_text?.[0]?.text?.content || '';
                console.log(`📄 區塊 ${index}: ${block.type} - "${text.substring(0, 50)}..."`);
            } else {
                console.log(`📦 區塊 ${index}: ${block.type}`);
            }
        });

        // 找到所有標記相關的區塊並刪除
        const blocksToDelete = [];
        let foundHighlightSection = false;
        let highlightSectionIndex = -1;
        
        for (let i = 0; i < existingBlocks.length; i++) {
            const block = existingBlocks[i];
            
            if (block.type === 'heading_3' && 
                block.heading_3?.rich_text?.[0]?.text?.content === '📝 頁面標記') {
                foundHighlightSection = true;
                highlightSectionIndex = i;
                blocksToDelete.push(block.id);
                console.log(`🎯 找到標記區域標題 (索引 ${i}):`, block.id);
            } else if (foundHighlightSection) {
                // 如果遇到下一個標題，停止收集
                if (block.type.startsWith('heading_')) {
                    console.log(`🛑 遇到下一個標題，停止收集標記區塊 (索引 ${i})`);
                    break;
                }
                // 收集標記區域的段落
                if (block.type === 'paragraph') {
                    blocksToDelete.push(block.id);
                    console.log(`📝 標記為刪除的段落 (索引 ${i}):`, block.id);
                }
            }
        }

        console.log('🗑️ 需要刪除的區塊數量:', blocksToDelete.length);
        console.log('🗑️ 需要刪除的區塊ID列表:', blocksToDelete);

        // 刪除舊的標記區塊
        let deletedCount = 0;
        for (const blockId of blocksToDelete) {
            try {
                console.log(`🗑️ 正在刪除區塊: ${blockId}`);
                const deleteResponse = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Notion-Version': '2022-06-28'
                    }
                });
                
                if (deleteResponse.ok) {
                    deletedCount++;
                    console.log(`✅ 成功刪除區塊: ${blockId}`);
                } else {
                    const errorData = await deleteResponse.json();
                    console.error(`❌ 刪除區塊失敗 ${blockId}:`, errorData);
                }
            } catch (deleteError) {
                console.error(`❌ 刪除區塊異常 ${blockId}:`, deleteError);
            }
        }
        
        console.log(`🗑️ 實際刪除了 ${deletedCount}/${blocksToDelete.length} 個區塊`);

        // 添加新的標記區域（如果有標記）
        if (highlights.length > 0) {
            console.log('➕ 準備添加新的標記區域...');
            
            const highlightBlocks = [{
                object: 'block',
                type: 'heading_3',
                heading_3: {
                    rich_text: [{
                        type: 'text',
                        text: { content: '📝 頁面標記' }
                    }]
                }
            }];

            highlights.forEach((highlight, index) => {
                console.log(`📝 準備添加標記 ${index + 1}: "${highlight.text.substring(0, 30)}..." (顏色: ${highlight.color})`);
                highlightBlocks.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{
                            type: 'text',
                            text: { content: highlight.text },
                            annotations: {
                                color: highlight.color
                            }
                        }]
                    }
                });
            });

            console.log('➕ 準備添加的區塊數量:', highlightBlocks.length);
            console.log('➕ 區塊結構:', JSON.stringify(highlightBlocks, null, 2));

            // 添加新的標記區域到頁面末尾
            console.log('🚀 正在發送添加請求到 Notion API...');
            const addResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({
                    children: highlightBlocks
                })
            });

            console.log('📡 API 響應狀態:', addResponse.status, addResponse.statusText);

            if (!addResponse.ok) {
                const errorData = await addResponse.json();
                console.error('❌ 添加標記失敗 - 錯誤詳情:', errorData);
                throw new Error('Failed to add new highlights: ' + (errorData.message || 'Unknown error'));
            }
            
            const addResult = await addResponse.json();
            console.log('✅ 成功添加新標記 - 響應:', addResult);
            console.log('✅ 添加的區塊數量:', addResult.results?.length || 0);
        } else {
            console.log('ℹ️ 沒有新標記需要添加');
        }

        // 更新保存記錄
        console.log('💾 更新本地保存記錄...');
        chrome.storage.local.set({
            [`saved_${pageUrl}`]: {
                savedAt: Date.now(),
                notionPageId: pageId,
                lastUpdated: Date.now()
            }
        });

        console.log('🎉 標記更新完成！');
        sendResponse({ success: true });
    } catch (error) {
        console.error('💥 標記更新錯誤:', error);
        console.error('💥 錯誤堆棧:', error.stack);
        sendResponse({ success: false, error: error.message });
    }
}

// 完整更新頁面內容的函數（首次保存時使用）
async function updateNotionPage(pageId, title, blocks, pageUrl, apiKey, sendResponse) {
    try {
        // 獲取現有內容並完全替換
        const getResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28'
            }
        });

        if (getResponse.ok) {
            const existingContent = await getResponse.json();
            
            // 刪除所有現有內容
            for (const block of existingContent.results) {
                await fetch(`https://api.notion.com/v1/blocks/${block.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Notion-Version': '2022-06-28'
                    }
                });
            }
        }

        // 添加新內容
        const updateResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                children: blocks.slice(0, 100) // Notion API limit of 100 blocks
            })
        });

        if (updateResponse.ok) {
            // 同時更新頁面標題和保存記錄
            const titleUpdatePromise = fetch(`https://api.notion.com/v1/pages/${pageId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({
                    properties: {
                        'Title': {
                            title: [{ text: { content: title } }]
                        }
                    }
                })
            });

            const storageUpdatePromise = chrome.storage.local.set({
                [`saved_${pageUrl}`]: {
                    title: title,
                    savedAt: Date.now(),
                    notionPageId: pageId,
                    lastUpdated: Date.now()
                }
            });

            // 並行執行標題更新和存儲更新
            await Promise.all([titleUpdatePromise, storageUpdatePromise]);
            
            sendResponse({ success: true });
        } else {
            const errorData = await updateResponse.json();
            console.error('Notion Update Error:', errorData);
            sendResponse({ success: false, error: errorData.message || 'Failed to update Notion page.' });
        }
    } catch (error) {
        console.error('Update Error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function saveToNotion(title, blocks, pageUrl, apiKey, databaseId, sendResponse) {
    const notionApiUrl = 'https://api.notion.com/v1/pages';

    const pageData = {
        parent: { database_id: databaseId },
        properties: {
            'Title': { // 'Title' must match the title property in your Notion database
                title: [{ text: { content: title } }]
            },
            'URL': { // Assumes you have a 'URL' property of type URL
                url: pageUrl
            }
        },
        // The blocks are already in the correct format from content.js
        children: blocks.slice(0, 100) // Notion API limit of 100 blocks
    };

    try {
        const response = await fetch(notionApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(pageData)
        });

        if (response.ok) {
            const responseData = await response.json();
            const notionPageId = responseData.id;
            
            // 記錄頁面已保存，包含 Notion 頁面 ID
            chrome.storage.local.set({
                [`saved_${pageUrl}`]: {
                    title: title,
                    savedAt: Date.now(),
                    notionPageId: notionPageId,
                    notionUrl: responseData.url || null
                }
            });
            sendResponse({ success: true, notionPageId: notionPageId });
        } else {
            const errorData = await response.json();
            console.error('Notion API Error:', errorData);
            sendResponse({ success: false, error: errorData.message || 'Failed to save to Notion.' });
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        sendResponse({ success: false, error: error.message });
    }
}
