/**
 * Notion Cookie 授權管理器
 * 
 * 實現基於 cookies 的 Notion 登入授權方式
 * 讓用戶可以使用自己的 Notion 帳號和工作區
 */

class NotionCookieAuth {
    constructor() {
        // Notion 相關的 cookies 模式
        this.cookiePatterns = {
            // 主要授權 token
            token_v2: 'token_v2',
            // 用戶 ID
            notion_user_id: 'notion_user_id',
            // 會話相關
            notion_session_id: 'notion_session_id',
            // 其他可能的授權相關 cookies
            notion_browser_id: 'notion_browser_id'
        };

        // Notion API 端點
        this.apiEndpoints = {
            // 用戶資訊
            loadUserEmailAndPhone: '/api/v3/loadUserEmailAndPhone',
            getUsers: '/api/v3/getUsers',
            // 工作空間
            getSpaces: '/api/v3/getSpaces',
            // 搜索（包括資料庫）
            search: '/api/v3/search',
            // 載入用戶內容
            loadUserContent: '/api/v3/loadUserContent',
            // 查詢集合（資料庫）
            queryCollection: '/api/v3/queryCollection'
        };

        // 狀態管理
        this.authCookies = {};
        this.userInfo = null;
        this.workspaces = [];
        this.databases = [];
        this.isLoggedIn = false;

        console.log('🍪 [Cookie Auth] Notion Cookie 授權管理器初始化');
    }

    /**
     * 初始化授權系統
     * @returns {Promise<boolean>} 是否成功初始化並檢測到登入狀態
     */
    async initialize() {
        console.log('🔄 [Cookie Auth] 開始初始化授權系統...');

        try {
            // 1. 檢測授權 cookies
            await this.detectAuthCookies();

            // 2. 驗證授權狀態
            const isValid = await this.validateAuth();

            if (isValid) {
                // 3. 獲取用戶資訊
                await this.getUserInfo();
                this.isLoggedIn = true;
                console.log('✅ [Cookie Auth] 授權初始化成功，用戶已登入');
            } else {
                this.isLoggedIn = false;
                console.log('ℹ️ [Cookie Auth] 授權初始化完成，但用戶未登入');
            }

            return this.isLoggedIn;

        } catch (error) {
            console.error('❌ [Cookie Auth] 授權初始化失敗:', error);
            this.isLoggedIn = false;
            return false;
        }
    }

    /**
     * 檢測 Notion 授權相關的 cookies
     * @returns {Promise<Array>} 檢測到的 cookies 列表
     */
    async detectAuthCookies() {
        console.log('🔍 [Cookie Auth] 檢測 Notion cookies...');

        try {
            // 獲取所有 notion.so 域名的 cookies
            const allCookies = await chrome.cookies.getAll({
                domain: '.notion.so'
            });

            console.log(`🔍 [Cookie Auth] 找到 ${allCookies.length} 個 notion.so cookies`);

            // 篩選授權相關的 cookies
            const authCookies = {};
            const relevantCookies = [];

            for (const cookie of allCookies) {
                // 檢查是否是我們關心的 cookie
                if (Object.values(this.cookiePatterns).includes(cookie.name)) {
                    authCookies[cookie.name] = cookie.value;
                    relevantCookies.push(cookie);
                    console.log(`✅ [Cookie Auth] 找到授權 cookie: ${cookie.name}`);
                }
            }

            this.authCookies = authCookies;
            return relevantCookies;

        } catch (error) {
            console.error('❌ [Cookie Auth] 檢測 cookies 失敗:', error);
            return [];
        }
    }

