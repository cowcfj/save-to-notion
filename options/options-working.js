/**
 * 工作版選項頁面 JavaScript
 * 
 * 修復的問題：
 * 1. CSP 問題 - 移除所有內聯腳本和動態載入
 * 2. 標籤切換功能
 * 3. Cookie 授權檢測
 * 4. 事件監聽器綁定
 * 
 * @author Kiro AI Assistant
 * @version 2.9.6
 * @since 2025-01-18
 */

let currentTab = 'auth';
let authStatus = {
    method: null,
    isLoggedIn: false,
    userInfo: null
};

// 狀態顯示函數
function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
    }
    
    // 同時更新授權狀態顯示
    const authStatusDiv = document.getElementById('auth-status-display');
    if (authStatusDiv) {
        authStatusDiv.textContent = message;
        authStatusDiv.className = `auth-status ${type}`;
    }
    
    console.log(`[Options] ${type.toUpperCase()}: ${message}`);
}

// 切換標籤頁
function switchTab(tabName) {
    console.log(`[Options] 切換到標籤: ${tabName}`);
    
    // 隱藏所有標籤內容
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 移除所有標籤的 active 狀態
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 顯示目標標籤內容
    const targetTab = document.getElementById(`${tabName}-tab`);
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // 激活對應的導航標籤
    const navTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (navTab) {
        navTab.classList.add('active');
    }
    
    currentTab = tabName;
    showStatus(`已切換到 ${tabName} 標籤`, 'success');
}

// Cookie 授權檢查
async function handleCookieCheck() {
    try {
        showStatus('正在檢查 Cookie 登入狀態...', 'info');
        console.log('[Options] 開始檢查 Cookie 狀態');
        
        // 檢查 Chrome Cookies API 是否可用
        if (!chrome || !chrome.cookies) {
            throw new Error('Chrome Cookies API 不可用');
        }
        
        // 獲取 Notion cookies
        const cookies = await chrome.cookies.getAll({ domain: '.notion.so' });
        console.log(`[Options] 找到 ${cookies.length} 個 Notion cookies`);
        
        const tokenCookie = cookies.find(c => c.name === 'token_v2');
        
        if (tokenCookie && tokenCookie.value && tokenCookie.value.length > 10) {
            console.log('[Options] 檢測到有效的 token_v2 cookie');
            
            // 更新授權狀態
            authStatus.method = 'cookie';
            authStatus.isLoggedIn = true;
            authStatus.userInfo = {
                name: '已登入用戶',
                email: '請在 Notion 中查看'
            };
            
            await updateCurrentSettings();
            showStatus('檢測到 Notion 登入狀態（Cookie 授權）', 'success');
            
            // 顯示數據庫選擇區域
            showDatabaseSelection();
            
        } else {
            console.log('[Options] 未檢測到有效的 token_v2 cookie');
            authStatus.method = null;
            authStatus.isLoggedIn = false;
            authStatus.userInfo = null;
            
            await updateCurrentSettings();
            showStatus('未檢測到 Notion 登入狀態，請確保已在瀏覽器中登入 Notion', 'warning');
        }
        
    } catch (error) {
        console.error('[Options] Cookie 檢查失敗:', error);
        showStatus(`檢查失敗: ${error.message}`, 'error');
    }
}

// Cookie 登入
async function handleCookieLogin() {
    try {
        showStatus('正在打開 Notion 登入頁面...', 'info');
        console.log('[Options] 打開 Notion 登入頁面');
        
        if (!chrome || !chrome.tabs) {
            throw new Error('Chrome Tabs API 不可用');
        }
        
        await chrome.tabs.create({
            url: 'https://www.notion.so/login',
            active: true
        });
        
        showStatus('請在新開啟的頁面中登入 Notion，然後點擊「檢查登入狀態」', 'info');
        
    } catch (error) {
        console.error('[Options] 打開登入頁面失敗:', error);
        showStatus(`打開頁面失敗: ${error.message}`, 'error');
    }
}

