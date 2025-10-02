# v2.5.7 測試指南 🧪

**版本：** v2.5.7  
**測試重點：** 作者頭像/Logo 過濾機制  
**測試日期：** 2025年10月2日

---

## 📋 測試概覽

### 主要測試目標
1. ✅ 驗證 Medium 文章作者 logo 不再被誤識別為封面圖
2. ✅ 確認真正的文章封面圖能被正確提取
3. ✅ 確保 WordPress、BBC News 等網站不受影響
4. ✅ 測試不同尺寸和形狀的頭像過濾

---

## 🎯 測試場景

### 場景 1：Medium 文章（有作者頭像）⭐⭐⭐⭐⭐

#### 測試目的
驗證作者 logo/頭像不會被誤識別為封面圖

#### 測試網站
- **URL 1：** https://medium.com/blog/partner-program-update-starting-october-1-were-rewarding-external-traffic-15cb28f75bc9
- **URL 2：** https://medium.com/@username/any-article（任何有作者頭像的文章）

#### 測試步驟
1. 打開 Medium 文章
2. 打開瀏覽器控制台（F12）
3. 點擊「保存到 Notion」按鈕
4. 觀察控制台日誌

#### 預期結果（v2.5.7）
**控制台日誌：**
```
🎯 Attempting to collect featured/hero image...
✗ Skipped author avatar/logo (keyword: avatar)
  或
✗ Skipped small image (possible avatar): [寬度]x[高度]px
  或
✗ Skipped circular/square image (likely avatar): [寬度]x[高度]px, border-radius: [值]
  然後
✓ Found featured image via selector: [選擇器名稱]
  Image URL: [真正的封面圖 URL]
```

**Notion 頁面：**
- ✅ 頁面頂部是**真正的文章封面圖**
- ✅ **不是** Medium Staff 或作者的 logo/頭像
- ✅ 封面圖是文章開頭的大圖

#### 對比結果（v2.5.6 vs v2.5.7）
| 項目 | v2.5.6（修復前） | v2.5.7（修復後） |
|------|------------------|------------------|
| 提取的圖片 | 作者 logo ❌ | 文章封面圖 ✅ |
| Notion 頁面頂部 | Medium Staff logo | 真正的封面圖 |
| 控制台日誌 | 無頭像過濾日誌 | 有頭像過濾日誌 |

---

### 場景 2：WordPress 網站（回歸測試）⭐⭐⭐⭐⭐

#### 測試目的
確保 v2.5.6 的功能不受 v2.5.7 影響

#### 測試網站
- **URL：** https://faroutmagazine.co.uk/the-rolling-stones-song-written-marianne-faithfull/

#### 測試步驟
1. 打開 WordPress 文章
2. 打開瀏覽器控制台（F12）
3. 點擊「保存到 Notion」按鈕
4. 觀察控制台日誌

#### 預期結果
**控制台日誌：**
```
🎯 Attempting to collect featured/hero image...
✓ Found featured image via selector: .wp-post-image
  Image URL: [封面圖 URL]
```

**Notion 頁面：**
- ✅ 頁面頂部有封面圖
- ✅ 封面圖是文章標題上方的大圖
- ✅ 功能與 v2.5.6 完全相同

#### 驗證點
- [ ] 封面圖正確提取
- [ ] 使用 `.wp-post-image` 選擇器
- [ ] 無錯誤日誌
- [ ] 與 v2.5.6 行為一致

---

### 場景 3：BBC News（回歸測試）⭐⭐⭐⭐

#### 測試目的
確保新聞網站不受影響

#### 測試網站
- **URL：** https://www.bbc.com/news/articles/*（任何 BBC 新聞文章）

#### 測試步驟
1. 打開 BBC News 文章
2. 點擊「保存到 Notion」按鈕
3. 檢查 Notion 頁面

#### 預期結果
- ✅ 圖片能正常提取
- ✅ 功能與 v2.5.6 相同
- 🟡 可能識別文章內圖片為封面圖（已知小問題）

---

### 場景 4：頭像尺寸測試⭐⭐⭐

#### 測試目的
驗證不同尺寸的頭像能被正確過濾

#### 測試案例

##### 案例 4.1：小頭像（< 200x200px）
- **預期：** 被過濾 ✅
- **日誌：** `✗ Skipped small image (possible avatar): [寬]x[高]px`

##### 案例 4.2：中等頭像（200-400px，圓形）
- **預期：** 被過濾 ✅
- **日誌：** `✗ Skipped circular/square image (likely avatar)`

##### 案例 4.3：大頭像（> 400px，圓形）
- **預期：** 可能不被過濾 🟡
- **原因：** 超出頭像常見尺寸範圍
- **影響：** 極少見，實際影響小

##### 案例 4.4：正常封面圖（> 400px，矩形）
- **預期：** 不被過濾 ✅
- **日誌：** `✓ Found featured image...`

---

### 場景 5：關鍵詞檢測測試⭐⭐⭐⭐

#### 測試目的
驗證關鍵詞檢測邏輯

#### 測試案例

##### 案例 5.1：圖片 class 包含 'avatar'
```html
<img class="user-avatar" src="..." />
```
- **預期：** 被過濾 ✅
- **日誌：** `✗ Skipped author avatar/logo (keyword: avatar)`

