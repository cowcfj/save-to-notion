/**
 * 修復版選項頁面 JavaScript
 * 
 * 修復的問題：
 * 1. 標籤切換功能
 * 2. Cookie 授權 API 問題
 * 3. 顯示當前設定
 * 4. 清除授權功能
 * 
 * @author Kiro AI Assistant
 * @version 2.9.5
 * @since 2025-01-17
 */

let simpleAuth = null;
let currentTab = 'auth';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 [Options] 修復版選項頁面載入中...');
    
    try {
        // 初始化授權模組
        await initializeAuthModules();
        
        // 設置事件監聽器
        setupEventListeners();
        
        // 載入當前設定
        await loadCurrentSettings();
        
        // 載入其他設定
        await loadTemplateSettings();
        
        console.log('✅ [Options] 修復版選項頁面初始化完成');
        
    } catch (error) {
        console.error('❌ [Options] 初始化失敗:', error);
        showStatus('初始化失敗: ' + error.message, 'error');
    }
});

/**
 * 初始化授權模組
 */
async function initializeAuthModules() {
    try {
        // 載入簡化授權模組
        await loadScript('../scripts/notion-simple-auth.js');
        simpleAuth = new NotionSimpleAuth();
        await simpleAuth.initialize();
        
        console.log('📦 [Options] 簡化授權模組已載入');
        
    } catch (error) {
        console.error('❌ [Options] 載入授權模組失敗:', error);
        // 不拋出錯誤，繼續使用基本功能
    }
}

/**
 * 動態載入腳本
 */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * 設置事件監聽器
 */
function setupEventListeners() {
    // 標籤切換
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
    
    // 授權相關按鈕
    document.getElementById('refresh-auth-button')?.addEventListener('click', handleRefreshAuth);
    document.getElementById('clear-all-auth-button')?.addEventListener('click', handleClearAllAuth);
    
    // Cookie 授權按鈕
    document.getElementById('cookie-login-button')?.addEventListener('click', handleCookieLogin);
    document.getElementById('cookie-check-button')?.addEventListener('click', handleCookieCheck);
    document.getElementById('cookie-logout-button')?.addEventListener('click', handleCookieLogout);
    
    // 手動 API 按鈕
    document.getElementById('test-api-button')?.addEventListener('click', handleTestAPI);
    document.getElementById('clear-api-button')?.addEventListener('click', handleClearAPI);
    document.getElementById('save-button')?.addEventListener('click', handleSave);
    
    // 手動授權折疊
    document.getElementById('manual-auth-toggle')?.addEventListener('click', toggleManualAuth);
    
    // 模板設定
    document.getElementById('preview-template')?.addEventListener('click', handlePreviewTemplate);
    document.getElementById('save-template-button')?.addEventListener('click', handleSaveTemplate);
    
    // 資料管理
    document.getElementById('export-data-button')?.addEventListener('click', handleExportData);
    document.getElementById('import-data-button')?.addEventListener('click', handleImportData);
    document.getElementById('check-data-button')?.addEventListener('click', handleCheckData);
    
    // 文件導入
    document.getElementById('import-data-file')?.addEventListener('change', handleFileImport);
    
    console.log('🎯 [Options] 事件監聽器已設置');
}

/**
 * 切換標籤頁
 */
function switchTab(tabName) {
    // 隱藏所有標籤內容
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 移除所有標籤按鈕的 active 類
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 顯示選中的標籤內容
    const targetTab = document.getElementById(tabName + '-tab');
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // 添加選中標籤按鈕的 active 類
    const targetButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }
    
    currentTab = tabName;
    
    console.log('📋 [Options] 切換到標籤:', tabName);
}

/**
 * 載入當前設定並顯示
 */
async function loadCurrentSettings() {
    try {
        // 獲取當前授權狀態
        const authStatus = await checkAuthStatus();
        
        // 獲取存儲的設定
        const syncData = await chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId']);
        
        // 顯示當前設定
        updateCurrentSettingsDisplay(authStatus, syncData);
        
        // 填充表單
        if (syncData.notionApiKey) {
            document.getElementById('api-key').value = syncData.notionApiKey;
        }
        if (syncData.notionDatabaseId) {
            document.getElementById('database-id').value = syncData.notionDatabaseId;
        }
        
    } catch (error) {
        console.error('❌ [Options] 載入當前設定失敗:', error);
    }
}

/**
 * 更新當前設定顯示
 */