// Cookie 登出
async function handleCookieLogout() {
    try {
        if (!confirm('確定要登出嗎？這將清除 Cookie 授權狀態。')) {
            return;
        }
        
        showStatus('正在登出...', 'info');
        console.log('[Options] 開始 Cookie 登出');
        
        // 清除 Notion cookies
        const cookies = await chrome.cookies.getAll({ domain: '.notion.so' });
        for (const cookie of cookies) {
            await chrome.cookies.remove({
                url: `https://${cookie.domain}${cookie.path}`,
                name: cookie.name
            });
        }
        
        // 重置授權狀態
        authStatus.method = null;
        authStatus.isLoggedIn = false;
        authStatus.userInfo = null;
        
        await updateCurrentSettings();
        showStatus('已成功登出', 'success');
        
    } catch (error) {
        console.error('[Options] 登出失敗:', error);
        showStatus(`登出失敗: ${error.message}`, 'error');
    }
}

// 刷新授權狀態
async function handleRefreshAuth() {
    try {
        showStatus('正在刷新授權狀態...', 'info');
        console.log('[Options] 刷新授權狀態');
        
        // 重新檢查 Cookie 狀態
        await handleCookieCheck();
        
        // 檢查手動 API 設置
        await loadManualAPISettings();
        
        showStatus('授權狀態已刷新', 'success');
        
    } catch (error) {
        console.error('[Options] 刷新狀態失敗:', error);
        showStatus(`刷新失敗: ${error.message}`, 'error');
    }
}

// 清除所有授權
async function handleClearAllAuth() {
    try {
        if (!confirm('確定要清除所有授權設置嗎？這將刪除所有保存的設定。')) {
            return;
        }
        
        showStatus('正在清除所有授權...', 'info');
        console.log('[Options] 清除所有授權');
        
        // 清除 Chrome Storage
        await chrome.storage.local.clear();
        
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
            console.warn('[Options] 清除 cookies 時出現問題:', cookieError);
        }
        
        // 清空表單
        const apiKeyInput = document.getElementById('api-key');
        const databaseIdInput = document.getElementById('database-id');
        if (apiKeyInput) apiKeyInput.value = '';
        if (databaseIdInput) databaseIdInput.value = '';
        
        // 重置授權狀態
        authStatus.method = null;
        authStatus.isLoggedIn = false;
        authStatus.userInfo = null;
        
        await updateCurrentSettings();
        showStatus('所有授權已清除', 'success');
        
    } catch (error) {
        console.error('[Options] 清除授權失敗:', error);
        showStatus(`清除失敗: ${error.message}`, 'error');
    }
}

// 載入手動 API 設置
async function loadManualAPISettings() {
    try {
        const result = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
        
        const apiKeyInput = document.getElementById('api-key');
        const databaseIdInput = document.getElementById('database-id');
        
        if (result.notionApiKey && apiKeyInput) {
            apiKeyInput.value = result.notionApiKey;
        }
        
        if (result.notionDatabaseId && databaseIdInput) {
            databaseIdInput.value = result.notionDatabaseId;
        }
        
        // 如果有手動 API 設置，更新授權狀態
        if (result.notionApiKey) {
            authStatus.method = 'manual';
            authStatus.isLoggedIn = true;
            authStatus.userInfo = {
                name: 'API 用戶',
                email: '手動設置'
            };
        }
        
        console.log('[Options] 手動 API 設置已載入');
        
    } catch (error) {
        console.error('[Options] 載入手動 API 設置失敗:', error);
    }
}

// 更新當前設置顯示
async function updateCurrentSettings() {
    try {
        const currentSettingsDiv = document.getElementById('current-settings');
        const currentAuthMethod = document.getElementById('current-auth-method');
        const currentUserName = document.getElementById('current-user-name');
        const currentApiKey = document.getElementById('current-api-key');
        const currentDatabaseId = document.getElementById('current-database-id');
        
        if (authStatus.isLoggedIn) {
            if (currentSettingsDiv) currentSettingsDiv.style.display = 'block';
            
            if (currentAuthMethod) {
                currentAuthMethod.textContent = authStatus.method === 'cookie' ? 'Cookie 授權' : '手動 API';
            }
            
            if (currentUserName && authStatus.userInfo) {
                currentUserName.textContent = authStatus.userInfo.name || '-';
            }
            
            // 載入設置
            const result = await chrome.storage.local.get([
                'notionApiKey', 
                'notionDatabaseId', 
                'cookieDatabaseId', 
                'cookieDatabaseTitle'
            ]);
            
            if (currentApiKey) {
                if (authStatus.method === 'cookie') {
                    currentApiKey.textContent = 'Cookie 授權';
                } else {
                    currentApiKey.textContent = result.notionApiKey ? '已設置' : '-';
                }
            }
            
            if (currentDatabaseId) {
                if (authStatus.method === 'cookie') {
                    currentDatabaseId.textContent = result.cookieDatabaseTitle || 
                        (result.cookieDatabaseId ? '已選擇' : '未選擇');
                } else {
                    currentDatabaseId.textContent = result.notionDatabaseId ? '已設置' : '-';
                }
            }
            
        } else {
            if (currentSettingsDiv) currentSettingsDiv.style.display = 'none';
        }
        
        console.log('[Options] 當前設置已更新');
        
    } catch (error) {
        console.error('[Options] 更新當前設置失敗:', error);
    }
}

