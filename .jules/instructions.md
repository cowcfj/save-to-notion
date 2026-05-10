# Jules Instructions

Marker: `JULES_CONTEXT_V1`

## Purpose

This file is an experimental, public-safe context snapshot for Jules. It does not replace the local `AGENTS.md` used by the primary development environment.

## Required Behavior

- MUST respond in Traditional Chinese for summaries, explanations, PR descriptions, and discussions.
- MUST preserve technical terms, API names, filenames, commands, and identifiers in English when that is clearer.
- MUST start from Planning State for every task.
- MUST NOT modify code, tests, docs, or tracked repository state until the user explicitly approves the implementation plan or an equivalent concrete proposal.
- MUST keep changes focused on the approved scope.
- MUST NOT introduce new npm packages or lockfile changes unless the user explicitly approves them.
- MUST NOT leave `console.log` in production code. `console.error` is allowed only when necessary.
- MUST keep code, tests, and docs free of AI scratch notes, hidden reasoning, and conversational self-reference.

## Routing

Before planning a task, read the synchronized knowledge files when present:

- `.agents/.shared/knowledge/task_routing.json`
- `.agents/.shared/knowledge/plan_policy.json`
- `.agents/.shared/knowledge/tool_boundaries.json`

For task-specific work, load only the relevant synchronized knowledge files instead of scanning the whole repository documentation set:

- Bug fixes: `.agents/.shared/knowledge/debugging_rules.json`
- Runtime message contracts: `.agents/.shared/knowledge/message_bus.json`
- Storage keys and lifecycle: `.agents/.shared/knowledge/storage_schema.json`
- Notion API behavior: `.agents/.shared/knowledge/notion_constraints.json`
- Security-sensitive changes: `.agents/.shared/knowledge/security_rules.json`
- Code review work: `.agents/.shared/knowledge/review_red_lines.json`

## Plan Levels

- Lite Plan: single-file or low-risk fixes, small text/config adjustments, or style-only changes. Use a short proposal or checklist.
- Standard Plan: general features, multi-file bug fixes, or ordinary refactors. Use an implementation plan before execution.
- Deep Plan: cross-module changes, contract changes, storage/message bus schema changes, backend-boundary investigations, major UX changes, or dependency introduction. Include documentation impact and ADR evaluation.

## Testing And Verification

- Core logic changes MUST include tests.
- Bug fixes MUST start from a failing test when practical.
- Before claiming a change is complete or fixed, run verification that matches the risk level and report the exact command results.

## Backend Boundary

When a defect is observed in the extension but evidence points to backend behavior, API contract, server-side state, allowlist, token exchange, redirect flow, or Worker route handling, state the backend root-cause hypothesis explicitly. Do not hide backend defects behind frontend-only workarounds unless the tradeoff and risk are clearly documented.

## Experiment Check

When asked whether Jules loaded repository instructions, mention the marker `JULES_CONTEXT_V1` in the plan or summary. If this marker is absent, assume this `.jules` instruction path may not be active.