    /**
     * 驗證當前的授權狀態
     * @returns {Promise<boolean>} 授權是否有效
     */
    async validateAuth() {
        console.log('🔐 [Cookie Auth] 驗證授權狀態...');

        // 檢查是否有必要的 cookies
        if (!this.authCookies.token_v2) {
            console.log('⚠️ [Cookie Auth] 缺少 token_v2 cookie');
            return false;
        }

        try {
            // 嘗試調用一個簡單的 API 來驗證授權
            const response = await this.makeAPICall('/api/v3/loadUserEmailAndPhone', {});

            if (response && !response.errorId) {
                console.log('✅ [Cookie Auth] 授權驗證成功');
                return true;
            } else {
                console.log('⚠️ [Cookie Auth] 授權驗證失敗，API 返回錯誤');
                return false;
            }

        } catch (error) {
            console.error('❌ [Cookie Auth] 授權驗證過程中發生錯誤:', error);
            return false;
        }
    }

    /**
     * 獲取用戶資訊
     * @returns {Promise<Object|null>} 用戶資訊
     */
    async getUserInfo() {
        console.log('👤 [Cookie Auth] 獲取用戶資訊...');

        if (!this.authCookies.notion_user_id) {
            console.log('⚠️ [Cookie Auth] 缺少用戶 ID cookie');
            return null;
        }

        try {
            const response = await this.makeAPICall('/api/v3/loadUserEmailAndPhone', {});

            if (response && response.results && response.results[0]) {
                const userData = response.results[0];
                this.userInfo = {
                    id: userData.id,
                    name: userData.name,
                    email: userData.email,
                    profilePhoto: userData.profile_photo,
                    timeZone: userData.time_zone
                };

                console.log('✅ [Cookie Auth] 用戶資訊獲取成功:', this.userInfo.name);
                return this.userInfo;
            } else {
                console.log('⚠️ [Cookie Auth] 用戶資訊獲取失敗');
                return null;
            }

        } catch (error) {
            console.error('❌ [Cookie Auth] 獲取用戶資訊時發生錯誤:', error);
            return null;
        }
    }

    /**
     * 獲取用戶的工作空間
     * @returns {Promise<Array>} 工作空間列表
     */
    async getUserWorkspaces() {
        console.log('🏢 [Cookie Auth] 獲取用戶工作空間...');

        try {
            const response = await this.makeAPICall('/api/v3/getSpaces', {});

            if (response && response.results) {
                this.workspaces = Object.values(response.results).map(space => ({
                    id: space.id,
                    name: space.name,
                    domain: space.domain,
                    icon: space.icon,
                    permissions: space.permissions
                }));

                console.log(`✅ [Cookie Auth] 找到 ${this.workspaces.length} 個工作空間`);
                return this.workspaces;
            } else {
                console.log('⚠️ [Cookie Auth] 工作空間獲取失敗');
                return [];
            }

        } catch (error) {
            console.error('❌ [Cookie Auth] 獲取工作空間時發生錯誤:', error);
            return [];
        }
    }

    /**
     * 搜索資料庫
     * @param {string} query 搜索查詢（可選）
     * @returns {Promise<Array>} 資料庫列表
     */
    async searchDatabases(query = '') {
        console.log('🗄️ [Cookie Auth] 搜索資料庫...');

        try {
            const response = await this.makeAPICall('/api/v3/search', {
                type: 'BlocksInSpace',
                query: query,
                limit: 100,
                filters: {
                    isDeletedOnly: false,
                    excludeTemplates: false,
                    isNavigableOnly: false,
                    requireEditPermissions: false,
                    ancestors: [],
                    createdBy: [],
                    editedBy: [],
                    lastEditedTime: {},
                    createdTime: {}
                }
            });

            if (response && response.results) {
                // 篩選出資料庫類型的結果
                const databases = response.results
                    .filter(result => result.type === 'collection')
                    .map(db => ({
                        id: db.id,
                        title: db.title,
                        icon: db.icon,
                        cover: db.cover,
                        description: db.description,
                        properties: db.schema
                    }));

                this.databases = databases;
                console.log(`✅ [Cookie Auth] 找到 ${databases.length} 個資料庫`);
                return databases;
            } else {
                console.log('⚠️ [Cookie Auth] 資料庫搜索失敗');
                return [];
            }

        } catch (error) {
            console.error('❌ [Cookie Auth] 搜索資料庫時發生錯誤:', error);
            return [];
        }
    }

