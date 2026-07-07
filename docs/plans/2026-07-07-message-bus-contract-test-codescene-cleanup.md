# Message Bus Contract Test CodeScene Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` or an equivalent repo-approved execution workflow. Steps use checkbox (`- [ ]`) syntax for tracking during execution.

**Goal:** 清理附件列出的 CodeScene test-only diagnostics，降低 message bus contract tests 與 highlight handler tests 的 duplication / large method warning，同時保留現有 runtime response contract。

**Architecture:** 這是 behavior-preserving test refactor。變更集中在 Jest test files 與 test-only helper，透過小型、語義明確的 assertion/setup helpers 收斂重複片段；不改 production handlers、runtime actions、`message_bus.json` payload / response contract 或 runner ownership。

**Tech Stack:** Jest 30 SWC default lane, jsdom test environment, existing background handler harnesses, `.agents/.shared/knowledge/message_bus.json`, CodeScene IDE diagnostics.

---

## Metadata

- **狀態:** ✅ 已完成（分支：codex/high-risk-message-bus-contract-tests）
- **Owner:** Message Bus / Background Runtime tests
- **Date:** 2026-07-07
- **Plan Level:** Standard
- **Task Type:** `refactor`
- **Primary evidence:** CodeScene diagnostics pasted by user on 2026-07-07
- **Entry condition:** 用戶批准本 plan 或等價具體 proposal 後，才可進入 Execution State。

## Summary

附件列出 14 個 CodeScene diagnostics，集中在 message bus contract tests 與 `highlightHandlers.test.js`：

- `tests/unit/background/handlers/saveHandlers.messageBusContract.test.js`
  - Code Duplication at lines 63, 111, 139
- `tests/unit/config/messageBusContract.test.js`
  - Bumpy Road Ahead at line 17
  - Code Duplication at lines 152, 160
- `tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js`
  - Code Duplication at lines 226, 242, 265, 292
  - Large Method at line 117
- `tests/unit/background/handlers/notionHandlers.messageBusContract.test.js`
  - Code Duplication at lines 132, 148
- `tests/unit/background/handlers/highlightHandlers.test.js`
  - Large Method at line 257

Preflight baseline already ran in Planning State:

```sh
npm test -- tests/unit/background/handlers/saveHandlers.messageBusContract.test.js tests/unit/config/messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js tests/unit/background/handlers/notionHandlers.messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.test.js --runInBand
```

Result: 5 test suites passed, 77 tests passed.

## Scope

This plan modifies only the CodeScene target tests and test-only helpers:

- Modify `tests/unit/background/handlers/messageBusContractTestUtils.js`
- Modify `tests/unit/background/handlers/saveHandlers.messageBusContract.test.js`
- Modify `tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js`
- Modify `tests/unit/background/handlers/notionHandlers.messageBusContract.test.js`
- Modify `tests/unit/config/messageBusContract.test.js`
- Modify `tests/unit/background/handlers/highlightHandlers.test.js`
- Modify this implementation plan during execution status / completion updates

Boundary rules:

- Do not change `scripts/background/handlers/*.js`.
- Do not change `.agents/.shared/knowledge/message_bus.json`.
- Do not change runtime action names, payload fields, response fields, error envelopes, log schema, storage keys, or Chrome runtime behavior.
- Do not add dependencies or lockfile changes.
- Do not move tests between Jest runner lanes or edit Jest config.
- Do not broaden cleanup to unrelated CodeScene findings.

## Required Changes

1. Add semantic test helpers for repeated message bus contract response assertions.
   - `getLastResponse(sendResponse)`
   - `expectMessageBusResponseContract({ group, actionName, declaredFields, response, actualFields })`
   - Keep helper assertions meaningful and add `expect.hasAssertions()` in tests whose core assertions move behind helpers.

2. Replace repeated contract assertion blocks in save / highlight / notion message bus contract tests.
   - Keep scenario-specific `expect.objectContaining(...)` assertions in each test body.
   - Preserve current field constants and response expectations.