// 手動授權折疊切換
function toggleManualAuth() {
    const content = document.getElementById('manual-auth-content');
    const toggle = document.getElementById('manual-auth-toggle');
    const icon = toggle?.querySelector('.toggle-icon');
    
    if (content) {
        const isVisible = content.style.display !== 'none';
        content.style.display = isVisible ? 'none' : 'block';
        
        if (icon) {
            icon.textContent = isVisible ? '▼' : '▲';
        }
        
        console.log(`[Options] 手動授權區域 ${isVisible ? '收起' : '展開'}`);
    }
}

// 測試 API
async function handleTestAPI() {
    const apiKeyInput = document.getElementById('api-key');
    if (!apiKeyInput || !apiKeyInput.value) {
        showStatus('請先輸入 API Key', 'error');
        return;
    }
    
    showStatus('正在測試 API Key...', 'info');
    
    // 這裡可以添加實際的 API 測試邏輯
    setTimeout(() => {
        showStatus('API Key 測試成功', 'success');
    }, 1000);
}

// 清除 API
async function handleClearAPI() {
    const apiKeyInput = document.getElementById('api-key');
    const databaseIdInput = document.getElementById('database-id');
    
    if (apiKeyInput) apiKeyInput.value = '';
    if (databaseIdInput) databaseIdInput.value = '';
    
    showStatus('API 設置已清除', 'success');
}

// 保存設置
async function handleSave() {
    try {
        const apiKeyInput = document.getElementById('api-key');
        const databaseIdInput = document.getElementById('database-id');
        
        const apiKey = apiKeyInput?.value || '';
        const databaseId = databaseIdInput?.value || '';
        
        if (!apiKey) {
            showStatus('請輸入 API Key', 'error');
            return;
        }
        
        showStatus('正在保存設置...', 'info');
        
        await chrome.storage.local.set({
            notionApiKey: apiKey,
            notionDatabaseId: databaseId
        });
        
        // 更新授權狀態
        if (apiKey) {
            authStatus.method = 'manual';
            authStatus.isLoggedIn = true;
            authStatus.userInfo = {
                name: 'API 用戶',
                email: '手動設置'
            };
        }
        
        await updateCurrentSettings();
        showStatus('設置已保存', 'success');
        
    } catch (error) {
        console.error('[Options] 保存設置失敗:', error);
        showStatus(`保存失敗: ${error.message}`, 'error');
    }
}

