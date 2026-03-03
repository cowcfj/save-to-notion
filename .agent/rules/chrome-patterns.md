---
trigger: core_api_design
description: Triggered when designing core Chrome Extension architecture (Manifest V3).
globs: ['manifest.json', '**/*background*', '**/*content*', '**/*popup*']
---

# Chrome Extension Best Practices (Trigger)

> ⚠️ **CRITICAL**: Manifest V3 imposes strict limitations and requires specific architecture.

## 🚨 Mandatory Execution Protocol

When this rule is triggered, you MUST immediately do the following two things:

1. **Invoke the Extension Expert Skill**:
   - You MUST follow the `extension-expert` skill to ensure compliance with Manifest V3 limitations (e.g., ephemeral service workers, CSP).

2. **Load Project-Specific Context**:
   - You MUST load and read the relevant JSON schema files to understand the project's data structures and message passing contracts:
   - `[message_bus.json](../../.agent/.shared/knowledge/message_bus.json)`
   - `[storage_schema.json](../../.agent/.shared/knowledge/storage_schema.json)`
   - `[notion_constraints.json](../../.agent/.shared/knowledge/notion_constraints.json)`

## 🔗 Hub Reference

For other AI tools (like Cursor or Claude Code) that cannot trigger this rule, they should be pointed to:

- [`CHROME_EXTENSION_PATTERNS.md`](../../docs/guides/CHROME_EXTENSION_PATTERNS.md)
