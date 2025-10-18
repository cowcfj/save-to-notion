document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('save-button');
    const highlightButton = document.getElementById('highlight-button');
    const clearHighlightsButton = document.getElementById('clear-highlights-button');
    const openNotionButton = document.getElementById('open-notion-button');
    const status = document.getElementById('status');

    // Check for API key and Database ID on popup open
    chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId'], (result) => {
        if (!result.notionApiKey || !result.notionDatabaseId) {
            status.textContent = 'Please set API Key and Database ID in settings.';
            saveButton.disabled = true;
            highlightButton.disabled = true;
        } else {
            // 檢查頁面狀態
            checkPageStatus();
        }
    });

    // 檢查頁面狀態
    function checkPageStatus() {
        chrome.runtime.sendMessage({ action: 'checkPageStatus' }, (response) => {
            if (response && response.success) {
                if (response.isSaved) {
                    // 頁面已保存
                    updateUIForSavedPage(response);
                } else {
                    // 頁面未保存
                    updateUIForUnsavedPage(response);
                }
            }
        });
    }

    // 更新 UI - 已保存狀態
    function updateUIForSavedPage(response) {
        // 啟用標記按鈕
        highlightButton.textContent = '📝 Start Highlighting';
        highlightButton.disabled = false;
        clearHighlightsButton.style.display = 'block';
        
        // 隱藏保存按鈕（頁面已保存，不需要重複保存）
        saveButton.style.display = 'none';
        
        // 顯示打開 Notion 按鈕
        if (response.notionUrl) {
            openNotionButton.style.display = 'block';
            openNotionButton.setAttribute('data-url', response.notionUrl);
        }
        
        // 更新狀態訊息
        status.textContent = 'Page saved. Ready to highlight or update.';
    }

    // 更新 UI - 未保存狀態
    function updateUIForUnsavedPage(response) {
        // 禁用標記按鈕
        highlightButton.textContent = '📝 Save First to Highlight';
        highlightButton.disabled = true;
        clearHighlightsButton.style.display = 'none';
        
        // 顯示保存按鈕（頁面未保存，需要先保存）
        saveButton.style.display = 'block';
        
        // 隱藏打開 Notion 按鈕
        openNotionButton.style.display = 'none';
        
        // 更新狀態訊息
        if (response.wasDeleted) {
            status.textContent = 'Original page was deleted. Save to create new page.';
            status.style.color = '#d63384';
            setTimeout(() => {
                status.textContent = 'Save page first to enable highlighting.';
                status.style.color = '';
            }, 3000);
        } else {
            status.textContent = 'Save page first to enable highlighting.';
        }
    }

    // 打開 Notion 頁面按鈕事件
    openNotionButton.addEventListener('click', () => {
        const notionUrl = openNotionButton.getAttribute('data-url');
        if (notionUrl) {
            chrome.tabs.create({ url: notionUrl }, () => {
                console.log('✅ 已在新標籤頁打開 Notion 頁面');
            });
        }
    });

    // Debug: 顯示最後一次 content extraction 的結果
    // 標記按鈕事件
    highlightButton.addEventListener('click', () => {
        // 先檢查頁面狀態
        chrome.runtime.sendMessage({ action: 'checkPageStatus' }, (statusResponse) => {
            if (statusResponse && statusResponse.success) {
                if (!statusResponse.isSaved) {
                    // 頁面未保存，提醒用戶
                    status.textContent = 'Please save the page first!';
                    status.style.color = '#d63384';
                    setTimeout(() => {
                        status.textContent = 'Save page first to enable highlighting.';
                        status.style.color = '';
                    }, 2000);
                    return;
                }

                // 頁面已保存，啟動標記功能
                status.textContent = 'Starting highlight mode...';
                highlightButton.disabled = true;

                chrome.runtime.sendMessage({ action: 'startHighlight' }, (response) => {
                    if (chrome.runtime.lastError) {
                        status.textContent = `Error: ${chrome.runtime.lastError.message}`;
                        console.error(chrome.runtime.lastError);
                    } else if (response && response.success) {
                        status.textContent = 'Highlight mode activated!';
                        setTimeout(() => {
                            window.close(); // 關閉 popup 讓用戶開始標記
                        }, 1000);
                    } else {
                        status.textContent = 'Failed to start highlight mode.';
                        console.error('Error from background script:', response ? response.error : 'No response');
                    }
                    
                    setTimeout(() => {
                        highlightButton.disabled = false;
                    }, 2000);
                });
            }
        });
    });

    // 清除標記按鈕事件
    clearHighlightsButton.addEventListener('click', () => {
        if (confirm('確定要清除頁面上的所有標記嗎？這個操作無法撤銷。')) {
            status.textContent = 'Clearing highlights...';
            clearHighlightsButton.disabled = true;

            // 發送清除標記的消息
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTab = tabs[0];
                if (activeTab && activeTab.id) {
                    chrome.scripting.executeScript({
                        target: { tabId: activeTab.id },
                        func: () => {
                            // 清除頁面上的標記
                            const highlights = document.querySelectorAll('.simple-highlight');
                            highlights.forEach(highlight => {
                                const parent = highlight.parentNode;
                                parent.insertBefore(document.createTextNode(highlight.textContent), highlight);
                                parent.removeChild(highlight);
                                parent.normalize();
                            });
                            
                            // 清除本地存儲
                            const normalizeUrl = (rawUrl) => {
                                try {
                                    const u = new URL(rawUrl);
                                    u.hash = '';
                                    const trackingParams = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'];
                                    trackingParams.forEach((p) => u.searchParams.delete(p));
                                    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
                                        u.pathname = u.pathname.replace(/\/+$/, '');
                                    }
                                    return u.toString();
                                } catch (e) {
                                    return rawUrl || '';
                                }
                            };
                            const pageKey = `highlights_${normalizeUrl(window.location.href)}`;
                            try { chrome.storage?.local?.remove([pageKey]); } catch (_) { localStorage.removeItem(pageKey); }
                            
                            // 更新工具欄計數（如果存在）
                            if (window.simpleHighlighter) {
                                window.simpleHighlighter.updateHighlightCount();
                            }
                            
                            return highlights.length;
                        }
                    }, (results) => {
                        const clearedCount = results && results[0] ? results[0].result : 0;
                        status.textContent = `Cleared ${clearedCount} highlights successfully!`;
                        
                        setTimeout(() => {
                            clearHighlightsButton.disabled = false;
                            status.textContent = 'Page saved. Ready to highlight or save again.';
                        }, 2000);
                    });
                } else {
                    status.textContent = 'Failed to clear highlights.';
                    clearHighlightsButton.disabled = false;
                }
            });
        }
    });

    saveButton.addEventListener('click', () => {
        status.textContent = 'Saving...';
        saveButton.disabled = true;

        // Send a message to the background script to start the saving process
        chrome.runtime.sendMessage({ action: 'savePage' }, (response) => {
            if (chrome.runtime.lastError) {
                // Handle potential errors (e.g., background script not ready)
                status.textContent = `Error: ${chrome.runtime.lastError.message}`;
                console.error(chrome.runtime.lastError);
            } else if (response && response.success) {
                let action = 'Saved';
                let details = '';
                
                if (response.recreated) {
                    action = 'Recreated (original was deleted)';
                    const imageCount = response.imageCount || 0;
                    const blockCount = response.blockCount || 0;
                    details = `(${blockCount} blocks, ${imageCount} images)`;
                } else if (response.highlightsUpdated) {
                    action = 'Highlights updated';
                    const highlightCount = response.highlightCount || 0;
                    details = `(${highlightCount} highlights)`;
                } else if (response.updated) {
                    action = 'Updated';
                    const imageCount = response.imageCount || 0;
                    const blockCount = response.blockCount || 0;
                    details = `(${blockCount} blocks, ${imageCount} images)`;
                } else if (response.created) {
                    action = 'Created';
                    const imageCount = response.imageCount || 0;
                    const blockCount = response.blockCount || 0;
                    details = `(${blockCount} blocks, ${imageCount} images)`;

                    // 如果有警告信息（如圖片被過濾），顯示在詳情中
                    if (response.warning) {
                        details += ` ⚠️ ${response.warning}`;
                    }
                }

                status.textContent = `${action} successfully! ${details}`;

                // v2.7.0: 保存成功後，更新圖標徽章
                chrome.runtime.sendMessage({ action: 'checkPageStatus' });
            } else {
                status.textContent = `Failed to save: ${response ? response.error : 'No response'}`;
                console.error('Error from background script:', response ? response.error : 'No response');
            }
            
            // Re-enable the button after a short delay
            setTimeout(() => {
                saveButton.disabled = false;
                // Optionally reset status text
                // status.textContent = 'Ready to save.';
            }, 3000);
        });
    });
});
