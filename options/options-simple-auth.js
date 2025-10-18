/**
 * 選項頁面 - 簡化授權版本
 * 
 * 使用 NotionSimpleAuth 模組提供更好的用戶體驗
 * 支援 Cookie 檢查和手動 API 設置
 * 
 * @author Kiro AI Assistant
 * @version 2.9.5
 * @since 2025-01-17
 */

let simpleAuth = null;
let isInitialized = false;

// DOM 元素
let elements = {};

/**
 * 頁面載入完成後初始化
 */
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 [Options] 選項頁面載入中...');
    
    try {
        // 獲取 DOM 元素
        initializeElements();
        
        // 載入簡化授權模組
        await loadSimpleAuthModule();
        
        // 初始化授權系統
        await initializeAuth();
        
        // 設置事件監聽器
        setupEventListeners();
        
        // 檢查授權狀態
        await checkAuthStatus();
        
        console.log('✅ [Options] 選項頁面初始化完成');
        
    } catch (error) {
        console.error('❌ [Options] 初始化失敗:', error);
        showStatus('初始化失敗: ' + error.message, 'error');
    }
});

/**
 * 初始化 DOM 元素引用
 */
function initializeElements() {
    elements = {
        // 狀態顯示
        authStatus: document.getElementById('auth-status'),
        userInfo: document.getElementById('user-info'),
        statusMessage: document.getElementById('status-message'),
        
        // 登入區域
        loginSection: document.getElementById('login-section'),
        loginButton: document.getElementById('login-button'),
        
        // 手動設置區域
        manualSection: document.getElementById('manual-section'),
        apiKeyInput: document.getElementById('api-key'),
        databaseIdInput: document.getElementById('database-id'),
        saveManualButton: document.getElementById('save-manual'),
        testApiButton: document.getElementById('test-api'),
        
        // 資料庫搜索
        searchSection: document.getElementById('search-section'),
        searchInput: document.getElementById('search-input'),
        searchButton: document.getElementById('search-button'),
        databaseList: document.getElementById('database-list'),
        
        // 控制按鈕
        logoutButton: document.getElementById('logout-button'),
        refreshButton: document.getElementById('refresh-button')
    };
    
    console.log('📋 [Options] DOM 元素已初始化');
}

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
 * @param {string} src 腳本路徑
 * @returns {Promise} 載入 Promise
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
        showStatus('正在初始化授權系統...', 'info');
        
        const success = await simpleAuth.initialize();
        isInitialized = true;
        
        if (success) {
            console.log('✅ [Options] 授權系統初始化成功');
        } else {
            console.log('ℹ️ [Options] 授權系統初始化完成，但用戶未授權');
        }
        
    } catch (error) {
        console.error('❌ [Options] 授權系統初始化失敗:', error);
        throw error;
    }
}

/**
 * 設置事件監聽器
 */
function setupEventListeners() {
    // 登入按鈕
    if (elements.loginButton) {
        elements.loginButton.addEventListener('click', handleLogin);
    }
    
    // 手動設置保存按鈕
    if (elements.saveManualButton) {
        elements.saveManualButton.addEventListener('click', handleSaveManual);
    }
    
    // 測試 API 按鈕
    if (elements.testApiButton) {
        elements.testApiButton.addEventListener('click', handleTestAPI);
    }
    
    // 搜索按鈕
    if (elements.searchButton) {
        elements.searchButton.addEventListener('click', handleSearchDatabases);
    }
    
    // 搜索輸入框 Enter 鍵
    if (elements.searchInput) {
        elements.searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleSearchDatabases();
            }
        });
    }
    
    // 登出按鈕
    if (elements.logoutButton) {
        elements.logoutButton.addEventListener('click', handleLogout);
    }
    
    // 刷新按鈕
    if (elements.refreshButton) {
        elements.refreshButton.addEventListener('click', handleRefresh);
    }
    
    console.log('🎯 [Options] 事件監聽器已設置');
}

/**
 * 檢查授權狀態並更新 UI
 */
async function checkAuthStatus() {
    try {
        if (!isInitialized) {
            showStatus('授權系統尚未初始化', 'warning');
            return;
        }
        
        const isAuthorized = simpleAuth.isAuthorized();
        const userInfo = simpleAuth.getUserDisplayInfo();
        const authMethod = simpleAuth.getAuthMethod();
        
        console.log('🔍 [Options] 授權狀態檢查:', { isAuthorized, authMethod, userInfo });
        
        if (isAuthorized && userInfo) {
            // 已授權狀態
            updateUIForAuthorized(userInfo, authMethod);
        } else {
            // 未授權狀態
            updateUIForUnauthorized();
        }
        
    } catch (error) {
        console.error('❌ [Options] 檢查授權狀態失敗:', error);
        showStatus('檢查授權狀態失敗: ' + error.message, 'error');
    }
}

