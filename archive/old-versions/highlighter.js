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
                if (selection.rangeCount === 0 || selection.isCollapsed) {
                    console.log('沒有選擇或選擇已折疊');
                    return;
                }

                const range = selection.getRangeAt(0);
                const selectedText = selection.toString().trim();

                if (selectedText.length === 0) {
                    console.log('選中的文本為空');
                    return;
                }

                // 詳細調試信息
                console.log('=== 標註調試信息 ===');
                console.log('選擇的文本:', `"${selectedText}"`);
                console.log('開始容器:', range.startContainer);
                console.log('開始容器類型:', range.startContainer.nodeType === Node.TEXT_NODE ? 'TEXT_NODE' : 'ELEMENT_NODE');
                console.log('結束容器:', range.endContainer);
                console.log('結束容器類型:', range.endContainer.nodeType === Node.TEXT_NODE ? 'TEXT_NODE' : 'ELEMENT_NODE');
                console.log('共同祖先:', range.commonAncestorContainer);
                
                // 檢查父元素信息
                let parentElement = range.commonAncestorContainer;
                if (parentElement.nodeType === Node.TEXT_NODE) {
                    parentElement = parentElement.parentElement;
                }
                console.log('父元素標籤:', parentElement ? parentElement.tagName : 'None');

                try {
                    // 檢查選擇範圍是否跨越多個元素
                    const startContainer = range.startContainer;
                    const endContainer = range.endContainer;
                    
                    // 如果是同一個文本節點，使用原來的方法
                    if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
                        console.log('使用簡單選擇方法');
                        this.wrapSimpleSelection(range, selectedText);
                    } else {
                        // 對於複雜選擇（跨元素），使用更健壯的方法
                        console.log('使用複雜選擇方法');
                        this.wrapComplexSelection(range, selectedText);
                    }
                    
                    selection.removeAllRanges();
                    this.updateHighlightCount();
                    saveHighlights();
                    console.log('標註成功完成');
                } catch (error) {
                    console.warn('標註失敗，嘗試備用方法:', error);
                    // 嘗試使用備用方法
                    this.fallbackHighlight(selection);
                }
                console.log('=== 標註調試結束 ===');
            },

            wrapSimpleSelection(range, selectedText) {
                console.log('執行簡單選擇包裝');
                try {
                    const highlight = this.createHighlightSpan();
                    range.surroundContents(highlight);
                    console.log('簡單選擇包裝成功');
                } catch (error) {
                    console.log('簡單選擇包裝失敗:', error.message);
                    throw error;
                }
            },

            wrapComplexSelection(range, selectedText) {
                console.log('執行複雜選擇包裝');
                const highlight = this.createHighlightSpan();
                
                // 檢查是否在需要特殊處理的元素內
                const commonAncestor = range.commonAncestorContainer;
                const problematicElement = this.findProblematicAncestor(commonAncestor);
                
                if (problematicElement) {
                    console.log(`檢測到在 ${problematicElement.tagName} 內選擇，使用特殊處理`);
                    this.highlightInProblematicElement(range, highlight, problematicElement.tagName);
                    return;
                } else {
                    console.log('未檢測到問題元素，使用標準方法');
                }
                
                try {
                    // 先嘗試標準方法
                    console.log('嘗試標準 surroundContents 方法');
                    range.surroundContents(highlight);
                    console.log('標準方法成功');
                } catch (error) {
                    console.log('標準方法失敗，使用提取插入方法:', error.message);
                    // 如果失敗，使用提取和插入的方法
                    try {
                        const contents = range.extractContents();
                        highlight.appendChild(contents);
                        range.insertNode(highlight);
                        console.log('提取插入方法成功');
                    } catch (extractError) {
                        console.log('提取插入也失敗，使用克隆方法:', extractError.message);
                        // 最後嘗試克隆內容
                        const contents = range.cloneContents();
                        highlight.appendChild(contents);
                        range.deleteContents();
                        range.insertNode(highlight);
                        console.log('克隆方法成功');
                    }
                }
            },

            // 擴展的祖先查找方法，檢查多種可能有問題的元素
            findProblematicAncestor(node) {
                // 定義可能導致 surroundContents 失敗的元素
                const problematicTags = [
                    'BLOCKQUOTE', 'UL', 'OL', 'LI', 'TABLE', 'TR', 'TD', 'TH', 
                    'THEAD', 'TBODY', 'TFOOT', 'DL', 'DT', 'DD', 'FIELDSET', 
                    'LEGEND', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY',
                    'ARTICLE', 'SECTION', 'HEADER', 'FOOTER', 'ASIDE', 'NAV'
                ];
                
                console.log('開始查找問題祖先元素...');
                let current = node;
                let depth = 0;
                
                while (current && current !== document.body && depth < 10) {
                    console.log(`檢查第${depth}層:`, current.nodeName || 'TEXT_NODE', current.nodeType);
                    
                    if (current.nodeType === Node.ELEMENT_NODE) {
                        console.log(`元素標籤: ${current.tagName}`);
                        if (problematicTags.includes(current.tagName)) {
                            console.log(`找到問題元素: ${current.tagName}`);
                            return current;
                        }
                    }
                    
                    current = current.parentNode;
                    depth++;
                }
                
                console.log('未找到問題元素');
                return null;
            },

            // 通用的問題元素處理方法
            highlightInProblematicElement(range, highlight, tagName) {
                try {
                    const selectedText = range.toString();
                    
                    // 根據不同的元素類型使用不同的策略
                    switch (tagName) {
                        case 'UL':
                        case 'OL':
                            this.highlightInList(range, highlight, selectedText);
                            break;
                        case 'LI':
                            this.highlightInListItem(range, highlight, selectedText);
                            break;
                        case 'TABLE':
                        case 'TR':
                        case 'TD':
                        case 'TH':
                            this.highlightInTable(range, highlight, selectedText);
                            break;
                        case 'BLOCKQUOTE':
                            this.highlightInBlockquote(range, highlight);
                            break;
                        default:
                            // 對於其他問題元素，使用通用的安全方法
                            this.safeHighlight(range, highlight, selectedText);
                            break;
                    }
                } catch (error) {
                    console.log(`${tagName} 特殊處理失敗，回退到通用方法:`, error.message);
                    throw error; // 讓上層方法處理
                }
            },

            // 列表容器的處理方法
            highlightInList(range, highlight, selectedText) {
                // 對於 UL/OL 容器，通常選擇跨越多個 LI
                this.safeHighlight(range, highlight, selectedText);
            },

            // 列表項的處理方法
            highlightInListItem(range, highlight, selectedText) {
                // LI 內的選擇，檢查是否跨越子元素
                if (range.startContainer === range.endContainer) {
                    // 在同一容器內，嘗試標準方法
                    try {
                        range.surroundContents(highlight);
                    } catch (error) {
                        this.safeHighlight(range, highlight, selectedText);
                    }
                } else {
                    // 跨容器選擇，使用安全方法
                    this.safeHighlight(range, highlight, selectedText);
                }
            },

            // 表格元素的處理方法
            highlightInTable(range, highlight, selectedText) {
                // 表格結構比較複雜，直接使用安全方法
                this.safeHighlight(range, highlight, selectedText);
            },

            // 通用的安全高亮方法 - 增強版本，支持複雜的跨元素選擇
            safeHighlight(range, highlight, selectedText) {
                console.log('開始安全高亮處理，選擇文本:', `"${selectedText}"`);
                
                // 方法1: 嘗試提取內容
                try {
                    console.log('嘗試方法1: 提取內容');
                    const contents = range.extractContents();
                    highlight.appendChild(contents);
                    range.insertNode(highlight);
                    console.log('方法1成功');
                    return;
                } catch (error) {
                    console.log('提取內容方法失敗:', error.message);
                }
                
                // 方法2: 嘗試克隆內容
                try {
                    console.log('嘗試方法2: 克隆內容');
                    const contents = range.cloneContents();
                    highlight.appendChild(contents);
                    range.deleteContents();
                    range.insertNode(highlight);
                    console.log('方法2成功');
                    return;
                } catch (error) {
                    console.log('克隆內容方法失敗:', error.message);
                }
                
                // 方法3: 文本替換方法
                try {
                    console.log('嘗試方法3: 文本替換');
                    highlight.textContent = selectedText;
                    range.deleteContents();
                    range.insertNode(highlight);
                    console.log('方法3成功');
                    return;
                } catch (error) {
                    console.log('文本替換方法失敗:', error.message);
                }
                
                // 方法4: 片段重建法 - 專門處理跨元素選擇
                try {
                    console.log('嘗試方法4: 片段重建法');
                    this.fragmentReconstructionHighlight(range, highlight, selectedText);
                    console.log('方法4成功');
                    return;
                } catch (error) {
                    console.log('片段重建法失敗:', error.message);
                }
                
                // 方法5: 分割節點法 - 將跨元素選擇分解為多個單元素選擇
                try {
                    console.log('嘗試方法5: 分割節點法');
                    this.splitNodeHighlight(range, highlight, selectedText);
                    console.log('方法5成功');
                    return;
                } catch (error) {
                    console.log('分割節點法失敗:', error.message);
                }
                
                // 方法6: 超級安全模式 - 使用絕對安全的文本節點創建
                try {
                    console.log('嘗試方法6: 超級安全模式');
                    this.superSafeHighlight(range, highlight, selectedText);
                    console.log('方法6成功');
                    return;
                } catch (error) {
                    console.log('超級安全模式失敗:', error.message);
                }
                
                console.log('所有方法都失敗，拋出錯誤');
                throw new Error('所有高亮方法都失敗');
            },
            
            // 片段重建法 - 重建 DOM 片段來處理跨元素選擇
            fragmentReconstructionHighlight(range, highlight, selectedText) {
                // 創建一個 DocumentFragment 來重建選擇的內容
                const fragment = document.createDocumentFragment();
                const walker = document.createTreeWalker(
                    range.commonAncestorContainer,
                    NodeFilter.SHOW_ALL,
                    {
                        acceptNode: function(node) {
                            if (range.intersectsNode(node)) {
                                return NodeFilter.FILTER_ACCEPT;
                            }
                            return NodeFilter.FILTER_SKIP;
                        }
                    }
                );
                
                let currentNode;
                const nodesToProcess = [];
                while (currentNode = walker.nextNode()) {
                    if (range.intersectsNode(currentNode)) {
                        nodesToProcess.push(currentNode);
                    }
                }
                
                // 如果找到了相關節點，處理它們
                if (nodesToProcess.length > 0) {
                    // 創建一個臨時容器
                    const tempContainer = document.createElement('div');
                    tempContainer.appendChild(range.cloneContents());
                    
                    // 將內容移到 highlight span 中
                    while (tempContainer.firstChild) {
                        highlight.appendChild(tempContainer.firstChild);
                    }
                    
                    // 刪除原選擇並插入高亮
                    range.deleteContents();
                    range.insertNode(highlight);
                } else {
                    throw new Error('無法找到相關節點進行片段重建');
                }
            },
            
            // 分割節點法 - 將跨元素選擇分解處理
            splitNodeHighlight(range, highlight, selectedText) {
                const startContainer = range.startContainer;
                const endContainer = range.endContainer;
                
                // 如果跨越不同的容器，嘗試分解處理
                if (startContainer !== endContainer) {
                    // 創建多個範圍來分別處理
                    const ranges = this.splitRangeIntoSegments(range);
                    
                    if (ranges.length > 1) {
                        // 創建一個包裝容器
                        const wrapper = document.createElement('span');
                        wrapper.className = highlight.className;
                        wrapper.style.cssText = highlight.style.cssText;
                        wrapper.title = highlight.title;
                        
                        // 處理每個範圍片段
                        for (let i = ranges.length - 1; i >= 0; i--) {
                            const segmentRange = ranges[i];
                            const segmentContents = segmentRange.extractContents();
                            wrapper.insertBefore(segmentContents, wrapper.firstChild);
                        }
                        
                        // 在第一個範圍的位置插入包裝元素
                        ranges[0].insertNode(wrapper);
                        
                        // 複製事件監聽器
                        this.copyEventListeners(highlight, wrapper);
                    } else {
                        throw new Error('無法分割範圍');
                    }
                } else {
                    // 同一容器，直接使用原有邏輯
                    throw new Error('同一容器選擇，應使用其他方法');
                }
            },
            
            // 將一個範圍分割成多個片段
            splitRangeIntoSegments(range) {
                const segments = [];
                const walker = document.createTreeWalker(
                    range.commonAncestorContainer,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: function(node) {
                            if (range.intersectsNode(node)) {
                                return NodeFilter.FILTER_ACCEPT;
                            }
                            return NodeFilter.FILTER_REJECT;
                        }
                    }
                );
                
                let node;
                while (node = walker.nextNode()) {
                    const nodeRange = document.createRange();
                    nodeRange.selectNodeContents(node);
                    
                    // 調整範圍邊界
                    if (node === range.startContainer) {
                        nodeRange.setStart(node, range.startOffset);
                    }
                    if (node === range.endContainer) {
                        nodeRange.setEnd(node, range.endOffset);
                    }
                    
                    if (!nodeRange.collapsed) {
                        segments.push(nodeRange);
                    }
                }
                
                return segments;
            },
            
            // 複製事件監聽器 - 雙擊刪除版本
            // 複製事件監聽器 - 支持兩種刪除方式
            copyEventListeners(source, target) {
                // 設置標記樣式和提示
                target.style.cursor = 'pointer';
                target.title = '雙擊刪除標記，或 Ctrl+點擊 (Mac: Cmd+點擊) 快速刪除';
                
                // 可靠的雙擊刪除事件
                target.addEventListener('dblclick', (e) => {
                    // 立即阻止默認的文本選擇行為
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // 清除任何現有的文本選擇
                    if (window.getSelection) {
                        window.getSelection().removeAllRanges();
                    }
                    
                    // 確認刪除
                    if (confirm('確定要刪除這個標記嗎？')) {
                        this.removeHighlight(target);
                    }
                });

                // Ctrl/Cmd + 點擊快速刪除
                target.addEventListener('click', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // 清除文本選擇
                        if (window.getSelection) {
                            window.getSelection().removeAllRanges();
                        }
                        
                        // 直接刪除，無需確認
                        this.removeHighlight(target);
                    }
                    // 普通點擊不做任何處理，保持文本可選擇
                });

                // 防止單擊時的文本選擇干擾
                target.addEventListener('mousedown', (e) => {
                    // 只在雙擊時阻止，單擊保持正常行為
                    if (e.detail >= 2) {
                        e.preventDefault();
                    }
                });
            },
            
            // 超級安全模式 - 最後的備用方案
            superSafeHighlight(range, highlight, selectedText) {
                // 使用純文本節點替換，確保絕對安全
                const textNode = document.createTextNode(selectedText);
                highlight.appendChild(textNode);
                
                // 嘗試在選擇的開始位置插入
                const insertRange = document.createRange();
                insertRange.setStart(range.startContainer, range.startOffset);
                insertRange.collapse(true);
                
                // 刪除原選擇並插入新的高亮
                range.deleteContents();
                insertRange.insertNode(highlight);
            },

            createHighlightSpan() {
                const highlight = document.createElement('span');
                highlight.className = 'simple-highlight';
                highlight.style.backgroundColor = this.colors[this.currentColor];
                highlight.style.cursor = 'pointer';
                highlight.title = '雙擊刪除標記，或 Ctrl+點擊 (Mac: Cmd+點擊) 快速刪除';

                // 可靠的雙擊刪除事件
                highlight.addEventListener('dblclick', (e) => {
                    // 立即阻止默認的文本選擇行為
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // 清除任何現有的文本選擇
                    if (window.getSelection) {
                        window.getSelection().removeAllRanges();
                    }
                    
                    // 確認刪除
                    if (confirm('確定要刪除這個標記嗎？')) {
                        this.removeHighlight(highlight);
                    }
                });

                // Ctrl/Cmd + 點擊快速刪除
                highlight.addEventListener('click', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // 清除文本選擇
                        if (window.getSelection) {
                            window.getSelection().removeAllRanges();
                        }
                        
                        // 直接刪除，無需確認
                        this.removeHighlight(highlight);
                    }
                    // 普通點擊不做任何處理，保持文本可選擇
                });

                // 防止單擊時的文本選擇干擾
                highlight.addEventListener('mousedown', (e) => {
                    // 只在雙擊時阻止，單擊保持正常行為
                    if (e.detail >= 2) {
                        e.preventDefault();
                    }
                });

                return highlight;
            },
            
            // 可靠的刪除方法
            removeHighlight(highlight) {
                try {
                    const parent = highlight.parentNode;
                    if (!parent) {
                        console.warn('標記沒有父節點，無法刪除');
                        return;
                    }
                    
                    // 將標記內的所有子節點移到標記前面
                    const fragment = document.createDocumentFragment();
                    while (highlight.firstChild) {
                        fragment.appendChild(highlight.firstChild);
                    }
                    
                    // 在標記位置插入內容，然後移除標記
                    parent.insertBefore(fragment, highlight);
                    parent.removeChild(highlight);
                    
                    // 合併相鄰的文本節點
                    parent.normalize();
                    
                    // 更新計數和保存狀態
                    this.updateHighlightCount();
                    saveHighlights();
                    
                    console.log('標記已成功刪除');
                } catch (error) {
                    console.error('刪除標記時出錯:', error);
                }
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
                    
                    // 檢查是否在問題元素內
                    const problematicElement = this.findProblematicAncestor(commonAncestor);
                    if (problematicElement) {
                        console.log(`在問題元素 ${problematicElement.tagName} 內，使用超級安全模式`);
                        this.superSafeHighlight(range, span, originalContent);
                        return;
                    }
                    
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

            // 超級安全的高亮方法，用於處理最複雜的情況
            superSafeHighlight(range, span, originalContent) {
                try {
                    // 方法1: 嘗試在範圍結束位置插入
                    const endRange = range.cloneRange();
                    endRange.collapse(false); // 折疊到結束位置
                    
                    span.textContent = originalContent;
                    span.style.fontWeight = 'bold';
                    span.style.textDecoration = 'underline';
                    span.title += ' (安全模式 - 已移至文本末尾)';
                    
                    endRange.insertNode(span);
                    
                    // 添加一個箭頭標記指向原始位置
                    const arrow = document.createTextNode(' ↑[標記] ');
                    arrow.style = 'color: red; font-size: 12px;';
                    endRange.insertNode(arrow);
                    
                    console.log('使用超級安全模式成功');
                    alert('已在文本末尾添加標記。由於HTML結構複雜，標記被放置在安全位置。');
                    
                } catch (error) {
                    console.log('超級安全模式失敗，嘗試最終備用方案:', error.message);
                    // 最終方案：在頁面頂部創建一個提示
                    this.createFloatingHighlight(originalContent, span);
                }
            },

            // 創建浮動標記提示（最後的備用方案）
            createFloatingHighlight(originalContent, span) {
                try {
                    // 創建一個浮動的標記提示框
                    const floatingDiv = document.createElement('div');
                    floatingDiv.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #fff3cd;
                        border: 2px solid #ffc107;
                        border-radius: 8px;
                        padding: 10px;
                        max-width: 300px;
                        z-index: 10000;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                        font-family: Arial, sans-serif;
                        font-size: 14px;
                    `;
                    
                    floatingDiv.innerHTML = `
                        <div style="font-weight: bold; margin-bottom: 5px;">📌 已標記文本</div>
                        <div style="background: ${span.style.backgroundColor}; padding: 3px 6px; border-radius: 3px; margin-bottom: 5px;">
                            ${originalContent.substring(0, 100)}${originalContent.length > 100 ? '...' : ''}
                        </div>
                        <div style="font-size: 12px; color: #666;">
                            由於HTML結構限制，標記已保存但顯示在此處
                        </div>
                        <button onclick="this.parentElement.remove()" style="
                            background: #007bff; color: white; border: none; 
                            border-radius: 3px; padding: 3px 8px; 
                            font-size: 11px; margin-top: 5px; cursor: pointer;
                        ">關閉</button>
                    `;
                    
                    document.body.appendChild(floatingDiv);
                    
                    // 5秒後自動消失
                    setTimeout(() => {
                        if (floatingDiv.parentElement) {
                            floatingDiv.remove();
                        }
                    }, 5000);
                    
                    console.log('創建浮動標記提示成功');
                    this.updateHighlightCount();
                    saveHighlights();
                    
                } catch (error) {
                    console.error('創建浮動提示也失敗了:', error);
                    alert(`無法標記文本，但內容已記錄：\n${originalContent.substring(0, 200)}`);
                }
            },

            // 保留 blockquote 的特殊處理方法
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
                        highlight.title = '雙擊刪除標記，或 Ctrl+點擊 (Mac: Cmd+點擊) 快速刪除';

                        // 使用統一的雙擊刪除邏輯
                        highlight.addEventListener('dblclick', (e) => {
                            // 立即阻止默認的文本選擇行為
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // 清除任何現有的文本選擇
                            if (window.getSelection) {
                                window.getSelection().removeAllRanges();
                            }
                            
                            // 確認刪除
                            if (confirm('確定要刪除這個標記嗎？')) {
                                self.removeHighlight(highlight);
                            }
                        });

                        // Ctrl/Cmd + 點擊快速刪除
                        highlight.addEventListener('click', (e) => {
                            if (e.ctrlKey || e.metaKey) {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                // 清除文本選擇
                                if (window.getSelection) {
                                    window.getSelection().removeAllRanges();
                                }
                                
                                // 直接刪除，無需確認
                                self.removeHighlight(highlight);
                            }
                            // 普通點擊不做任何處理，保持文本可選擇
                        });

                        // 防止雙擊時的文本選擇干擾
                        highlight.addEventListener('mousedown', (e) => {
                            if (e.detail >= 2) {
                                e.preventDefault();
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