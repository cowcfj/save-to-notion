/**
 * 混合授權管理器
 * 
 * 統一管理 Cookie 授權和手動 API 金鑰兩種授權方式
 * 提供統一的 API 調用介面給 background.js 使用
 */

class HybridAuthManager {
    constructor() {
        // 授權方式
        this.authMethods = {
            COOKIE: 'cookie',
            MANUAL: 'manual'
        };
        
        // 當前授權方式
        this.currentAuthMethod = null;
        
        // Cookie 授權實例
        this.cookieAuth = null;
        
        // 手動 API 金鑰
        this.manualApiKey = null;
        
        // 初始化狀態
        this.isInitialized = false;
        
        console.log('🔧 [Hybrid Auth] 混合授權管理器初始化');
    }

    /**
     * 初始化授權管理器
     * @returns {Promise<boolean>} 初始化是否成功
     */
    async initialize() {
        console.log('🔄 [Hybrid Auth] 開始初始化授權管理器...');
        
        try {
            // 1. 載入用戶的授權方式偏好
            const authMethod = await this.getStoredAuthMethod();
            console.log('📋 [Hybrid Auth] 用戶偏好的授權方式:', authMethod);
            
            // 2. 根據授權方式初始化相應的模組
            if (authMethod === this.authMethods.COOKIE) {
                await this.initializeCookieAuth();
            } else {
                await this.initializeManualAuth();
            }
            
            this.currentAuthMethod = authMethod;
            this.isInitialized = true;
            
            console.log('✅ [Hybrid Auth] 授權管理器初始化完成');
            return true;
            
        } catch (error) {
            console.error('❌ [Hybrid Auth] 授權管理器初始化失敗:', error);
            
            // 初始化失敗時回退到手動授權
            await this.fallbackToManualAuth();
            return false;
        }
    }

    /**
     * 初始化 Cookie 授權
     * @returns {Promise<void>}
     */
    async initializeCookieAuth() {
        console.log('🍪 [Hybrid Auth] 初始化 Cookie 授權...');
        
        try {
            // 動態載入 Cookie 授權模組
            if (typeof NotionCookieAuth === 'undefined') {
                await this.loadScript('scripts/notion-cookie-auth.js');
            }
            
            // 創建 Cookie 授權實例
            this.cookieAuth = new NotionCookieAuth();
            
            // 初始化 Cookie 授權
            const isLoggedIn = await this.cookieAuth.initialize();
            
            if (isLoggedIn) {
                console.log('✅ [Hybrid Auth] Cookie 授權初始化成功');
            } else {
                console.log('⚠️ [Hybrid Auth] Cookie 授權初始化完成，但用戶未登入');
            }
            
        } catch (error) {
            console.error('❌ [Hybrid Auth] Cookie 授權初始化失敗:', error);
            throw error;
        }
    }

    /**
     * 初始化手動 API 授權
     * @returns {Promise<void>}
     */
    async initializeManualAuth() {
        console.log('🔑 [Hybrid Auth] 初始化手動 API 授權...');
        
        try {
            // 從 storage 載入 API 金鑰
            const result = await new Promise(resolve => {
                chrome.storage.sync.get(['notionApiKey'], resolve);
            });
            
            this.manualApiKey = result.notionApiKey || null;
            
            if (this.manualApiKey) {
                console.log('✅ [Hybrid Auth] 手動 API 授權初始化成功');
            } else {
                console.log('⚠️ [Hybrid Auth] 手動 API 授權初始化完成，但未設置 API 金鑰');
            }
            
        } catch (error) {
            console.error('❌ [Hybrid Auth] 手動 API 授權初始化失敗:', error);
            throw error;
        }
    }

    /**
     * 回退到手動授權
     * @returns {Promise<void>}
     */
    async fallbackToManualAuth() {
        console.log('🔄 [Hybrid Auth] 回退到手動授權...');
        
        try {
            await this.initializeManualAuth();
            this.currentAuthMethod = this.authMethods.MANUAL;
            this.isInitialized = true;
            
            console.log('✅ [Hybrid Auth] 成功回退到手動授權');
        } catch (error) {
            console.error('❌ [Hybrid Auth] 回退到手動授權失敗:', error);
            this.currentAuthMethod = null;
            this.isInitialized = false;
        }
    }

    /**
     * 獲取儲存的授權方式
     * @returns {Promise<string>} 授權方式
     */
    async getStoredAuthMethod() {
        try {
            const result = await new Promise(resolve => {
                chrome.storage.sync.get(['authMethod'], resolve);
            });
            
            // 默認使用 Cookie 授權
            return result.authMethod || this.authMethods.COOKIE;
        } catch (error) {
            console.error('❌ [Hybrid Auth] 獲取授權方式失敗:', error);
            return this.authMethods.MANUAL; // 失敗時回退到手動授權
        }
    }