function updateCurrentSettingsDisplay(authStatus, syncData) {
    const currentSettings = document.getElementById('current-settings');
    const authStatusDisplay = document.getElementById('auth-status-display');
    
    if (authStatus.isAuthenticated) {
        authStatusDisplay.textContent = `✅ 已授權 (${authStatus.authMethod})`;
        authStatusDisplay.className = 'auth-status success';
        
        // 顯示設定詳情
        document.getElementById('current-auth-method').textContent = 
            authStatus.authMethod === 'cookie' ? 'Cookie 授權' : '手動 API';
        document.getElementById('current-user-name').textContent = 
            authStatus.userInfo?.name || '未知';
        document.getElementById('current-api-key').textContent = 
            syncData.notionApiKey ? syncData.notionApiKey.substring(0, 10) + '...' : '未設置';
        document.getElementById('current-database-id').textContent = 
            syncData.notionDatabaseId || '未設置';
        
        currentSettings.style.display = 'block';
    } else {
        authStatusDisplay.textContent = '❌ 未授權';
        authStatusDisplay.className = 'auth-status error';
        currentSettings.style.display = 'none';
    }
}

/**
 * 檢查授權狀態
 */
async function checkAuthStatus() {
    try {
        if (simpleAuth && simpleAuth.isAuthorized()) {
            return {
                isAuthenticated: true,
                authMethod: simpleAuth.getAuthMethod(),
                userInfo: simpleAuth.getUserDisplayInfo()
            };
        }
        
        // 檢查手動 API
        const config = await chrome.storage.sync.get(['notionApiKey']);
        if (config.notionApiKey) {
            return {
                isAuthenticated: true,
                authMethod: 'manual',
                userInfo: { name: '手動 API 用戶', method: 'manual' }
            };
        }
        
        return {
            isAuthenticated: false,
            authMethod: null,
            userInfo: null
        };
        
    } catch (error) {
        console.error('❌ [Options] 檢查授權狀態失敗:', error);
        return {
            isAuthenticated: false,
            authMethod: null,
            userInfo: null
        };
    }
}/
**
 * 處理刷新授權
 */
async function handleRefreshAuth() {
    try {
        showStatus('正在刷新授權狀態...', 'info');
        
        // 重新初始化授權模組
        if (simpleAuth) {
            await simpleAuth.recheckAuth();
        }
        
        // 重新載入設定
        await loadCurrentSettings();
        
        showStatus('授權狀態已刷新', 'success');
        
    } catch (error) {
        console.error('❌ [Options] 刷新授權失敗:', error);
        showStatus('刷新失敗: ' + error.message, 'error');
    }
}

/**
 * 處理清除所有授權
 */
async function handleClearAllAuth() {
    try {
        if (!confirm('確定要清除所有授權設定嗎？這將移除所有 API 金鑰、Cookie 和資料庫設定。')) {
            return;
        }
        
        showStatus('正在清除所有授權...', 'info');
        
        // 清除 Chrome Storage
        await chrome.storage.sync.remove(['notionApiKey', 'notionDatabaseId']);
        await chrome.storage.local.remove(['notion_oauth_tokens']);
        
        // 清除 Notion cookies
        try {
            const cookies = await chrome.cookies.getAll({ domain: '.notion.so' });
            for (const cookie of cookies) {
                await chrome.cookies.remove({
                    url: `https://${cookie.domain}${cookie.path}`,
                    name: cookie.name
                });
            }
        } catch (cookieError) {
            console.warn('清除 cookies 時出現問題:', cookieError);
        }
        
        // 清空表單
        document.getElementById('api-key').value = '';
        document.getElementById('database-id').value = '';
        
        // 重新載入設定
        await loadCurrentSettings();
        
        showStatus('所有授權已清除', 'success');
        
    } catch (error) {
        console.error('❌ [Options] 清除授權失敗:', error);
        showStatus('清除失敗: ' + error.message, 'error');
    }
}

/**
 * 處理 Cookie 登入
 */
async function handleCookieLogin() {
    try {
        showStatus('正在打開 Notion 登入頁面...', 'info');
        
        const tab = await chrome.tabs.create({
            url: 'https://www.notion.so/login',
            active: true
        });
        
        showStatus('請在新開啟的頁面中登入 Notion，然後點擊「檢查登入狀態」', 'info');
        
    } catch (error) {
        console.error('❌ [Options] Cookie 登入失敗:', error);
        showStatus('打開登入頁面失敗: ' + error.message, 'error');
    }
}

/**
 * 處理檢查 Cookie 狀態
 */
