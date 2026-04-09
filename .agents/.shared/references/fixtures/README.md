# Test Data Schema & Fixtures

此目錄存放提供給 Agent 參考的靜態資料範例與 schema 說明。
真正會被自動化測試直接讀取的 fixture，應放在 `tests/fixtures/`。

## 用途

- **Reference Examples**: 提供 Agent 理解資料形狀與 fixture 類型的參考。
- **Large API Responses**: 可保留供 Agent 參考的 Notion API 結構範例 (e.g., `notion_api/blocks.json`).

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