3. Reduce `tests/unit/config/messageBusContract.test.js` local duplication and bumpy control flow.
   - Add a small fixture builder for repeated `actions.save.savePage` malformed fixtures.
   - Rewrite `listActions()` to avoid nested control-flow bumps while preserving `$` metadata filtering and malformed domain handling.

4. Split large setup methods in highlight tests.
   - In `highlightHandlers.messageBusContract.test.js`, split the large `beforeEach` into focused setup helpers for mocks, services, Chrome globals, and Logger globals.
   - In `highlightHandlers.test.js`, split the large `beforeEach` at line 257 into focused setup helpers while preserving mock setup order.

5. Verify behavior and update plan state.
   - Run focused tests before and after refactor slices.
   - Run touched-file lint.
   - Use CodeScene IDE refresh as the authoritative warning clearance check when available; CLI verification remains Jest/lint.

## Implementation Steps

### Task 1: Execution Preflight And Baseline

**Goal:** Reconfirm the approved branch, dirty state, and baseline behavior before editing tests.

**Primary Changes:**

- No code changes.
- Confirm current branch is not `main`.
- Capture current diagnostics target list from this plan.
- Re-run focused baseline tests if execution starts in a later session.

**Verification:**

```sh
git status --short --branch
git branch --show-current
npm test -- tests/unit/background/handlers/saveHandlers.messageBusContract.test.js tests/unit/config/messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js tests/unit/background/handlers/notionHandlers.messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.test.js --runInBand
```

Expected:

- Branch is a feature branch, not `main`.
- Focused Jest command exits 0 with 5 suites passing.

### Task 2: Add Shared Message Bus Response Assertion Helper

**Goal:** Reduce duplicated contract declaration + response field checks without hiding scenario-specific assertions.

**Primary Changes:**

- Modify `tests/unit/background/handlers/messageBusContractTestUtils.js`.
- Add:

```js
export function getLastResponse(sendResponse) {
  return sendResponse.mock.calls.at(-1)?.[0];
}

export function expectMessageBusResponseContract({
  group,
  actionName,
  declaredFields,
  response,
  actualFields = declaredFields,
}) {
  expectActionResponseDeclares(group, actionName, declaredFields);
  expectResponseHasFields(response, actualFields);
}
```

- Keep existing `loadMessageBusContract()`, `expectActionResponseDeclares()`, and `expectResponseHasFields()` exports for tests that need direct contract access.

**Verification:**

```sh
npm test -- tests/unit/background/handlers/saveHandlers.messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js tests/unit/background/handlers/notionHandlers.messageBusContract.test.js --runInBand
```

Expected: existing contract tests still pass after helper addition, before call sites are migrated.

### Task 3: Migrate Save / Highlight / Notion Contract Tests To Helper

**Goal:** Remove repeated CodeScene duplication in message bus handler contract tests while keeping direct scenario assertions readable.

**Primary Changes:**

- Modify `tests/unit/background/handlers/saveHandlers.messageBusContract.test.js`.
  - Import `getLastResponse` and `expectMessageBusResponseContract`.
  - Remove the local `getLastResponse()` function.
  - Replace repeated:

```js
expectActionResponseDeclares('save', actionName, fields);
expectResponseHasFields(response, fields);
```

  with:

```js
expectMessageBusResponseContract({
  group: 'save',
  actionName,
  declaredFields: fields,
  response,
});
```

  - Use `actualFields` for tests whose runtime response only exercises a subset of the declared response contract.

- Modify `tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js`.
  - Import the same helpers.
  - Remove the local `getLastResponse()` function.
  - Add `expect.hasAssertions()` to tests whose contract checks move behind helper calls.
  - Keep `expect(response).not.toHaveProperty('details')` in the test body for remote deletion scenarios.