    /**
     * 調用 Notion API
     * @param {string} endpoint API 端點
     * @param {Object} payload 請求負載
     * @returns {Promise<Object>} API 響應
     */
    async makeAPICall(endpoint, payload = {}) {
        if (!this.authCookies.token_v2) {
            throw new Error('UNAUTHORIZED');
        }

        const url = `https://www.notion.so${endpoint}`;
        
        // 構建 cookie 字符串
        const cookieString = Object.entries(this.authCookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookieString,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            body: JSON.stringify(payload)
        };

        console.log(`🌐 [Cookie Auth] 調用 API: ${endpoint}`);

        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.errorId) {
                throw new Error(`Notion API Error: ${data.name || data.errorId}`);
            }

            return data;

        } catch (error) {
            console.error(`❌ [Cookie Auth] API 調用失敗 (${endpoint}):`, error);
            throw error;
        }
    }

    /**
     * 檢查登入狀態
     * @returns {boolean} 是否已登入
     */
    checkLoginStatus() {
        return this.isLoggedIn && !!this.authCookies.token_v2;
    }

    /**
     * 提示用戶登入
     * @returns {Promise<boolean>} 是否成功引導用戶登入
     */
    async promptUserLogin() {
        console.log('🔑 [Cookie Auth] 提示用戶登入...');

        try {
            // 打開 Notion 登入頁面
            const tab = await chrome.tabs.create({
                url: 'https://www.notion.so/login',
                active: true
            });

            console.log('✅ [Cookie Auth] 已打開 Notion 登入頁面');

            // 返回 tab ID，讓調用者可以監聽登入完成
            return tab.id;

        } catch (error) {
            console.error('❌ [Cookie Auth] 打開登入頁面失敗:', error);
            return false;
        }
    }

    /**
     * 監聽登入完成
     * @param {number} tabId 登入頁面的 tab ID
     * @returns {Promise<boolean>} 是否登入成功
     */
    async waitForLogin(tabId) {
        return new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                try {
                    // 重新檢測 cookies
                    await this.detectAuthCookies();
                    
                    // 驗證授權
                    const isValid = await this.validateAuth();
                    
                    if (isValid) {
                        clearInterval(checkInterval);
                        await this.getUserInfo();
                        this.isLoggedIn = true;
                        console.log('✅ [Cookie Auth] 用戶登入成功');
                        resolve(true);
                    }
                } catch (error) {
                    console.error('❌ [Cookie Auth] 檢查登入狀態時發生錯誤:', error);
                }
            }, 2000); // 每 2 秒檢查一次

            // 10 分鐘後超時
            setTimeout(() => {
                clearInterval(checkInterval);
                console.log('⏰ [Cookie Auth] 等待登入超時');
                resolve(false);
            }, 10 * 60 * 1000);
        });
    }

    /**
     * 獲取用戶顯示資訊
     * @returns {Object|null} 用戶顯示資訊
     */
    getUserDisplayInfo() {
        if (!this.userInfo) {
            return null;
        }

        return {
            name: this.userInfo.name || '未知用戶',
            email: this.userInfo.email || '',
            avatar: this.userInfo.profilePhoto || '',
            isLoggedIn: this.isLoggedIn
        };
    }

    /**
     * 登出（清除本地狀態）
     */
    logout() {
        console.log('🚪 [Cookie Auth] 用戶登出');
        
        this.authCookies = {};
        this.userInfo = null;
        this.workspaces = [];
        this.databases = [];
        this.isLoggedIn = false;
    }

    /**
     * 獲取授權狀態摘要
     * @returns {Object} 授權狀態摘要
     */
    getAuthStatus() {
        return {
            isLoggedIn: this.isLoggedIn,
            hasTokenCookie: !!this.authCookies.token_v2,
            hasUserInfo: !!this.userInfo,
            workspaceCount: this.workspaces.length,
            databaseCount: this.databases.length,
            userDisplayName: this.userInfo?.name || null
        };
    }
}

// 導出給其他模組使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotionCookieAuth;
}

console.log('📦 [Cookie Auth] Notion Cookie 授權模組載入完成');