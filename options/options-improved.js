/**
 * 改進版選項頁面 JavaScript
 * 
 * 解決的問題：
 * 1. 正確的 Cookie 授權檢測
 * 2. 資料庫設定持久化保存
 * 3. 恢復下拉菜單 + 搜索功能
 * 4. 改進的界面佈局
 * 5. 更好的配色和可讀性
 * 
 * @author Kiro AI Assistant
 * @version 2.9.5
 * @since 2025-01-17
 */

let simpleAuth = null;
let currentAuthMethod = null;
let selectedDatabaseId = null;
let databases = [];
let isInitialized = false;

// DOM 元素
const elements = {
    // 狀態顯示
    authStatusIcon: document.getElementById('auth-status-icon'),
    authStatusText: document.getElementById('auth-status-text'),
    authMethodBadge: document.getElementById('auth-method-badge'),
    userInfo: document.getElementById('user-info'),
    userName: document.getElementById('user-name'),
    userEmail: document.getElementById('user-email'),
    userMethod: document.getElementById('user-method'),
    
    // 授權方式選擇
    cookieMethod: document.getElementById('cookie-method'),
    manualMethod: document.getElementById('manual-method'),
    cookieStatus: document.getElementById('cookie-status'),
    manualStatus: document.getElementById('manual-status'),
    
    // Cookie 授權
    cookieAuthSection: document.getElementById('cookie-auth-section'),
    loginButton: document.getElementById('login-button'),
    checkStatusButton: document.getElementById('check-status-button'),
    logoutButton: document.getElementById('logout-button'),
    cookieStatusMessage: document.getElementById('cookie-status-message'),
    
    // 手動 API
    manualAuthSection: document.getElementById('manual-auth-section'),
    apiKeyInput: document.getElementById('api-key'),
    testApiButton: document.getElementById('test-api-button'),
    saveManualButton: document.getElementById('save-manual-button'),
    manualStatusMessage: document.getElementById('manual-status-message'),
    
    // 資料庫選擇
    databaseSection: document.getElementById('database-section'),
    databaseSearch: document.getElementById('database-search'),
    dropdownToggle: document.getElementById('dropdown-toggle'),
    databaseDropdown: document.getElementById('database-dropdown'),
    databaseCount: document.getElementById('database-count'),
    refreshDatabases: document.getElementById('refresh-databases'),
    databaseList: document.getElementById('database-list'),
    saveDatabaseButton: document.getElementById('save-database-button'),
    databaseStatusMessage: document.getElementById('database-status-message'),
    
    // 全局狀態
    globalStatusMessage: document.getElementById('global-status-message')
};

/**
 * 頁面載入完成後初始化
 */
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 [Options] 改進版選項頁面載入中...');
    
    try {
        // 載入簡化授權模組
        await loadSimpleAuthModule();
        
        // 初始化授權系統
        await initializeAuth();
        
        // 設置事件監聽器
        setupEventListeners();
        
        // 載入保存的設定
        await loadSavedSettings();
        
        // 檢查授權狀態
        await checkAuthStatus();
        
        isInitialized = true;
        console.log('✅ [Options] 改進版選項頁面初始化完成');
        
    } catch (error) {
        console.error('❌ [Options] 初始化失敗:', error);
        showGlobalStatus('初始化失敗: ' + error.message, 'error');
    }
});

/**
 * 載入簡化授權模組
 */