- Modify `tests/unit/background/handlers/notionHandlers.messageBusContract.test.js`.
  - Import the same helpers.
  - Remove the local `getLastResponse()` function.
  - Use `actualFields` for success/error branches that intentionally return subsets of declared fields.

**Verification:**

```sh
npm test -- tests/unit/background/handlers/saveHandlers.messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js tests/unit/background/handlers/notionHandlers.messageBusContract.test.js --runInBand
```

Expected: 3 suites pass, and scenario-specific response assertions still fail with useful messages if a handler response drifts.

### Task 4: Refactor `messageBusContract.test.js` Local Shape Fixtures

**Goal:** Address the `Bumpy Road Ahead` and duplicated malformed fixture diagnostics without changing contract validation semantics.

**Primary Changes:**

- Modify `tests/unit/config/messageBusContract.test.js`.
- Add a local fixture builder:

```js
function buildSavePageActionsFixture(savePageContract) {
  return {
    save: {
      savePage: savePageContract,
    },
  };
}
```

- Replace repeated malformed fixtures with `buildSavePageActionsFixture(...)`.
- Rewrite `listActions(actionsByDomain)` into a flatter implementation that keeps malformed domain maps ignored by `listActions()` and reported by `collectMalformedActionDomainViolations()`:

```js
function listActions(actionsByDomain) {
  if (!isRecord(actionsByDomain)) {
    return [];
  }

  return Object.entries(actionsByDomain).flatMap(([domain, actions]) => {
    if (!isRecord(actions)) {
      return [];
    }

    return Object.entries(actions)
      .filter(([actionName]) => !actionName.startsWith('$'))
      .map(([actionName, contract]) => ({ domain, actionName, contract }));
  });
}
```

**Verification:**

```sh
npm test -- tests/unit/config/messageBusContract.test.js --runInBand
```

Expected: `messageBusContract.test.js` passes with the same malformed fixture expectations.

### Task 5: Split `highlightHandlers.messageBusContract.test.js` Setup

**Goal:** Reduce the large `beforeEach` at line 117 into named setup helpers while preserving mock initialization order.

**Primary Changes:**

- Modify `tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js`.
- Add helper functions near existing setup helpers:

```js
function resetHighlightContractMocks() {
  jest.resetAllMocks();
}

function configureDefaultHighlightContractMocks() {
  mockSecurityUtils.validateContentScriptRequest.mockReturnValue(null);
  mockSecurityUtils.validateInternalRequest.mockReturnValue(null);
  mockInjectionService.isRestrictedInjectionUrl.mockReturnValue(false);
  mockUrlUtils.normalizeUrl.mockImplementation(url => url);
  mockUrlUtils.resolveStorageUrl.mockImplementation(url => url);
  mockNotionAuth.ensureNotionApiKey.mockResolvedValue('key1');
  mockApiErrorSanitizer.sanitizeApiError.mockImplementation(err =>
    typeof err === 'string' ? err : err.message || 'unknown_error'
  );
  mockErrorHandler.ErrorHandler.formatUserMessage.mockImplementation(error => {
    const key = error?.message ?? error;
    return ERROR_MESSAGES.PATTERNS[key] ?? ERROR_MESSAGES.USER_MESSAGES[key] ?? key;
  });
  mockLogSanitizer.sanitizeUrlForLogging.mockImplementation(url => {
    try {
      return new URL(url).toString();
    } catch {
      return url;
    }
  });
}

function createHighlightContractMockServices() {
  return {
    notionService: {
      updateHighlightsSection: jest.fn(),
    },
    storageService: {
      getSavedPageData: jest.fn(),
      getConfig: jest.fn(),
      clearNotionStateWithRetry: jest.fn().mockResolvedValue({ cleared: true, attempts: 1 }),
    },
    tabService: {
      resolveTabUrl: jest.fn().mockImplementation((_tabId, url) =>
        Promise.resolve({
          stableUrl: url,
          originalUrl: url,
          migrated: false,
        })
      ),
      confirmRemotePageMissing: jest
        .fn()
        .mockReturnValue({ shouldDelete: false, deletionPending: true }),
      resetRemotePageMissingState: jest
        .fn()
        .mockReturnValue({ shouldDelete: false, deletionPending: false }),
    },
    migrationService: {
      migrateStorageKey: jest.fn().mockResolvedValue(false),
    },
    injectionService: {
      collectHighlights: jest.fn().mockResolvedValue([{ text: 'hi' }]),
    },
  };
}

function installHighlightContractChromeMock() {
  globalThis.chrome = {
    runtime: { id: TEST_EXTENSION_ID, lastError: null },
    tabs: {
      query: jest.fn().mockResolvedValue([{ id: TEST_TAB_ID, url: TEST_URL }]),
      sendMessage: jest.fn(),
    },
  };
}

function installHighlightContractLoggerMock() {
  globalThis.Logger = {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  };
}
```