/**
 * 更新 UI 為已授權狀態
 * @param {Object} userInfo 用戶資訊
 * @param {string} authMethod 授權方式
 */
function updateUIForAuthorized(userInfo, authMethod) {
    // 更新狀態顯示
    if (elements.authStatus) {
        elements.authStatus.textContent = '✅ 已授權';
        elements.authStatus.className = 'status authorized';
    }
    
    // 更新用戶資訊
    if (elements.userInfo) {
        const methodText = authMethod === 'cookie' ? 'Cookie 登入' : '手動 API';
        elements.userInfo.innerHTML = `
            <div class="user-details">
                <p><strong>用戶:</strong> ${userInfo.name}</p>
                <p><strong>郵箱:</strong> ${userInfo.email}</p>
                <p><strong>方式:</strong> ${methodText}</p>
            </div>
        `;
    }
    
    // 隱藏登入區域
    if (elements.loginSection) {
        elements.loginSection.style.display = 'none';
    }
    
    // 顯示手動設置區域（如果是手動方式）
    if (elements.manualSection) {
        elements.manualSection.style.display = authMethod === 'manual' ? 'block' : 'none';
    }
    
    // 顯示搜索區域（僅手動方式支援）
    if (elements.searchSection) {
        elements.searchSection.style.display = authMethod === 'manual' ? 'block' : 'none';
    }
    
    // 顯示控制按鈕
    if (elements.logoutButton) {
        elements.logoutButton.style.display = 'inline-block';
    }
    if (elements.refreshButton) {
        elements.refreshButton.style.display = 'inline-block';
    }
    
    showStatus('授權成功！可以開始使用擴展功能。', 'success');
}

/**
 * 更新 UI 為未授權狀態
 */
function updateUIForUnauthorized() {
    // 更新狀態顯示
    if (elements.authStatus) {
        elements.authStatus.textContent = '❌ 未授權';
        elements.authStatus.className = 'status unauthorized';
    }
    
    // 清空用戶資訊
    if (elements.userInfo) {
        elements.userInfo.innerHTML = '<p>請選擇授權方式</p>';
    }
    
    // 顯示登入區域
    if (elements.loginSection) {
        elements.loginSection.style.display = 'block';
    }
    
    // 顯示手動設置區域
    if (elements.manualSection) {
        elements.manualSection.style.display = 'block';
    }
    
    // 隱藏搜索區域
    if (elements.searchSection) {
        elements.searchSection.style.display = 'none';
    }
    
    // 隱藏控制按鈕
    if (elements.logoutButton) {
        elements.logoutButton.style.display = 'none';
    }
    if (elements.refreshButton) {
        elements.refreshButton.style.display = 'none';
    }
    
    showStatus('請選擇授權方式：Cookie 登入或手動設置 API', 'info');
}

/**
 * 處理登入按鈕點擊
 */
async function handleLogin() {
    try {
        showStatus('正在打開 Notion 登入頁面...', 'info');
        
        // 打開登入頁面
        await simpleAuth.promptLogin();
        
        showStatus('請在新開啟的頁面中登入 Notion，然後點擊刷新按鈕', 'info');
        
    } catch (error) {
        console.error('❌ [Options] 登入失敗:', error);
        showStatus('打開登入頁面失敗: ' + error.message, 'error');
    }
}

/**
 * 處理手動設置保存
 */
async function handleSaveManual() {
    try {
        const apiKey = elements.apiKeyInput?.value?.trim();
        const databaseId = elements.databaseIdInput?.value?.trim();
        
        if (!apiKey) {
            showStatus('請輸入 API 金鑰', 'error');
            return;
        }
        
        if (!databaseId) {
            showStatus('請輸入資料庫 ID', 'error');
            return;
        }
        
        showStatus('正在驗證 API 金鑰...', 'info');
        
        // 設置手動配置
        const success = await simpleAuth.setManualConfig(apiKey, databaseId);
        
        if (success) {
            showStatus('手動設置保存成功！', 'success');
            await checkAuthStatus();
        } else {
            showStatus('API 金鑰驗證失敗', 'error');
        }
        
    } catch (error) {
        console.error('❌ [Options] 保存手動設置失敗:', error);
        showStatus('保存失敗: ' + error.message, 'error');
    }
}

/**
 * 處理測試 API
 */
