/**
 * Notion 簡化授權模組
 * 
 * 結合 Cookie 檢查和手動 API 設置的混合方案
 * 提供更好的用戶體驗，同時保持簡單性
 * 
 * @author Kiro AI Assistant
 * @version 2.9.5
 * @since 2025-01-17
 */

class NotionSimpleAuth {
    constructor() {
        this.isReady = false;
        this.authMethod = null; // 'cookie', 'manual', null
        this.userInfo = null;
        this.apiKey = null;
        this.databaseId = null;
        
        console.log('🔧 [SimpleAuth] Notion 簡化授權模組初始化');
    }

    /**
     * 初始化授權模組
     * @returns {Promise<boolean>} 是否成功初始化
     */
    async initialize() {
        try {
            console.log('🔄 [SimpleAuth] 初始化授權模組...');
            
            // 檢查是否有手動設置的 API 金鑰
            const manualConfig = await this.loadManualConfig();
            if (manualConfig && manualConfig.apiKey) {
                this.apiKey = manualConfig.apiKey;
                this.databaseId = manualConfig.databaseId;
                this.authMethod = 'manual';
                
                // 驗證手動 API 金鑰
                const isValid = await this.validateManualAPI();
                if (isValid) {
                    console.log('✅ [SimpleAuth] 手動 API 金鑰驗證成功');
                    this.isReady = true;
                    return true;
                } else {
                    console.log('⚠️ [SimpleAuth] 手動 API 金鑰無效');
                }
            }
            
            // 檢查 Cookie 登入狀態
            const cookieStatus = await this.checkCookieLogin();
            if (cookieStatus) {
                this.authMethod = 'cookie';
                console.log('✅ [SimpleAuth] Cookie 登入狀態確認');
                this.isReady = true;
                return true;
            }
            
            console.log('ℹ️ [SimpleAuth] 未檢測到有效的授權方式');
            this.isReady = true;
            return false;
            
        } catch (error) {
            console.error('❌ [SimpleAuth] 初始化失敗:', error);
            this.isReady = true;
            return false;
        }
    }

    /**
     * 檢查 Cookie 登入狀態
     * @returns {Promise<boolean>} 是否已通過 Cookie 登入
     */
    async checkCookieLogin() {
        try {
            // 檢查 Notion cookies
            const cookies = await chrome.cookies.getAll({
                domain: '.notion.so'
            });
            
            console.log('🍪 [SimpleAuth] 檢查到的 cookies:', cookies.map(c => ({ name: c.name, hasValue: !!c.value })));
            
            // 檢查關鍵的 cookies
            const tokenCookie = cookies.find(cookie => cookie.name === 'token_v2');
            const userIdCookie = cookies.find(cookie => cookie.name === 'notion_user_id');
            
            if (tokenCookie && tokenCookie.value && tokenCookie.value.length > 10) {
                console.log('🍪 [SimpleAuth] 檢測到有效的 Notion token_v2 cookie');
                
                // 嘗試驗證 cookie 是否有效（通過簡單的 API 調用）
                try {
                    const isValid = await this.validateCookieAuth(tokenCookie.value);
                    if (isValid) {
                        console.log('✅ [SimpleAuth] Cookie 授權驗證成功');
                        return true;
                    } else {
                        console.log('⚠️ [SimpleAuth] Cookie 已過期或無效');
                        return false;
                    }
                } catch (validationError) {
                    console.warn('⚠️ [SimpleAuth] Cookie 驗證失敗，但仍認為已登入:', validationError);
                    
                    // 即使驗證失敗，如果有 token 也認為是登入狀態
                    this.userInfo = {
                        name: '已登入用戶',
                        email: '請在 Notion 中查看',
                        method: 'cookie'
                    };
                    return true;
                }
            }
            
            console.log('ℹ️ [SimpleAuth] 未檢測到有效的 Notion 登入 cookies');
            return false;
            
        } catch (error) {
            console.error('❌ [SimpleAuth] Cookie 檢查失敗:', error);
            return false;
        }
    }

