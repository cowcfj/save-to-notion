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

## Retired Surfaces

This tracked catalog is the GitHub-visible record for retired tool surfaces.
Current checks and ownership live in the tracked targets listed below.

| Retired surface                                  | Replacement / current owner                                                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report-native-default-runner-blockers.mjs`      | `tests/contract/native-default/ci/nativeDefaultRunnerContract.test.mjs`, `jest.native-default.config.js`, `package.json` `test:native`, `npm run test:coverage:native-esm:assert`      |
| `report-native-default-runner-blockers-core.mjs` | Retired with the classifier CLI; current ownership is covered by `tests/contract/native-default/ci/nativeDefaultRunnerContract.test.mjs`                                               |
| `probe-root-esm-package-markers.mjs`             | `tests/contract/ci/jestTransformerContract.test.js`, `tests/contract/native-default/ci/nativeDefaultRunnerContract.test.mjs`, `tools/check-message-boundaries.mjs`, package/size gates |
| `probe-root-esm-package-markers-core.mjs`        | Retired with the completed root ESM temp-copy rehearsal CLI; current proof uses the live root checks above                                                                             |

`tools/coverage/` is not an active tool; it is a local artifact directory.