async function handleCookieCheck() {
    try {
        showStatus('正在檢查 Cookie 登入狀態...', 'info');
        
        // 檢查 Notion cookies
        const cookies = await chrome.cookies.getAll({ domain: '.notion.so' });
        console.log('🍪 [Options] 檢查到的 cookies:', cookies.map(c => ({ name: c.name, hasValue: !!c.value })));
        
        const tokenCookie = cookies.find(c => c.name === 'token_v2');
        const userIdCookie = cookies.find(c => c.name === 'notion_user_id');
        
        if (tokenCookie && tokenCookie.value && tokenCookie.value.length > 10) {
            console.log('✅ [Options] 檢測到有效的 token_v2 cookie');
            
            // 直接基於 cookie 存在判斷登入狀態，避免 CORS 問題
            if (simpleAuth) {
                simpleAuth.userInfo = {
                    name: '已登入用戶',
                    email: '請在 Notion 中查看',
                    method: 'cookie'
                };
                simpleAuth.authMethod = 'cookie';
            }
            
            await loadCurrentSettings();
            showStatus('檢測到 Notion 登入狀態（Cookie 授權）', 'success');
            
        } else {
            console.log('⚠️ [Options] 未檢測到有效的 token_v2 cookie');
            showStatus('未檢測到 Notion 登入狀態，請確保已在瀏覽器中登入 Notion', 'warning');
        }
        
    } catch (error) {
        console.error('❌ [Options] 檢查 Cookie 狀態失敗:', error);
        showStatus('檢查狀態失敗: ' + error.message, 'error');
    }
}

/**
 * 處理 Cookie 登出
 */
async function handleCookieLogout() {
    try {
        if (!confirm('確定要登出嗎？這將清除 Cookie 授權狀態。')) {
            return;
        }
        
        showStatus('正在登出...', 'info');
        
        // 清除 Notion cookies
        const cookies = await chrome.cookies.getAll({ domain: '.notion.so' });
        for (const cookie of cookies) {
            await chrome.cookies.remove({
                url: `https://${cookie.domain}${cookie.path}`,
                name: cookie.name
            });
        }
        
        // 重置簡化授權模組
        if (simpleAuth) {
            simpleAuth.authMethod = null;
            simpleAuth.userInfo = null;
        }
        
        await loadCurrentSettings();
        
        showStatus('已成功登出', 'success');
        
    } catch (error) {
        console.error('❌ [Options] Cookie 登出失敗:', error);
        showStatus('登出失敗: ' + error.message, 'error');
    }
}

/**
 * 處理清除 API 金鑰
 */
async function handleClearAPI() {
    try {
        if (!confirm('確定要清除 API 金鑰設定嗎？')) {
            return;
        }
        
        // 清除表單
        document.getElementById('api-key').value = '';
        document.getElementById('database-id').value = '';
        
        // 清除存儲
        await chrome.storage.sync.remove(['notionApiKey', 'notionDatabaseId']);
        
        await loadCurrentSettings();
        
        showStatus('API 金鑰已清除', 'success');
        
    } catch (error) {
        console.error('❌ [Options] 清除 API 失敗:', error);
        showStatus('清除失敗: ' + error.message, 'error');
    }
}

/**
 * 處理測試 API
 */
async function handleTestAPI() {
    const apiKey = document.getElementById('api-key').value.trim();
    
    if (!apiKey) {
        showStatus('請輸入 API 金鑰', 'error');
        return;
    }
    
    try {
        showStatus('正在測試 API 金鑰...', 'info');
        
        const response = await fetch('https://api.notion.com/v1/users/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28'
            }
        });
        
        if (response.ok) {
            const userData = await response.json();
            showStatus(`API 金鑰有效！用戶: ${userData.name}`, 'success');
        } else {
            showStatus('API 金鑰無效', 'error');
        }
        
    } catch (error) {
        console.error('❌ [Options] 測試 API 失敗:', error);
        showStatus('測試失敗: ' + error.message, 'error');
    }
}

/**
 * 處理保存設定
 */
async function handleSave() {
    const apiKey = document.getElementById('api-key').value.trim();
    const databaseId = document.getElementById('database-id').value.trim();
    
    if (!apiKey) {
        showStatus('請輸入 API 金鑰', 'error');
        return;
    }
    
    try {
        showStatus('正在保存設定...', 'info');
        
        await chrome.storage.sync.set({
            notionApiKey: apiKey,
            notionDatabaseId: databaseId
        });
        
        // 如果有簡化授權模組，也更新它
        if (simpleAuth) {
            await simpleAuth.setManualConfig(apiKey, databaseId);
        }
        
        await loadCurrentSettings();
        
        showStatus('設定已保存', 'success');
        
    } catch (error) {
        console.error('❌ [Options] 保存設定失敗:', error);
        showStatus('保存失敗: ' + error.message, 'error');
    }
}

/**
 * 切換手動授權區域
 */
function toggleManualAuth() {
    const content = document.getElementById('manual-auth-content');
    const toggle = document.getElementById('manual-auth-toggle');
    const icon = toggle.querySelector('.toggle-icon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▲';
        toggle.classList.add('expanded');
    } else {
        content.style.display = 'none';
        icon.textContent = '▼';
        toggle.classList.remove('expanded');
    }
}

