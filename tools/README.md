# Tools

This directory contains repo-local automation used by tests, CI, release packaging, and focused diagnostics. Keep this catalog current when adding, removing, or retiring a tool.

## Active Tools

| Tool                                      | Status                      | Purpose                                                                                                                              | Primary caller / owner                                                                |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `assert-native-esm-line-hits.mjs`         | Active coverage gate        | Asserts native ESM V8 coverage line-hit expectations and writes `coverage/native-esm/line-hit-summary.*`.                            | `npm run test:coverage:native-esm:assert`                                             |
| `audit-page-shared-chunks.mjs`            | Active retained diagnostic  | Audits built `dist/pages/*.js` page entry shared imports; hard-fails page-entry violations and prints warning-only breadth evidence. | Manual bundle review; `tests/contract/incumbent/ci/audit-page-shared-chunks.test.mjs` |
| `bundle-boundary-sentinels.mjs`           | Active helper module        | Shared sentinel definitions for bundle boundary and page shared chunk audits.                                                        | Boundary tooling and contract tests                                                   |
| `check-extension-package-surface.mjs`     | Active package hard gate    | Verifies the unpacked extension package file surface and auth callback/package invariants.                                           | CI/release/local package gates                                                        |
| `check-message-boundaries.mjs`            | Active bundle hard gate     | Verifies built bundle message-boundary sentinels and cross-boundary leakage rules.                                                   | CI/release/local bundle gates                                                         |
| `check-size-gates.mjs`                    | Active size hard/delta gate | Enforces bundle and package size budgets.                                                                                            | CI/release/local size gates                                                           |
| `inject-manifest-key.mjs`                 | Active packaging helper     | Copies `manifest.json` and injects an optional local development extension key.                                                      | `tools/package-extension.sh`                                                          |
| `package-extension.sh`                    | Active packaging helper     | Builds release/unpacked extension package contents from `dist/`, `pages/`, `styles/`, and static assets.                             | `npm run package:local-unpacked`, release workflows                                   |
| `report-native-esm-scope-parity.mjs`      | Active coverage diagnostic  | Reports parity between default Jest coverage scope and native ESM coverage scope.                                                    | `npm run test:coverage:native-esm:scope-parity`                                       |
| `report-native-esm-scope-parity-core.mjs` | Active helper module        | Core implementation for native ESM scope parity reporting.                                                                           | `report-native-esm-scope-parity.mjs`                                                  |
| `static-import-parser.mjs`                | Active helper module        | Parses static import/export specifiers for boundary and bundle-shape checks.                                                         | Boundary tooling and contract tests                                                   |

## Retired By `docs/plans/2026-07-06-tools-retirement-archive.md`

These active surfaces are archived locally under `archive/tool-retirement/` and removed from GitHub-tracked active tooling by the retirement plan:

| Retired surface                                  | Replacement / current owner                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `report-native-default-runner-blockers.mjs`      | `nativeDefaultRunnerContract`, marker-zero checks, native-default diagnostic lane, native ESM V8 coverage |
| `report-native-default-runner-blockers-core.mjs` | Archived with retired classifier CLI                                                                      |
| `probe-root-esm-package-markers.mjs`             | Live root ESM checks, native ESM V8 coverage, production build, package-surface and size gates            |
| `probe-root-esm-package-markers-core.mjs`        | Archived with completed root ESM temp-copy rehearsal CLI                                                  |

`tools/coverage/` is not an active tool; it is a local artifact directory.