##### 案例 5.2：父元素 class 包含 'author'
```html
<div class="author-info">
    <img src="..." />
</div>
```
- **預期：** 被過濾 ✅
- **日誌：** `✗ Skipped author avatar/logo (parent 1 has keyword: author)`

##### 案例 5.3：Alt 屬性包含 'profile'
```html
<img src="..." alt="User profile photo" />
```
- **預期：** 被過濾 ✅
- **日誌：** `✗ Skipped author avatar/logo (keyword: profile)`

##### 案例 5.4：無相關關鍵詞
```html
<img class="article-cover" src="..." />
```
- **預期：** 不被過濾 ✅
- **日誌：** `✓ Found featured image...`

---

## 🔍 調試技巧

### 查看完整日誌
1. 打開控制台（F12）
2. 切換到「控制台」標籤
3. 過濾日誌：輸入 `featured` 或 `avatar`

### 關鍵日誌標記
- `🎯 Attempting to collect featured/hero image...` - 開始搜索封面圖
- `✗ Skipped author avatar/logo` - 過濾頭像
- `✗ Skipped small image` - 過濾小圖
- `✗ Skipped circular/square image` - 過濾圓形/正方形小圖
- `✓ Found featured image` - 找到封面圖
- `✗ No featured image found` - 沒找到封面圖

### 檢查圖片屬性（開發者工具）
在控制台中檢查圖片：
```javascript
// 找到圖片元素
const img = document.querySelector('img.some-class');

// 檢查屬性
console.log('Class:', img.className);
console.log('ID:', img.id);
console.log('Alt:', img.alt);
console.log('Size:', img.naturalWidth, 'x', img.naturalHeight);
console.log('Style:', window.getComputedStyle(img).borderRadius);

// 檢查父元素
console.log('Parent 1:', img.parentElement.className);
console.log('Parent 2:', img.parentElement.parentElement.className);
```

---

## ✅ 測試檢查清單

### 基礎功能測試
- [ ] Medium 文章：作者 logo 被過濾
- [ ] Medium 文章：真正封面圖被提取
- [ ] WordPress：封面圖正常提取（回歸測試）
- [ ] BBC News：圖片正常提取（回歸測試）

### 頭像過濾測試
- [ ] 小頭像（< 200x200px）被過濾
- [ ] 圓形頭像被過濾
- [ ] 正方形小頭像被過濾
- [ ] 大封面圖不被過濾

### 關鍵詞檢測測試
- [ ] class 包含 'avatar' 被過濾
- [ ] class 包含 'profile' 被過濾
- [ ] class 包含 'author' 被過濾
- [ ] id 包含頭像關鍵詞被過濾
- [ ] alt 包含頭像關鍵詞被過濾
- [ ] 父元素包含頭像關鍵詞被過濾

### 日誌驗證
- [ ] 控制台有 `✗ Skipped author avatar/logo` 日誌
- [ ] 日誌說明過濾原因（keyword, size, shape）
- [ ] 最終找到真正的封面圖

---

## 📊 測試報告模板

### 測試環境
- **擴展版本：** v2.5.7
- **瀏覽器：** Chrome / Edge / Firefox
- **瀏覽器版本：** [版本號]
- **操作系統：** macOS / Windows / Linux
- **測試日期：** [日期]

### 測試結果

#### 場景 1：Medium 文章
- **測試網站：** [URL]
- **結果：** ✅ 通過 / ❌ 失敗
- **作者 logo：** ✅ 被過濾 / ❌ 未被過濾
- **封面圖：** ✅ 正確提取 / ❌ 未提取
- **控制台日誌：**
  ```
  [貼上日誌]
  ```

#### 場景 2：WordPress 網站
- **測試網站：** [URL]
- **結果：** ✅ 通過 / ❌ 失敗
- **封面圖：** ✅ 正確提取 / ❌ 未提取
- **與 v2.5.6 對比：** ✅ 一致 / ❌ 不一致

#### 場景 3：BBC News
- **測試網站：** [URL]
- **結果：** ✅ 通過 / ❌ 失敗
- **圖片：** ✅ 正常提取 / ❌ 未提取

### 發現的問題
1. [問題描述]
2. [問題描述]

### 建議
1. [改進建議]
2. [改進建議]

---

## 🚨 已知問題

### 問題 1：非常大的頭像可能不被過濾
- **描述：** > 400x400px 的頭像可能不會被形狀檢測捕獲
- **影響：** 極小（很少網站使用這麼大的頭像）
- **解決方案：** 如遇到，可在 GitHub 報告，我們會添加特殊處理

### 問題 2：非圓形、非正方形的大頭像
- **描述：** 矩形大頭像可能不被過濾
- **影響：** 較小（關鍵詞檢測通常能捕獲）
- **解決方案：** 依賴關鍵詞檢測

---

## 📞 支援和反饋

### 如果測試失敗
1. **收集信息：**
   - 網站 URL
   - 控制台完整日誌
   - 截圖（Notion 頁面 + 原始網頁）

2. **報告問題：**
   - GitHub Issues
   - 提供上述信息

3. **臨時解決方案：**
   - 手動在 Notion 中更改封面圖
   - 或暫時回退到 v2.5.6

---

*感謝您的測試！您的反饋對改進擴展至關重要。* 🙏
