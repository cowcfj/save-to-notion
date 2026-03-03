---
trigger: notion_api
description: Triggered when implementing Notion API interactions.
globs: ['**/*Notion*', '**/*Transporter*', '**/*Block*']
---

# Notion API Constraints (Trigger)

> ⚠️ **CRITICAL**: Strict API versioning and block structure rules apply.

## 🚨 Mandatory Execution Protocol

When this rule is triggered, you MUST immediately do the following two things:

1. **Load Project-Specific Context**:
   - You MUST load and read the following JSON schema file to understand the hard limits of the Notion API (e.g., maximum children per block, text limits, rate limits, and the locked API version):
   - `[notion_constraints.json](../../.agent/.shared/knowledge/notion_constraints.json)`
   - **DO NOT** guess these limits or upgrade the API version without checking this file.

2. **Invoke the QA Testing Skill for Verification**:
   - If you modify any core API interactions (Save, Highlight, Migration), you MUST use the `e2e-testing-patterns` skill and the instructions in `testing_rules.json` to verify your changes.

## 🔗 Hub Reference

For other AI tools (like Cursor or Claude Code) that cannot trigger this rule, they should be pointed to:

- [`NOTION_API_PATTERNS.md`](../../docs/guides/NOTION_API_PATTERNS.md)
