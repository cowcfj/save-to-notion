# Gemini Code Assist Code Review Style Guide

## Review Language (語言規範)

**CRITICAL RULE:** All code review comments, summaries, and explanations MUST be written entirely in **Traditional Chinese (繁體中文)**. Do not use English or Simplified Chinese for conversational text or explanations.

(Technical terms, variable names, and code snippets should remain in English, but the surrounding context and feedback must be in Traditional Chinese.)

## AI Agent Prompt Formatting (AI 助手提示詞格式)

**CRITICAL RULE:** When providing code review feedback, you MUST format your suggestions so that the user can directly copy and paste them as a prompt to another AI Coding Agent (like Cursor, GitHub Copilot, or Aider).

Follow these formatting rules for EVERY actionable comment:

1. Start the prompt by asking the AI agent to _review_ the feedback first, not just blindly implement it (e.g., "請幫我審核這個 Code Review 意見", "請問這個建議合理嗎？").
2. Clearly state the **file name**, **line number(s)**, the problem found, and the proposed solution inside the prompt.
3. Use a designated fenced code block (e.g., ` ```markdown ` or ` ```text `) to encapsulate the actual prompt that the user should copy. **DO NOT** use markdown blockquotes (`>`) as they often display poorly in GitHub PR comments.
4. **MUST** insert at least one blank line to separate your preceding review text from the suggested prompt block, so they are not joined.
5. **MUST** 在 fenced block 內以**真實換行字元**輸出多行內容；**MUST NOT** 使用字面跳脫序列（如字串裡的 `\n`、`\r`、`\t`）作為換行/縮排表達。GitHub 不會把字面 `\n` 渲染成換行，輸出後會變成可見的 `\n` 文字串影響閱讀。

**Schema:**

（用一兩句描述問題與影響）

你可以直接複製以下提示詞給你的 AI 助手進行二次確認與修復：

```markdown
請幫我審核這個 Code Review 意見：

**檔案**：`<file_path>` (第 `<line_or_range>` 行)
**建議**：「<具體問題描述與修改方向>」

請先評估這個建議是否合理、有沒有副作用。如果合理，請提供修改方案；如果不合理，請告訴我原因。
```

## Final Aggregated Prompt (聚合提示詞)

**CRITICAL RULE:** 每次 code review **MUST** 產出一個聚合提示詞區塊，將本輪 **MEDIUM / HIGH / CRITICAL** 嚴重度的建議彙整為單一可複製提示詞；**不包含** LOW 嚴重度的建議。

位置與時機：

- **MUST** 將聚合提示詞區塊附加於 Gemini 在本輪生成的**最後一條 inline review comment** 的末尾（Gemini Code Assist 沒有 PR-level review-end hook，最後一條 inline 是唯一可控的終局位置）。
- **MUST** 在聚合區塊**之前**插入一條 `---` 水平分隔線與一個空白行，使其與前面的逐條建議在視覺上明確分離。
- **MUST** 使用次標題 `### 聚合提示詞 (Aggregated Prompt)`。

內容與結構：

- 整個聚合內容 **MUST** 包在單一 ` ```markdown ` fenced code block 內，便於使用者一鍵複製。
- block 內第一段為指引語：要求接收提示詞的 AI agent **先逐條評估合理性與副作用**再決定是否實作，並對不合理者直接駁回並說明原因。
- 緊接指引語為編號清單，每條 finding 一項。每項分兩行：
  - 第一行：``序號. `<檔案路徑>:<行號或範圍>` — <問題摘要>``
  - 第二行（縮排 3 個空白）：`建議：<具體修改方向>`
- 各條 finding 之間 **MUST** 以一個空白行分隔。
- **MUST** 通用於 Claude Code 與 Codex；**MUST NOT** 引用任何 IDE 專屬指令、快捷鍵或產品名稱。

退化情境：

- 若該輪沒有 MEDIUM 以上建議，**MUST** 仍輸出聚合區塊，但 fenced block 內僅包含一行說明「本輪無 MEDIUM 以上需聚合的建議」，**MUST NOT** 整段省略，便於使用者辨別「規則生效但無聚合」與「規則失效」。

格式紀律：

- **MUST** 在 fenced block 內以**真實換行字元**呈現所有換行與縮排；**MUST NOT** 出現字面 `\n`、`\r`、`\t` 等跳脫序列字串。
- **MUST NOT** 把本聚合區塊重複輸出在多個 inline comments；只附加在最後一條。

## General Guidelines

- Focus on correctness, efficiency, maintainability, and security.
- Provide actionable, clear, and constructive feedback.
- Point out potential bugs or edge cases that might not be handled.
