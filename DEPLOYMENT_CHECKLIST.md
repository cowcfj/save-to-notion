# 🚀 v2.5.0 部署檢查清單

## 📋 部署前檢查

### ✅ 代碼完整性
- [x] `scripts/highlighter-v2.js` 已創建並測試
- [x] `scripts/seamless-migration.js` 已創建並測試
- [x] `scripts/script-injector.js` 已更新注入邏輯
- [x] `manifest.json` 版本號已更新到 v2.5.0
- [ ] 所有測試腳本已驗證功能正常

### ✅ 文檔更新
- [x] `CHANGELOG.md` 已添加 v2.5.0 條目
- [x] `README.md` 已更新版本號和功能描述
- [x] `RELEASE_NOTES_v2.5.md` 已創建完整發布說明
- [x] `SEAMLESS_MIGRATION.md` 技術文檔完整
- [x] `HIGHLIGHTER_UPGRADE_PLAN.md` 升級計劃完整

### ✅ 測試驗證
- [ ] 本地加載擴展測試
- [ ] 新標註功能測試
- [ ] 跨元素標註測試
- [ ] 舊標註遷移測試
- [ ] 回滾機制測試
- [ ] 多個網站兼容性測試

### ✅ 兼容性檢查
- [ ] Chrome 105+ 測試通過
- [ ] Edge 105+ 測試通過
- [ ] Safari 17.2+ 測試（如適用）
- [ ] 確認舊版瀏覽器降級處理

---

## 🧪 本地測試步驟

### 1. 加載擴展
```bash
# 1. 打開 Chrome
chrome://extensions/

# 2. 啟用「開發者模式」

# 3. 點擊「載入未封裝項目」

# 4. 選擇項目目錄
/Volumes/WD1TMac/code/notion-chrome
```

### 2. 測試新標註功能
```
測試網站：
1. Wikipedia 文章頁面
2. Medium 博客文章
3. GitHub README 頁面
4. 新聞網站文章

測試步驟：
1. 選擇單段文本 → 右鍵「標註文字」
2. 驗證標註顯示正常
3. 選擇跨段落文本 → 右鍵「標註文字」
4. 驗證跨元素標註正常
5. 刷新頁面
6. 驗證標註自動恢復
```

### 3. 測試遷移功能
```
準備工作：
1. 降級到 v2.4.9
2. 在測試頁面創建多個舊版標註
3. 確認標註保存到存儲

升級測試：
1. 升級到 v2.5.0
2. 訪問之前標註的頁面
3. 打開開發者工具查看控制台

預期日誌：
[階段1遷移] 檢測到 X 個舊標註
[階段1遷移] 創建新標註...
[階段1遷移] 隱藏舊標註...
[階段1遷移] 完成！

4. 刷新頁面，查看階段2日誌
5. 再次刷新，查看階段3日誌
6. 檢查 DOM，確認舊 <span> 標籤已移除
```

### 4. 測試回滾機制
```
模擬失敗場景：
1. 修改 seamless-migration.js 模擬驗證失敗
2. 訪問有舊標註的頁面
3. 檢查控制台是否顯示回滾信息
4. 驗證舊標註是否正常恢復
```

### 5. 性能測試
```
測試場景：
1. 頁面有 20+ 個標註
2. 測試標註創建速度
3. 測試頁面加載時間
4. 測試標註恢復速度

性能指標：
- 標註創建時間 < 200ms
- 頁面加載增加 < 100ms
- 遷移處理時間 < 500ms
```

---

## 📦 打包發布

### 1. 清理臨時文件
```bash
cd /Volumes/WD1TMac/code/notion-chrome

# 刪除測試文件（不打包）
# highlight-test.html
# highlighter-comparison.html
# long-text-test.html
# migration-test-suite.html
# seamless-migration-demo.html
# template-test.html

# 可選：創建 release 目錄
mkdir -p release
```

### 2. 打包核心文件
```
必需文件：
✓ manifest.json
✓ icons/
  ✓ icon16.png
  ✓ icon48.png
  ✓ icon128.png
✓ scripts/
  ✓ background.js
  ✓ content.js
  ✓ utils.js
  ✓ highlighter-v2.js         [新]
  ✓ seamless-migration.js     [新]
  ✓ highlight-restore.js
  ✓ script-injector.js
✓ popup/
  ✓ popup.html
  ✓ popup.js
  ✓ popup.css
✓ options/
  ✓ options.html
  ✓ options.js
  ✓ options.css
✓ lib/
  ✓ Readability.js
✓ help.html

文檔文件（可選）：
- README.md
- CHANGELOG.md
- RELEASE_NOTES_v2.5.md
- PRIVACY.md
- LICENSE

不打包：
✗ highlighter.js            [舊版，備份保留]
✗ *.html (測試文件)
✗ .git/
✗ .DS_Store
✗ node_modules/ (如有)
```

