# Test Data Schema & Fixtures

此目錄存放測試用的靜態資源文件（HTML, Images, large JSON payloads 等）。

## 用途

- **HTML Snippets**: 用於測試 DOM 解析與 Content Script 邏輯 (e.g., `parser_article_content.html`).
- **Large API Responses**: 用於測試大數據量的 API 處理 (e.g., `notion_api/blocks.json`).

## 測試 Fixture 結構參考

如果你在寫 E2E 或 Unit Test 時需要參考記憶體內的假資料結構，請遵循以下 Schema：

### User Fixture

```typescript
type TestUser = {
  id: string;
  email: string;
  preferences: {
    theme: 'light' | 'dark';
    autoSave: boolean;
  };
};
```

### Storage Mock

```javascript
const mockStorage = {
  [`highlights_${url}`]: [
    {
      id: 'uuid-v4',
      text: 'Highlighted Text',
      color: '#ffeb3b',
      xpath: '/HTML/BODY/DIV[1]/P[2]',
    },
  ],
};
```