async function loadSimpleAuthModule() {
    try {
        // 動態載入腳本
        await loadScript('../scripts/notion-simple-auth.js');
        
        // 創建授權實例
        simpleAuth = new NotionSimpleAuth();
        
        console.log('📦 [Options] 簡化授權模組已載入');
        
    } catch (error) {
        console.error('❌ [Options] 載入授權模組失敗:', error);
        throw new Error('無法載入授權模組');
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
 * 初始化授權系統
 */
async function initializeAuth() {
    try {
        showGlobalStatus('正在初始化授權系統...', 'info');
        
        const success = await simpleAuth.initialize();
        
        if (success) {
            console.log('✅ [Options] 授權系統初始化成功');
        } else {
            console.log('ℹ️ [Options] 授權系統初始化完成，但用戶未授權');
        }
        
        hideGlobalStatus();
        
    } catch (error) {
        console.error('❌ [Options] 授權系統初始化失敗:', error);
        throw error;
    }
}

/**
 * 設置事件監聽器
 */
function setupEventListeners() {
    // Cookie 授權按鈕
    elements.loginButton?.addEventListener('click', handleLogin);
    elements.checkStatusButton?.addEventListener('click', handleCheckStatus);
    elements.logoutButton?.addEventListener('click', handleLogout);
    
    // 手動 API 按鈕
    elements.testApiButton?.addEventListener('click', handleTestAPI);
    elements.saveManualButton?.addEventListener('click', handleSaveManual);
    
    // 資料庫相關
    elements.dropdownToggle?.addEventListener('click', toggleDatabaseDropdown);
    elements.refreshDatabases?.addEventListener('click', handleRefreshDatabases);
    elements.saveDatabaseButton?.addEventListener('click', handleSaveDatabaseSettings);
    
    // 搜索輸入
    elements.databaseSearch?.addEventListener('input', handleDatabaseSearch);
    elements.databaseSearch?.addEventListener('keydown', handleSearchKeydown);
    
    // 點擊外部關閉下拉菜單
    document.addEventListener('click', function(e) {
        if (!elements.databaseSection?.contains(e.target)) {
            closeDatabaseDropdown();
        }
    });
    
    console.log('🎯 [Options] 事件監聽器已設置');
}

/**
 * 載入保存的設定
 */
async function loadSavedSettings() {
    try {
        // 載入資料庫設定
        const result = await chrome.storage.sync.get(['selectedDatabaseId', 'selectedDatabaseTitle']);
        if (result.selectedDatabaseId) {
            selectedDatabaseId = result.selectedDatabaseId;
            if (result.selectedDatabaseTitle) {
                elements.databaseSearch.value = result.selectedDatabaseTitle;
            }
            console.log('📋 [Options] 已載入保存的資料庫設定:', selectedDatabaseId);
        }
        
    } catch (error) {
        console.error('❌ [Options] 載入設定失敗:', error);
    }
}

/**
 * 檢查授權狀態並更新 UI
 */
async function checkAuthStatus() {
    try {
        if (!simpleAuth) {
            showGlobalStatus('授權系統尚未初始化', 'warning');
            return;
        }
        
        // 重新檢查授權狀態
        await simpleAuth.recheckAuth();
        
        const isAuthorized = simpleAuth.isAuthorized();
        const userInfo = simpleAuth.getUserDisplayInfo();
        const authMethod = simpleAuth.getAuthMethod();
        
        console.log('🔍 [Options] 授權狀態檢查:', { isAuthorized, authMethod, userInfo });
        
        if (isAuthorized && userInfo) {
            updateUIForAuthorized(userInfo, authMethod);
        } else {
            updateUIForUnauthorized();
        }
        
        // 更新授權方式狀態指示器
        updateAuthMethodIndicators(authMethod);
        
        // 如果已授權，載入資料庫列表
        if (isAuthorized) {
            await loadDatabases();
        }
        
    } catch (error) {
        console.error('❌ [Options] 檢查授權狀態失敗:', error);
        showGlobalStatus('檢查授權狀態失敗: ' + error.message, 'error');
    }
}

/**
 * 更新 UI 為已授權狀態
 */
function updateUIForAuthorized(userInfo, authMethod) {
    // 更新狀態圖標和文字
    elements.authStatusIcon.textContent = '✅';
    elements.authStatusIcon.className = 'auth-status-icon authorized';
    elements.authStatusText.textContent = '已授權';
    elements.authStatusText.className = 'auth-status-text authorized';
    
    // 顯示授權方式標籤
    const methodText = authMethod === 'cookie' ? 'Cookie 授權' : '手動 API';
    elements.authMethodBadge.textContent = methodText;
    elements.authMethodBadge.style.display = 'inline-block';
    
    // 顯示用戶資訊
    elements.userName.textContent = userInfo.name || '未知用戶';
    elements.userEmail.textContent = userInfo.email || '未提供郵箱';
    elements.userMethod.textContent = `授權方式: ${methodText}`;
    elements.userInfo.style.display = 'flex';
    
    // 顯示登出按鈕（僅 Cookie 方式）
    if (authMethod === 'cookie') {
        elements.logoutButton.style.display = 'inline-flex';
    } else {
        elements.logoutButton.style.display = 'none';
    }
    
    // 顯示資料庫選擇區域
    showSection('database');
    
    currentAuthMethod = authMethod;
}

/**
 * 更新 UI 為未授權狀態
 */
function updateUIForUnauthorized() {
    // 更新狀態圖標和文字
    elements.authStatusIcon.textContent = '🔒';
    elements.authStatusIcon.className = 'auth-status-icon unauthorized';
    elements.authStatusText.textContent = '未授權';
    elements.authStatusText.className = 'auth-status-text unauthorized';
    
    // 隱藏授權方式標籤和用戶資訊
    elements.authMethodBadge.style.display = 'none';
    elements.userInfo.style.display = 'none';
    elements.logoutButton.style.display = 'none';
    
    // 隱藏資料庫選擇區域
    hideSection('database');
    
    currentAuthMethod = null;
}

/**
 * 更新授權方式指示器
 */
function updateAuthMethodIndicators(authMethod) {
    // 重置所有指示器
    elements.cookieStatus.className = 'status-indicator';
    elements.manualStatus.className = 'status-indicator';
    elements.cookieMethod.classList.remove('active');
    elements.manualMethod.classList.remove('active');
    
    // 根據當前授權方式更新
    if (authMethod === 'cookie') {
        elements.cookieStatus.classList.add('active');
        elements.cookieMethod.classList.add('active');
    } else if (authMethod === 'manual') {
        elements.manualStatus.classList.add('active');
        elements.manualMethod.classList.add('active');
    }
}

/**
 * 選擇授權方式
 */
function selectAuthMethod(method) {
    console.log('🔄 [Options] 選擇授權方式:', method);
    
    // 隱藏所有授權區域
    hideSection('cookie');
    hideSection('manual');
    
    // 顯示選中的授權區域
    if (method === 'cookie') {
        showSection('cookie');
    } else if (method === 'manual') {
        showSection('manual');
    }
}

/**
 * 顯示區域
 */
function showSection(section) {
    const sectionMap = {
        'cookie': elements.cookieAuthSection,
        'manual': elements.manualAuthSection,
        'database': elements.databaseSection
    };
    
    const element = sectionMap[section];
    if (element) {
        element.classList.remove('section-hidden');
        element.classList.add('section-visible');
    }
}

/**
 * 隱藏區域
 */
function hideSection(section) {
    const sectionMap = {
        'cookie': elements.cookieAuthSection,
        'manual': elements.manualAuthSection,
        'database': elements.databaseSection
    };
    
    const element = sectionMap[section];
    if (element) {
        element.classList.remove('section-visible');
        element.classList.add('section-hidden');
    }
}

/**
 * 處理登入按鈕點擊
 */
async function handleLogin() {
    try {
        showCookieStatus('正在打開 Notion 登入頁面...', 'info');
        
        await simpleAuth.promptLogin();
        
        showCookieStatus('請在新開啟的頁面中登入 Notion，然後點擊「檢查登入狀態」', 'info');
        
    } catch (error) {
        console.error('❌ [Options] 登入失敗:', error);
        showCookieStatus('打開登入頁面失敗: ' + error.message, 'error');
    }
}

/**
 * 處理檢查狀態按鈕點擊
 */
async function handleCheckStatus() {
    try {
        showCookieStatus('正在檢查登入狀態...', 'info');
        
        await checkAuthStatus();
        
        if (simpleAuth.isAuthorized() && simpleAuth.getAuthMethod() === 'cookie') {
            showCookieStatus('Cookie 授權成功！', 'success');
        } else {
            showCookieStatus('未檢測到 Notion 登入狀態，請確保已在瀏覽器中登入 Notion', 'warning');
        }
        
    } catch (error) {
        console.error('❌ [Options] 檢查狀態失敗:', error);
        showCookieStatus('檢查狀態失敗: ' + error.message, 'error');
    }
}

/**
 * 處理登出按鈕點擊
 */
async function handleLogout() {
    try {
        if (!confirm('確定要登出嗎？這將清除當前的授權狀態。')) {
            return;
        }
        
        showCookieStatus('正在登出...', 'info');
        
        await simpleAuth.logout();
        
        // 清除選中的資料庫
        selectedDatabaseId = null;
        elements.databaseSearch.value = '';
        await chrome.storage.sync.remove(['selectedDatabaseId', 'selectedDatabaseTitle']);
        
        await checkAuthStatus();
        
        showCookieStatus('已成功登出', 'success');
        
    } catch (error) {
        console.error('❌ [Options] 登出失敗:', error);
        showCookieStatus('登出失敗: ' + error.message, 'error');
    }
}

/**
 * 處理測試 API 按鈕點擊
 */
async function handleTestAPI() {
    try {
        const apiKey = elements.apiKeyInput.value.trim();
        
        if (!apiKey) {
            showManualStatus('請輸入 API 金鑰', 'error');
            return;
        }
        
        showManualStatus('正在測試 API 金鑰...', 'info');
        
        // 創建臨時實例進行測試
        const tempAuth = new NotionSimpleAuth();
        tempAuth.apiKey = apiKey;
        tempAuth.authMethod = 'manual';
        
        const isValid = await tempAuth.validateManualAPI();
        
        if (isValid) {
            const userInfo = tempAuth.getUserDisplayInfo();
            showManualStatus(`API 金鑰有效！用戶: ${userInfo.name}`, 'success');
        } else {
            showManualStatus('API 金鑰無效，請檢查金鑰是否正確', 'error');
        }
        
    } catch (error) {
        console.error('❌ [Options] 測試 API 失敗:', error);
        showManualStatus('測試失敗: ' + error.message, 'error');
    }
}

/**
 * 處理保存手動設定按鈕點擊
 */
async function handleSaveManual() {
    try {
        const apiKey = elements.apiKeyInput.value.trim();
        
        if (!apiKey) {
            showManualStatus('請輸入 API 金鑰', 'error');
            return;
        }
        
        showManualStatus('正在保存設定...', 'info');
        
        const success = await simpleAuth.setManualConfig(apiKey, selectedDatabaseId || '');
        
        if (success) {
            showManualStatus('手動設定保存成功！', 'success');
            await checkAuthStatus();
        } else {
            showManualStatus('保存失敗，請檢查 API 金鑰是否有效', 'error');
        }
        
    } catch (error) {
        console.error('❌ [Options] 保存手動設定失敗:', error);
        showManualStatus('保存失敗: ' + error.message, 'error');
    }
}

/**
 * 載入資料庫列表
 */
async function loadDatabases() {
    try {
        if (!simpleAuth.isAuthorized()) {
            elements.databaseList.innerHTML = '<div class="no-databases">請先完成授權</div>';
            elements.databaseCount.textContent = '未授權';
            return;
        }
        
        elements.databaseCount.textContent = '載入中...';
        elements.databaseList.innerHTML = '<div class="loading-state"><div class="loading"></div> 正在載入資料庫...</div>';
        
        databases = await simpleAuth.searchDatabases('');
        
        elements.databaseCount.textContent = `找到 ${databases.length} 個資料庫`;
        
        if (databases.length === 0) {
            elements.databaseList.innerHTML = '<div class="no-databases">未找到資料庫</div>';
        } else {
            renderDatabaseList(databases);
        }
        
        console.log(`📊 [Options] 載入了 ${databases.length} 個資料庫`);
        
    } catch (error) {
        console.error('❌ [Options] 載入資料庫失敗:', error);
        elements.databaseList.innerHTML = '<div class="no-databases">載入失敗</div>';
        elements.databaseCount.textContent = '載入失敗';
    }
}

/**
 * 渲染資料庫列表
 */
function renderDatabaseList(databasesToRender) {
    if (databasesToRender.length === 0) {
        elements.databaseList.innerHTML = '<div class="no-databases">沒有符合條件的資料庫</div>';
        return;
    }
    
    const listHTML = databasesToRender.map(db => `
        <div class="database-item ${db.id === selectedDatabaseId ? 'selected' : ''}" 
             data-id="${db.id}" 
             data-title="${db.title}"
             onclick="selectDatabase('${db.id}', '${db.title}')">
            <div class="database-title">${db.title}</div>
            <div class="database-id">${db.id}</div>
        </div>
    `).join('');
    
    elements.databaseList.innerHTML = listHTML;
}

/**
 * 選擇資料庫
 */
function selectDatabase(databaseId, databaseTitle) {
    selectedDatabaseId = databaseId;
    elements.databaseSearch.value = databaseTitle;
    
    // 更新選中狀態
    elements.databaseList.querySelectorAll('.database-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    const selectedItem = elements.databaseList.querySelector(`[data-id="${databaseId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
    
    closeDatabaseDropdown();
    
    console.log('📊 [Options] 選擇資料庫:', databaseTitle, databaseId);
}

/**
 * 處理資料庫搜索
 */
function handleDatabaseSearch() {
    const query = elements.databaseSearch.value.toLowerCase();
    
    if (query === '') {
        renderDatabaseList(databases);
        return;
    }
    
    const filteredDatabases = databases.filter(db => 
        db.title.toLowerCase().includes(query) || 
        db.id.toLowerCase().includes(query)
    );
    
    renderDatabaseList(filteredDatabases);
}

/**
 * 處理搜索框鍵盤事件
 */
function handleSearchKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        
        // 如果輸入的是資料庫 ID 格式，直接設置
        const value = elements.databaseSearch.value.trim();
        if (value.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
            selectedDatabaseId = value;
            console.log('📊 [Options] 直接輸入資料庫 ID:', value);
        }
    }
}

/**
 * 切換資料庫下拉菜單
 */
function toggleDatabaseDropdown() {
    const isVisible = elements.databaseDropdown.classList.contains('show');
    
    if (isVisible) {
        closeDatabaseDropdown();
    } else {
        openDatabaseDropdown();
    }
}

/**
 * 打開資料庫下拉菜單
 */
function openDatabaseDropdown() {
    elements.databaseDropdown.classList.add('show');
    elements.dropdownToggle.querySelector('span').textContent = '▲';
    
    // 如果還沒有載入資料庫，現在載入
    if (databases.length === 0 && simpleAuth.isAuthorized()) {
        loadDatabases();
    }
}

/**
 * 關閉資料庫下拉菜單
 */
function closeDatabaseDropdown() {
    elements.databaseDropdown.classList.remove('show');
    elements.dropdownToggle.querySelector('span').textContent = '▼';
}

/**
 * 處理刷新資料庫按鈕點擊
 */
async function handleRefreshDatabases() {
    await loadDatabases();
}

/**
 * 處理保存資料庫設定按鈕點擊
 */
async function handleSaveDatabaseSettings() {
    try {
        if (!selectedDatabaseId) {
            showDatabaseStatus('請先選擇一個資料庫', 'error');
            return;
        }
        
        showDatabaseStatus('正在保存資料庫設定...', 'info');
        
        // 保存到 Chrome Storage
        await chrome.storage.sync.set({
            selectedDatabaseId: selectedDatabaseId,
            selectedDatabaseTitle: elements.databaseSearch.value
        });
        
        // 如果使用手動 API，也更新 simpleAuth 的設定
        if (currentAuthMethod === 'manual') {
            const apiKey = elements.apiKeyInput.value.trim();
            if (apiKey) {
                await simpleAuth.setManualConfig(apiKey, selectedDatabaseId);
            }
        }
        
        showDatabaseStatus('資料庫設定已保存！', 'success');
        
        console.log('💾 [Options] 資料庫設定已保存:', selectedDatabaseId);
        
    } catch (error) {
        console.error('❌ [Options] 保存資料庫設定失敗:', error);
        showDatabaseStatus('保存失敗: ' + error.message, 'error');
    }
}

/**
 * 顯示 Cookie 狀態訊息
 */
function showCookieStatus(message, type) {
    showStatus(elements.cookieStatusMessage, message, type);
}

/**
 * 顯示手動 API 狀態訊息
 */
function showManualStatus(message, type) {
    showStatus(elements.manualStatusMessage, message, type);
}

/**
 * 顯示資料庫狀態訊息
 */
function showDatabaseStatus(message, type) {
    showStatus(elements.databaseStatusMessage, message, type);
}

/**
 * 顯示全局狀態訊息
 */
function showGlobalStatus(message, type) {
    showStatus(elements.globalStatusMessage, message, type);
}

/**
 * 隱藏全局狀態訊息
 */
function hideGlobalStatus() {
    elements.globalStatusMessage.classList.remove('show');
}

/**
 * 通用狀態訊息顯示函數
 */
function showStatus(element, message, type) {
    if (!element) return;
    
    element.textContent = message;
    element.className = `status-message ${type} show`;
    
    console.log(`📢 [Options] ${type.toUpperCase()}: ${message}`);
    
    // 自動清除成功和資訊訊息
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            if (element.textContent === message) {
                element.classList.remove('show');
            }
        }, 5000);
    }
}

// 將函數暴露到全局範圍供 HTML 調用
window.selectAuthMethod = selectAuthMethod;
window.selectDatabase = selectDatabase;

console.log('📄 [Options] 改進版選項頁面腳本已載入');