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

**CRITICAL RULE:** 每次 code review 結尾，**MUST** 額外輸出一個 fenced markdown block，將本輪 **MEDIUM / HIGH / CRITICAL** 嚴重度的建議彙整為單一可複製提示詞；**不包含** LOW 嚴重度的建議。

格式要求：

1. 標題為 `### 聚合提示詞 (Aggregated Prompt)`，**MUST** 為整輪 review 的最後一個元素。
2. 開頭指引：要求 AI agent **先逐條評估合理性與副作用**再決定是否實作；不合理者請直接駁回並說明原因。
3. 主體每條 finding 為一編號小節，結構為「檔名:行號 → 問題 → 建議」；**MUST** 通用於 Claude Code 與 Codex，**MUST NOT** 引用 IDE 專屬指令或快捷鍵。
4. 若該輪無 MEDIUM 以上建議，block 內明寫「本輪無 MEDIUM 以上需聚合的建議」，而非省略整個 block。

**Example Schema:**

```markdown
請先逐條審核以下 code review 建議。對每一條，評估合理性與副作用後再決定是否實作；若有不合理或會引入新問題者，請直接回覆原因並駁回該條。

1. `<file_path>:<line>` — <問題摘要>
   建議：<修改方向>

2. `<file_path>:<line>` — <問題摘要>
   建議：<修改方向>

（僅含 MEDIUM / HIGH / CRITICAL；LOW 已於上方逐條呈現）
```

## General Guidelines

- Focus on correctness, efficiency, maintainability, and security.
- Provide actionable, clear, and constructive feedback.
- Point out potential bugs or edge cases that might not be handled.
