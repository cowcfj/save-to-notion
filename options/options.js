document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('api-key');
    const databaseIdInput = document.getElementById('database-id');
    const databaseSelect = document.getElementById('database-select');
    const saveButton = document.getElementById('save-button');
    const oauthButton = document.getElementById('oauth-button');
    const testApiButton = document.getElementById('test-api-button');
    const status = document.getElementById('status');
    const authStatus = document.getElementById('auth-status');
    
    // 模板相關元素
    const titleTemplateInput = document.getElementById('title-template');
    const addSourceCheckbox = document.getElementById('add-source');
    const addTimestampCheckbox = document.getElementById('add-timestamp');
    const previewButton = document.getElementById('preview-template');
    const templatePreview = document.getElementById('template-preview');

    // 檢查授權狀態和載入設置
    function checkAuthStatus() {
        chrome.storage.sync.get([
            'notionApiKey', 
            'notionDatabaseId', 
            'titleTemplate', 
            'addSource', 
            'addTimestamp'
        ], (result) => {
            if (result.notionApiKey) {
                authStatus.textContent = '✅ 已連接到 Notion';
                authStatus.className = 'auth-status success';
                oauthButton.innerHTML = '<span class="notion-icon">🔄</span>重新設置';
                
                apiKeyInput.value = result.notionApiKey;
                
                if (result.notionDatabaseId) {
                    databaseIdInput.value = result.notionDatabaseId;
                }
                
                // 載入數據庫列表
                loadDatabases(result.notionApiKey);
            } else {
                authStatus.textContent = '未連接到 Notion';
                authStatus.className = 'auth-status';
                oauthButton.innerHTML = '<span class="notion-icon">📝</span>連接到 Notion';
            }
            
            // 載入模板設置
            titleTemplateInput.value = result.titleTemplate || '{title}';
            addSourceCheckbox.checked = result.addSource !== false; // 默認為 true
            addTimestampCheckbox.checked = result.addTimestamp !== false; // 默認為 true
        });
    }

    // 引導用戶到 Notion 設置頁面
    async function startNotionSetup() {
        try {
            oauthButton.disabled = true;
            oauthButton.innerHTML = '<span class="loading"></span>正在打開 Notion...';

            // 打開 Notion 集成頁面
            const integrationUrl = 'https://www.notion.so/my-integrations';
            await chrome.tabs.create({ url: integrationUrl });
            
            // 顯示設置指南
            showSetupGuide();
            
            setTimeout(() => {
                oauthButton.disabled = false;
                oauthButton.innerHTML = '<span class="notion-icon">📝</span>連接到 Notion';
            }, 2000);
            
        } catch (error) {
            oauthButton.disabled = false;
            oauthButton.innerHTML = '<span class="notion-icon">📝</span>連接到 Notion';
            showStatus('打開 Notion 頁面失敗: ' + error.message, 'error');
        }
    }

    // 顯示簡化設置指南
    function showSetupGuide() {
        const guideHtml = `
            <div style="background: #e6fffa; border: 1px solid #38b2ac; border-radius: 6px; padding: 15px; margin: 15px 0;">
                <h3 style="margin: 0 0 10px 0; color: #2c7a7b;">📋 快速設置</h3>
                <ol style="margin: 0; padding-left: 20px; line-height: 1.6;">
                    <li>點擊 <strong>"+ New integration"</strong> 創建新的集成</li>
                    <li>複製 <strong>"Internal Integration Token"</strong></li>
                    <li>將 Token 貼到下方的 API Key 欄位</li>
                    <li>系統會自動載入可用的數據庫列表</li>
                </ol>
            </div>
        `;
        
        const existingGuide = document.querySelector('.setup-guide');
        if (existingGuide) {
            existingGuide.remove();
        }
        
        const guideDiv = document.createElement('div');
        guideDiv.className = 'setup-guide';
        guideDiv.innerHTML = guideHtml;
        
        const manualSection = document.querySelector('.manual-section');
        manualSection.insertBefore(guideDiv, manualSection.firstChild);
    }

    // 載入數據庫列表
    async function loadDatabases(apiKey) {
        try {
            showStatus('正在載入數據庫列表...', 'info');
            console.log('開始載入數據庫，API Key:', apiKey.substring(0, 20) + '...');
            
            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({
                    filter: {
                        property: 'object',
                        value: 'database'
                    },
                    page_size: 100
                })
            });

            console.log('API 響應狀態:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('API 響應數據:', data);
                
                if (data.results && data.results.length > 0) {
                    populateDatabaseSelect(data.results);
                } else {
                    showStatus('未找到任何數據庫。請確保：1) API Key 正確 2) Integration 已連接到數據庫', 'error');
                    databaseSelect.style.display = 'none';
                }
            } else {
                const errorData = await response.json();
                console.error('API 錯誤:', errorData);
                
                let errorMessage = '載入數據庫失敗: ';
                if (response.status === 401) {
                    errorMessage += 'API Key 無效或已過期';
                } else if (response.status === 403) {
                    errorMessage += 'API Key 沒有足夠的權限';
                } else {
                    errorMessage += errorData.message || `HTTP ${response.status}`;
                }
                
                showStatus(errorMessage, 'error');
                databaseSelect.style.display = 'none';
            }
        } catch (error) {
            console.error('載入數據庫失敗:', error);
            
            let errorMessage = '載入數據庫失敗: ';
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage += '網絡連接問題，請檢查網絡連接';
            } else {
                errorMessage += error.message;
            }
            
            showStatus(errorMessage, 'error');
            databaseSelect.style.display = 'none';
        }
    }

    // 填充數據庫選擇器
    function populateDatabaseSelect(databases) {
        databaseSelect.innerHTML = '<option value="">選擇數據庫...</option>';
        
        console.log('找到數據庫:', databases.length, '個');
        
        databases.forEach(db => {
            const option = document.createElement('option');
            option.value = db.id;
            // 修復標題提取邏輯
            let title = '未命名數據庫';
            if (db.title && db.title.length > 0) {
                title = db.title[0].plain_text || db.title[0].text?.content || '未命名數據庫';
            } else if (db.properties && db.properties.title) {
                // 有些數據庫的標題在 properties 中
                const titleProp = Object.values(db.properties).find(prop => prop.type === 'title');
                if (titleProp && titleProp.title && titleProp.title.length > 0) {
                    title = titleProp.title[0].plain_text || titleProp.title[0].text?.content || '未命名數據庫';
                }
            }
            option.textContent = title;
            databaseSelect.appendChild(option);
            console.log('添加數據庫:', title, 'ID:', db.id);
        });

        if (databases.length > 0) {
            databaseSelect.style.display = 'block';
            // 移除舊的事件監聽器，避免重複綁定
            databaseSelect.removeEventListener('change', handleDatabaseSelect);
            databaseSelect.addEventListener('change', handleDatabaseSelect);
            
            showStatus(`找到 ${databases.length} 個數據庫，請從下拉選單中選擇`, 'success');
        } else {
            showStatus('未找到任何數據庫，請確保 API Key 有權限訪問數據庫', 'error');
        }
    }

    // 處理數據庫選擇
    function handleDatabaseSelect() {
        if (databaseSelect.value) {
            databaseIdInput.value = databaseSelect.value;
            showStatus('數據庫已選擇，請點擊保存設置', 'info');
        }
    }

    // 顯示狀態消息
    function showStatus(message, type = 'info') {
        status.textContent = message;
        status.className = type;
        
        if (type === 'success') {
            setTimeout(() => {
                status.textContent = '';
                status.className = '';
            }, 3000);
        }
    }

    // 手動保存設置
    function saveManualSettings() {
        const apiKey = apiKeyInput.value.trim();
        let databaseId = databaseIdInput.value.trim();

        if (apiKey && databaseId) {
            // Clean the database ID: remove query parameters like ?v=...
            const queryParamIndex = databaseId.indexOf('?');
            if (queryParamIndex !== -1) {
                databaseId = databaseId.substring(0, queryParamIndex);
            }
            // Also remove hyphens, some Notion links have them
            databaseId = databaseId.replace(/-/g, '');

            // Update the input field to show the cleaned ID
            databaseIdInput.value = databaseId;

            // 保存所有設置
            const settings = {
                notionApiKey: apiKey,
                notionDatabaseId: databaseId,
                titleTemplate: titleTemplateInput.value.trim() || '{title}',
                addSource: addSourceCheckbox.checked,
                addTimestamp: addTimestampCheckbox.checked
            };

            chrome.storage.sync.set(settings, () => {
                showStatus('設置保存成功！', 'success');
                checkAuthStatus();
            });
        } else {
            showStatus('請填寫 API Key 和數據庫 ID', 'error');
        }
    }

    // API Key 輸入時自動載入數據庫
    let loadDatabasesTimeout;
    
    function handleApiKeyInput() {
        const apiKey = apiKeyInput.value.trim();
        
        // 清除之前的定時器
        if (loadDatabasesTimeout) {
            clearTimeout(loadDatabasesTimeout);
        }
        
        // 檢查 API Key 格式 - Notion API Key 通常較長
        if (apiKey && apiKey.length > 20) {
            // 延遲載入，避免頻繁請求
            loadDatabasesTimeout = setTimeout(() => {
                loadDatabases(apiKey);
            }, 1000);
        }
    }
    
    apiKeyInput.addEventListener('input', handleApiKeyInput);
    apiKeyInput.addEventListener('blur', handleApiKeyInput);

    // 測試 API Key 功能
    function testApiKey() {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            showStatus('請先輸入 API Key', 'error');
            return;
        }
        
        if (apiKey.length < 20) {
            showStatus('API Key 格式不正確，長度太短', 'error');
            return;
        }
        
        testApiButton.disabled = true;
        testApiButton.textContent = '測試中...';
        
        loadDatabases(apiKey).finally(() => {
            testApiButton.disabled = false;
            testApiButton.textContent = '測試 API Key';
        });
    }

    // 模板預覽功能
    function previewTemplate() {
        const template = titleTemplateInput.value.trim() || '{title}';
        const sampleTitle = '示例文章標題';
        const sampleUrl = 'https://example.com/article';
        
        // 簡化的模板處理（不引入完整的 template.js）
        const now = new Date();
        const domain = 'example.com';
        const date = now.getFullYear() + '-' + 
                    String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                    String(now.getDate()).padStart(2, '0');
        const time = String(now.getHours()).padStart(2, '0') + ':' + 
                    String(now.getMinutes()).padStart(2, '0');
        const datetime = date + ' ' + time;
        
        const processedTitle = template
            .replace(/\{title\}/g, sampleTitle)
            .replace(/\{url\}/g, sampleUrl)
            .replace(/\{domain\}/g, domain)
            .replace(/\{date\}/g, date)
            .replace(/\{time\}/g, time)
            .replace(/\{datetime\}/g, datetime);
        
        let previewText = `標題預覽: "${processedTitle}"`;
        
        if (addTimestampCheckbox.checked) {
            previewText += `\n✓ 會在內容開頭添加時間戳`;
        }
        
        if (addSourceCheckbox.checked) {
            previewText += `\n✓ 會在內容末尾添加來源鏈接`;
        }
        
        templatePreview.textContent = previewText;
        templatePreview.className = 'template-preview show';
    }

    // 事件監聽器
    oauthButton.addEventListener('click', startNotionSetup);
    saveButton.addEventListener('click', saveManualSettings);
    testApiButton.addEventListener('click', testApiKey);
    previewButton.addEventListener('click', previewTemplate);

    // 初始化
    checkAuthStatus();
});