- Replace `beforeEach` with:

```js
beforeEach(() => {
  resetHighlightContractMocks();
  configureDefaultHighlightContractMocks();
  mockServices = createHighlightContractMockServices();
  installHighlightContractChromeMock();
  installHighlightContractLoggerMock();
  handlers = createHighlightHandlers(mockServices);
});
```

**Verification:**

```sh
npm test -- tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js --runInBand
```

Expected: highlight contract suite passes and setup ordering remains unchanged.

### Task 6: Split `highlightHandlers.test.js` Setup

**Goal:** Reduce the large `beforeEach` at line 257 while preserving existing handler behavior, mocks, and cleanup.

**Primary Changes:**

- Modify `tests/unit/background/handlers/highlightHandlers.test.js`.
- Add setup helpers inside the `describe('highlightHandlers', ...)` block so they can use existing mock references:

```js
const resetHighlightHandlerMocks = () => {
  jest.resetAllMocks();
  getActiveNotionToken.mockResolvedValue({ token: 'key1', mode: 'manual' });
  ensureNotionApiKey.mockResolvedValue('key1');
};

const configureDefaultHighlightHandlerMocks = () => {
  validateContentScriptRequest.mockReturnValue(null);
  validateInternalRequest.mockReturnValue(null);
  isRestrictedInjectionUrl.mockReturnValue(false);
  normalizeUrl.mockImplementation(url => url);
  mockSecurityUtils.isValidUrl.mockImplementation(
    url => typeof url === 'string' && url.startsWith('https://')
  );
  sanitizeUrlForLogging.mockImplementation(url => {
    try {
      return new URL(url).toString();
    } catch {
      return url;
    }
  });
  ErrorHandler.formatUserMessage.mockImplementation(error => {
    const key = error?.message ?? error;
    return ERROR_MESSAGES.PATTERNS[key] ?? ERROR_MESSAGES.USER_MESSAGES[key] ?? key;
  });
  sanitizeApiError.mockImplementation(err =>
    typeof err === 'string' ? err : err.message || 'unknown_error'
  );
};
```

- Add:

```js
const createHighlightHandlerMockServices = () => ({
  notionService: {
    updateHighlights: jest.fn(),
    syncHighlights: jest.fn(),
    updateHighlightsSection: jest.fn(),
    checkPageExists: jest.fn(),
  },
  storageService: {
    getHighlighterState: jest.fn(),
    setHighlighterState: jest.fn(),
    getSavedPageData: jest.fn(),
    getHighlights: jest.fn().mockResolvedValue([{ id: 'h1' }, { id: 'h2' }]),
    getConfig: jest.fn(),
    updateHighlights: jest.fn(),
    clearNotionState: jest.fn(),
    clearNotionStateWithRetry: jest.fn().mockResolvedValue({ cleared: true, attempts: 1 }),
  },
  tabService: {
    getStableUrl: jest.fn().mockResolvedValue('https://example.com/stable'),
    getPreloaderData: jest.fn().mockResolvedValue(null),
    confirmRemotePageMissing: jest
      .fn()
      .mockReturnValue({ shouldDelete: false, deletionPending: true }),
    resetRemotePageMissingState: jest
      .fn()
      .mockReturnValue({ shouldDelete: false, deletionPending: false }),
    resolveTabUrl: jest.fn().mockImplementation((_tabId, url) =>
      Promise.resolve({
        stableUrl: url,
        originalUrl: url,
        migrated: false,
      })
    ),
  },
  injectionService: {
    ensureBundleInjected: jest.fn(),
    injectHighlighter: jest.fn(),
    collectHighlights: jest.fn(),
    clearPageHighlights: jest.fn(),
  },
  migrationService: {
    migrateStorageKey: jest.fn().mockResolvedValue(false),
  },
});
```

