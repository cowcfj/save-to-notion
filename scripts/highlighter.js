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
                            saveHighlights();
                        }
                    });

                    range.surroundContents(highlight);
                    selection.removeAllRanges();
                    this.updateHighlightCount();
                    saveHighlights();
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