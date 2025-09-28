// 頁面標記功能腳本
(function() {
    // 使用來自 utils.js 的共享函數
    const { normalizeUrl, StorageUtil, Logger } = window;

    /**
     * 保存標記到存儲
     */
    function saveHighlights() {
        const highlights = document.querySelectorAll('.simple-highlight');
        const highlightData = [];

        highlights.forEach(highlight => {
            highlightData.push({
                text: highlight.textContent,
                color: highlight.style.backgroundColor || '#ffff00'
            });
        });

        // 使用共享的存儲工具
        StorageUtil.saveHighlights(window.location.href, highlightData);
    }

    /**
     * 收集標記數據
     */
    function collectHighlights() {
        const highlights = document.querySelectorAll('.simple-highlight');
        const highlightData = [];

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

        highlights.forEach((highlight) => {
            const color = highlight.style.backgroundColor;
            const text = highlight.textContent.trim();

            let notionColor = colorMap[color] || 'yellow_background';

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

    /**
     * 清除頁面所有標記
     */
    function clearPageHighlights() {
        const highlights = document.querySelectorAll('.simple-highlight');
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            parent.insertBefore(document.createTextNode(highlight.textContent), highlight);
            parent.removeChild(highlight);
            parent.normalize();
        });

        // 使用共享的存儲工具清除數據
        StorageUtil.clearHighlights(window.location.href);

        if (window.simpleHighlighter) {
            window.simpleHighlighter.updateHighlightCount();
        }

        console.log('Cleared page highlights and local storage');
    }    /**
     * 初始化標記工具
     */
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
                this.updateHighlightCount();
                this.setupExistingHighlights();
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
                    // 檢查選擇範圍是否跨越多個元素
                    const startContainer = range.startContainer;
                    const endContainer = range.endContainer;
                    
                    // 如果是同一個文本節點，使用原來的方法
                    if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
                        this.wrapSimpleSelection(range, selectedText);
                    } else {
                        // 對於複雜選擇（跨元素），使用更健壯的方法
                        this.wrapComplexSelection(range, selectedText);
                    }
                    
                    selection.removeAllRanges();
                    this.updateHighlightCount();
                    saveHighlights();
                } catch (error) {
                    console.warn('無法標記選中的文字:', error);
                    // 嘗試使用備用方法
                    this.fallbackHighlight(selection);
                }
            },

            wrapSimpleSelection(range, selectedText) {
                const highlight = this.createHighlightSpan();
                range.surroundContents(highlight);
            },

            wrapComplexSelection(range, selectedText) {
                const highlight = this.createHighlightSpan();
                
                // 檢查是否在特殊元素內（如 blockquote）
                const commonAncestor = range.commonAncestorContainer;
                const blockquote = this.findAncestorByTagName(commonAncestor, 'BLOCKQUOTE');
                
                if (blockquote) {
                    console.log('檢測到在 blockquote 內選擇，使用特殊處理');
                    this.highlightInBlockquote(range, highlight);
                    return;
                }
                
                try {
                    // 先嘗試標準方法
                    range.surroundContents(highlight);
                } catch (error) {
                    console.log('標準方法失敗，使用提取插入方法:', error.message);
                    // 如果失敗，使用提取和插入的方法
                    try {
                        const contents = range.extractContents();
                        highlight.appendChild(contents);
                        range.insertNode(highlight);
                    } catch (extractError) {
                        console.log('提取插入也失敗，使用克隆方法:', extractError.message);
                        // 最後嘗試克隆內容
                        const contents = range.cloneContents();
                        highlight.appendChild(contents);
                        range.deleteContents();
                        range.insertNode(highlight);
                    }
                }
            },

            findAncestorByTagName(node, tagName) {
                let current = node;
                while (current && current !== document.body) {
                    if (current.nodeType === Node.ELEMENT_NODE && current.tagName === tagName) {
                        return current;
                    }
                    current = current.parentNode;
                }
                return null;
            },

            highlightInBlockquote(range, highlight) {
                try {
                    // 對於 blockquote 內的內容，使用更保守的方法
                    const selectedText = range.toString();
                    
                    // 檢查選擇是否跨越多個子元素
                    if (range.startContainer === range.endContainer) {
                        // 在同一容器內，安全使用標準方法
                        range.surroundContents(highlight);
                    } else {
                        // 跨容器選擇，使用文本替換方法
                        highlight.textContent = selectedText;
                        range.deleteContents();
                        range.insertNode(highlight);
                    }
                } catch (error) {
                    console.log('blockquote 處理失敗，回退到通用方法:', error.message);
                    throw error; // 讓上層方法處理
                }
            },

            createHighlightSpan() {
                const highlight = document.createElement('span');
                highlight.className = 'simple-highlight';
                highlight.style.backgroundColor = this.colors[this.currentColor];
                highlight.style.cursor = 'pointer';
                highlight.title = '雙擊刪除標記';

                highlight.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    if (confirm('確定要刪除這個標記嗎？')) {
                        const parent = highlight.parentNode;
                        // 將高亮內容替換回原始文本
                        while (highlight.firstChild) {
                            parent.insertBefore(highlight.firstChild, highlight);
                        }
                        parent.removeChild(highlight);
                        parent.normalize();
                        this.updateHighlightCount();
                        saveHighlights();
                    }
                });

                return highlight;
            },

            fallbackHighlight(selection) {
                try {
                    console.log('使用備用高亮方法');
                    const range = selection.getRangeAt(0);
                    const span = this.createHighlightSpan();
                    
                    // 記錄原始內容
                    const originalContent = range.toString();
                    
                    // 檢查是否可以安全地修改 DOM
                    const commonAncestor = range.commonAncestorContainer;
                    console.log('共同祖先元素:', commonAncestor.nodeName || 'TEXT_NODE');
                    
                    // 特別處理不同的容器類型
                    if (commonAncestor.nodeType === Node.TEXT_NODE) {
                        // 文本節點，使用分割方法
                        this.highlightInTextNode(range, span, originalContent);
                    } else {
                        // 元素節點，使用提取插入方法
                        this.highlightAcrossElements(range, span);
                    }
                    
                    this.updateHighlightCount();
                    saveHighlights();
                } catch (error) {
                    console.error('所有高亮方法都失敗了:', error);
                    // 最後的備用方案：添加到選擇範圍的父元素
                    this.addHighlightToParent(selection);
                }
            },

            highlightInTextNode(range, span, originalContent) {
                const textNode = range.startContainer;
                const startOffset = range.startOffset;
                const endOffset = range.endOffset;
                
                // 分割文本節點
                const beforeText = textNode.textContent.substring(0, startOffset);
                const selectedText = textNode.textContent.substring(startOffset, endOffset);
                const afterText = textNode.textContent.substring(endOffset);
                
                // 創建新的節點結構
                const parent = textNode.parentNode;
                const beforeNode = document.createTextNode(beforeText);
                const afterNode = document.createTextNode(afterText);
                
                span.textContent = selectedText;
                
                // 替換原文本節點
                parent.insertBefore(beforeNode, textNode);
                parent.insertBefore(span, textNode);
                parent.insertBefore(afterNode, textNode);
                parent.removeChild(textNode);
            },

            highlightAcrossElements(range, span) {
                try {
                    // 提取選中內容
                    const contents = range.extractContents();
                    span.appendChild(contents);
                    range.insertNode(span);
                } catch (error) {
                    console.log('提取插入方法失敗，嘗試克隆方法');
                    // 如果提取失敗，嘗試克隆內容
                    const contents = range.cloneContents();
                    span.appendChild(contents);
                    // 刪除原內容
                    range.deleteContents();
                    range.insertNode(span);
                }
            },

            addHighlightToParent(selection) {
                try {
                    const range = selection.getRangeAt(0);
                    const selectedText = selection.toString().trim();
                    
                    // 創建一個包裝元素，添加到選擇範圍後面
                    const highlight = this.createHighlightSpan();
                    highlight.textContent = selectedText;
                    
                    // 在選擇範圍後插入
                    range.collapse(false); // 將範圍折疊到結束位置
                    range.insertNode(highlight);
                    
                    // 添加提示說明這是備用方法
                    highlight.title += ' (備用模式)';
                    
                    console.log('使用備用插入方法成功');
                    alert('已使用備用方式添加標記。如果位置不正確，請手動調整。');
                } catch (error) {
                    console.error('備用插入方法也失敗了:', error);
                    alert('無法在此位置添加標記。請嘗試選擇較短的文本片段，或在不同位置重試。');
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
                    saveHighlights(); // 保存空的標記列表
                }
            },

            syncHighlights() {
                const syncButton = document.getElementById('sync-highlights');
                const originalText = syncButton.textContent;

                syncButton.textContent = '同步中...';
                syncButton.disabled = true;

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

            show() {
                const toolbar = document.getElementById('simple-highlighter');
                if (toolbar) {
                    toolbar.style.display = 'block';
                    this.updateHighlightCount();
                    this.setupExistingHighlights();
                }
            },

            // 為現有標記添加雙擊刪除事件
            setupExistingHighlights() {
                const highlights = document.querySelectorAll('.simple-highlight');
                const self = this; // 保存 this 引用
                
                highlights.forEach(highlight => {
                    // 檢查是否已經添加了事件監聽器（避免重複添加）
                    if (!highlight.hasAttribute('data-click-handler')) {
                        highlight.style.cursor = 'pointer';
                        highlight.title = '雙擊刪除標記';
                        highlight.setAttribute('data-click-handler', 'true');

                        highlight.addEventListener('dblclick', (e) => {
                            e.stopPropagation();
                            if (confirm('確定要刪除這個標記嗎？')) {
                                const parent = highlight.parentNode;
                                parent.insertBefore(document.createTextNode(highlight.textContent), highlight);
                                parent.removeChild(highlight);
                                parent.normalize();
                                self.updateHighlightCount();
                                saveHighlights();
                            }
                        });
                    }
                });
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

    // 暴露函數供外部調用
    window.initHighlighter = initHighlighter;
    window.collectHighlights = collectHighlights;
    window.clearPageHighlights = clearPageHighlights;
    window.saveHighlights = saveHighlights;
    
})();