### 3. 創建 ZIP
```bash
# 方法1：手動打包
# 選擇上述文件，右鍵壓縮

# 方法2：使用命令
cd /Volumes/WD1TMac/code/notion-chrome
zip -r notion-smart-clipper-v2.5.0.zip \
  manifest.json \
  icons/ \
  scripts/ \
  popup/ \
  options/ \
  lib/ \
  help.html \
  README.md \
  CHANGELOG.md \
  PRIVACY.md \
  -x "*.html" \
  -x "scripts/highlighter.js" \
  -x ".git/*" \
  -x ".DS_Store"
```

---

## 🌐 Chrome Web Store 發布

### 1. 登錄開發者控制台
```
URL: https://chrome.google.com/webstore/devconsole
登錄你的 Google 開發者賬號
```

### 2. 上傳新版本
```
1. 選擇「Notion Smart Clipper」擴展
2. 點擊「上傳新版本」
3. 上傳 notion-smart-clipper-v2.5.0.zip
4. 等待自動檢查完成
```

### 3. 填寫發布信息
```
版本號：2.5.0

更新說明（中文）：
---
🎉 重大更新：新一代標註系統

✨ 新功能：
• CSS Custom Highlight API - 使用瀏覽器原生標註
• 完美支持跨元素標註 - 不再需要分兩次標註
• 零 DOM 修改 - 不改變網頁結構
• 無痛自動遷移 - 自動升級舊標註

🐛 修復：
• 修復跨元素標註失敗問題
• 修復標註重複保存問題
• 修復與網頁功能衝突問題

📖 詳見：RELEASE_NOTES_v2.5.md
---

更新說明（英文）：
---
🎉 Major Update: Next-Gen Highlighting System

✨ New Features:
• CSS Custom Highlight API - Native browser highlighting
• Perfect cross-element support - No more double-clicking
• Zero DOM modification - Doesn't change webpage structure
• Seamless auto-migration - Automatic upgrade of old highlights

🐛 Fixes:
• Fixed cross-element highlighting failures
• Fixed duplicate highlight saves
• Fixed conflicts with webpage functions

📖 See: RELEASE_NOTES_v2.5.md
---
```

### 4. 設置發布選項
```
可見性：公開
地區：所有地區
類別：生產力
年齡分級：適合所有人
```

### 5. 提交審核
```
1. 檢查所有信息
2. 點擊「提交審核」
3. 等待審核（通常 1-3 個工作日）
```

---

## 📢 發布後工作

### 1. GitHub Release
```bash
# 創建 Git 標籤
git tag -a v2.5.0 -m "v2.5.0: Next-Gen Highlighting System"
git push origin v2.5.0

# 在 GitHub 創建 Release
1. 前往 https://github.com/cowcfj/save-to-notion/releases
2. 點擊「Draft a new release」
3. 選擇標籤：v2.5.0
4. 標題：v2.5.0 - Next-Gen Highlighting System
5. 描述：複製 RELEASE_NOTES_v2.5.md 內容
6. 上傳：notion-smart-clipper-v2.5.0.zip
7. 發布
```

### 2. 用戶通知
```
渠道：
□ 發送更新郵件（如有郵件列表）
□ 在 Product Hunt 發布更新
□ 在社交媒體分享
□ 更新官網（如有）

內容要點：
• 強調新功能優勢
• 說明自動遷移
• 提供支持渠道
```

### 3. 監控反饋
```
監控渠道：
□ Chrome Web Store 評論
□ GitHub Issues
□ 用戶郵件反饋
□ 社交媒體提及

重點關注：
• 遷移是否順利
• 是否有新的 bug
• 性能是否符合預期
• 用戶體驗反饋
```

### 4. 準備熱修復
```
如發現嚴重問題：
1. 立即創建修復分支
2. 修復問題
3. 發布 v2.5.1 熱修復
4. 加急審核（如可能）

常見問題準備：
• 遷移失敗處理
• 瀏覽器兼容性問題
• 性能問題
• 特定網站兼容性
```

---

## ✅ 最終檢查清單

### 發布前必做
- [ ] 所有測試通過
- [ ] 文檔完整更新
- [ ] 打包文件正確
- [ ] 版本號一致
- [ ] 發布說明準備好

### 發布後必做
- [ ] 創建 GitHub Release
- [ ] 監控用戶反饋
- [ ] 準備支持響應
- [ ] 更新項目文檔

---

## 📞 緊急聯繫

如果發現重大問題：
1. **立即暫停推廣**
2. **在 Chrome Web Store 標記問題**（如可能）
3. **準備回滾方案**
4. **通知已更新用戶**

回滾步驟：
```
1. 準備 v2.4.9 版本包
2. 在 Chrome Web Store 上傳舊版本
3. 更新說明中註明暫時回滾
4. 修復問題後重新發布 v2.5.1
```

---

**祝發布順利！** 🚀

最後更新：2025年10月1日
