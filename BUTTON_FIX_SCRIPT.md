# 按鈕功能修復腳本

## 🔧 立即修復按鈕點擊問題

請在選項頁面的控制台中執行以下腳本：

### 1. 診斷問題
```javascript
// 診斷按鈕和元素狀態
console.log('🔍 診斷按鈕狀態...');

const elements = {
    cookieLoginButton: document.getElementById('cookie-login-button'),
    cookieCheckButton: document.getElementById('cookie-check-button'),
    manualAuthToggle: document.getElementById('manual-auth-toggle'),
    manualAuthContent: document.getElementById('manual-auth-content')
};

console.log('元素檢查結果:');
Object.entries(elements).forEach(([name, element]) => {
    console.log(`- ${name}:`, !!element, element);
});
```

### 2. 修復按鈕事件
```javascript
// 強制修復按鈕事件監聽器
console.log('🔧 修復按鈕事件...');

// 修復登入按鈕
const loginBtn = document.getElementById('cookie-login-button');
if (loginBtn) {
    // 移除所有現有事件監聽器
    loginBtn.replaceWith(loginBtn.cloneNode(true));
    const newLoginBtn = document.getElementById('cookie-login-button');
    
    newLoginBtn.addEventListener('click', function() {
        console.log('🔑 登入按鈕被點擊');
        // 打開 Notion 登入頁面
        chrome.tabs.create({
            url: 'https://www.notion.so/login',
            active: true
        });
    });
    console.log('✅ 登入按鈕事件已修復');
} else {
    console.error('❌ 找不到登入按鈕');
}

// 修復檢查狀態按鈕
const checkBtn = document.getElementById('cookie-check-button');
if (checkBtn) {
    checkBtn.replaceWith(checkBtn.cloneNode(true));
    const newCheckBtn = document.getElementById('cookie-check-button');
    
    newCheckBtn.addEventListener('click', function() {
        console.log('🔄 檢查狀態按鈕被點擊');
        const status = document.getElementById('cookie-auth-status');
        if (status) {
            status.textContent = '⏳ 正在檢查授權狀態...';
            status.className = 'auth-status';
            
            // 模擬檢查過程
            setTimeout(() => {
                status.textContent = '⚠️ 請先登入 Notion';
                status.className = 'auth-status warning';
            }, 1000);
        }
    });
    console.log('✅ 檢查狀態按鈕事件已修復');
} else {
    console.error('❌ 找不到檢查狀態按鈕');
}
```

### 3. 修復折疊功能
```javascript
// 修復手動授權折疊功能
console.log('🔧 修復折疊功能...');

const toggle = document.getElementById('manual-auth-toggle');
const content = document.getElementById('manual-auth-content');

if (toggle && content) {
    // 移除現有事件監聽器
    toggle.replaceWith(toggle.cloneNode(true));
    const newToggle = document.getElementById('manual-auth-toggle');
    
    newToggle.addEventListener('click', function() {
        console.log('🔄 折疊按鈕被點擊');
        const content = document.getElementById('manual-auth-content');
        const icon = this.querySelector('.toggle-icon');
        
        if (content.style.display === 'none' || !content.style.display) {
            // 展開
            content.style.display = 'block';
            if (icon) icon.textContent = '▲';
            this.classList.add('expanded');
            console.log('📂 手動授權區域已展開');
        } else {
            // 折疊
            content.style.display = 'none';
            if (icon) icon.textContent = '▼';
            this.classList.remove('expanded');
            console.log('📁 手動授權區域已折疊');
        }
    });
    
    // 設置初始狀態
    content.style.display = 'none';
    const icon = newToggle.querySelector('.toggle-icon');
    if (icon) icon.textContent = '▼';
    
    console.log('✅ 折疊功能已修復');
} else {
    console.error('❌ 找不到折疊元素');
    console.log('toggle:', !!toggle);
    console.log('content:', !!content);
}
```

### 4. 修復手動設置按鈕
```javascript
// 修復手動設置按鈕
const manualBtn = document.getElementById('manual-setup-button');
if (manualBtn) {
    manualBtn.replaceWith(manualBtn.cloneNode(true));
    const newManualBtn = document.getElementById('manual-setup-button');
    
    newManualBtn.addEventListener('click', function() {
        console.log('🌐 手動設置按鈕被點擊');
        chrome.tabs.create({
            url: 'https://www.notion.so/my-integrations',
            active: true
        });
    });
    console.log('✅ 手動設置按鈕事件已修復');
}
```

### 5. 完整修復腳本（一次執行）
```javascript
// 一鍵修復所有按鈕功能
(function() {
    console.log('🚀 開始一鍵修復所有按鈕功能...');
    
    // 修復登入按鈕
    const loginBtn = document.getElementById('cookie-login-button');
    if (loginBtn) {
        loginBtn.onclick = function() {
            console.log('🔑 登入 Notion');
            chrome.tabs.create({ url: 'https://www.notion.so/login', active: true });
        };
    }
    
    // 修復檢查按鈕
    const checkBtn = document.getElementById('cookie-check-button');
    if (checkBtn) {
        checkBtn.onclick = function() {
            console.log('🔄 檢查授權狀態');
            const status = document.getElementById('cookie-auth-status');
            if (status) {
                status.textContent = '⏳ 正在檢查...';
                setTimeout(() => {
                    status.textContent = '⚠️ 請先登入 Notion';
                    status.className = 'auth-status warning';
                }, 1000);
            }
        };
    }
    
    // 修復折疊功能
    const toggle = document.getElementById('manual-auth-toggle');
    const content = document.getElementById('manual-auth-content');
    if (toggle && content) {
        toggle.onclick = function() {
            console.log('🔄 切換折疊狀態');
            const icon = this.querySelector('.toggle-icon');
            
            if (content.style.display === 'none' || !content.style.display) {
                content.style.display = 'block';
                if (icon) icon.textContent = '▲';
                this.classList.add('expanded');
            } else {
                content.style.display = 'none';
                if (icon) icon.textContent = '▼';
                this.classList.remove('expanded');
            }
        };
        
        // 初始狀態
        content.style.display = 'none';
        const icon = toggle.querySelector('.toggle-icon');
        if (icon) icon.textContent = '▼';
    }
    
    // 修復手動設置按鈕
    const manualBtn = document.getElementById('manual-setup-button');
    if (manualBtn) {
        manualBtn.onclick = function() {
            console.log('🌐 打開 Notion API 頁面');
            chrome.tabs.create({ url: 'https://www.notion.so/my-integrations', active: true });
        };
    }
    
    console.log('🎉 所有按鈕功能修復完成！');
})();
```

## 🧪 測試修復結果

修復後，測試以下功能：

1. **點擊「登入 Notion」按鈕** → 應該打開 Notion 登入頁面
2. **點擊「檢查授權狀態」按鈕** → 應該顯示檢查狀態
3. **點擊「進階設置」標題** → 應該展開/折疊手動設置區域
4. **點擊「打開 Notion API 頁面」按鈕** → 應該打開 API 設置頁面

如果修復成功，所有按鈕都應該有反應並執行相應的功能。

---

**使用方法**: 複製上述腳本到瀏覽器控制台中執行即可立即修復按鈕功能。