- Add:

```js
const installHighlightHandlerChromeMock = () => {
  globalThis.chrome = {
    runtime: { id: TEST_EXTENSION_ID, lastError: null },
    tabs: {
      sendMessage: jest.fn(),
      query: jest.fn().mockResolvedValue([{ id: TEST_TAB_ID, url: TEST_URL }]),
    },
    action: { setBadgeText: jest.fn() },
  };
};

const installHighlightHandlerLoggerMock = () => {
  globalThis.Logger = {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  };
};
```

- Replace the large `beforeEach` with:

```js
beforeEach(() => {
  resetHighlightHandlerMocks();
  configureDefaultHighlightHandlerMocks();
  mockServices = createHighlightHandlerMockServices();
  installHighlightHandlerChromeMock();
  installHighlightHandlerLoggerMock();
  handlers = createHighlightHandlers(mockServices);
});
```

**Verification:**

```sh
npm test -- tests/unit/background/handlers/highlightHandlers.test.js --runInBand
```

Expected: 1 suite passes and all existing highlight handler behavior tests remain green.

### Task 7: Final Verification, Documentation Check, And Commit

**Goal:** Prove the full touched scope still passes and finish the Standard plan lifecycle.

**Primary Changes:**

- Update this plan status from `📝 草稿` to `🔄 實施中` when execution starts, and to `✅ 已完成（commit <sha>）` after commit.
- Append `## Completion Report` with the six required sections after verification and commit.
- Do not update specs/guides unless execution discovers a real workflow or contract change.

**Verification:**

```sh
npm test -- tests/unit/background/handlers/saveHandlers.messageBusContract.test.js tests/unit/config/messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js tests/unit/background/handlers/notionHandlers.messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.test.js --runInBand
npm run lint -- tests/unit/background/handlers/messageBusContractTestUtils.js tests/unit/background/handlers/saveHandlers.messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js tests/unit/background/handlers/notionHandlers.messageBusContract.test.js tests/unit/config/messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.test.js
```

Expected:

- Focused Jest command exits 0.
- Lint command exits 0 for touched files, or reports only pre-existing unrelated repo-wide warnings with a touched-file focused follow-up check.

Commit:

```sh
git add docs/plans/2026-07-07-message-bus-contract-test-codescene-cleanup.md tests/unit/background/handlers/messageBusContractTestUtils.js tests/unit/background/handlers/saveHandlers.messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js tests/unit/background/handlers/notionHandlers.messageBusContract.test.js tests/unit/config/messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.test.js
git commit -m "test: clean up message bus contract diagnostics"
```

## Verification

Required execution-time checks:

1. Baseline focused Jest command before edits:
   `npm test -- tests/unit/background/handlers/saveHandlers.messageBusContract.test.js tests/unit/config/messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js tests/unit/background/handlers/notionHandlers.messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.test.js --runInBand`
2. Slice checks after each task:
   - Save/highlight/notion contract tests after shared helper migration.
   - `messageBusContract.test.js` after fixture / control-flow cleanup.
   - `highlightHandlers.messageBusContract.test.js` after setup split.
   - `highlightHandlers.test.js` after setup split.
