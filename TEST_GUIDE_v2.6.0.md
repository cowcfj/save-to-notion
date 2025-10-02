# v2.6.0 測試指南 🧪

**版本：** v2.6.0  
**測試重點：** 網站 Icon 自動提取功能  
**測試日期：** 2025年10月2日

---

## 📋 測試概覽

### 主要測試目標
1. ✅ 驗證網站 Icon 能正確提取
2. ✅ 確認 Icon 在 Notion 頁面正確顯示
3. ✅ 測試不同網站的 Icon 類型支持
4. ✅ 驗證錯誤處理機制
5. ✅ 確保與封面圖功能不衝突

---

## 🎯 測試場景

### 場景 1：標準網站 Icon 提取（⭐⭐⭐⭐⭐）

#### 測試目的
驗證常見網站的 Icon 能正確提取和顯示

#### 測試網站

**1.1 WordPress 網站**
- **URL：** https://faroutmagazine.co.uk/the-rolling-stones-song-written-marianne-faithfull/
- **預期 Icon 類型：** Apple Touch Icon 或 Favicon

**1.2 Medium 文章**
- **URL：** https://medium.com/（任何文章）
- **預期 Icon 類型：** Apple Touch Icon（Medium 的 M logo）

**1.3 BBC News**
- **URL：** https://www.bbc.com/news/articles/*
- **預期 Icon 類型：** Standard Favicon（BBC logo）

**1.4 GitHub**
- **URL：** https://github.com/（任何頁面）
- **預期 Icon 類型：** SVG Favicon（GitHub logo）

#### 測試步驟
1. 打開測試網站
2. 打開瀏覽器控制台（F12）
3. 點擊「保存到 Notion」按鈕
4. 觀察控制台日誌
5. 在 Notion 中檢查頁面

#### 預期結果

**控制台日誌：**
```
🎯 Attempting to collect site icon/favicon...
✓ Found site icon via link[rel="apple-touch-icon"]: https://example.com/icon.png
  或
✓ Found site icon via link[rel="icon"]: https://example.com/favicon.ico
  或
✓ Falling back to default favicon: https://example.com/favicon.ico
```

**Notion 頁面：**
- ✅ 頁面標題旁顯示網站 Icon
- ✅ 在數據庫列表中也能看到 Icon
- ✅ Icon 清晰可辨識

#### 驗證點
- [ ] 控制台有 Icon 提取日誌
- [ ] 日誌顯示找到的 Icon URL
- [ ] Notion 頁面標題旁有 Icon
- [ ] Icon 是該網站的正確 logo
- [ ] Icon 尺寸和顯示效果良好

---

### 場景 2：Icon 優先級測試（⭐⭐⭐⭐）

#### 測試目的
驗證 Icon 提取的優先級邏輯

#### 測試方法
使用瀏覽器開發者工具檢查不同網站的 HTML：

**2.1 有 Apple Touch Icon 的網站**
```html
<link rel="apple-touch-icon" href="/apple-icon.png">
<link rel="icon" href="/favicon.ico">
```
- **預期：** 提取 apple-icon.png（優先級更高）

**2.2 只有標準 Favicon**
```html
<link rel="icon" href="/favicon.ico">
```
- **預期：** 提取 favicon.ico

**2.3 只有 Shortcut Icon**
```html
<link rel="shortcut icon" href="/favicon.ico">
```
- **預期：** 提取 favicon.ico

**2.4 沒有任何 Icon 標籤**
- **預期：** 回退到 /favicon.ico

#### 驗證方法
查看控制台日誌，確認使用的選擇器：
```
✓ Found site icon via link[rel="apple-touch-icon"]: ...
✓ Found site icon via link[rel="icon"]: ...
✓ Found site icon via link[rel="shortcut icon"]: ...
✓ Falling back to default favicon: ...
```

---

### 場景 3：與封面圖功能集成（⭐⭐⭐⭐⭐）

#### 測試目的
確保 Icon 和封面圖功能不衝突

#### 測試網站
- **WordPress**：faroutmagazine.co.uk（有封面圖）
- **Medium**：有作者頭像和文章圖片

#### 測試步驟
1. 保存有封面圖的文章
2. 檢查 Notion 頁面

#### 預期結果
**Notion 頁面結構：**
```
[網站 Icon] 文章標題
─────────────────
[封面圖]
─────────────────
文章內容...
```

- ✅ Icon 顯示在標題旁（小圖標）
- ✅ 封面圖顯示在頁面頂部（大圖片）
- ✅ 兩者不衝突，分別顯示
- ✅ 作者頭像不會被誤識別

#### 驗證點
- [ ] Icon 和封面圖都正確顯示
- [ ] Icon 在標題旁，封面圖在內容頂部
- [ ] 沒有重複的圖片
- [ ] 作者頭像被正確過濾

---

### 場景 4：錯誤處理測試（⭐⭐⭐⭐）

#### 測試目的
驗證 Icon 提取失敗不影響頁面保存

#### 測試案例

**4.1 無 Icon 的網站**
- 找一個沒有 favicon 的簡單網站
- **預期：** 頁面正常保存，無 Icon

**4.2 相對路徑 Icon**
網站使用相對路徑：`<link rel="icon" href="images/icon.png">`
- **預期：** 自動轉換為絕對路徑

**4.3 無效的 Icon URL**
網站的 Icon URL 損壞或不存在
- **預期：** 靜默失敗，頁面正常保存