async function handleTestAPI() {
    try {
        const apiKey = elements.apiKeyInput?.value?.trim();
        
        if (!apiKey) {
            showStatus('請輸入 API 金鑰', 'error');
            return;
        }
        
        showStatus('正在測試 API 金鑰...', 'info');
        
        // 臨時設置 API 金鑰進行測試
        const tempAuth = new NotionSimpleAuth();
        tempAuth.apiKey = apiKey;
        tempAuth.authMethod = 'manual';
        
        const isValid = await tempAuth.validateManualAPI();
        
        if (isValid) {
            const userInfo = tempAuth.getUserDisplayInfo();
            showStatus(`API 金鑰有效！用戶: ${userInfo.name}`, 'success');
        } else {
            showStatus('API 金鑰無效', 'error');
        }
        
    } catch (error) {
        console.error('❌ [Options] 測試 API 失敗:', error);
        showStatus('測試失敗: ' + error.message, 'error');
    }
}

/**
 * 處理搜索資料庫
 */
async function handleSearchDatabases() {
    try {
        if (!simpleAuth.isAuthorized()) {
            showStatus('請先完成授權', 'error');
            return;
        }
        
        const query = elements.searchInput?.value?.trim() || '';
        
        showStatus('正在搜索資料庫...', 'info');
        
        const databases = await simpleAuth.searchDatabases(query);
        
        displayDatabases(databases);
        
        if (databases.length > 0) {
            showStatus(`找到 ${databases.length} 個資料庫`, 'success');
        } else {
            showStatus('未找到資料庫', 'warning');
        }
        
    } catch (error) {
        console.error('❌ [Options] 搜索資料庫失敗:', error);
        showStatus('搜索失敗: ' + error.message, 'error');
    }
}

/**
 * 顯示資料庫列表
 * @param {Array} databases 資料庫陣列
 */
function displayDatabases(databases) {
    if (!elements.databaseList) return;
    
    if (databases.length === 0) {
        elements.databaseList.innerHTML = '<p>未找到資料庫</p>';
        return;
    }
    
    const listHTML = databases.map(db => `
        <div class="database-item" data-id="${db.id}">
            <div class="database-info">
                <h4>${db.title}</h4>
                <p class="database-id">ID: ${db.id}</p>
                <p class="database-url">
                    <a href="${db.url}" target="_blank">在 Notion 中打開</a>
                </p>
            </div>
            <button class="select-database" data-id="${db.id}" data-title="${db.title}">
                選擇此資料庫
            </button>
        </div>
    `).join('');
    
    elements.databaseList.innerHTML = listHTML;
    
    // 添加選擇資料庫的事件監聽器
    elements.databaseList.querySelectorAll('.select-database').forEach(button => {
        button.addEventListener('click', function() {
            const dbId = this.dataset.id;
            const dbTitle = this.dataset.title;
            selectDatabase(dbId, dbTitle);
        });
    });
}

/**
 * 選擇資料庫
 * @param {string} databaseId 資料庫 ID
 * @param {string} databaseTitle 資料庫標題
 */
function selectDatabase(databaseId, databaseTitle) {
    if (elements.databaseIdInput) {
        elements.databaseIdInput.value = databaseId;
    }
    
    showStatus(`已選擇資料庫: ${databaseTitle}`, 'success');
}

/**
 * 處理登出
 */
async function handleLogout() {
    try {
        showStatus('正在登出...', 'info');
        
        await simpleAuth.logout();
        
        // 清空輸入框
        if (elements.apiKeyInput) elements.apiKeyInput.value = '';
        if (elements.databaseIdInput) elements.databaseIdInput.value = '';
        if (elements.searchInput) elements.searchInput.value = '';
        if (elements.databaseList) elements.databaseList.innerHTML = '';
        
        await checkAuthStatus();
        
        showStatus('已成功登出', 'success');
        
    } catch (error) {
        console.error('❌ [Options] 登出失敗:', error);
        showStatus('登出失敗: ' + error.message, 'error');
    }
}

/**
 * 處理刷新
 */
async function handleRefresh() {
    try {
        showStatus('正在刷新授權狀態...', 'info');
        
        await simpleAuth.recheckAuth();
        await checkAuthStatus();
        
    } catch (error) {
        console.error('❌ [Options] 刷新失敗:', error);
        showStatus('刷新失敗: ' + error.message, 'error');
    }
}

/**
 * 顯示狀態訊息
 * @param {string} message 訊息內容
 * @param {string} type 訊息類型 (success, error, warning, info)
 */
function showStatus(message, type = 'info') {
    if (!elements.statusMessage) return;
    
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message ${type}`;
    
    console.log(`📢 [Options] ${type.toUpperCase()}: ${message}`);
    
    // 自動清除成功和資訊訊息
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            if (elements.statusMessage.textContent === message) {
                elements.statusMessage.textContent = '';
                elements.statusMessage.className = 'status-message';
            }
        }, 5000);
    }
}

console.log('📄 [Options] 選項頁面腳本已載入');