    /**
     * 驗證 Cookie 授權是否有效
     * @param {string} token token_v2 值
     * @returns {Promise<boolean>} 是否有效
     */
    async validateCookieAuth(token) {
        try {
            // 嘗試調用 Notion 的用戶資訊 API
            const response = await fetch('https://www.notion.so/api/v3/loadUserEmailAndPhone', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `token_v2=${token}`
                },
                body: JSON.stringify({})
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data && (data.email || data.name)) {
                    // 更新用戶資訊
                    this.userInfo = {
                        name: data.name || data.email?.split('@')[0] || '已登入用戶',
                        email: data.email || '請在 Notion 中查看',
                        method: 'cookie'
                    };
                    return true;
                }
            }
            
            return false;
            
        } catch (error) {
            console.warn('⚠️ [SimpleAuth] Cookie 驗證 API 調用失敗:', error);
            // 不拋出錯誤，讓調用者決定如何處理
            return false;
        }
    }

    /**
     * 驗證手動 API 金鑰
     * @returns {Promise<boolean>} API 金鑰是否有效
     */
    async validateManualAPI() {
        try {
            if (!this.apiKey) {
                return false;
            }
            
            // 調用 Notion API 測試
            const response = await fetch('https://api.notion.com/v1/users/me', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Notion-Version': '2022-06-28'
                }
            });
            
            if (response.ok) {
                const userData = await response.json();
                this.userInfo = {
                    id: userData.id,
                    name: userData.name,
                    email: userData.person?.email || '未提供',
                    method: 'manual'
                };
                
                console.log(`👤 [SimpleAuth] 手動 API 用戶: ${this.userInfo.name}`);
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ [SimpleAuth] 手動 API 驗證失敗:', error);
            return false;
        }
    }

    /**
     * 提示用戶登入 Notion
     * @returns {Promise<number>} 新開啟的標籤頁 ID
     */
    async promptLogin() {
        try {
            console.log('🔗 [SimpleAuth] 打開 Notion 登入頁面...');
            
            const tab = await chrome.tabs.create({
                url: 'https://www.notion.so/login',
                active: true
            });
            
            console.log(`✅ [SimpleAuth] 已打開登入頁面，標籤 ID: ${tab.id}`);
            return tab.id;
            
        } catch (error) {
            console.error('❌ [SimpleAuth] 打開登入頁面失敗:', error);
            throw error;
        }
    }

    /**
     * 設置手動 API 配置
     * @param {string} apiKey API 金鑰
     * @param {string} databaseId 資料庫 ID
     * @returns {Promise<boolean>} 是否設置成功
     */
    async setManualConfig(apiKey, databaseId) {
        try {
            // 驗證 API 金鑰
            const tempApiKey = this.apiKey;
            this.apiKey = apiKey;
            
            const isValid = await this.validateManualAPI();
            if (!isValid) {
                this.apiKey = tempApiKey;
                throw new Error('API 金鑰無效');
            }
            
            // 保存配置
            await chrome.storage.sync.set({
                notionApiKey: apiKey,
                notionDatabaseId: databaseId
            });
            
            this.apiKey = apiKey;
            this.databaseId = databaseId;
            this.authMethod = 'manual';
            
            console.log('✅ [SimpleAuth] 手動配置已保存');
            return true;
            
        } catch (error) {
            console.error('❌ [SimpleAuth] 設置手動配置失敗:', error);
            throw error;
        }
    }

    /**
     * 載入手動配置
     * @returns {Promise<Object|null>} 配置物件
     */
    async loadManualConfig() {
        try {
            const result = await chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId']);
            
            if (result.notionApiKey) {
                return {
                    apiKey: result.notionApiKey,
                    databaseId: result.notionDatabaseId
                };
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ [SimpleAuth] 載入手動配置失敗:', error);
            return null;
        }
    }

    /**
     * 搜索資料庫
     * @param {string} query 搜索關鍵字
     * @returns {Promise<Array>} 資料庫陣列
     */
    async searchDatabases(query = '') {
        try {
            if (this.authMethod === 'manual' && this.apiKey) {
                return await this.searchDatabasesWithAPI(query);
            } else if (this.authMethod === 'cookie') {
                // Cookie 方式的資料庫搜索比較複雜，暫時返回空陣列
                console.log('ℹ️ [SimpleAuth] Cookie 方式暫不支援資料庫搜索');
                return [];
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ [SimpleAuth] 搜索資料庫失敗:', error);
            return [];
        }
    }

    /**
     * 使用 API 搜索資料庫
     * @param {string} query 搜索關鍵字
     * @returns {Promise<Array>} 資料庫陣列
     */
    async searchDatabasesWithAPI(query = '') {
        try {
            const response = await fetch('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({
                    query: query,
                    filter: {
                        value: 'database',
                        property: 'object'
                    }
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                const databases = data.results.map(db => ({
                    id: db.id,
                    title: db.title?.[0]?.plain_text || 'Untitled Database',
                    url: db.url,
                    icon: db.icon,
                    created_time: db.created_time
                }));
                
                console.log(`📊 [SimpleAuth] 找到 ${databases.length} 個資料庫`);
                return databases;
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ [SimpleAuth] API 搜索資料庫失敗:', error);
            return [];
        }
    }

    /**
     * 執行 Notion API 調用
     * @param {string} endpoint API 端點
     * @param {Object} options 請求選項
     * @returns {Promise<Object>} API 響應
     */
    async makeAPICall(endpoint, options = {}) {
        try {
            if (this.authMethod === 'manual' && this.apiKey) {
                return await this.makeManualAPICall(endpoint, options);
            } else if (this.authMethod === 'cookie') {
                throw new Error('Cookie 方式暫不支援直接 API 調用，請使用手動 API 金鑰');
            } else {
                throw new Error('未授權：請先設置 API 金鑰或登入 Notion');
            }
            
        } catch (error) {
            console.error(`❌ [SimpleAuth] API 調用失敗 (${endpoint}):`, error);
            throw error;
        }
    }

    /**
     * 使用手動 API 金鑰調用 API
     * @param {string} endpoint API 端點
     * @param {Object} options 請求選項
     * @returns {Promise<Object>} API 響應
     */
    async makeManualAPICall(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `https://api.notion.com/v1${endpoint}`;
        
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
                ...options.headers
            },
            body: options.body
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API 調用失敗: ${errorData.message || response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * 登出用戶
     */
    async logout() {
        try {
            if (this.authMethod === 'cookie') {
                // 清除 Notion cookies
                const cookies = await chrome.cookies.getAll({
                    domain: '.notion.so'
                });
                
                for (const cookie of cookies) {
                    await chrome.cookies.remove({
                        url: `https://${cookie.domain}${cookie.path}`,
                        name: cookie.name
                    });
                }
                
                console.log('🍪 [SimpleAuth] Notion cookies 已清除');
            }
            
            // 清除手動配置（可選）
            // await chrome.storage.sync.remove(['notionApiKey', 'notionDatabaseId']);
            
            // 重置狀態
            this.authMethod = null;
            this.userInfo = null;
            this.apiKey = null;
            this.databaseId = null;
            
            console.log('✅ [SimpleAuth] 用戶已登出');
            
        } catch (error) {
            console.error('❌ [SimpleAuth] 登出失敗:', error);
            throw error;
        }
    }

    /**
     * 檢查是否已授權
     * @returns {boolean} 是否已授權
     */
    isAuthorized() {
        return this.isReady && this.authMethod !== null;
    }

    /**
     * 獲取用戶顯示資訊
     * @returns {Object|null} 用戶顯示資訊
     */
    getUserDisplayInfo() {
        return this.userInfo;
    }

    /**
     * 獲取 API 金鑰
     * @returns {string|null} API 金鑰或特殊標識
     */
    getApiKey() {
        if (this.authMethod === 'manual') {
            return this.apiKey;
        } else if (this.authMethod === 'cookie') {
            return 'COOKIE_AUTH_TOKEN';
        }
        return null;
    }

    /**
     * 獲取資料庫 ID
     * @returns {string|null} 資料庫 ID
     */
    getDatabaseId() {
        return this.databaseId;
    }

    /**
     * 獲取授權方式
     * @returns {string|null} 授權方式
     */
    getAuthMethod() {
        return this.authMethod;
    }

    /**
     * 重新檢查授權狀態
     * @returns {Promise<boolean>} 是否已授權
     */
    async recheckAuth() {
        console.log('🔄 [SimpleAuth] 重新檢查授權狀態...');
        return await this.initialize();
    }
}

// 確保在全局範圍內可用
if (typeof window !== 'undefined') {
    window.NotionSimpleAuth = NotionSimpleAuth;
}

// 支援 CommonJS 和 ES6 模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotionSimpleAuth;
}

console.log('🔧 [SimpleAuth] Notion 簡化授權模組已載入');