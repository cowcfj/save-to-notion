# 🚀 Codeco## 🎉 設置完成！

### ✅ 驗證結果

**CI 測試狀態**: ✅ 成功
- Run ID: 18262620372
- Token: ✅ 已識別
- 上傳狀態: ✅ Processing
- 無 429 錯誤: ✅ 已解決

**Codecov 鏈接**:
- 🔗 **儀表板**: https://app.codecov.io/github/cowcfj/save-to-notion
- 🔗 **GitHub README**: https://github.com/cowcfj/save-to-notion

### 📊 覆蓋率狀態

**當前覆蓋率**: **19.40%** 🎯
- ✅ 成功從 3.02% 提升到 19.40%
- 🎯 接近第一階段目標：20%
- 📈 包含 [`scripts/`](scripts/ ) 和 [`tests/helpers/`](tests/helpers/ ) 的測試覆蓋率

**README 徽章**: ✅ 已正常顯示實際覆蓋率
**Codecov 儀表板**: ✅ 已顯示詳細報告和趨勢圖 已完成的配置

- [x] 更新 GitHub Actions workflow (添加 token 參數)
- [x] 創建 `codecov.yml` 配置文件
- [x] 推送配置到 GitHub
- [x] 修復 README 徽章鏈接
- [x] **添加 CODECOV_TOKEN 到 GitHub Secrets**
- [x] **觸發 CI 測試並成功上傳覆蓋率**

## 🎉 設置完成！

### ✅ 驗證結果

**CI 測試狀態**: ✅ 成功
- Run ID: 18262620372
- Token: ✅ 已識別
- 上傳狀態: ✅ Processing
- 無 429 錯誤: ✅ 已解決

**Codecov 鏈接**:
- 🔗 **儀表板**: https://app.codecov.io/github/cowcfj/save-to-notion
- 🔗 **GitHub README**: https://github.com/cowcfj/save-to-notion

### � 等待數據處理

覆蓋率數據正在 Codecov 處理中（通常需要 1-2 分鐘），完成後：
- README 徽章將顯示實際覆蓋率百分比
- Codecov 儀表板將顯示詳細報告和趨勢圖

---

## 🔲 原待辦步驟（已完成）

### 步驟 1: 訪問 Codecov 並登錄
🔗 **鏈接**: https://codecov.io

1. 點擊 "Log in" 或 "Sign up"
2. 選擇 "Continue with GitHub"
3. 授權 Codecov 訪問你的 GitHub 帳號

### 步驟 2: 添加倉庫
在 Codecov 儀表板中：

1. 點擊左側的 "Not yet setup" 或搜索欄
2. 搜索 `save-to-notion`
3. 點擊倉庫名稱進入設置

### 步驟 3: 獲取 Upload Token
在倉庫頁面中：

1. 點擊 **Settings** 標籤
2. 找到 **"Repository Upload Token"** 部分
3. 點擊 **"Copy"** 按鈕複製 token
   - Token 格式類似：`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### 步驟 4: 添加 Token 到 GitHub Secrets
🔗 **鏈接**: https://github.com/cowcfj/save-to-notion/settings/secrets/actions

1. 點擊 **"New repository secret"** 按鈕
2. 填寫信息：
   - **Name**: `CODECOV_TOKEN`（必須完全一致）
   - **Secret**: 貼上從 Codecov 複製的 token
3. 點擊 **"Add secret"** 保存

### 步驟 5: 觸發 CI 測試
有兩種方式：

**方式 A**: 推送新 commit
```bash
# 任何小改動都會觸發
git commit --allow-empty -m "ci: 觸發 Codecov 測試"
git push origin main
```

**方式 B**: 手動觸發 workflow
1. 訪問: https://github.com/cowcfj/save-to-notion/actions
2. 選擇 "Tests" workflow
3. 點擊 "Run workflow" 按鈕

### 步驟 6: 驗證結果
1. **查看 CI 日誌**:
   - 訪問: https://github.com/cowcfj/save-to-notion/actions
   - 查找最新的運行
   - 展開 "Upload coverage to Codecov" 步驟
   - 確認看到 "✓ Coverage reports uploaded successfully" 而不是 429 錯誤

2. **檢查 Codecov 儀表板**:
   - 訪問: https://codecov.io/gh/cowcfj/save-to-notion
   - 確認能看到覆蓋率數據和圖表

3. **驗證 README 徽章**:
   - 訪問: https://github.com/cowcfj/save-to-notion
   - 確認徽章顯示實際覆蓋率百分比（而不是 "unknown"）

## 🎯 成功標誌

當你完成所有步驟後，應該看到：

✅ **CI 日誌**:
```
[info] Uploading reports
[info] Coverage reports uploaded successfully
```

✅ **Codecov 儀表板**:
- 顯示項目覆蓋率百分比
- 顯示覆蓋率趨勢圖
- 可以查看各文件的詳細覆蓋率

✅ **README 徽章**:
- 顯示類似 "codecov: 7.71%" 的實際數據
- 點擊徽章可跳轉到 Codecov 儀表板

## ⚠️ 常見問題

### Q: Codecov 頁面找不到我的倉庫？
**A**: 確保你已經授權 Codecov 訪問 GitHub 組織/倉庫。可能需要：
1. 安裝 Codecov GitHub App: https://github.com/apps/codecov
2. 在 GitHub 設置中授權對應的倉庫

### Q: Token 添加後還是出現 429 錯誤？
**A**: 檢查：
1. Secret 名稱是否完全正確（`CODECOV_TOKEN`，區分大小寫）
2. Token 是否完整複製（沒有多餘空格）
3. 等待 5-10 分鐘讓 GitHub 更新 secrets

### Q: 徽章顯示 "unknown"？
**A**: 
1. 確認第一次上傳成功完成（可能需要幾分鐘）
2. 刷新 README 頁面（清除緩存）
3. 檢查 Codecov 儀表板是否有數據

## 📚 參考資料

- **完整設置指南**: `CODECOV_SETUP.md`
- **Codecov 文檔**: https://docs.codecov.com
- **GitHub Actions 集成**: https://docs.codecov.com/docs/github-actions-integration

---

**預計時間**: 5-10 分鐘  
**難度**: ⭐⭐☆☆☆ 簡單
