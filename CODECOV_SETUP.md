# Codecov 設置指南

## 📋 問題說明

當前 GitHub Actions CI 在上傳測試覆蓋率到 Codecov 時遇到速率限制錯誤（429），因為沒有使用 repository upload token。

## 🔧 解決步驟

### 1. 獲取 Codecov Token

#### 方法 A：通過 Codecov 網站（首次設置）

1. **訪問 Codecov**: https://codecov.io
2. **登錄**: 使用 GitHub 帳號登錄
3. **添加倉庫**: 
   - 點擊 "Add new repository"
   - 搜索並選擇 `cowcfj/save-to-notion`
   - 授權 Codecov 訪問倉庫
4. **獲取 Token**:
   - 進入倉庫設置頁面
   - 找到 "Repository Upload Token"
   - 複製 token（格式類似：`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）

#### 方法 B：通過 GitHub App（推薦）

1. **安裝 Codecov GitHub App**: https://github.com/apps/codecov
2. **授權倉庫訪問**
3. Codecov 會自動檢測你的倉庫

### 2. 添加 Token 到 GitHub Secrets

1. **進入 GitHub 倉庫設置**:
   - 訪問: https://github.com/cowcfj/save-to-notion/settings/secrets/actions

2. **添加新 Secret**:
   - 點擊 "New repository secret"
   - **Name**: `CODECOV_TOKEN`
   - **Value**: 貼上從 Codecov 複製的 token
   - 點擊 "Add secret"

### 3. 更新 GitHub Actions 配置

修改 `.github/workflows/test.yml`，添加 token 參數：

```yaml
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  if: matrix.node-version == '20.x'
  with:
    token: ${{ secrets.CODECOV_TOKEN }}  # 添加這一行
    files: ./coverage/lcov.info
    flags: unittests
    name: codecov-umbrella
    fail_ci_if_error: false
```

### 4. 驗證設置

1. **推送更改**後，GitHub Actions 會自動運行
2. **檢查 CI 日誌**，確認 Codecov 上傳成功
3. **訪問 Codecov 儀表板**: https://codecov.io/gh/cowcfj/save-to-notion
4. **確認徽章**在 README.md 中正常顯示

## 📊 當前配置狀態

### ✅ 已配置
- [x] GitHub Actions workflow (`.github/workflows/test.yml`)
- [x] Jest 覆蓋率配置 (`jest.config.js`)
- [x] npm 腳本 (`package.json`: `test:coverage`)
- [x] Codecov action 步驟

### ❌ 待配置
- [ ] CODECOV_TOKEN GitHub Secret
- [ ] Codecov 徽章驗證

## 🔍 故障排除

### 問題：速率限制錯誤（429）
**症狀**: 
```
Error: There was an error fetching the storage URL during POST: 429
Rate limit reached. Please upload with the Codecov repository upload token
```

**原因**: 未使用 repository upload token

**解決**: 按照上述步驟添加 `CODECOV_TOKEN`

### 問題：徽章顯示 "unknown"
**可能原因**:
1. 第一次上傳尚未完成
2. Token 配置錯誤
3. 覆蓋率報告未生成

**解決**:
1. 確認 CI 成功運行
2. 檢查 Codecov 儀表板
3. 等待幾分鐘讓數據同步

### 問題：覆蓋率為 0%
**可能原因**:
1. `lcov.info` 文件路徑錯誤
2. Jest 覆蓋率配置問題

**解決**:
```bash
# 本地測試
npm run test:coverage

# 檢查覆蓋率報告
ls -la coverage/
cat coverage/lcov.info | head -20
```

## 📚 相關文檔

- [Codecov Documentation](https://docs.codecov.com)
- [GitHub Actions Integration](https://docs.codecov.com/docs/github-actions-integration)
- [Codecov Action](https://github.com/codecov/codecov-action)

## 🎯 預期結果

配置完成後：
- ✅ CI 成功上傳覆蓋率到 Codecov
- ✅ Codecov 徽章在 README 中顯示實時覆蓋率
- ✅ 可以在 Codecov 儀表板查看詳細報告
- ✅ 每次 push 自動更新覆蓋率數據

---

**最後更新**: 2025-10-06