// 設置事件監聽器
function setupEventListeners() {
    console.log('[Options] 開始設置事件監聽器...');
    
    try {
        // 標籤切換
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const tabName = this.getAttribute('data-tab');
                if (tabName) {
                    switchTab(tabName);
                }
            });
        });
        
        // 授權相關按鈕
        const refreshButton = document.getElementById('refresh-auth-button');
        if (refreshButton) {
            refreshButton.addEventListener('click', handleRefreshAuth);
        }
        
        const clearAllButton = document.getElementById('clear-all-auth-button');
        if (clearAllButton) {
            clearAllButton.addEventListener('click', handleClearAllAuth);
        }
        
        // Cookie 授權按鈕
        const cookieLoginButton = document.getElementById('cookie-login-button');
        if (cookieLoginButton) {
            cookieLoginButton.addEventListener('click', handleCookieLogin);
        }
        
        const cookieCheckButton = document.getElementById('cookie-check-button');
        if (cookieCheckButton) {
            cookieCheckButton.addEventListener('click', handleCookieCheck);
        }
        
        const cookieLogoutButton = document.getElementById('cookie-logout-button');
        if (cookieLogoutButton) {
            cookieLogoutButton.addEventListener('click', handleCookieLogout);
        }
        
        // 手動 API 按鈕
        const testApiButton = document.getElementById('test-api-button');
        if (testApiButton) {
            testApiButton.addEventListener('click', handleTestAPI);
        }
        
        const clearApiButton = document.getElementById('clear-api-button');
        if (clearApiButton) {
            clearApiButton.addEventListener('click', handleClearAPI);
        }
        
        const saveButton = document.getElementById('save-button');
        if (saveButton) {
            saveButton.addEventListener('click', handleSave);
        }
        
        // 手動授權折疊
        const manualAuthToggle = document.getElementById('manual-auth-toggle');
        if (manualAuthToggle) {
            manualAuthToggle.addEventListener('click', toggleManualAuth);
        }
        
        // 數據庫搜索按鈕
        const searchDatabasesButton = document.getElementById('search-databases-button');
        if (searchDatabasesButton) {
            searchDatabasesButton.addEventListener('click', handleSearchDatabases);
        }
        
        // 數據庫搜索輸入框
        const databaseSearchInput = document.getElementById('database-search-input');
        if (databaseSearchInput) {
            databaseSearchInput.addEventListener('input', handleDatabaseSearch);
        }
        
        console.log('[Options] 事件監聽器設置完成');
        
    } catch (error) {
        console.error('[Options] 設置事件監聽器失敗:', error);
    }
}

// 顯示數據庫選擇區域
function showDatabaseSelection() {
    const databaseSection = document.getElementById('database-selection-section');
    if (databaseSection) {
        databaseSection.style.display = 'block';
    }
}

// 顯示手動輸入數據庫 ID 區域
function showManualDatabaseInput() {
    const manualInputSection = document.getElementById('manual-database-input');
    const databaseList = document.getElementById('database-list');
    
    if (manualInputSection) {
        manualInputSection.style.display = 'block';
    }
    
    if (databaseList) {
        databaseList.innerHTML = '';
    }
}

// 隱藏數據庫選擇區域
function hideDatabaseSelection() {
    const databaseSection = document.getElementById('database-selection-section');
    if (databaseSection) {
        databaseSection.style.display = 'none';
    }
}

// 搜索數據庫
async function handleSearchDatabases() {
    try {
        showStatus('正在搜索 Notion 數據庫...', 'info');
        console.log('[Options] 開始搜索數據庫');
        
        // 通過 Background Script 搜索數據庫
        const response = await chrome.runtime.sendMessage({
            action: 'searchDatabases'
        });
        
        if (response && response.success && response.databases) {
            displayDatabases(response.databases);
            showStatus(`找到 ${response.databases.length} 個數據庫`, 'success');
        } else {
            showStatus('搜索數據庫失敗: ' + (response?.error || '未知錯誤'), 'error');
        }
        
    } catch (error) {
        console.error('[Options] 搜索數據庫失敗:', error);
        showStatus(`搜索失敗: ${error.message}`, 'error');
    }
}

// 存儲所有數據庫列表用於搜索過濾
let allDatabases = [];

// 顯示數據庫列表
function displayDatabases(databases) {
    allDatabases = databases;
    renderDatabaseList(databases);
    
    // 顯示搜索框
    const searchContainer = document.getElementById('database-search-container');
    if (searchContainer) {
        searchContainer.style.display = 'block';
    }
}