/**
 * 載入模板設定
 */
async function loadTemplateSettings() {
    try {
        const result = await chrome.storage.sync.get([
            'titleTemplate', 
            'addSource', 
            'addTimestamp'
        ]);
        
        if (result.titleTemplate) {
            document.getElementById('title-template').value = result.titleTemplate;
        }
        
        document.getElementById('add-source').checked = result.addSource || false;
        document.getElementById('add-timestamp').checked = result.addTimestamp || false;
        
    } catch (error) {
        console.error('❌ [Options] 載入模板設定失敗:', error);
    }
}

/**
 * 處理預覽模板
 */
function handlePreviewTemplate() {
    const template = document.getElementById('title-template').value;
    const preview = document.getElementById('template-preview');
    
    if (!template) {
        preview.textContent = '請輸入模板';
        preview.classList.add('show');
        return;
    }
    
    // 模擬數據
    const mockData = {
        title: '示例網頁標題',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        datetime: new Date().toLocaleString(),
        url: 'https://example.com/page',
        domain: 'example.com'
    };
    
    let result = template;
    Object.keys(mockData).forEach(key => {
        result = result.replace(new RegExp(`{${key}}`, 'g'), mockData[key]);
    });
    
    preview.textContent = result;
    preview.classList.add('show');
}

/**
 * 處理保存模板
 */
async function handleSaveTemplate() {
    try {
        const titleTemplate = document.getElementById('title-template').value;
        const addSource = document.getElementById('add-source').checked;
        const addTimestamp = document.getElementById('add-timestamp').checked;
        
        await chrome.storage.sync.set({
            titleTemplate,
            addSource,
            addTimestamp
        });
        
        showStatus('模板設定已保存', 'success');
        
    } catch (error) {
        console.error('❌ [Options] 保存模板失敗:', error);
        showStatus('保存模板失敗: ' + error.message, 'error');
    }
}

/**
 * 處理導出數據
 */
async function handleExportData() {
    try {
        showStatus('正在導出數據...', 'info');
        
        const syncData = await chrome.storage.sync.get(null);
        const localData = await chrome.storage.local.get(null);
        
        const exportData = {
            version: '2.9.5',
            timestamp: new Date().toISOString(),
            sync: syncData,
            local: localData
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notion-clipper-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showStatus('數據導出成功', 'success');
        
    } catch (error) {
        console.error('❌ [Options] 導出數據失敗:', error);
        showStatus('導出失敗: ' + error.message, 'error');
    }
}

/**
 * 處理導入數據按鈕
 */
function handleImportData() {
    document.getElementById('import-data-file').click();
}

/**
 * 處理文件導入
 */
async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        showStatus('正在導入數據...', 'info');
        
        const text = await file.text();
        const importData = JSON.parse(text);
        
        if (!importData.version || !importData.sync || !importData.local) {
            throw new Error('無效的備份文件格式');
        }
        
        if (!confirm('確定要導入數據嗎？這將覆蓋現有的所有設定和數據。')) {
            return;
        }
        
        // 導入數據
        await chrome.storage.sync.clear();
        await chrome.storage.local.clear();
        
        await chrome.storage.sync.set(importData.sync);
        await chrome.storage.local.set(importData.local);
        
        // 重新載入設定
        await loadCurrentSettings();
        await loadTemplateSettings();
        
        showStatus('數據導入成功', 'success');
        
    } catch (error) {
        console.error('❌ [Options] 導入數據失敗:', error);
        showStatus('導入失敗: ' + error.message, 'error');
    }
}

/**
 * 處理檢查數據
 */
async function handleCheckData() {
    try {
        showStatus('正在檢查數據完整性...', 'info');
        
        const syncData = await chrome.storage.sync.get(null);
        const localData = await chrome.storage.local.get(null);
        
        let issues = [];
        
        // 檢查必要的配置
        if (!syncData.notionApiKey) {
            issues.push('缺少 API 金鑰配置');
        }
        
        if (issues.length === 0) {
            showStatus('數據檢查完成，未發現問題', 'success');
        } else {
            showStatus(`發現 ${issues.length} 個問題: ${issues.join(', ')}`, 'warning');
        }
        
    } catch (error) {
        console.error('❌ [Options] 檢查數據失敗:', error);
        showStatus('檢查失敗: ' + error.message, 'error');
    }
}

/**
 * 顯示狀態訊息
 */
function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    
    console.log(`📢 [Options] ${type.toUpperCase()}: ${message}`);
    
    // 自動清除成功和資訊訊息
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            if (status.textContent === message) {
                status.textContent = '';
                status.className = 'status';
            }
        }, 5000);
    }
}

console.log('📄 [Options] 修復版選項頁面腳本已載入');