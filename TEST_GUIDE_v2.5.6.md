# 🧪 v2.5.6 測試指南

## 🚀 快速測試步驟

### 1. 重新加載擴展
```
1. 打開 Chrome 瀏覽器
2. 進入 chrome://extensions/
3. 找到 "Save to Notion (Smart Clipper)"
4. 點擊「重新載入」按鈕 🔄
```

### 2. 測試封面圖提取
```
1. 訪問測試網站：https://faroutmagazine.co.uk/hitchcock-blonde-wasnt-interested-being-muse/
2. 開啟開發者工具（F12）
3. 切換到 Console 標籤
4. 點擊擴展圖標 → 「💾 Save Page」
5. 檢查 Console 輸出
```

### 3. 預期結果

#### ✅ Console 輸出應該包含：
```
=== v2.5.6: Featured Image Collection ===
🎯 Attempting to collect featured/hero image...
✓ Found featured image via selector: [某個選擇器]
  Image URL: https://cdn1.faroutmagazine.co.uk/uploads/1/2025/08/Alfred-Hitchcock-Director-1955-Far-Out-Magazine.jpg
✓ Featured image added as first block
```

#### ✅ 不應該出現的錯誤：
```
❌ Uncaught SyntaxError: Identifier 'StorageUtil' has already been declared
```

如果看到 `⚠️ StorageUtil 已存在，跳過重複定義`，這是**正常**的，說明防重複注入機制正常工作。

### 4. 檢查 Notion 頁面
```
1. 前往你的 Notion 工作區
2. 找到剛保存的頁面
3. 檢查第一張圖片是否為封面圖（Alfred Hitchcock）
4. 檢查是否有重複的圖片
```

---

## 🔍 詳細測試場景

### 場景 1: 新聞網站封面圖
**測試網站：**
- faroutmagazine.co.uk
- BBC News
- The Guardian
- CNN

**預期：**
- ✅ 封面圖作為第一張圖片
- ✅ 文章內其他圖片正常顯示
- ✅ 無重複圖片

### 場景 2: WordPress 博客
**測試網站：**
- 任何 WordPress 博客
- 尋找有 Featured Image 的文章

**預期：**
- ✅ Featured Image 被正確提取
- ✅ 使用 .wp-post-image 選擇器

### 場景 3: 多次加載同一頁面
**測試步驟：**
1. 訪問任意網頁
2. 刷新頁面（F5）3-5 次
3. 檢查 Console

**預期：**
- ✅ 無 StorageUtil 重複聲明錯誤
- ✅ 可能看到「⚠️ utils.js 已經加載」的警告（正常）

### 場景 4: 無封面圖的網頁
**測試網站：**
- 簡單的文章頁面
- 沒有專門封面圖的網頁

**預期：**
- ✅ Console 顯示：`✗ No featured image found`
- ✅ 正常收集文章內的圖片
- ✅ 不會出錯或崩潰

---

## 🐛 常見問題排查

### 問題 1: 仍然出現 StorageUtil 錯誤
**原因：** 擴展未正確重新加載

**解決：**
```
1. chrome://extensions/
2. 找到擴展
3. 點擊「移除」
4. 重新加載擴展文件夾
```

### 問題 2: 封面圖沒有被提取
**檢查：**
1. 開啟 Console 查看日誌
2. 確認是否執行了 `collectFeaturedImage()`
3. 檢查是否有 `✓ Found featured image` 的日誌

**可能原因：**
- 網站使用了非標準的封面圖容器
- 封面圖在 iframe 中
- 封面圖被 lazy loading 延遲加載

**反饋：**
- 提供網站 URL
- 提供 Console 日誌截圖
- 描述封面圖的 HTML 結構

### 問題 3: 圖片重複
**檢查：**
1. Console 中是否有 `✗ Skipped duplicate featured image` 日誌
2. 如果沒有，說明去重邏輯沒有生效

**反饋：**
- 提供重複圖片的 URL
- 提供 Console 日誌

---

## 📊 測試檢查清單

### 功能測試
- [ ] 封面圖正確提取（faroutmagazine.co.uk）
- [ ] 封面圖作為第一張圖片
- [ ] 無重複圖片
- [ ] 文章內圖片正常收集
- [ ] WordPress Featured Image 正確提取
- [ ] 無封面圖的網頁正常工作

### 錯誤修復驗證
- [ ] ✅ 無 StorageUtil 重複聲明錯誤
- [ ] ✅ 多次刷新頁面無錯誤
- [ ] ✅ Console 日誌清晰完整

### 性能測試
- [ ] 頁面保存速度正常
- [ ] 無明顯卡頓
- [ ] Memory usage 正常

---

## 📝 測試報告模板

```markdown
**測試環境：**
- Chrome 版本：___
- 擴展版本：v2.5.6
- 操作系統：___

**測試網站：**
- URL：___

**測試結果：**
- [ ] 封面圖提取：✅ / ❌
- [ ] 無重複圖片：✅ / ❌
- [ ] 無錯誤信息：✅ / ❌

**Console 日誌：**
```
[貼上關鍵日誌]
```

**截圖：**
[如果有問題，請附上截圖]

**其他備註：**
[任何額外的觀察或問題]
```

---

## 🎓 調試技巧

### 1. 查看封面圖選擇器匹配
在 Console 中執行：
```javascript
const selectors = [
    '.featured-image img',
    '.hero-image img',
    '.cover-image img',
    // ... 其他選擇器
];

selectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) console.log('✓ Found:', sel, el);
});
```

### 2. 手動測試圖片 URL
```javascript
const testUrl = 'https://cdn1.faroutmagazine.co.uk/uploads/1/2025/08/Alfred-Hitchcock-Director-1955-Far-Out-Magazine.jpg';

// 檢查是否為有效圖片 URL
console.log('Valid:', /\.(jpg|jpeg|png|gif|webp)$/i.test(testUrl));
```

### 3. 檢查 StorageUtil 是否已加載
```javascript
console.log('StorageUtil:', typeof window.StorageUtil);
console.log('normalizeUrl:', typeof window.normalizeUrl);
console.log('Logger:', typeof window.Logger);
```

---

**測試愉快！🎉**

如有任何問題，請隨時反饋！