    /**
     * 載入腳本
     * @param {string} src 腳本路徑
     * @returns {Promise<void>}
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            // 在 service worker 中使用 importScripts
            try {
                importScripts(src);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 獲取有效的 API 金鑰或授權標頭
     * @returns {Promise<string|null>} API 金鑰或 null
     */
    async getApiKey() {
        if (!this.isInitialized) {
            console.warn('⚠️ [Hybrid Auth] 授權管理器未初始化，嘗試初始化...');
            await this.initialize();
        }

        if (this.currentAuthMethod === this.authMethods.COOKIE) {
            // Cookie 授權模式：返回特殊標記，表示使用 Cookie
            if (this.cookieAuth && this.cookieAuth.checkLoginStatus()) {
                return 'COOKIE_AUTH';
            } else {
                console.warn('⚠️ [Hybrid Auth] Cookie 授權未登入，回退到手動授權');
                await this.fallbackToManualAuth();
                return this.manualApiKey;
            }
        } else {
            // 手動授權模式：返回 API 金鑰
            return this.manualApiKey;
        }
    }

    /**
     * 執行 Notion API 調用
     * @param {string} endpoint API 端點
     * @param {Object} options 請求選項
     * @returns {Promise<Response>} API 響應
     */
    async makeNotionAPICall(endpoint, options = {}) {
        console.log(`🌐 [Hybrid Auth] 調用 Notion API: ${endpoint}`);
        
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.currentAuthMethod === this.authMethods.COOKIE) {
            return await this.makeCookieAPICall(endpoint, options);
        } else {
            return await this.makeManualAPICall(endpoint, options);
        }
    }

    /**
     * 使用 Cookie 授權調用 API
     * @param {string} endpoint API 端點
     * @param {Object} options 請求選項
     * @returns {Promise<Response>} API 響應
     */
    async makeCookieAPICall(endpoint, options = {}) {
        if (!this.cookieAuth) {
            throw new Error('Cookie 授權未初始化');
        }

        // 檢查登入狀態
        if (!this.cookieAuth.checkLoginStatus()) {
            throw new Error('用戶未登入 Notion');
        }

        // 使用 Cookie 授權的 API 調用方法
        if (endpoint.startsWith('/api/v3/')) {
            // Notion 內部 API
            return await this.cookieAuth.makeAPICall(endpoint, options.body ? JSON.parse(options.body) : {});
        } else {
            // 標準 Notion API - 需要轉換
            throw new Error('Cookie 授權暫不支援標準 Notion API，請使用手動 API 金鑰');
        }
    }

    /**
     * 使用手動 API 金鑰調用 API
     * @param {string} endpoint API 端點
     * @param {Object} options 請求選項
     * @returns {Promise<Response>} API 響應
     */
    async makeManualAPICall(endpoint, options = {}) {
        if (!this.manualApiKey) {
            throw new Error('API 金鑰未設置');
        }

        const url = endpoint.startsWith('http') ? endpoint : `https://api.notion.com/v1${endpoint}`;
        
        const requestOptions = {
            method: options.method || 'POST',
            headers: {
                'Authorization': `Bearer ${this.manualApiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
                ...options.headers
            },
            ...options
        };

        return await fetch(url, requestOptions);
    }

    /**
     * 檢查授權狀態
     * @returns {Promise<Object>} 授權狀態資訊
     */
    async getAuthStatus() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const status = {
            isAuthenticated: false,
            authMethod: this.currentAuthMethod,
            userInfo: null,
            error: null
        };

        try {
            if (this.currentAuthMethod === this.authMethods.COOKIE) {
                if (this.cookieAuth) {
                    status.isAuthenticated = this.cookieAuth.checkLoginStatus();
                    if (status.isAuthenticated) {
                        status.userInfo = this.cookieAuth.getUserDisplayInfo();
                    }
                }
            } else {
                status.isAuthenticated = !!this.manualApiKey;
                if (status.isAuthenticated) {
                    status.userInfo = { method: 'manual', hasApiKey: true };
                }
            }
        } catch (error) {
            status.error = error.message;
            console.error('❌ [Hybrid Auth] 檢查授權狀態失敗:', error);
        }

        return status;
    }

    /**
     * 切換授權方式
     * @param {string} method 新的授權方式
     * @returns {Promise<boolean>} 切換是否成功
     */
    async switchAuthMethod(method) {
        console.log(`🔄 [Hybrid Auth] 切換授權方式到: ${method}`);
        
        try {
            if (method === this.authMethods.COOKIE) {
                await this.initializeCookieAuth();
            } else {
                await this.initializeManualAuth();
            }
            
            this.currentAuthMethod = method;
            
            // 保存用戶選擇
            chrome.storage.sync.set({ authMethod: method });
            
            console.log('✅ [Hybrid Auth] 授權方式切換成功');
            return true;
            
        } catch (error) {
            console.error('❌ [Hybrid Auth] 授權方式切換失敗:', error);
            return false;
        }
    }

    /**
     * 重新載入授權配置
     * @returns {Promise<boolean>} 重新載入是否成功
     */
    async reload() {
        console.log('🔄 [Hybrid Auth] 重新載入授權配置...');
        
        this.isInitialized = false;
        this.cookieAuth = null;
        this.manualApiKey = null;
        this.currentAuthMethod = null;
        
        return await this.initialize();
    }

    /**
     * 獲取當前授權方式
     * @returns {string|null} 當前授權方式
     */
    getCurrentAuthMethod() {
        return this.currentAuthMethod;
    }

    /**
     * 檢查是否已初始化
     * @returns {boolean} 是否已初始化
     */
    isReady() {
        return this.isInitialized;
    }
}

// 創建全局實例
const hybridAuthManager = new HybridAuthManager();

// 導出給其他模組使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HybridAuthManager;
}

console.log('📦 [Hybrid Auth] 混合授權管理器模組載入完成');