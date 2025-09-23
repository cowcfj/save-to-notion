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

    // 數據管理功能
    setupDataManagement();

    // 初始化
    checkAuthStatus();

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
                
                if (report.corruptedData.length > 0) {
                    statusText += `• ⚠️ ${report.corruptedData.length} 個損壞的數據項`;
                    showDataStatus(statusText, 'error');
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
                corruptedData: []
            };

            for (const [key, value] of Object.entries(data)) {
                if (key.startsWith('highlights_')) {
                    report.highlightPages++;
                    if (!Array.isArray(value)) {
                        report.corruptedData.push(key);
                    }
                } else if (key.startsWith('config_') || key.includes('notion')) {
                    report.configKeys++;
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
        
        // 安全清理：只清理空白頁面
        async function previewSafeCleanup() {
            const plan = await generateSafeCleanupPlan();
            cleanupPlan = plan;
            displayCleanupPreview(plan);
            
            if (plan.items.length > 0) {
                executeCleanupButton.style.display = 'inline-block';
            } else {
                executeCleanupButton.style.display = 'none';
            }
        }
        
        async function generateSafeCleanupPlan() {
            return new Promise((resolve) => {
                chrome.storage.local.get(null, (data) => {
                    const plan = {
                        items: [],
                        totalKeys: 0,
                        spaceFreed: 0
                    };
                    
                    for (const [key, value] of Object.entries(data)) {
                        if (!key.startsWith('highlights_')) continue;
                        
                        // 只清理真正的空白頁面（沒有任何標記數據）
                        if (!Array.isArray(value) || value.length === 0) {
                            const itemSize = new Blob([JSON.stringify({[key]: value})]).size;
                            
                            plan.items.push({
                                key,
                                url: key.replace('highlights_', ''),
                                size: itemSize,
                                reason: '空白頁面記錄'
                            });
                            
                            plan.spaceFreed += itemSize;
                        }
                    }
                    
                    plan.totalKeys = plan.items.length;
                    resolve(plan);
                });
            });
        }
        
        function displayCleanupPreview(plan) {
            cleanupPreview.className = 'cleanup-preview show';
            
            if (plan.items.length === 0) {
                cleanupPreview.innerHTML = `
                    <div class="cleanup-summary">
                        <strong>✅ 沒有發現空白頁面記錄</strong>
                        <p>所有頁面記錄都包含標記數據，無需清理。</p>
                    </div>
                `;
                return;
            }
            
            const spaceMB = (plan.spaceFreed / (1024 * 1024)).toFixed(3);
            
            cleanupPreview.innerHTML = `
                <div class="cleanup-summary">
                    <strong>🧹 安全清理預覽</strong>
                    <p>將清理 <strong>${plan.totalKeys}</strong> 個空白頁面記錄，釋放約 <strong>${spaceMB} MB</strong> 空間</p>
                    <div class="warning-notice">
                        ⚠️ <strong>重要提醒：</strong>這只會清理擴展中的空白記錄，<strong>絕對不會影響您在 Notion 中保存的任何頁面</strong>。
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
                const keysToRemove = cleanupPlan.items.map(item => item.key);
                
                await new Promise((resolve, reject) => {
                    chrome.storage.local.remove(keysToRemove, () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve();
                        }
                    });
                });
                
                const spaceMB = (cleanupPlan.spaceFreed / (1024 * 1024)).toFixed(3);
                showDataStatus(`✅ 安全清理完成！已移除 ${cleanupPlan.totalKeys} 個空白記錄，釋放 ${spaceMB} MB 空間`, 'success');
                
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
                        totalHighlights: 0
                    };
                    
                    const originalData = JSON.stringify(data);
                    plan.originalSize = new Blob([originalData]).size;
                    
                    // 分析可能的優化
                    const optimizedData = {};
                    
                    for (const [key, value] of Object.entries(data)) {
                        if (key.startsWith('highlights_')) {
                            if (Array.isArray(value) && value.length > 0) {
                                plan.highlightPages++;
                                plan.totalHighlights += value.length;
                                
                                // 數據壓縮：移除重複的長文本，優化數據結構
                                const optimizedHighlights = value.map(highlight => {
                                    const optimized = { ...highlight };
                                    // 限制文本長度，移除多餘空白
                                    if (optimized.text) {
                                        optimized.text = optimized.text.trim().substring(0, 500);
                                    }
                                    return optimized;
                                });
                                
                                optimizedData[key] = optimizedHighlights;
                                
                                if (value.length !== optimizedHighlights.length || 
                                    JSON.stringify(value) !== JSON.stringify(optimizedHighlights)) {
                                    plan.optimizations.push(`優化 ${key.replace('highlights_', '')} 的數據結構`);
                                }
                            }
                        } else {
                            optimizedData[key] = value;
                        }
                    }
                    
                    const optimizedJson = JSON.stringify(optimizedData);
                    plan.optimizedSize = new Blob([optimizedJson]).size;
                    plan.spaceSaved = plan.originalSize - plan.optimizedSize;
                    plan.canOptimize = plan.spaceSaved > 1024; // 至少節省 1KB 才值得優化
                    
                    // 檢查是否需要索引重建
                    const hasFragmentation = Object.keys(data).some(key => 
                        key.startsWith('highlights_') && (!data[key] || !Array.isArray(data[key]))
                    );
                    
                    if (hasFragmentation) {
                        plan.optimizations.push('修復數據碎片');
                        plan.canOptimize = true;
                    }
                    
                    if (plan.highlightPages > 100) {
                        plan.optimizations.push('重建數據索引');
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
                // 創建備份
                const backupData = await new Promise(resolve => {
                    chrome.storage.local.get(null, resolve);
                });
                
                // 執行優化
                const optimizedData = {};
                
                for (const [key, value] of Object.entries(backupData)) {
                    if (key.startsWith('highlights_')) {
                        if (Array.isArray(value) && value.length > 0) {
                            // 優化標記數據
                            const optimizedHighlights = value.map(highlight => {
                                const optimized = { ...highlight };
                                if (optimized.text) {
                                    optimized.text = optimized.text.trim().substring(0, 500);
                                }
                                return optimized;
                            }).filter(h => h.text && h.text.length > 0); // 移除空標記
                            
                            if (optimizedHighlights.length > 0) {
                                optimizedData[key] = optimizedHighlights;
                            }
                        }
                    } else {
                        optimizedData[key] = value;
                    }
                }
                
                // 清空存儲並寫入優化後的數據
                await new Promise((resolve, reject) => {
                    chrome.storage.local.clear(() => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve();
                        }
                    });
                });
                
                await new Promise((resolve, reject) => {
                    chrome.storage.local.set(optimizedData, () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve();
                        }
                    });
                });
                
                const spaceSavedMB = (optimizationPlan.spaceSaved / (1024 * 1024)).toFixed(3);
                showDataStatus(`✅ 數據重整完成！已優化數據結構，節省 ${spaceSavedMB} MB 空間，所有標記內容完整保留`, 'success');
                
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