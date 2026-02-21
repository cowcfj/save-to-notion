# Gemini Code Assist Code Review Style Guide

## Review Language (語言規範)

**CRITICAL RULE:** All code review comments, summaries, and explanations MUST be written entirely in **Traditional Chinese (繁體中文)**. Do not use English or Simplified Chinese for conversational text or explanations.

(Technical terms, variable names, and code snippets should remain in English, but the surrounding context and feedback must be in Traditional Chinese.)

## AI Agent Prompt Formatting (AI 助手提示詞格式)

**CRITICAL RULE:** When providing code review feedback, you MUST format your suggestions so that the user can directly copy and paste them as a prompt to another AI Coding Agent (like Cursor, GitHub Copilot, or Aider).

Follow these formatting rules for EVERY actionable comment:

1. Start the prompt by asking the AI agent to _review_ the feedback first, not just blindly implement it (e.g., "請幫我審核這個 Code Review 意見", "請問這個建議合理嗎？").
2. Clearly state the problem found and the proposed solution from the review.
3. Use a markdown blockquote (`>`) or a designated code block to encapsulate the actual prompt that the user should copy.

**Example Format:**
發現一個潛在的效能問題。你可以直接複製以下提示詞給你的 AI 助手進行二次確認與修復：

```prompt
請幫我審核這個 Code Review 意見：
「在 `utils.js` 中的 `calculateScore` 函式，目前它在迴圈內頻繁建立新的物件，導致不必要的記憶體配置。建議改為在迴圈外部預先配置好需要的資料結構，或者使用更有效率的陣列操作方法。」
請先評估這個建議是否合理、有沒有副作用。如果合理，請提供修改方案；如果不合理，請告訴我原因。
```

## General Guidelines

- Focus on correctness, efficiency, maintainability, and security.
- Provide actionable, clear, and constructive feedback.
- Point out potential bugs or edge cases that might not be handled.