3. Final focused Jest command over all touched suites.
4. Touched-file lint command:
   `npm run lint -- tests/unit/background/handlers/messageBusContractTestUtils.js tests/unit/background/handlers/saveHandlers.messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js tests/unit/background/handlers/notionHandlers.messageBusContract.test.js tests/unit/config/messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.test.js`
5. CodeScene IDE refresh for authoritative diagnostic clearance when available. If CodeScene is not runnable from CLI, report Jest/lint evidence plus the structural changes that target each diagnostic line.

## Documentation Impact

### Must Check

- `.agents/.shared/knowledge/doc_impact_matrix.json`
- `docs/guides/CHANGE_COMPLETION_WORKFLOW.md`
- `docs/guides/TESTING_GUIDE.md`
- `docs/guides/REFACTORING_BEST_PRACTICES.md`

### Expected Updates

- This implementation plan.
- No guide, spec, ADR, `message_bus.json`, user-facing documentation, or architecture document update is expected because the planned work is test-only cleanup that preserves runtime contracts and workflow policy.

### Notes

- Completion must follow `docs/guides/CHANGE_COMPLETION_WORKFLOW.md`.
- Since this is a Standard plan, completion must append the global six-section `## Completion Report`:
  1. Verification Evidence
  2. Updated Docs
  3. Checked But No Change Needed
  4. Implementation-Time Extensions
  5. Scope Drift
  6. Contract Lifecycle Note

## Completion Report

### Verification Evidence

- `npm test -- tests/unit/background/handlers/saveHandlers.messageBusContract.test.js tests/unit/config/messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js tests/unit/background/handlers/notionHandlers.messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.test.js --runInBand` → exit 0; 5 suites passed, 77 tests passed.
- `npm run lint -- tests/unit/background/handlers/messageBusContractTestUtils.js tests/unit/background/handlers/saveHandlers.messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.messageBusContract.test.js tests/unit/background/handlers/notionHandlers.messageBusContract.test.js tests/unit/config/messageBusContract.test.js tests/unit/background/handlers/highlightHandlers.test.js` → exit 0.
- Follow-up CodeScene pasted diagnostics on 2026-07-07 were addressed by replacing repeated `expectMessageBusResponseContract({...})` object literals with save/highlight/auth-specific assertion helpers.
- CodeScene IDE refresh was not available from CLI in this session; CLI evidence is Jest/lint plus the targeted structural cleanup.

### Updated Docs

- `docs/plans/2026-07-07-message-bus-contract-test-codescene-cleanup.md`

### Checked But No Change Needed

- `.agents/.shared/knowledge/doc_impact_matrix.json`: `refactor` path allows behavior-preserving local cleanup to skip guide/spec edits when final report states why.
- `docs/guides/CHANGE_COMPLETION_WORKFLOW.md`: Standard plan completion rules were followed; no workflow policy changed.
- `docs/guides/TESTING_GUIDE.md`: test refactor preserved existing SWC Jest ownership and assertion visibility; no testing policy changed.
- `docs/guides/REFACTORING_BEST_PRACTICES.md`: changes stayed inside test-only helper/setup cleanup and did not alter production caller boundaries.

### Implementation-Time Extensions

- Added shared `getLastResponse()` and `expectMessageBusResponseContract()` helpers in the existing test-only message bus contract utility.
- Added file-local semantic assertion helpers for save, highlight, and auth response contract checks after CodeScene still reported duplication in the shared-helper call sites.

### Scope Drift

- None. Changes stayed within the listed test/helper files and this plan file. No production handlers, runtime actions, message bus knowledge, Jest config, dependencies, or lockfiles were changed.

### Contract Lifecycle Note

- Runtime response contracts remain unchanged. This pass only refactors test assertions and setup structure around existing `message_bus.json` expectations.