#### 預期行為
- ✅ 控制台有錯誤警告（如果有）
- ✅ 頁面仍然正常保存到 Notion
- ✅ 沒有阻斷性錯誤
- ✅ 用戶不會看到錯誤提示

---

### 場景 5：不同 Icon 格式測試（⭐⭐⭐）

#### 測試目的
驗證對不同圖片格式的支持

#### 測試案例

**5.1 PNG Icon**
- 最常見的格式
- **預期：** ✅ 正常顯示

**5.2 ICO Icon**
- 傳統 favicon 格式
- **預期：** ✅ 正常顯示

**5.3 SVG Icon**
- 現代矢量格式
- **預期：** ✅ 正常顯示（取決於 Notion 支持）

**5.4 JPG Icon**
- 較少見
- **預期：** ✅ 正常顯示

#### 測試網站推薦
- PNG: WordPress 網站
- ICO: 老舊網站
- SVG: GitHub, 現代網站

---

## 🔍 調試技巧

### 查看完整日誌
1. 打開控制台（F12）
2. 切換到「控制台」標籤
3. 過濾日誌：輸入 `icon` 或 `favicon`

### 關鍵日誌標記
- `🎯 Attempting to collect site icon` - 開始提取 Icon
- `✓ Found site icon via` - 找到 Icon
- `✓ Falling back to default favicon` - 使用默認 Icon
- `✗ No site icon found` - 沒找到 Icon
- `✓ Setting page icon` - 設置 Notion 頁面 Icon

### 檢查 HTML（開發者工具）
在控制台中檢查網站的 Icon 標籤：
```javascript
// 檢查所有 Icon 相關標籤
document.querySelectorAll('link[rel*="icon"]')

// 檢查 Apple Touch Icon
document.querySelector('link[rel="apple-touch-icon"]')

// 檢查標準 Favicon
document.querySelector('link[rel="icon"]')
```

### 檢查 Notion API 請求（高級）
1. 打開「網絡」標籤
2. 過濾：`notion.com/v1/pages`
3. 查看請求 Payload
4. 確認 `icon` 屬性存在

---

## ✅ 測試檢查清單

### 基礎功能測試
- [ ] WordPress：Icon 正確提取和顯示
- [ ] Medium：Icon 正確提取和顯示
- [ ] BBC News：Icon 正確提取和顯示
- [ ] GitHub：Icon 正確提取和顯示

### Icon 優先級測試
- [ ] Apple Touch Icon 優先被選擇
- [ ] 標準 Favicon 作為備選
- [ ] Shortcut Icon 作為備選
- [ ] 回退到 /favicon.ico

### 集成測試
- [ ] Icon 和封面圖同時正確顯示
- [ ] 不與作者頭像過濾衝突
- [ ] 不影響文章內容提取

### 錯誤處理測試
- [ ] 無 Icon 網站正常保存
- [ ] 相對路徑正確轉換
- [ ] 無效 URL 靜默失敗
- [ ] 沒有阻斷性錯誤

### 格式支持測試
- [ ] PNG Icon 正常顯示
- [ ] ICO Icon 正常顯示
- [ ] SVG Icon 正常顯示（如支持）

---

## 📊 測試報告模板

### 測試環境
- **擴展版本：** v2.6.0
- **瀏覽器：** Chrome / Edge
- **瀏覽器版本：** [版本號]
- **測試日期：** [日期]

### 測試結果

#### 場景 1：標準網站
| 網站 | Icon 類型 | 提取結果 | 顯示效果 |
|------|----------|----------|----------|
| WordPress | Apple Touch Icon | ✅ / ❌ | ✅ / ❌ |
| Medium | Apple Touch Icon | ✅ / ❌ | ✅ / ❌ |
| BBC News | Standard Favicon | ✅ / ❌ | ✅ / ❌ |
| GitHub | SVG Favicon | ✅ / ❌ | ✅ / ❌ |

#### 場景 2：Icon 優先級
- **Apple Touch Icon 優先：** ✅ / ❌
- **標準 Favicon 備選：** ✅ / ❌
- **默認回退：** ✅ / ❌

#### 場景 3：與封面圖集成
- **Icon 正確顯示：** ✅ / ❌
- **封面圖正確顯示：** ✅ / ❌
- **無衝突：** ✅ / ❌

#### 場景 4：錯誤處理
- **無 Icon 網站：** ✅ / ❌
- **相對路徑：** ✅ / ❌
- **無效 URL：** ✅ / ❌

### 發現的問題
1. [問題描述]
2. [問題描述]

### 改進建議
1. [建議]
2. [建議]

---

## 🚨 已知限制

### Notion API 限制
- 某些域名的圖片可能被 Notion 拒絕
- 圖片需要公開可訪問（無需認證）
- 非常小的 Icon（< 16x16）可能顯示模糊

### 瀏覽器限制
- 跨域圖片無法預先驗證
- 依賴 Notion 的圖片處理

### 網站特殊情況
- 動態生成的 Icon 可能無法提取
- 需要登錄才能訪問的 Icon 可能失效
- CDN 限制的圖片可能有時效性

---

## 📞 支援和反饋

### 測試問題報告
如果發現問題，請報告以下信息：
1. **網站 URL**
2. **控制台完整日誌**
3. **Notion 頁面截圖**
4. **瀏覽器和版本**

### GitHub Issues
- 報告 bug
- 提供反饋
- 建議改進

---

*感謝您的測試！您的反饋對改進功能至關重要。* 🙏
