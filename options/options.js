// 載入 Cookie 授權模組
let notionCookieAuth = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 原有元素
    const apiKeyInput = document.getElementById('api-key');
    const databaseIdInput = document.getElementById('database-id');
    const databaseSelect = document.getElementById('database-select');
    const saveButton = document.getElementById('save-button');
    const testApiButton = document.getElementById('test-api-button');
    const status = document.getElementById('status');
    
    // 授權方式選擇器
    const authMethodCookie = document.getElementById('auth-method-cookie');
    const authMethodManual = document.getElementById('auth-method-manual');
    const cookieAuthSection = document.getElementById('cookie-auth-section');
    const manualAuthSection = document.getElementById('manual-auth-section');
    
    // Cookie 授權相關元素
    const cookieAuthStatus = document.getElementById('cookie-auth-status');
    const cookieLoginButton = document.getElementById('cookie-login-button');
    const cookieCheckButton = document.getElementById('cookie-check-button');
    const cookieLogoutButton = document.getElementById('cookie-logout-button');
    const cookieUserInfo = document.getElementById('cookie-user-info');
    const cookieUserName = document.getElementById('cookie-user-name');
    const cookieUserEmail = document.getElementById('cookie-user-email');
    const cookieUserAvatar = document.getElementById('cookie-user-avatar');
    const cookieWorkspaceInfo = document.getElementById('cookie-workspace-info');
    const cookieDatabaseSection = document.getElementById('cookie-database-section');
    const cookieLoadDatabases = document.getElementById('cookie-load-databases');
    const cookieDatabaseList = document.getElementById('cookie-database-list');
    
    // 手動授權相關元素
    const manualAuthStatus = document.getElementById('manual-auth-status');
    const manualSetupButton = document.getElementById('manual-setup-button');
    
    // 模板相關元素
    const titleTemplateInput = document.getElementById('title-template');
    const addSourceCheckbox = document.getElementById('add-source');
    const addTimestampCheckbox = document.getElementById('add-timestamp');
    const previewButton = document.getElementById('preview-template');
    const templatePreview = document.getElementById('template-preview');

    // 初始化 Cookie 授權模組
    console.log('🔄 開始載入 Cookie 授權模組...');
    try {
        // 動態載入 Cookie 授權腳本
        console.log('📜 載入腳本: ../scripts/notion-cookie-auth.js');
        await loadScript('../scripts/notion-cookie-auth.js');
        console.log('📜 腳本載入完成，檢查 NotionCookieAuth 類...');
        
        if (typeof NotionCookieAuth !== 'undefined') {
            notionCookieAuth = new NotionCookieAuth();
            console.log('✅ Cookie 授權模組載入成功');
        } else {
            console.error('❌ NotionCookieAuth 類未定義');
        }
    } catch (error) {
        console.error('❌ Cookie 授權模組載入失敗:', error);
        console.error('錯誤詳情:', error.stack);
    }

    // 確保所有元素都已準備好
    console.log('🔍 檢查關鍵元素是否存在...');
    console.log('- cookieAuthSection:', !!cookieAuthSection);
    console.log('- manualAuthSection:', !!manualAuthSection);
    console.log('- authMethodCookie:', !!authMethodCookie);
    console.log('- authMethodManual:', !!authMethodManual);

    // 載入腳本輔助函數
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // 授權方式切換
    function switchAuthMethod(method) {
        console.log(`🔄 切換授權方式到: ${method}`);
        
        // 強制檢查元素是否存在
        const cookieSection = document.getElementById('cookie-auth-section');
        const manualSection = document.getElementById('manual-auth-section');
        const cookieRadio = document.getElementById('auth-method-cookie');
        const manualRadio = document.getElementById('auth-method-manual');
        
        console.log('元素檢查結果:');
        console.log('- cookieSection:', !!cookieSection);
        console.log('- manualSection:', !!manualSection);
        console.log('- cookieRadio:', !!cookieRadio);
        console.log('- manualRadio:', !!manualRadio);
        
        if (method === 'cookie') {
            console.log('🍪 顯示 Cookie 授權區域');
            
            if (cookieSection) {
                cookieSection.style.display = 'block';
                console.log('✅ Cookie 授權區域已顯示');
            } else {
                console.error('❌ 找不到 Cookie 授權區域元素 (ID: cookie-auth-section)');
                return;
            }
            
            if (manualSection) {
                manualSection.style.display = 'none';
                console.log('✅ 手動授權區域已隱藏');
            }
            
            if (cookieRadio) {
                cookieRadio.checked = true;
                console.log('✅ Cookie 單選按鈕已選中');
            }
            
            // 檢查 Cookie 授權狀態
            if (notionCookieAuth) {
                console.log('🔍 檢查 Cookie 授權狀態...');
                checkCookieAuthStatus();
            } else {
                console.warn('⚠️ Cookie 授權模組未載入，顯示默認狀態');
                const statusElement = document.getElementById('cookie-auth-status');
                if (statusElement) {
                    statusElement.textContent = '⚠️ Cookie 授權模組載入中...';
                    statusElement.className = 'auth-status warning';
                }
            }
        } else {
            console.log('🔑 顯示手動授權區域');
            
            if (cookieSection) {
                cookieSection.style.display = 'none';
                console.log('✅ Cookie 授權區域已隱藏');
            }
            
            if (manualSection) {
                manualSection.style.display = 'block';
                console.log('✅ 手動授權區域已顯示');
            } else {
                console.error('❌ 找不到手動授權區域元素 (ID: manual-auth-section)');
                return;
            }
            
            if (manualRadio) {
                manualRadio.checked = true;
                console.log('✅ 手動單選按鈕已選中');
            }
            
            // 檢查手動授權狀態
            checkManualAuthStatus();
        }
        
        // 保存授權方式選擇
        chrome.storage.sync.set({ authMethod: method }, () => {
            console.log(`💾 授權方式 "${method}" 已保存到 storage`);
        });
    }

    // 檢查授權狀態和載入設置
    function checkAuthStatus() {
        console.log('🔍 檢查授權狀態和載入設置...');
        chrome.storage.sync.get([
            'authMethod',
            'notionApiKey', 
            'notionDatabaseId', 
            'titleTemplate', 
            'addSource', 
            'addTimestamp'
        ], (result) => {
            console.log('📋 載入的設置:', result);
            
            // 載入模板設置
            if (titleTemplateInput) {
                titleTemplateInput.value = result.titleTemplate || '{title}';
            }
            if (addSourceCheckbox) {
                addSourceCheckbox.checked = result.addSource !== false;
            }
            if (addTimestampCheckbox) {
                addTimestampCheckbox.checked = result.addTimestamp !== false;
            }
            
            // 設置授權方式
            const authMethod = result.authMethod || 'cookie'; // 默認使用 Cookie 授權
            console.log(`🎯 設置授權方式為: ${authMethod}`);
            switchAuthMethod(authMethod);
        });
    }

    // 檢查 Cookie 授權狀態
    async function checkCookieAuthStatus() {
        if (!notionCookieAuth) {
            cookieAuthStatus.textContent = '❌ Cookie 授權模組未載入';
            cookieAuthStatus.className = 'auth-status error';
            return;
        }

        try {
            cookieAuthStatus.textContent = '⏳ 檢查授權狀態...';
            cookieAuthStatus.className = 'auth-status';
            
            const isLoggedIn = await notionCookieAuth.initialize();
            
            if (isLoggedIn) {
                cookieAuthStatus.textContent = '✅ 已連接到 Notion';
                cookieAuthStatus.className = 'auth-status success';
                
                // 顯示用戶資訊
                const userInfo = notionCookieAuth.getUserDisplayInfo();
                if (userInfo) {
                    cookieUserName.textContent = userInfo.name;
                    cookieUserEmail.textContent = userInfo.email || '未提供郵箱';
                    if (userInfo.avatar) {
                        cookieUserAvatar.src = userInfo.avatar;
                    }
                    cookieUserInfo.style.display = 'flex';
                }
                
                // 獲取工作空間資訊
                try {
                    const workspaces = await notionCookieAuth.getUserWorkspaces();
                    cookieWorkspaceInfo.textContent = `工作空間: ${workspaces.length} 個`;
                } catch (error) {
                    cookieWorkspaceInfo.textContent = '工作空間: 載入失敗';
                }
                
                // 顯示資料庫選擇區域
                cookieDatabaseSection.style.display = 'block';
                cookieLoginButton.style.display = 'none';
                cookieLogoutButton.style.display = 'inline-flex';
                
            } else {
                cookieAuthStatus.textContent = '❌ 未連接到 Notion';
                cookieAuthStatus.className = 'auth-status error';
                
                cookieUserInfo.style.display = 'none';
                cookieDatabaseSection.style.display = 'none';
                cookieLoginButton.style.display = 'inline-flex';
                cookieLogoutButton.style.display = 'none';
            }
            
        } catch (error) {
            console.error('檢查 Cookie 授權狀態失敗:', error);
            cookieAuthStatus.textContent = '❌ 授權檢查失敗';
            cookieAuthStatus.className = 'auth-status error';
        }
    }

    // 檢查手動授權狀態
    function checkManualAuthStatus() {
        chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId'], (result) => {
            if (result.notionApiKey) {
                manualAuthStatus.textContent = '✅ 已設置 API 金鑰';
                manualAuthStatus.className = 'auth-status success';
                
                apiKeyInput.value = result.notionApiKey;
                
                if (result.notionDatabaseId) {
                    databaseIdInput.value = result.notionDatabaseId;
                }
                
                // 載入數據庫列表
                loadDatabases(result.notionApiKey);
            } else {
                manualAuthStatus.textContent = '未設置 API 金鑰';
                manualAuthStatus.className = 'auth-status';
            }
        });
    }

    // Cookie 授權 - 登入 Notion
    async function cookieLogin() {
        if (!notionCookieAuth) {
            showStatus('Cookie 授權模組未載入', 'error');
            return;
        }

        try {
            cookieLoginButton.disabled = true;
            cookieLoginButton.innerHTML = '<span class="loading"></span><span class="button-text">正在打開登入頁面...</span>';
            
            const tabId = await notionCookieAuth.promptUserLogin();
            
            if (tabId) {
                showStatus('已打開 Notion 登入頁面，請完成登入後點擊「檢查授權狀態」', 'success');
            } else {
                throw new Error('無法打開登入頁面');
            }
            
        } catch (error) {
            console.error('Cookie 登入失敗:', error);
            showStatus('登入失敗: ' + error.message, 'error');
        } finally {
            cookieLoginButton.disabled = false;
            cookieLoginButton.innerHTML = '<span class="button-icon">🔑</span><span class="button-text">登入 Notion</span>';
        }
    }

    // Cookie 授權 - 登出
    async function cookieLogout() {
        if (!notionCookieAuth) {
            return;
        }

        try {
            notionCookieAuth.logout();
            await checkCookieAuthStatus();
            showStatus('已登出', 'success');
        } catch (error) {
            console.error('登出失敗:', error);
            showStatus('登出失敗: ' + error.message, 'error');
        }
    }

    // Cookie 授權 - 載入資料庫
    async function cookieLoadDatabases() {
        if (!notionCookieAuth) {
            return;
        }

        try {
            cookieLoadDatabases.disabled = true;
            cookieLoadDatabases.innerHTML = '<span class="loading"></span><span class="button-text">載入中...</span>';
            
            const databases = await notionCookieAuth.searchDatabases();
            
            if (databases.length > 0) {
                // 顯示資料庫列表
                cookieDatabaseList.innerHTML = '';
                
                databases.forEach(db => {
                    const item = document.createElement('div');
                    item.className = 'database-item';
                    item.onclick = () => selectCookieDatabase(db, item);
                    
                    item.innerHTML = `
                        <div class="database-title">${db.title || '未命名資料庫'}</div>
                        <div class="database-description">ID: ${db.id}</div>
                    `;
                    
                    cookieDatabaseList.appendChild(item);
                });
                
                cookieDatabaseList.style.display = 'block';
                showStatus(`找到 ${databases.length} 個資料庫`, 'success');
                
            } else {
                showStatus('未找到任何資料庫', 'error');
            }
            
        } catch (error) {
            console.error('載入資料庫失敗:', error);
            showStatus('載入資料庫失敗: ' + error.message, 'error');
        } finally {
            cookieLoadDatabases.disabled = false;
            cookieLoadDatabases.innerHTML = '<span class="button-icon">📚</span><span class="button-text">載入資料庫</span>';
        }
    }

    // Cookie 授權 - 選擇資料庫
    function selectCookieDatabase(database, element) {
        // 移除其他選中狀態
        document.querySelectorAll('#cookie-database-list .database-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 設置當前選中
        element.classList.add('selected');
        
        // 保存選擇的資料庫
        chrome.storage.sync.set({
            selectedDatabase: database,
            notionDatabaseId: database.id // 保持相容性
        });
        
        showStatus(`已選擇資料庫: ${database.title}`, 'success');
    }

    // 引導用戶到 Notion 設置頁面（手動授權）
    async function startManualNotionSetup() {
        try {
            manualSetupButton.disabled = true;
            manualSetupButton.innerHTML = '<span class="loading"></span>正在打開 Notion...';

            // 打開 Notion 集成頁面
            const integrationUrl = 'https://www.notion.so/my-integrations';
            await chrome.tabs.create({ url: integrationUrl });
            
            // 顯示設置指南
            showSetupGuide();
            
            setTimeout(() => {
                manualSetupButton.disabled = false;
                manualSetupButton.innerHTML = '<span class="notion-icon">📝</span>打開 Notion 集成頁面';
            }, 2000);
            
        } catch (error) {
            manualSetupButton.disabled = false;
            manualSetupButton.innerHTML = '<span class="notion-icon">📝</span>打開 Notion 集成頁面';
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
        console.log('populateDatabaseSelect 被調用，數據庫數量:', databases.length);
        
        // 初始化搜索式選擇器（如果還沒有）
        if (!searchableSelector) {
            console.log('初始化搜索式選擇器');
            searchableSelector = new SearchableDatabaseSelector();
        }
        
        // 使用新的搜索式選擇器
        console.log('調用 searchableSelector.populateDatabases');
        searchableSelector.populateDatabases(databases);
        
        // 隱藏原有的簡單選擇器
        databaseSelect.style.display = 'none';
        console.log('隱藏原有選擇器');
        
        // 保留原有邏輯作為回退（但隱藏）
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
    
    // 授權方式切換
    authMethodCookie.addEventListener('change', () => {
        if (authMethodCookie.checked) {
            switchAuthMethod('cookie');
        }
    });
    
    authMethodManual.addEventListener('change', () => {
        if (authMethodManual.checked) {
            switchAuthMethod('manual');
        }
    });
    
    // Cookie 授權事件
    cookieLoginButton.addEventListener('click', cookieLogin);
    cookieCheckButton.addEventListener('click', checkCookieAuthStatus);
    cookieLogoutButton.addEventListener('click', cookieLogout);
    cookieLoadDatabases.addEventListener('click', cookieLoadDatabases);
    
    // 手動授權事件
    manualSetupButton.addEventListener('click', startManualNotionSetup);
    saveButton.addEventListener('click', saveManualSettings);
    testApiButton.addEventListener('click', testApiKey);
    
    // 模板事件
    previewButton.addEventListener('click', previewTemplate);

    // 數據管理功能
    setupDataManagement();

    // 初始化 - 延遲執行以確保所有模組都已載入
    setTimeout(() => {
        console.log('🚀 開始初始化授權狀態檢查...');
        checkAuthStatus();
    }, 100);

    // 數據管理功能實現
    function setupDataManagement() {
        const exportButton = document.getElementById('export-data-button');
        const importButton = document.getElementById('import-data-button');
        const importFile = document.getElementById('import-data-file');
        const checkButton = document.getElementById('check-data-button');
        const dataStatus = document.getElementById('data-status');

        // 備份數據
        exportButton.addEventListener('click', async () => {
            try {
                showDataStatus('正在備份數據...', 'info');
                
                const data = await new Promise(resolve => {
                    chrome.storage.local.get(null, resolve);
                });

                const backup = {
                    timestamp: new Date().toISOString(),
                    version: chrome.runtime.getManifest().version,
                    data: data
                };

                const blob = new Blob([JSON.stringify(backup, null, 2)], {
                    type: 'application/json'
                });

                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `notion-clipper-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                showDataStatus('✅ 數據備份成功！備份文件已下載。', 'success');
            } catch (error) {
                console.error('Backup failed:', error);
                showDataStatus('❌ 備份失敗：' + error.message, 'error');
            }
        });

        // 恢復數據
        importButton.addEventListener('click', () => {
            importFile.click();
        });

        importFile.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    showDataStatus('正在恢復數據...', 'info');
                    
                    const backup = JSON.parse(e.target.result);
                    
                    if (!backup.data) {
                        throw new Error('無效的備份文件格式');
                    }

                    await new Promise(resolve => {
                        chrome.storage.local.set(backup.data, resolve);
                    });

                    showDataStatus(`✅ 數據恢復成功！已恢復 ${Object.keys(backup.data).length} 項數據。請重新整理頁面查看。`, 'success');
                    
                    // 清除文件選擇
                    importFile.value = '';
                    
                    // 3秒後重新載入設定
                    setTimeout(() => {
                        checkAuthStatus();
                    }, 2000);
                    
                } catch (error) {
                    console.error('Import failed:', error);
                    showDataStatus('❌ 恢復失敗：' + error.message, 'error');
                    importFile.value = '';
                }
            };
            reader.readAsText(file);
        });

        // 檢查數據完整性
        checkButton.addEventListener('click', async () => {
            try {
                showDataStatus('正在檢查數據完整性...', 'info');
                
                const data = await new Promise(resolve => {
                    chrome.storage.local.get(null, resolve);
                });

                const report = analyzeData(data);
                
                let statusText = `📊 數據完整性報告：\n`;
                statusText += `• 總共 ${report.totalKeys} 個數據項\n`;
                statusText += `• ${report.highlightPages} 個頁面有標記\n`;
                statusText += `• ${report.configKeys} 個配置項\n`;
                
                // v2.8.0: 顯示遷移數據統計
                if (report.migrationKeys > 0) {
                    const migrationSizeKB = (report.migrationDataSize / 1024).toFixed(1);
                    statusText += `• ⚠️ ${report.migrationKeys} 個遷移數據（${migrationSizeKB} KB，可清理）\n`;
                }
                
                if (report.corruptedData.length > 0) {
                    statusText += `• ⚠️ ${report.corruptedData.length} 個損壞的數據項`;
                    showDataStatus(statusText, 'error');
                } else if (report.migrationKeys > 0) {
                    statusText += `• 💡 建議使用「數據重整」功能清理遷移數據`;
                    showDataStatus(statusText, 'warning');
                } else {
                    statusText += `• ✅ 所有數據完整無損`;
                    showDataStatus(statusText, 'success');
                }
                
            } catch (error) {
                console.error('Data check failed:', error);
                showDataStatus('❌ 檢查失敗：' + error.message, 'error');
            }
        });

        function showDataStatus(message, type) {
            dataStatus.textContent = message;
            dataStatus.className = `data-status ${type}`;
        }

        function analyzeData(data) {
            const report = {
                totalKeys: Object.keys(data).length,
                highlightPages: 0,
                configKeys: 0,
                migrationKeys: 0,  // v2.8.0: 新增遷移數據統計
                migrationDataSize: 0,  // v2.8.0: 遷移數據大小
                corruptedData: []
            };

            for (const [key, value] of Object.entries(data)) {
                if (key.startsWith('highlights_')) {
                    report.highlightPages++;
                    if (!Array.isArray(value) && (!value || !Array.isArray(value.highlights))) {
                        report.corruptedData.push(key);
                    }
                } else if (key.startsWith('config_') || key.includes('notion')) {
                    report.configKeys++;
                } else if (key.includes('migration') || key.includes('_v1_') || key.includes('_backup_')) {
                    // v2.8.0: 統計遷移數據（包括舊版本備份）
                    report.migrationKeys++;
                    const size = new Blob([JSON.stringify({[key]: value})]).size;
                    report.migrationDataSize += size;
                }
            }

            return report;
        }

        // 存儲使用情況相關功能
        const refreshUsageButton = document.getElementById('refresh-usage-button');
        
        // 頁面載入時更新存儲使用情況
        updateStorageUsage();
        
        // 刷新按鈕事件
        refreshUsageButton.addEventListener('click', updateStorageUsage);
        
        async function updateStorageUsage() {
            try {
                const usage = await getStorageUsage();
                updateUsageDisplay(usage);
            } catch (error) {
                console.error('Failed to get storage usage:', error);
            }
        }
        
        async function getStorageUsage() {
            return new Promise((resolve) => {
                chrome.storage.local.get(null, (data) => {
                    const jsonString = JSON.stringify(data);
                    const sizeInBytes = new Blob([jsonString]).size;
                    const maxSize = 5 * 1024 * 1024; // 5MB
                    
                    // 分析數據
                    let pagesCount = 0;
                    let highlightsCount = 0;
                    let configCount = 0;
                    
                    for (const [key, value] of Object.entries(data)) {
                        if (key.startsWith('highlights_')) {
                            pagesCount++;
                            if (Array.isArray(value)) {
                                highlightsCount += value.length;
                            }
                        } else if (key.includes('notion') || key.startsWith('config_')) {
                            configCount++;
                        }
                    }
                    
                    const usage = {
                        used: sizeInBytes,
                        total: maxSize,
                        percentage: (sizeInBytes / maxSize * 100).toFixed(1),
                        usedMB: (sizeInBytes / (1024 * 1024)).toFixed(2),
                        totalMB: (maxSize / (1024 * 1024)).toFixed(0),
                        pages: pagesCount,
                        highlights: highlightsCount,
                        configs: configCount
                    };
                    
                    resolve(usage);
                });
            });
        }
        
        function updateUsageDisplay(usage) {
            const usageFill = document.getElementById('usage-fill');
            const usagePercentage = document.getElementById('usage-percentage');
            const usageDetails = document.getElementById('usage-details');
            const pagesCount = document.getElementById('pages-count');
            const highlightsCount = document.getElementById('highlights-count');
            const configCount = document.getElementById('config-count');
            
            // 更新使用率條
            usageFill.style.width = `${usage.percentage}%`;
            
            // 根據使用率設置顏色
            usageFill.className = 'usage-fill';
            if (usage.percentage > 90) {
                usageFill.classList.add('danger');
            } else if (usage.percentage > 70) {
                usageFill.classList.add('warning');
            }
            
            // 更新文字信息
            usagePercentage.textContent = `${usage.percentage}%`;
            usageDetails.textContent = `${usage.usedMB} MB / ${usage.totalMB} MB`;
            
            // 更新統計信息
            pagesCount.textContent = usage.pages.toLocaleString();
            highlightsCount.textContent = usage.highlights.toLocaleString();
            configCount.textContent = usage.configs;
            
            // 添加性能建議
            if (usage.percentage > 80) {
                showDataStatus(`⚠️ 存儲使用率較高 (${usage.percentage}%)，建議清理不需要的標記數據`, 'warning');
            } else if (usage.percentage > 90) {
                showDataStatus(`🚨 存儲接近上限 (${usage.percentage}%)，請立即清理數據以避免功能異常`, 'error');
            }
        }

        // 數據優化功能
        const previewCleanupButton = document.getElementById('preview-cleanup-button');
        const executeCleanupButton = document.getElementById('execute-cleanup-button');
        const analyzeOptimizationButton = document.getElementById('analyze-optimization-button');
        const executeOptimizationButton = document.getElementById('execute-optimization-button');
        const cleanupPreview = document.getElementById('cleanup-preview');
        const optimizationPreview = document.getElementById('optimization-preview');
        
        let cleanupPlan = null;
        let optimizationPlan = null;
        
        previewCleanupButton.addEventListener('click', previewSafeCleanup);
        executeCleanupButton.addEventListener('click', executeSafeCleanup);
        analyzeOptimizationButton.addEventListener('click', analyzeOptimization);
        executeOptimizationButton.addEventListener('click', executeOptimization);
        
        // 安全清理：清理已刪除頁面的標註數據
        async function previewSafeCleanup() {
            const cleanDeletedPages = document.getElementById('cleanup-deleted-pages').checked;

            // 顯示加載狀態
            setPreviewButtonLoading(true);

            try {
                const plan = await generateSafeCleanupPlan(cleanDeletedPages);
                cleanupPlan = plan;
                displayCleanupPreview(plan);

                if (plan.items.length > 0) {
                    executeCleanupButton.style.display = 'inline-block';
                } else {
                    executeCleanupButton.style.display = 'none';
                }
            } catch (error) {
                console.error('預覽清理失敗:', error);
                showDataStatus('❌ 預覽清理失敗: ' + error.message, 'error');
            } finally {
                // 恢復按鈕狀態
                setPreviewButtonLoading(false);
            }
        }
        
        // 設置預覽按鈕的加載狀態
        function setPreviewButtonLoading(loading) {
            const button = document.getElementById('preview-cleanup-button');
            const buttonText = button.querySelector('.button-text');
            
            if (loading) {
                button.classList.add('loading');
                button.disabled = true;
                buttonText.textContent = '🔍 檢查中...';
            } else {
                button.classList.remove('loading');
                button.disabled = false;
                buttonText.textContent = '👀 預覽清理效果';
            }
        }
        
        // 更新檢查進度
        function updateCheckProgress(current, total) {
            const button = document.getElementById('preview-cleanup-button');
            const buttonText = button.querySelector('.button-text');
            
            if (total > 0) {
                const percentage = Math.round((current / total) * 100);
                buttonText.textContent = `🔍 檢查中... ${current}/${total} (${percentage}%)`;
            }
        }
        
        async function generateSafeCleanupPlan(cleanDeletedPages) {
            return new Promise((resolve) => {
                chrome.storage.local.get(null, async (data) => {
                    const plan = {
                        items: [],
                        totalKeys: 0,
                        spaceFreed: 0,
                        deletedPages: 0
                    };

                    // 清理已刪除頁面的標註數據
                    if (cleanDeletedPages) {
                        const savedPages = Object.keys(data)
                            .filter(key => key.startsWith('saved_'))
                            .map(key => ({
                                key: key,
                                url: key.replace('saved_', ''),
                                data: data[key]
                            }));
                        
                        console.log(`🔍 檢查 ${savedPages.length} 個已保存的頁面...`);
                        
                        // 顯示檢查進度
                        updateCheckProgress(0, savedPages.length);
                        
                        // 批量檢查（避免 API 速率限制）
                        for (let i = 0; i < savedPages.length; i++) {
                            const page = savedPages[i];
                            
                            // 更新進度
                            updateCheckProgress(i + 1, savedPages.length);
                            
                            if (!page.data || !page.data.notionPageId) {
                                console.log(`⏭️ 跳過無效頁面: ${page.url}`);
                                continue;
                            }
                            
                            try {
                                // 檢查 Notion 頁面是否存在
                                const exists = await checkNotionPageExists(page.data.notionPageId);
                                
                                if (!exists) {
                                    // 頁面已刪除，添加到清理計劃
                                    const savedKey = page.key;
                                    const highlightsKey = `highlights_${page.url}`;
                                    
                                    const savedSize = new Blob([JSON.stringify({[savedKey]: page.data})]).size;
                                    const highlightsData = data[highlightsKey];
                                    const highlightsSize = highlightsData ? new Blob([JSON.stringify({[highlightsKey]: highlightsData})]).size : 0;
                                    const totalSize = savedSize + highlightsSize;
                                    
                                    // 添加兩個項目（saved_ 和 highlights_）
                                    plan.items.push({
                                        key: savedKey,
                                        url: page.url,
                                        size: savedSize,
                                        reason: '已刪除頁面的保存狀態'
                                    });
                                    
                                    if (highlightsData) {
                                        plan.items.push({
                                            key: highlightsKey,
                                            url: page.url,
                                            size: highlightsSize,
                                            reason: '已刪除頁面的標註數據'
                                        });
                                    }
                                    
                                    plan.spaceFreed += totalSize;
                                    plan.deletedPages++;
                                    
                                    console.log(`❌ 頁面已刪除: ${page.url} (${(totalSize / 1024).toFixed(1)} KB)`);
                                }
                                
                                // 避免 API 速率限制（Notion: 3 requests/second）
                                if (i < savedPages.length - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 350));
                                }
                                
                            } catch (error) {
                                console.error(`檢查頁面失敗: ${page.url}`, error);
                                // 繼續處理下一個頁面
                            }
                        }
                    }
                    
                    plan.totalKeys = plan.items.length;
                    resolve(plan);
                });
            });
        }
        
        // 輔助函數：檢查 Notion 頁面是否存在
        async function checkNotionPageExists(pageId) {
            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'checkNotionPageExists',
                    pageId: pageId
                });
                return response && response.exists === true;
            } catch (error) {
                console.error('檢查頁面存在失敗:', error);
                return true; // 發生錯誤時假設頁面存在（安全策略）
            }
        }
        
        function displayCleanupPreview(plan) {
            cleanupPreview.className = 'cleanup-preview show';
            
            if (plan.items.length === 0) {
                cleanupPreview.innerHTML = `
                    <div class="cleanup-summary">
                        <strong>✅ 沒有發現需要清理的數據</strong>
                        <p>所有頁面記錄都是有效的，無需清理。</p>
                    </div>
                `;
                return;
            }
            
            const spaceMB = (plan.spaceFreed / (1024 * 1024)).toFixed(3);
            
            let summaryText = '🧹 安全清理預覽\n\n將清理：\n';
            if (plan.deletedPages > 0) {
                summaryText += `• ${plan.deletedPages} 個已刪除頁面的數據\n`;
            }
            summaryText += `\n釋放約 ${spaceMB} MB 空間`;
            
            cleanupPreview.innerHTML = `
                <div class="cleanup-summary">
                    <strong>🧹 安全清理預覽</strong>
                    <p>${summaryText.split('\n').filter(line => line).map(line => {
                        if (line.includes('將清理：')) return `<strong>${line.replace('將清理：', '')}</strong>`;
                        if (line.startsWith('•')) return line;
                        if (line.includes('釋放約')) return `<br>${line}`;
                        return line;
                    }).join('<br>')}</p>
                    <div class="warning-notice">
                        ⚠️ <strong>重要提醒：</strong>這只會清理擴展中的無效記錄，<strong>絕對不會影響您在 Notion 中保存的任何頁面</strong>。
                    </div>
                </div>
                <div class="cleanup-list">
                    ${plan.items.slice(0, 10).map(item => `
                        <div class="cleanup-item">
                            <strong>${decodeURIComponent(item.url)}</strong> - ${item.reason}
                            <br><small>${(item.size / 1024).toFixed(1)} KB</small>
                        </div>
                    `).join('')}
                    ${plan.items.length > 10 ? `<div class="cleanup-item"><em>... 還有 ${plan.items.length - 10} 個項目</em></div>` : ''}
                </div>
            `;
        }
        
        async function executeSafeCleanup() {
            if (!cleanupPlan || cleanupPlan.items.length === 0) {
                showDataStatus('❌ 沒有清理計劃可執行', 'error');
                return;
            }
            
            try {
                showDataStatus('🔄 正在執行安全清理...', 'info');
                
                const keysToRemove = cleanupPlan.items.map(item => item.key);
                
                console.log('📋 清理計劃:', {
                    keysToRemove: keysToRemove.length,
                    deletedPages: cleanupPlan.deletedPages,
                    spaceFreed: cleanupPlan.spaceFreed
                });
                
                // 執行刪除操作
                await new Promise((resolve, reject) => {
                    chrome.storage.local.remove(keysToRemove, () => {
                        if (chrome.runtime.lastError) {
                            console.error('❌ 刪除失敗:', chrome.runtime.lastError);
                            reject(chrome.runtime.lastError);
                        } else {
                            console.log(`✅ 已刪除 ${keysToRemove.length} 個數據項`);
                            resolve();
                        }
                    });
                });
                
                const spaceKB = (cleanupPlan.spaceFreed / 1024).toFixed(1);
                let message = `✅ 安全清理完成！已移除 ${cleanupPlan.totalKeys} 個無效記錄，釋放 ${spaceKB} KB 空間`;

                if (cleanupPlan.deletedPages > 0) {
                    message += `\n• 清理了 ${cleanupPlan.deletedPages} 個已刪除頁面的數據`;
                }
                
                showDataStatus(message, 'success');
                
                // 重新整理使用情況和預覽
                updateStorageUsage();
                executeCleanupButton.style.display = 'none';
                cleanupPreview.className = 'cleanup-preview';
                cleanupPlan = null;
                
            } catch (error) {
                console.error('Cleanup failed:', error);
                showDataStatus('❌ 清理失敗：' + error.message, 'error');
            }
        }
        
        // 數據重整優化
        async function analyzeOptimization() {
            const plan = await generateOptimizationPlan();
            optimizationPlan = plan;
            displayOptimizationPreview(plan);
            
            if (plan.canOptimize) {
                executeOptimizationButton.style.display = 'inline-block';
            } else {
                executeOptimizationButton.style.display = 'none';
            }
        }
        
        async function generateOptimizationPlan() {
            return new Promise((resolve) => {
                chrome.storage.local.get(null, (data) => {
                    const plan = {
                        canOptimize: false,
                        originalSize: 0,
                        optimizedSize: 0,
                        spaceSaved: 0,
                        optimizations: [],
                        highlightPages: 0,
                        totalHighlights: 0,
                        keysToRemove: [],
                        optimizedData: {}
                    };
                    
                    const originalData = JSON.stringify(data);
                    plan.originalSize = new Blob([originalData]).size;
                    
                    // v2.8.0: 統計遷移數據
                    let migrationDataSize = 0;
                    let migrationKeysCount = 0;
                    
                    // 分析可能的優化
                    const optimizedData = {};
                    const keysToRemove = [];
                    
                    for (const [key, value] of Object.entries(data)) {
                        // v2.8.0: 檢測並清理遷移數據（包括舊版本備份）
                        if (key.includes('migration') || key.includes('_v1_') || key.includes('_backup_')) {
                            migrationKeysCount++;
                            const size = new Blob([JSON.stringify({[key]: value})]).size;
                            migrationDataSize += size;
                            keysToRemove.push(key);
                            // 不加入 optimizedData（清理掉）
                            continue;
                        }
                        
                        if (key.startsWith('highlights_')) {
                            if (Array.isArray(value) && value.length > 0) {
                                plan.highlightPages++;
                                plan.totalHighlights += value.length;
                                
                                // 保持完整數據，不截斷文本
                                optimizedData[key] = value;
                            }
                        } else {
                            optimizedData[key] = value;
                        }
                    }
                    
                    // v2.8.0: 添加遷移數據清理到優化計劃
                    if (migrationDataSize > 1024) {
                        const sizeKB = (migrationDataSize / 1024).toFixed(1);
                        plan.optimizations.push(`清理遷移數據（${migrationKeysCount} 項，${sizeKB} KB）`);
                        plan.canOptimize = true;
                    }
                    
                    plan.keysToRemove = keysToRemove;
                    plan.optimizedData = optimizedData;
                    
                    const optimizedJson = JSON.stringify(optimizedData);
                    plan.optimizedSize = new Blob([optimizedJson]).size;
                    plan.spaceSaved = plan.originalSize - plan.optimizedSize;
                    
                    // 只要有遷移數據就可以優化
                    if (migrationKeysCount > 0) {
                        plan.canOptimize = true;
                    }
                    
                    // 檢查是否需要索引重建
                    const hasFragmentation = Object.keys(data).some(key => 
                        key.startsWith('highlights_') && (!data[key] || !Array.isArray(data[key]))
                    );
                    
                    if (hasFragmentation) {
                        plan.optimizations.push('修復數據碎片');
                        plan.canOptimize = true;
                    }
                    
                    resolve(plan);
                });
            });
        }
        
        function displayOptimizationPreview(plan) {
            optimizationPreview.className = 'optimization-preview show';
            
            if (!plan.canOptimize) {
                optimizationPreview.innerHTML = `
                    <div class="optimization-summary">
                        <strong>✅ 數據已經處於最佳狀態</strong>
                        <p>當前數據結構已經很好，暫時不需要重整優化。</p>
                        <div class="data-stats">
                            <div>📑 標記頁面：${plan.highlightPages}</div>
                            <div>🎯 總標記數：${plan.totalHighlights}</div>
                            <div>💾 數據大小：${(plan.originalSize / 1024).toFixed(1)} KB</div>
                        </div>
                    </div>
                `;
                return;
            }
            
            const spaceSavedMB = (plan.spaceSaved / (1024 * 1024)).toFixed(3);
            const percentSaved = ((plan.spaceSaved / plan.originalSize) * 100).toFixed(1);
            
            optimizationPreview.innerHTML = `
                <div class="optimization-summary">
                    <strong>⚡ 數據重整分析結果</strong>
                    <p>可以優化您的數據結構，預計節省 <strong>${spaceSavedMB} MB</strong> 空間（<strong>${percentSaved}%</strong>）</p>
                    <div class="optimization-details">
                        <div class="size-comparison">
                            <div>📊 當前大小：${(plan.originalSize / 1024).toFixed(1)} KB</div>
                            <div>📊 優化後：${(plan.optimizedSize / 1024).toFixed(1)} KB</div>
                            <div>💾 節省空間：${(plan.spaceSaved / 1024).toFixed(1)} KB</div>
                        </div>
                        <div class="optimization-list">
                            <strong>將執行的優化：</strong>
                            ${plan.optimizations.map(opt => `<div class="optimization-item">✅ ${opt}</div>`).join('')}
                        </div>
                    </div>
                </div>
            `;
        }
        
        async function executeOptimization() {
            if (!optimizationPlan || !optimizationPlan.canOptimize) {
                showDataStatus('❌ 沒有優化計劃可執行', 'error');
                return;
            }
            
            try {
                showDataStatus('🔄 正在執行數據重整...', 'info');
                
                // v2.8.0: 使用預先計算好的優化數據
                const optimizedData = optimizationPlan.optimizedData;
                const keysToRemove = optimizationPlan.keysToRemove;
                
                console.log('📋 優化計劃:', {
                    keysToRemove: keysToRemove.length,
                    optimizedKeys: Object.keys(optimizedData).length,
                    spaceSaved: optimizationPlan.spaceSaved
                });
                
                // 先刪除遷移數據
                if (keysToRemove.length > 0) {
                    await new Promise((resolve, reject) => {
                        chrome.storage.local.remove(keysToRemove, () => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                console.log(`✅ 已刪除 ${keysToRemove.length} 個遷移數據`);
                                resolve();
                            }
                        });
                    });
                }
                
                // 然後寫入優化後的數據（如果有變化）
                const currentData = await new Promise(resolve => {
                    chrome.storage.local.get(null, resolve);
                });
                
                const needsUpdate = Object.keys(optimizedData).some(key => {
                    return JSON.stringify(currentData[key]) !== JSON.stringify(optimizedData[key]);
                });
                
                if (needsUpdate) {
                    await new Promise((resolve, reject) => {
                        chrome.storage.local.set(optimizedData, () => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                console.log('✅ 已更新優化後的數據');
                                resolve();
                            }
                        });
                    });
                }
                
                const spaceSavedKB = (optimizationPlan.spaceSaved / 1024).toFixed(1);
                showDataStatus(`✅ 數據重整完成！已清理遷移數據，節省 ${spaceSavedKB} KB 空間，所有標記內容完整保留`, 'success');
                
                // 重新整理使用情況和預覽
                updateStorageUsage();
                executeOptimizationButton.style.display = 'none';
                optimizationPreview.className = 'optimization-preview';
                optimizationPlan = null;
                
            } catch (error) {
                console.error('Optimization failed:', error);
                showDataStatus('❌ 數據重整失敗：' + error.message, 'error');
            }
        }
    }
});
// ==========================================
// 可搜索數據庫選擇器
// ==========================================

class SearchableDatabaseSelector {
    constructor() {
        this.databases = [];
        this.filteredDatabases = [];
        this.selectedDatabase = null;
        this.isOpen = false;
        this.focusedIndex = -1;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.container = document.getElementById('database-selector-container');
        this.searchInput = document.getElementById('database-search');
        this.toggleButton = document.getElementById('selector-toggle');
        this.dropdown = document.getElementById('database-dropdown');
        this.databaseList = document.getElementById('database-list');
        this.databaseCount = document.getElementById('database-count');
        this.refreshButton = document.getElementById('refresh-databases');
        this.databaseIdInput = document.getElementById('database-id');
        
        console.log('SearchableDatabaseSelector 元素初始化:');
        console.log('- container:', this.container);
        console.log('- searchInput:', this.searchInput);
        console.log('- toggleButton:', this.toggleButton);
        console.log('- dropdown:', this.dropdown);
        console.log('- databaseList:', this.databaseList);
        console.log('- databaseCount:', this.databaseCount);
        console.log('- refreshButton:', this.refreshButton);
        console.log('- databaseIdInput:', this.databaseIdInput);
        
        if (!this.container) {
            console.error('找不到 database-selector-container 元素！');
        }
        if (!this.searchInput) {
            console.error('找不到 database-search 元素！');
        }
    }

    setupEventListeners() {
        // 搜索輸入
        this.searchInput.addEventListener('input', (e) => {
            this.filterDatabases(e.target.value);
            this.showDropdown();
        });

        // 搜索框焦點事件
        this.searchInput.addEventListener('focus', () => {
            if (this.databases.length > 0) {
                this.showDropdown();
            }
        });

        // 切換下拉選單
        this.toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleDropdown();
        });

        // 重新載入數據庫
        this.refreshButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.refreshDatabases();
        });

        // 點擊外部關閉
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.hideDropdown();
            }
        });

        // 鍵盤導航
        this.searchInput.addEventListener('keydown', (e) => {
            this.handleKeyNavigation(e);
        });
    }

    populateDatabases(databases) {
        console.log('SearchableDatabaseSelector.populateDatabases 被調用');
        console.log('容器元素:', this.container);
        console.log('搜索輸入元素:', this.searchInput);
        
        this.databases = databases.map(db => ({
            id: db.id,
            title: this.extractDatabaseTitle(db),
            raw: db,
            created: db.created_time,
            lastEdited: db.last_edited_time
        }));
        
        console.log('處理後的數據庫:', this.databases);
        
        // 按標題排序
        this.databases.sort((a, b) => a.title.localeCompare(b.title));
        
        this.filteredDatabases = [...this.databases];
        this.updateDatabaseCount();
        this.renderDatabaseList();
        
        // 顯示選擇器
        console.log('顯示搜索選擇器容器');
        this.container.style.display = 'block';
        
        // 更新搜索框提示
        this.searchInput.placeholder = `搜索 ${databases.length} 個數據庫...`;
        console.log('搜索選擇器初始化完成');
        
        // 如果當前有選中的數據庫，在搜索框中顯示
        if (this.databaseIdInput.value) {
            const selectedDb = this.databases.find(db => db.id === this.databaseIdInput.value);
            if (selectedDb) {
                this.searchInput.value = selectedDb.title;
                this.selectedDatabase = selectedDb;
            }
        }
    }

    filterDatabases(query) {
        const lowerQuery = query.toLowerCase().trim();
        
        if (!lowerQuery) {
            this.filteredDatabases = [...this.databases];
        } else {
            this.filteredDatabases = this.databases.filter(db => 
                db.title.toLowerCase().includes(lowerQuery) ||
                db.id.toLowerCase().includes(lowerQuery)
            );
        }
        
        this.focusedIndex = -1;
        this.updateDatabaseCount();
        this.renderDatabaseList();
    }

    renderDatabaseList() {
        if (this.filteredDatabases.length === 0) {
            this.databaseList.innerHTML = `
                <div class="no-results">
                    <span class="icon">🔍</span>
                    <div>未找到匹配的數據庫</div>
                    <small>嘗試使用不同的關鍵字搜索</small>
                </div>
            `;
            return;
        }

        this.databaseList.innerHTML = this.filteredDatabases
            .map((db, index) => this.createDatabaseItemHTML(db, index))
            .join('');

        // 添加點擊事件
        this.databaseList.querySelectorAll('.database-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                this.selectDatabase(this.filteredDatabases[index]);
            });
        });
    }

    createDatabaseItemHTML(db, index) {
        const isSelected = this.selectedDatabase && this.selectedDatabase.id === db.id;
        const isFocused = index === this.focusedIndex;
        
        // 高亮搜索關鍵字
        const query = this.searchInput.value.toLowerCase().trim();
        let highlightedTitle = db.title;
        if (query) {
            const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
            highlightedTitle = db.title.replace(regex, '<span class="search-highlight">$1</span>');
        }
        
        return `
            <div class="database-item ${isSelected ? 'selected' : ''} ${isFocused ? 'keyboard-focus' : ''}" 
                 data-index="${index}">
                <div class="database-title">${highlightedTitle}</div>
                <div class="database-id">${db.id}</div>
                <div class="database-meta">
                    <span class="database-icon">📊</span>
                    <span>數據庫</span>
                    ${db.created ? `<span>•</span><span>創建於 ${this.formatDate(db.created)}</span>` : ''}
                </div>
            </div>
        `;
    }

    selectDatabase(database) {
        this.selectedDatabase = database;
        
        // 更新搜索框顯示
        this.searchInput.value = database.title;
        
        // 更新隱藏的數據庫 ID 輸入框
        this.databaseIdInput.value = database.id;
        
        // 重新渲染以顯示選中狀態
        this.renderDatabaseList();
        
        this.hideDropdown();
        
        // 顯示成功狀態
        showStatus(`已選擇數據庫: ${database.title}`, 'success');
        
        // 觸發選擇事件（如果需要）
        this.onDatabaseSelected?.(database);
    }

    showDropdown() {
        this.dropdown.style.display = 'block';
        this.isOpen = true;
        this.toggleButton.classList.add('open');
    }

    hideDropdown() {
        this.dropdown.style.display = 'none';
        this.isOpen = false;
        this.focusedIndex = -1;
        this.toggleButton.classList.remove('open');
        this.renderDatabaseList(); // 清除鍵盤焦點樣式
    }

    toggleDropdown() {
        if (this.isOpen) {
            this.hideDropdown();
        } else {
            if (this.databases.length > 0) {
                this.showDropdown();
            }
        }
    }

    handleKeyNavigation(e) {
        if (!this.isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                this.showDropdown();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.focusedIndex = Math.min(this.focusedIndex + 1, this.filteredDatabases.length - 1);
                this.renderDatabaseList();
                this.scrollToFocused();
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                this.focusedIndex = Math.max(this.focusedIndex - 1, -1);
                this.renderDatabaseList();
                this.scrollToFocused();
                break;
                
            case 'Enter':
                e.preventDefault();
                if (this.focusedIndex >= 0 && this.filteredDatabases[this.focusedIndex]) {
                    this.selectDatabase(this.filteredDatabases[this.focusedIndex]);
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                this.hideDropdown();
                break;
        }
    }

    scrollToFocused() {
        if (this.focusedIndex >= 0) {
            const focusedElement = this.databaseList.querySelector('.keyboard-focus');
            if (focusedElement) {
                focusedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }

    updateDatabaseCount() {
        const total = this.databases.length;
        const filtered = this.filteredDatabases.length;
        
        if (filtered === total) {
            this.databaseCount.textContent = `${total} 個數據庫`;
        } else {
            this.databaseCount.textContent = `${filtered} / ${total} 個數據庫`;
        }
    }

    refreshDatabases() {
        const apiKey = document.getElementById('api-key').value;
        if (apiKey) {
            this.showLoading();
            loadDatabases(apiKey);
        }
    }

    showLoading() {
        this.databaseList.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <span>重新載入數據庫中...</span>
            </div>
        `;
        this.showDropdown();
    }

    extractDatabaseTitle(db) {
        let title = '未命名數據庫';
        
        if (db.title && db.title.length > 0) {
            title = db.title[0].plain_text || db.title[0].text?.content || '未命名數據庫';
        } else if (db.properties) {
            const titleProp = Object.values(db.properties).find(prop => prop.type === 'title');
            if (titleProp && titleProp.title && titleProp.title.length > 0) {
                title = titleProp.title[0].plain_text || titleProp.title[0].text?.content || '未命名數據庫';
            }
        }
        
        return title;
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('zh-TW', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        } catch (e) {
            return '';
        }
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 初始化搜索式數據庫選擇器
let searchableSelector = null;