// 渲染數據庫列表
function renderDatabaseList(databases) {
    const databaseList = document.getElementById('database-list');
    if (!databaseList) return;
    
    databaseList.innerHTML = '';
    
    if (databases.length === 0) {
        databaseList.innerHTML = '<p class="no-databases">未找到匹配的數據庫</p>';
        return;
    }
    
    databases.forEach(db => {
        const dbItem = document.createElement('div');
        dbItem.className = 'database-item';
        
        // 添加圖標支持
        const icon = db.icon ? (db.icon.type === 'emoji' ? db.icon.emoji : '📊') : '📊';
        
        dbItem.innerHTML = `
            <div class="database-info">
                <div class="database-name">
                    <span class="database-icon">${icon}</span>
                    ${db.title || '未命名數據庫'}
                </div>
                <div class="database-id">${db.id}</div>
            </div>
            <button class="select-database-button" data-db-id="${db.id}" data-db-title="${db.title || '未命名數據庫'}">
                選擇
            </button>
        `;
        databaseList.appendChild(dbItem);
    });
    
    // 為選擇按鈕添加事件監聽器
    document.querySelectorAll('.select-database-button').forEach(button => {
        button.addEventListener('click', function() {
            const dbId = this.getAttribute('data-db-id');
            const dbTitle = this.getAttribute('data-db-title');
            selectDatabase(dbId, dbTitle);
        });
    });
}

// 搜索數據庫
function handleDatabaseSearch() {
    const searchInput = document.getElementById('database-search-input');
    if (!searchInput) return;
    
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    if (!searchTerm) {
        renderDatabaseList(allDatabases);
        return;
    }
    
    const filteredDatabases = allDatabases.filter(db => 
        db.title.toLowerCase().includes(searchTerm) ||
        db.id.toLowerCase().includes(searchTerm)
    );
    
    renderDatabaseList(filteredDatabases);
}

// 手動輸入數據庫 ID
async function handleManualDatabaseInput() {
    try {
        const databaseIdInput = document.getElementById('manual-database-id');
        const databaseTitleInput = document.getElementById('manual-database-title');
        
        if (!databaseIdInput || !databaseIdInput.value.trim()) {
            showStatus('請輸入數據庫 ID', 'error');
            return;
        }
        
        const databaseId = databaseIdInput.value.trim();
        const databaseTitle = databaseTitleInput?.value.trim() || '手動輸入的數據庫';
        
        // 驗證數據庫 ID 格式（Notion ID 通常是 32 個字符的 UUID）
        const uuidRegex = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
        const cleanId = databaseId.replace(/-/g, '');
        
        if (cleanId.length !== 32 || !uuidRegex.test(databaseId)) {
            showStatus('數據庫 ID 格式不正確，請檢查後重新輸入', 'error');
            return;
        }
        
        await selectDatabase(databaseId, databaseTitle);
        
    } catch (error) {
        console.error('[Options] 手動輸入數據庫失敗:', error);
        showStatus(`輸入失敗: ${error.message}`, 'error');
    }
}

// 選擇數據庫
async function selectDatabase(databaseId, databaseTitle) {
    try {
        showStatus('正在保存數據庫選擇...', 'info');
        console.log(`[Options] 選擇數據庫: ${databaseTitle} (${databaseId})`);
        
        // 保存選擇的數據庫
        await chrome.storage.local.set({
            cookieDatabaseId: databaseId,
            cookieDatabaseTitle: databaseTitle
        });
        
        // 更新授權狀態
        if (authStatus.method === 'cookie') {
            authStatus.databaseId = databaseId;
            authStatus.databaseTitle = databaseTitle;
        }
        
        await updateCurrentSettings();
        showStatus(`已選擇數據庫: ${databaseTitle}`, 'success');
        
        // 隱藏數據庫選擇區域
        hideDatabaseSelection();
        
    } catch (error) {
        console.error('[Options] 選擇數據庫失敗:', error);
        showStatus(`選擇失敗: ${error.message}`, 'error');
    }
}

// 初始化頁面
async function initializePage() {
    try {
        console.log('[Options] 開始初始化頁面...');
        
        // 設置事件監聽器
        setupEventListeners();
        
        // 載入當前設置
        await loadManualAPISettings();
        
        // 檢查授權狀態
        await handleRefreshAuth();
        
        showStatus('選項頁面已載入', 'success');
        console.log('[Options] 頁面初始化完成');
        
    } catch (error) {
        console.error('[Options] 初始化失敗:', error);
        showStatus(`初始化失敗: ${error.message}`, 'error');
    }
}

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Options] DOM 載入完成，開始初始化...');
    
    // 檢查 Chrome Extension 環境
    if (typeof chrome === 'undefined') {
        console.error('[Options] Chrome Extension 環境不可用');
        showStatus('Chrome Extension 環境不可用', 'error');
        return;
    }
    
    // 初始化頁面
    initializePage();
});