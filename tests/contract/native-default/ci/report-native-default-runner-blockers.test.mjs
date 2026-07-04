/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as reporter from '../../../../tools/report-native-default-runner-blockers-core.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const createDirectory = directoryPath => {
  fs.mkdirSync(directoryPath, { recursive: true });
};

const writeFile = (rootDir, relativePath, content = '') => {
  const filePath = path.join(rootDir, relativePath);
  createDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
};

const writeConfig = (rootDir, relativePath, testMatch) => {
  writeFile(
    rootDir,
    relativePath,
    `'use strict';\n\nmodule.exports = ${JSON.stringify({ rootDir: '.', testMatch }, null, 2)};\n`
  );
};

const expectPathDoesNotExist = filePath => {
  expect(fs.existsSync(filePath)).toBe(false);
};

const expectFileContents = (filePath, expectedContents) => {
  expect(fs.readFileSync(filePath, 'utf8')).toBe(expectedContents);
};

const setupNativeRunnerFixture = rootDir => {
  writeFile(rootDir, 'tests/unit/storage.test.js', 'sessionStorage.clear();');
  writeConfig(rootDir, 'jest.native-default.config.cjs', []);
  writeConfig(rootDir, 'jest.native-esm.config.cjs', []);
};

const buildRejectedSymlinkOutputPaths = ({ allowedOutputRoot, fileName, flag, symlinkPath }) => ({
  jsonPath:
    flag === '--summary-json'
      ? path.join(symlinkPath, fileName)
      : path.join(allowedOutputRoot, 'blocker-classification-summary.json'),
  markdownPath:
    flag === '--summary-md'
      ? path.join(symlinkPath, fileName)
      : path.join(allowedOutputRoot, 'blocker-classification-summary.md'),
});

const writeClassificationFixtures = rootDir => {
  writeFile(rootDir, 'tests/native-esm/ready.native-esm.test.mjs', 'test("ready", () => {});');
  writeFile(
    rootDir,
    'tests/native-esm/coverage-only.native-esm.test.mjs',
    'test("coverage", () => {});'
  );
  writeFile(rootDir, 'tests/unit/mock-hoist.test.js', 'jest.mock("../../scripts/foo.js");');
  writeFile(
    rootDir,
    'tests/unit/require-actual.test.js',
    'const actual = jest.requireActual("../../scripts/foo.js");'
  );
  writeFile(
    rootDir,
    'tests/unit/production-require.test.js',
    'const tool = require("../../../scripts/background/utils/BlockBuilder.js");'
  );
  writeFile(
    rootDir,
    'tests/unit/non-root-runtime-name.test.js',
    [
      'const vendorPage = require("../../../vendor/pages/widget.js");',
      'const packageScript = require("../../../third_party/scripts/tool.js");',
    ].join('\n')
  );
  writeFile(
    rootDir,
    'tests/unit/contained-cjs-require.test.js',
    'const tool = require("../../../scripts/background/utils/updateNotificationVersion.cjs");'
  );
  writeFile(
    rootDir,
    'tests/unit/mixed-contained-and-production-require.test.js',
    [
      'const retained = require("../../../scripts/background/utils/updateNotificationVersion.cjs");',
      'const migrated = require("../../../scripts/background/utils/BlockBuilder.js");',
    ].join('\n')
  );
  writeFile(
    rootDir,
    'tests/unit/root-import-boundary.test.js',
    'import { tool } from "../../../scripts/tool.js";\ntest("tool", () => expect(tool).toBeDefined());'
  );
  writeFile(
    rootDir,
    'tests/unit/node-lifecycle.test.js',
    'if (require.main === module) { module.exports = { argv: process.argv }; }'
  );
  writeFile(rootDir, 'tests/unit/storage.test.js', 'localStorage.setItem("key", "value");');
  writeFile(rootDir, 'tests/unit/helper-package/package.json', JSON.stringify({ type: 'module' }));
  writeFile(
    rootDir,
    'tests/unit/helper-package/package-boundary.test.js',
    'test("esm", () => {});'
  );
  writeFile(rootDir, 'tests/contract/ci/native-contract.test.js', 'test("contract", () => {});');
};

const writeNativeRunnerConfigs = rootDir => {
  writeConfig(rootDir, 'jest.native-default.config.cjs', [
    '<rootDir>/tests/native-esm/ready.native-esm.test.mjs',
  ]);
  writeConfig(rootDir, 'jest.native-esm.config.cjs', [
    '<rootDir>/tests/native-esm/ready.native-esm.test.mjs',
    '<rootDir>/tests/native-esm/coverage-only.native-esm.test.mjs',
  ]);
};

const packageBoundaryCases = [
  {
    description:
      'classifies malformed nearest package.json without falling back to a parent boundary',
    packageJsonPath: 'tests/unit/malformed/package.json',
    packageJsonContent: '{ invalid json',
    testFilePath: 'tests/unit/malformed/package-boundary.test.js',
    testSource: 'test("malformed", () => {});',
    expectedRecord: {
      path: 'tests/unit/malformed/package-boundary.test.js',
      packageBoundary: 'tests/unit/malformed/package.json',
      signals: expect.arrayContaining(['malformed-package-boundary']),
      primaryBlocker: 'malformed-package-boundary',
      disposition: 'requires-package-json-fix',
    },
  },
  {
    description:
      'uses the nearest valid package.json as the package boundary even when it is CommonJS',
    packageJsonPath: 'tests/unit/commonjs-helper/package.json',
    packageJsonContent: JSON.stringify({ type: 'commonjs' }),
    testFilePath: 'tests/unit/commonjs-helper/package-boundary.test.js',
    testSource: 'test("commonjs", () => {});',
    expectedRecord: {
      path: 'tests/unit/commonjs-helper/package-boundary.test.js',
      packageBoundary: 'tests/unit/commonjs-helper/package.json',
      signals: expect.arrayContaining(['test-helper-package-boundary']),
      primaryBlocker: 'test-helper-package-boundary',
      disposition: 'requires-package-boundary-change',
    },
  },
];

const rejectedSymlinkOutputCases = [
  {
    description: 'CLI rejects symlinked parents that escape coverage/native-default (%s)',
    flag: '--summary-json',
    fileName: 'blocker-classification-summary.json',
    symlinkType: 'dir',
    prepareSymlinkTarget: ({ symlinkTargetPath }) => createDirectory(symlinkTargetPath),
    verifyTarget: ({ symlinkTargetPath, fileName }) => {
      expectPathDoesNotExist(path.join(symlinkTargetPath, fileName));
    },
  },
  {
    description: 'CLI rejects symlinked parents that escape coverage/native-default (%s)',
    flag: '--summary-md',
    fileName: 'blocker-classification-summary.md',
    symlinkType: 'dir',
    prepareSymlinkTarget: ({ symlinkTargetPath }) => createDirectory(symlinkTargetPath),
    verifyTarget: ({ symlinkTargetPath, fileName }) => {
      expectPathDoesNotExist(path.join(symlinkTargetPath, fileName));
    },
  },
  {
    description: 'CLI rejects symlinked final files under coverage/native-default (%s)',
    flag: '--summary-json',
    fileName: 'blocker-classification-summary.json',
    symlinkType: 'file',
    prepareSymlinkTarget: ({ tempRoot, fileName }) => {
      writeFile(tempRoot, `escaped-${fileName}`, '');
    },
    verifyTarget: ({ symlinkTargetPath }) => {
      expectFileContents(symlinkTargetPath, '');
    },
  },
  {
    description: 'CLI rejects symlinked final files under coverage/native-default (%s)',
    flag: '--summary-md',
    fileName: 'blocker-classification-summary.md',
    symlinkType: 'file',
    prepareSymlinkTarget: ({ tempRoot, fileName }) => {
      writeFile(tempRoot, `escaped-${fileName}`, '');
    },
    verifyTarget: ({ symlinkTargetPath }) => {
      expectFileContents(symlinkTargetPath, '');
    },
  },
];

const classificationRoots = ['tests/unit', 'tests/integration', 'tests/contract', 'tests/native-esm'];

const phase2OwnerPathNativeDefaultCohort = [
  'tests/integration/native-default/background/background-require.integration.test.mjs',
  'tests/unit/native-default/content/content-script.require.test.js',
  'tests/unit/native-default/scripts/assert-native-esm-line-hits.test.mjs',
  'tests/unit/native-default/scripts/postinstall.test.js',
  'tests/unit/native-default/scripts/report-native-esm-scope-parity.test.mjs',
];

const phase2BIncumbentOwnedProbeSuites = [
  'tests/unit/background/core-functions.test.js',
  'tests/unit/background/image-processing.test.js',
  'tests/unit/highlighter/highlighter-path-compression.test.js',
  'tests/unit/highlighter/highlighter-storage-optimization.test.js',
];

const phase2BNativeDefaultOwnerPathCohort = [
  'tests/unit/native-default/config/messages.test.js',
  'tests/unit/native-default/config/storageKeys.test.js',
  'tests/unit/native-default/utils/normalizeUrl.test.js',
  'tests/unit/native-default/background/buildHighlightBlocks.test.js',
  'tests/unit/native-default/utils/pageComplexityDetector.node-env.test.js',
  'tests/unit/native-default/utils/splitTextForHighlight.test.js',
  'tests/unit/native-default/background/processContentResult.test.js',
  'tests/unit/native-default/performance/PerformanceOptimizer.batchProcessing.test.js',
];

const babelHoistedMockOrderingCohort1 = [
  'tests/unit/utils/LogExporter.test.js',
  'tests/unit/utils/uiUtils.test.js',
  'tests/unit/destinations/profile-domain.test.js',
  'tests/unit/security/saveHandlers.security.test.js',
];

const babelHoistedMockOrderingCohort2Drive = [
  'tests/unit/driveAutoSync.test.js',
  'tests/unit/driveClient.test.js',
  'tests/unit/driveSyncHandlers.test.js',
];

const babelHoistedMockOrderingCohort2AuthAdjacent = [
  'tests/unit/scripts/accountSession.test.js',
  'tests/unit/utils/notionAuth.test.js',
];

const babelHoistedMockOrderingCohort3LeafRuntime = [
  'tests/unit/legacy/MigrationExecutor.test.js',
  'tests/unit/performance/PerformanceOptimizer.test.js',
  'tests/unit/imageUtils.utils.test.js',
];

const babelHoistedMockOrderingCohort3HighlighterIndex = [
  'tests/unit/highlighter/highlighter-index-skipRestore.test.js',
  'tests/unit/highlighter/highlighter-index.test.js',
];

const babelHoistedMockOrderingCohort3BackgroundEntrypoint = [
  'tests/unit/background/extension-lifecycle.test.js',
  'tests/unit/background.test.js',
];

const babelHoistedMockOrderingCohort4Entrypoints = [
  'tests/unit/content/content-index.test.js',
  'tests/unit/highlighter/entryAutoInit.test.js',
];

const commonjsRequireProductionEsmImageIifeCohort = [
  'tests/unit/background.imageUtils.test.js',
  'tests/unit/imageExtraction/imageUtils.test.js',
];

const commonjsRequireProductionEsmLifecycleCohort = [
  'tests/unit/content/content-ping.test.js',
  'tests/unit/performance/preloader.test.js',
];

const commonjsRequireProductionEsmLoggerCohort = [
  'tests/unit/logger.test.js',
  'tests/unit/utils/Logger.background.test.js',
  'tests/unit/utils/Logger.test.js',
];

// This live-repo cohort intentionally tracks the one retained contained-CJS suite
// in the current classifier ledger. If it fails, inspect the suite's require()
// calls and update the cohort only after confirming the ledger changed.
const containedCjsRequireCohort = ['tests/unit/background/updateNotificationVersion.test.js'];

const globalRuntimeSurfaceDispositionCandidates = [
  'tests/unit/background/notification-handlers.test.js',
  'tests/unit/content/isContentGood.test.js',
  'tests/unit/highlighter/highlighter-dom-stability.test.js',
  'tests/unit/imageUtils.boundary.test.js',
  'tests/unit/logger.advanced.test.js',
];

const rootCommonjsPureOrStaticDispositionCandidates = [
  'tests/unit/background/htmlSanitizerBoundary.test.js',
  'tests/unit/background/utils/BlockBuilder.test.js',
  'tests/unit/background/utils/migrationMetadataUtils.test.js',
  'tests/unit/config/contentSafe.test.js',
  'tests/unit/config/extensionConstants.test.js',
  'tests/unit/config/runtimeActionModules.test.js',
  'tests/unit/config/runtimeActions.test.js',
  'tests/unit/content/runtimeMessageHandlers.test.js',
  'tests/unit/content/sanitizers/htmlSanitizer.test.js',
  'tests/unit/driveSnapshotHash.test.js',
  'tests/unit/utils/ApiErrorSanitizer.test.js',
  'tests/unit/utils/LogBuffer.dirty.test.js',
  'tests/unit/utils/LogBuffer.test.js',
  'tests/unit/utils/LogExportValidator.test.js',
  'tests/unit/utils/LogSanitizer.test.js',
  'tests/unit/utils/accountDisplayUtils.test.js',
  'tests/unit/utils/concurrencyUtils.test.js',
  'tests/unit/utils/contentUtils.test.js',
  'tests/unit/utils/mergeUniqueImages.test.js',
  'tests/unit/utils/temporaryImageUrl.test.js',
  'tests/unit/utils/urlNormalization.regression.test.js',
];

const rootCommonjsGlobalOverlapDispositionCandidates = [
  'tests/unit/background/background-state.test.js',
  'tests/unit/background/exportDebugLogs.test.js',
  'tests/unit/background/notion-page-operations.test.js',
  'tests/unit/background/tab-listeners.test.js',
  'tests/unit/config/saveStatus.test.js',
  'tests/unit/driveAlarmScheduler.test.js',
  'tests/unit/driveClientPhaseB.test.js',
  'tests/unit/driveSnapshot.test.js',
  'tests/unit/highlighter/windowAPI.clearPageHighlights.test.js',
  'tests/unit/highlighter/windowAPI.test.js',
  'tests/unit/popup.test.js',
  'tests/unit/utils/ErrorHandler.test.js',
  'tests/unit/utils/LogBufferPersistence.test.js',
  'tests/unit/utils/securityUtils.test.js',
];

const rootCommonjsRetainedCutoverCandidates = ['tests/unit/performance/timingHelpers.test.js'];

const rootCommonjsDispositionCandidates = [
  ...rootCommonjsPureOrStaticDispositionCandidates,
  ...rootCommonjsGlobalOverlapDispositionCandidates,
  ...rootCommonjsRetainedCutoverCandidates,
];

const forbiddenClearedDispositionBlockers = [
  'unknown-needs-reproduction',
  'test-helper-package-boundary',
  'commonjs-require-production-esm',
  'babel-hoisted-mock',
];

const testHelperBoundaryPlatformCohort = [
  'tests/unit/auth/accountLogin.test.js',
  'tests/unit/auth/auth.test.js',
  'tests/unit/auth/callbackStatusView.test.js',
  'tests/unit/auth/notionOAuthCompleter.test.js',
  'tests/unit/auth/notionOAuthInitiator.test.js',
  'tests/unit/background/handlers/MessageHandler.test.js',
  'tests/unit/background/handlers/accountAuthHandler.test.js',
  'tests/unit/background/handlers/actionHandlers.edge-cases.test.js',
  'tests/unit/background/handlers/handlerGuard.test.js',
  'tests/unit/background/handlers/handlerUtils.test.js',
  'tests/unit/background/handlers/highlightHandlers.test.js',
  'tests/unit/background/handlers/logHandlers.test.js',
  'tests/unit/background/handlers/migrationHandlers.test.js',
  'tests/unit/background/handlers/notionHandlers.test.js',
  'tests/unit/background/handlers/notionHandlers_params.test.js',
  'tests/unit/background/handlers/saveHandlers.actions.test.js',
  'tests/unit/background/handlers/saveHandlers.savePage.test.js',
  'tests/unit/background/handlers/saveHandlers.status.test.js',
  'tests/unit/background/handlers/sidepanelHandlers.test.js',
  'tests/unit/background/handlers/toastUtils.test.js',
  'tests/unit/background/services/ImageService.test.js',
  'tests/unit/background/services/InjectionService.test.js',
  'tests/unit/background/services/MigrationService.test.js',
  'tests/unit/background/services/NotionService.auth-retry.test.js',
  'tests/unit/background/services/NotionService.block-operations.test.js',
  'tests/unit/background/services/NotionService.highlight-section.test.js',
  'tests/unit/background/services/NotionService.page-data.test.js',
  'tests/unit/background/services/NotionService.retry.test.js',
  'tests/unit/background/services/NotionService.test.js',
  'tests/unit/background/services/NotionService_Parallel_Safety.test.js',
  'tests/unit/background/services/PageContentService.test.js',
  'tests/unit/background/services/SaveStatusCoordinator.test.js',
  'tests/unit/background/services/StorageMigrationScanner.test.js',
  'tests/unit/background/services/StorageService.canonical-lock.test.js',
  'tests/unit/background/services/StorageService.highlights.test.js',
  'tests/unit/background/services/StorageService.notion-state.test.js',
  'tests/unit/background/services/StorageService.read-upgrade.test.js',
  'tests/unit/background/services/StorageService.test.js',
  'tests/unit/background/services/TabService.migration.test.js',
  'tests/unit/background/services/TabService.test.js',
  'tests/unit/options/AuthManager.test.js',
  'tests/unit/options/DataSourceManager.test.js',
  'tests/unit/options/DataSourceManagerError.test.js',
  'tests/unit/options/DriveCloudSyncController.init.test.js',
  'tests/unit/options/DriveCloudSyncController.refresh.test.js',
  'tests/unit/options/DriveCloudSyncController.render.test.js',
  'tests/unit/options/DriveCloudSyncController.uploadPreflight.test.js',
  'tests/unit/options/MigrationScanner.test.js',
  'tests/unit/options/MigrationTool.test.js',
  'tests/unit/options/SearchableDatabaseSelector.test.js',
  'tests/unit/options/StorageManager.cleanup.test.js',
  'tests/unit/options/StorageManager.display.test.js',
  'tests/unit/options/StorageManager.test.js',
  'tests/unit/options/UIManager.test.js',
  'tests/unit/options/confirmDialog.test.js',
  'tests/unit/options/optionsAccountUI.test.js',
  'tests/unit/options/optionsController.test.js',
  'tests/unit/options/optionsDestinationProfiles.test.js',
  'tests/unit/options/optionsHtmlStructure.test.js',
  'tests/unit/options/optionsInitialization.test.js',
  'tests/unit/options/optionsLogExport.test.js',
  'tests/unit/options/optionsStaticMessages.test.js',
  'tests/unit/options/preferenceControls.test.js',
  'tests/unit/options/storageDataUtils.test.js',
  'tests/unit/sidepanel/sidepanel.dom-contract.test.js',
  'tests/unit/sidepanel/sidepanel.interactions.test.js',
  'tests/unit/sidepanel/sidepanel.test.js',
  'tests/unit/sidepanel/sidepanel.unsynced.test.js',
  'tests/unit/sidepanel/sidepanelUI.test.js',
];

const testHelperBoundaryContentAndHighlighterCohort = [
  'tests/unit/content/converters/ContentBridge.test.js',
  'tests/unit/content/converters/ConverterFactory.test.js',
  'tests/unit/content/converters/DomConverter.edge-cases.test.js',
  'tests/unit/content/converters/DomConverter.richtext.test.js',
  'tests/unit/content/converters/DomConverter.test.js',
  'tests/unit/content/converters/DomConverterNestedLinks.test.js',
  'tests/unit/content/extractors/ContentExtractor.test.js',
  'tests/unit/content/extractors/ImageCollector.collection-strategies.test.js',
  'tests/unit/content/extractors/ImageCollector.process-images.test.js',
  'tests/unit/content/extractors/ImageCollector.size-resolution.test.js',
  'tests/unit/content/extractors/ImageCollector.temporary-images.test.js',
  'tests/unit/content/extractors/ImageCollector.test.js',
  'tests/unit/content/extractors/MarkdownExtractor.test.js',
  'tests/unit/content/extractors/MetadataExtractor.test.js',
  'tests/unit/content/extractors/NextJsDataResolver.rsc.test.js',
  'tests/unit/content/extractors/NextJsDataResolver.scoring.test.js',
  'tests/unit/content/extractors/NextJsExtractor.blocks.test.js',
  'tests/unit/content/extractors/NextJsExtractor.test.js',
  'tests/unit/content/extractors/ReadabilityAdapter.extended.test.js',
  'tests/unit/content/extractors/ReadabilityAdapter.smartCleaning.test.js',
  'tests/unit/content/extractors/ReadabilityAdapter.test.js',
  'tests/unit/content/extractors/blocks/BbcBlockConverter.test.js',
  'tests/unit/content/extractors/blocks/StoryAtomsConverter.test.js',
  'tests/unit/content/extractors/temporaryImagePlaceholder.test.js',
  'tests/unit/highlighter/autoInit/initializationInputs.test.js',
  'tests/unit/highlighter/autoInit/lateStableUrlRestore.test.js',
  'tests/unit/highlighter/autoInit/persistentListeners.test.js',
  'tests/unit/highlighter/core/HighlightInteraction.test.js',
  'tests/unit/highlighter/core/HighlightLookupResolver.contract-matrix.test.js',
  'tests/unit/highlighter/core/HighlightLookupResolver.test.js',
  'tests/unit/highlighter/core/HighlightManager.deleteRecursionGuard.test.js',
  'tests/unit/highlighter/core/HighlightManager.test.js',
  'tests/unit/highlighter/core/HighlightMigration.test.js',
  'tests/unit/highlighter/core/HighlightStorage.test.js',
  'tests/unit/highlighter/core/HighlightStorageGateway.clearHighlights.improved.test.js',
  'tests/unit/highlighter/core/HighlightStorageGateway.extended.test.js',
  'tests/unit/highlighter/core/Range.edge-cases.test.js',
  'tests/unit/highlighter/core/Range.test.js',
  'tests/unit/highlighter/core/StyleManager.namespace.test.js',
  'tests/unit/highlighter/core/StyleManager.test.js',
  'tests/unit/highlighter/core/highlightCleanupHelper.test.js',
  'tests/unit/highlighter/ui/FloatingRail.actions.test.js',
  'tests/unit/highlighter/ui/FloatingRail.events.test.js',
  'tests/unit/highlighter/ui/FloatingRail.lifecycle.test.js',
  'tests/unit/highlighter/ui/FloatingRail.settings.test.js',
  'tests/unit/highlighter/ui/FloatingRailAnimations.test.js',
  'tests/unit/highlighter/ui/FloatingRailRuntime.node.test.js',
  'tests/unit/highlighter/ui/FloatingRailRuntime.test.js',
  'tests/unit/highlighter/ui/FloatingRailState.test.js',
  'tests/unit/highlighter/ui/FloatingRailUI.test.js',
  'tests/unit/highlighter/ui/Toast.test.js',
  'tests/unit/highlighter/ui/components/ColorPicker.test.js',
  'tests/unit/highlighter/ui/components/FloatingRailContainer.test.js',
  'tests/unit/highlighter/ui/components/ToastContainer.test.js',
  'tests/unit/highlighter/ui/styles/floatingRailStyles.test.js',
  'tests/unit/highlighter/ui/styles/toastStyles.test.js',
  'tests/unit/highlighter/utils/color.edge-cases.test.js',
  'tests/unit/highlighter/utils/color.test.js',
  'tests/unit/highlighter/utils/dom.edge-cases.test.js',
  'tests/unit/highlighter/utils/dom.test.js',
  'tests/unit/highlighter/utils/domStability.edge-cases.test.js',
  'tests/unit/highlighter/utils/domStability.test.js',
  'tests/unit/highlighter/utils/floatingRailAvailability.test.js',
  'tests/unit/highlighter/utils/path.edge-cases.test.js',
  'tests/unit/highlighter/utils/path.test.js',
  'tests/unit/highlighter/utils/safeIcon.test.js',
  'tests/unit/highlighter/utils/textSearch.edge-cases.test.js',
  'tests/unit/highlighter/utils/textSearch.test.js',
  'tests/unit/highlighter/utils/validation.edge-cases.test.js',
  'tests/unit/highlighter/utils/validation.test.js',
  'tests/unit/onboarding/onboarding-entry.test.js',
  'tests/unit/onboarding/onboardingController.test.js',
];

const retainedTestHelperBoundaryMarkerFiles = [
  'tests/unit/background/handlers/package.json',
  'tests/unit/background/package.json',
  'tests/unit/background/services/package.json',
  'tests/unit/config/package.json',
  'tests/unit/content/extractors/package.json',
  'tests/unit/content/package.json',
  'tests/unit/highlighter/package.json',
  'tests/unit/highlighter/ui/package.json',
  'tests/unit/options/package.json',
  'tests/unit/package.json',
  'tests/unit/sidepanel/package.json',
  'tests/unit/utils/package.json',
];

const retainedNativeDefaultCohort = [
  ...phase2OwnerPathNativeDefaultCohort,
  ...phase2BNativeDefaultOwnerPathCohort,
  ...babelHoistedMockOrderingCohort3BackgroundEntrypoint,
];

const countPathsByRoot = suitePaths =>
  suitePaths.reduce((totals, suitePath) => {
    const root = classificationRoots.find(root => suitePath.startsWith(`${root}/`));
    if (!root) {
      throw new Error(`Test path is outside classifier roots: ${suitePath}`);
    }
    totals[root] = (totals[root] ?? 0) + 1;
    return totals;
  }, {});

const buildClassificationReport = (reporter, rootDir, files) =>
  reporter.buildClassificationReport({
    rootDir,
    roots: classificationRoots,
    nativeDefaultConfigPath: path.join(rootDir, 'jest.native-default.config.cjs'),
    nativeCoverageConfigPath: path.join(rootDir, 'jest.native-esm.config.cjs'),
    ...(files ? { files } : {}),
  });

const expectRootTotals = (report, expectedRootTotals) => {
  expect(report.totals.byRoot).toEqual(expectedRootTotals);
};

const expectClassificationRows = report => {
  expect(report.files).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: 'tests/native-esm/ready.native-esm.test.mjs',
        primaryBlocker: 'already-native-default',
        disposition: 'already-native-default',
      }),
      expect.objectContaining({
        path: 'tests/native-esm/coverage-only.native-esm.test.mjs',
        primaryBlocker: 'coverage-gate-only',
        disposition: 'coverage-only-not-default-runner',
      }),
      expect.objectContaining({
        path: 'tests/unit/mock-hoist.test.js',
        primaryBlocker: 'babel-hoisted-mock',
        disposition: 'requires-helper-refactor',
      }),
      expect.objectContaining({
        path: 'tests/unit/require-actual.test.js',
        primaryBlocker: 'jest-require-actual-esm',
      }),
      expect.objectContaining({
        path: 'tests/unit/production-require.test.js',
        primaryBlocker: 'commonjs-require-production-esm',
      }),
      expect.objectContaining({
        path: 'tests/unit/non-root-runtime-name.test.js',
        primaryBlocker: 'root-commonjs-test-boundary',
        disposition: 'defer-to-default-cutover-decision',
      }),
      expect.objectContaining({
        path: 'tests/unit/contained-cjs-require.test.js',
        primaryBlocker: 'contained-cjs-require',
        disposition: 'retain-contained-cjs',
      }),
      expect.objectContaining({
        path: 'tests/unit/mixed-contained-and-production-require.test.js',
        primaryBlocker: 'commonjs-require-production-esm',
        disposition: 'requires-helper-refactor',
      }),
      expect.objectContaining({
        path: 'tests/unit/root-import-boundary.test.js',
        primaryBlocker: 'root-commonjs-test-boundary',
        disposition: 'defer-to-default-cutover-decision',
      }),
      expect.objectContaining({
        path: 'tests/unit/node-lifecycle.test.js',
        primaryBlocker: 'node-lifecycle-contract',
        disposition: 'retain-incumbent-contract',
      }),
      expect.objectContaining({
        path: 'tests/unit/storage.test.js',
        primaryBlocker: 'jsdom-origin-or-storage',
        disposition: 'probe-for-native-default',
      }),
      expect.objectContaining({
        path: 'tests/unit/helper-package/package-boundary.test.js',
        primaryBlocker: 'test-helper-package-boundary',
        disposition: 'requires-package-boundary-change',
      }),
      expect.objectContaining({
        path: 'tests/contract/ci/native-contract.test.js',
        primaryBlocker: 'incumbent-contract-retained',
        disposition: 'retain-incumbent-contract',
      }),
    ])
  );
};

const expectPromotedCohortRecords = (report, cohortPaths) => {
  expect(report.files).toHaveLength(cohortPaths.length);
  expectRootTotals(report, countPathsByRoot(cohortPaths));
  for (const suitePath of cohortPaths) {
    expect(report.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: suitePath,
          primaryBlocker: 'already-native-default',
          disposition: 'already-native-default',
        }),
      ])
    );
  }
};

const expectCohortSignalsAbsent = (report, cohortPaths, signals) => {
  for (const suitePath of cohortPaths) {
    expect(report.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: suitePath,
        }),
      ])
    );
    const suiteRecord = report.files.find(file => file.path === suitePath);
    for (const signal of signals) {
      expect(suiteRecord.signals).not.toContain(signal);
    }
  }
};

const expectRetainedContainedCjsReport = report => {
  expect(report.files).toEqual([
    expect.objectContaining({
      path: 'tests/unit/background/updateNotificationVersion.test.js',
      primaryBlocker: 'test-helper-package-boundary',
      disposition: 'requires-package-boundary-change',
      packageBoundary: 'tests/unit/background/package.json',
    }),
  ]);
  expect(report.files[0].signals).toEqual(
    expect.arrayContaining([
      'test-helper-package-boundary',
      'contained-cjs-require',
      'root-commonjs-test-boundary',
    ])
  );
  expect(report.files[0].signals).not.toContain('commonjs-require-production-esm');
};

const expectDispositionCandidateRecords = (report, candidatePaths, expectedBlocker) => {
  const recordsByPath = new Map(report.files.map(file => [file.path, file]));
  const allowedBlockers = Array.isArray(expectedBlocker) ? expectedBlocker : [expectedBlocker];

  for (const suitePath of candidatePaths) {
    expect(recordsByPath.has(suitePath)).toBe(true);

    const record = recordsByPath.get(suitePath);
    expect(allowedBlockers).toContain(record.primaryBlocker);
    if (!allowedBlockers.includes('test-helper-package-boundary')) {
      expect(forbiddenClearedDispositionBlockers).not.toContain(record.primaryBlocker);
    }
  }
};

describe('tools/report-native-default-runner-blockers', () => {
  const projectRoot = path.resolve(__dirname, '../../../..');
  const tempRoot = path.join(projectRoot, '.tmp/test-native-default-blockers');
  const allowedOutputRoot = path.join(projectRoot, 'coverage/native-default/test-output');
  const cliPath = path.join(projectRoot, 'tools/report-native-default-runner-blockers.mjs');

  const runCliWithArgs = args =>
    spawnSync(process.execPath, [cliPath, ...args], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

  beforeEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(allowedOutputRoot, { recursive: true, force: true });
    createDirectory(tempRoot);
    createDirectory(allowedOutputRoot);
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(allowedOutputRoot, { recursive: true, force: true });
  });

  test('default classifier roots include all documented non-E2E suite roots', () => {
    expect(reporter.defaultRoots).toEqual(classificationRoots);
  });

  test('classifies fixture suites with blocker signals and stable dispositions', () => {
    expect.hasAssertions();

    writeClassificationFixtures(tempRoot);
    writeNativeRunnerConfigs(tempRoot);

    const report = buildClassificationReport(reporter, tempRoot);

    expect(report.files).toHaveLength(13);
    expectRootTotals(report, {
      'tests/contract': 1,
      'tests/native-esm': 2,
      'tests/unit': 10,
    });
    expectClassificationRows(report);
    const containedCjsRecord = report.files.find(
      file => file.path === 'tests/unit/contained-cjs-require.test.js'
    );
    expect(containedCjsRecord.signals).toEqual(
      expect.arrayContaining(['contained-cjs-require', 'root-commonjs-test-boundary'])
    );
    expect(containedCjsRecord.signals).not.toContain('commonjs-require-production-esm');
    const nonRootRuntimeNameRecord = report.files.find(
      file => file.path === 'tests/unit/non-root-runtime-name.test.js'
    );
    expect(nonRootRuntimeNameRecord.signals).not.toEqual(
      expect.arrayContaining(['contained-cjs-require', 'commonjs-require-production-esm'])
    );
    const mixedRequireRecord = report.files.find(
      file => file.path === 'tests/unit/mixed-contained-and-production-require.test.js'
    );
    expect(mixedRequireRecord.signals).toEqual(
      expect.arrayContaining([
        'contained-cjs-require',
        'commonjs-require-production-esm',
        'root-commonjs-test-boundary',
      ])
    );
  });

  test('cohort signal absence helper rejects each forbidden signal independently', () => {
    expect(() =>
      expectCohortSignalsAbsent(
        {
          files: [
            {
              path: 'tests/unit/partial-regression.test.js',
              signals: ['commonjs-require-production-esm'],
            },
          ],
        },
        ['tests/unit/partial-regression.test.js'],
        ['commonjs-require-production-esm', 'root-commonjs-test-boundary']
      )
    ).toThrow();
  });

  test('disposition candidate helper rejects fallback blocker records', () => {
    expect(() =>
      expectDispositionCandidateRecords(
        {
          files: [
            {
              path: 'tests/unit/fallback-blocker.test.js',
              primaryBlocker: 'unknown-needs-reproduction',
            },
          ],
        },
        ['tests/unit/fallback-blocker.test.js'],
        'unknown-needs-reproduction'
      )
    ).toThrow();
  });

  test('目前 repo 的 retained native-default cohort 沒有未知 blockers', () => {
    expect.hasAssertions();

    const report = buildClassificationReport(reporter, projectRoot);
    const promotedCohortReport = buildClassificationReport(
      reporter,
      projectRoot,
      retainedNativeDefaultCohort
    );

    expect(report.totals.unknown).toBe(0);
    expectPromotedCohortRecords(promotedCohortReport, retainedNativeDefaultCohort);
    expectPromotedCohortRecords(
      buildClassificationReport(reporter, projectRoot, phase2OwnerPathNativeDefaultCohort),
      phase2OwnerPathNativeDefaultCohort
    );
    expectPromotedCohortRecords(
      buildClassificationReport(reporter, projectRoot, phase2BNativeDefaultOwnerPathCohort),
      phase2BNativeDefaultOwnerPathCohort
    );
    expectCohortSignalsAbsent(
      promotedCohortReport,
      phase2BNativeDefaultOwnerPathCohort,
      ['commonjs-require-production-esm']
    );
    const incumbentOwnedProbeReport = buildClassificationReport(
      reporter,
      projectRoot,
      phase2BIncumbentOwnedProbeSuites
    );
    for (const suiteRecord of incumbentOwnedProbeReport.files) {
      expect(suiteRecord.primaryBlocker).not.toBe('already-native-default');
      expect(suiteRecord.disposition).not.toBe('already-native-default');
    }
    const containedCjsReport = buildClassificationReport(
      reporter,
      projectRoot,
      containedCjsRequireCohort
    );

    expectRetainedContainedCjsReport(containedCjsReport);
  });

  test('目前 repo 的 root/global disposition candidates 保持在明確 closure scope', () => {
    expect.hasAssertions();

    const allDispositionCandidates = [
      ...globalRuntimeSurfaceDispositionCandidates,
      ...rootCommonjsDispositionCandidates,
    ];
    const uniqueCandidates = new Set(allDispositionCandidates);
    const report = buildClassificationReport(reporter, projectRoot, allDispositionCandidates);

    expect(uniqueCandidates.size).toBe(41);
    expect(report.files).toHaveLength(allDispositionCandidates.length);
    expectDispositionCandidateRecords(
      report,
      globalRuntimeSurfaceDispositionCandidates,
      ['already-native-default', 'test-helper-package-boundary']
    );
    expectDispositionCandidateRecords(
      report,
      rootCommonjsPureOrStaticDispositionCandidates,
      ['already-native-default', 'test-helper-package-boundary']
    );
    expectDispositionCandidateRecords(
      report,
      rootCommonjsGlobalOverlapDispositionCandidates,
      ['already-native-default', 'test-helper-package-boundary']
    );
    expectDispositionCandidateRecords(
      report,
      rootCommonjsRetainedCutoverCandidates,
      'test-helper-package-boundary'
    );
  });

  test('native-default runner config stays outside coverage ownership', () => {
    const nativeDefaultConfig = require(path.join(projectRoot, 'jest.native-default.config.cjs'));

    expect(nativeDefaultConfig).not.toHaveProperty('coverageProvider');
    expect(nativeDefaultConfig).not.toHaveProperty('coverageDirectory');
    expect(nativeDefaultConfig).not.toHaveProperty('coverageReporters');
    expect(nativeDefaultConfig).not.toHaveProperty('collectCoverageFrom');
    expect(nativeDefaultConfig).not.toHaveProperty('coverageThreshold');
  });

  test('目前 repo 的 test-helper package boundary cohort 仍由 marker boundary 明確標記', () => {
    expect.hasAssertions();

    const cohortPaths = [
      ...testHelperBoundaryPlatformCohort,
      ...testHelperBoundaryContentAndHighlighterCohort,
    ];
    const cohortReport = buildClassificationReport(reporter, projectRoot, cohortPaths);

    for (const markerPath of retainedTestHelperBoundaryMarkerFiles) {
      expect(fs.existsSync(path.join(projectRoot, markerPath))).toBe(true);
    }
    expect(cohortReport.files).toHaveLength(cohortPaths.length);
    for (const suitePath of cohortPaths) {
      const record = cohortReport.files.find(file => file.path === suitePath);
      expect(record).toEqual(
        expect.objectContaining({
          path: suitePath,
          primaryBlocker: 'test-helper-package-boundary',
          disposition: 'requires-package-boundary-change',
        })
      );
    }
  });

  test('classifies custom root suites under the caller-provided roots', () => {
    writeFile(tempRoot, 'tests/custom/domain/custom-root.test.js', 'test("custom", () => {});');
    writeConfig(tempRoot, 'jest.native-default.config.cjs', []);
    writeConfig(tempRoot, 'jest.native-esm.config.cjs', []);

    const report = reporter.buildClassificationReport({
      rootDir: tempRoot,
      roots: ['tests/custom'],
      nativeDefaultConfigPath: path.join(tempRoot, 'jest.native-default.config.cjs'),
      nativeCoverageConfigPath: path.join(tempRoot, 'jest.native-esm.config.cjs'),
    });

    expect(report.files).toEqual([
      expect.objectContaining({
        path: 'tests/custom/domain/custom-root.test.js',
        root: 'tests/custom',
      }),
    ]);
    expect(report.totals.byRoot).toEqual({ 'tests/custom': 1 });
  });

  test('detects root ESM syntax without regex backtracking-prone line anchors', () => {
    expect(reporter.hasRootEsmSyntax('const importable = true;\n  export { importable };\n')).toBe(
      true
    );
    expect(reporter.hasRootEsmSyntax('const imported = "value";\nconst exported = true;\n')).toBe(
      false
    );
  });

  test.each(packageBoundaryCases)(
    '$description',
    ({ packageJsonPath, packageJsonContent, testFilePath, testSource, expectedRecord }) => {
      writeFile(tempRoot, 'tests/unit/package.json', JSON.stringify({ type: 'module' }));
      writeFile(tempRoot, packageJsonPath, packageJsonContent);
      writeFile(tempRoot, testFilePath, testSource);
      writeNativeRunnerConfigs(tempRoot);

      const report = buildClassificationReport(reporter, tempRoot);

      expect(report.files).toEqual(
        expect.arrayContaining([expect.objectContaining(expectedRecord)])
      );
    }
  );

  test('does not treat the project root package.json as a nested test-helper boundary', () => {
    writeFile(tempRoot, 'package.json', JSON.stringify({ type: 'commonjs' }));
    writeFile(tempRoot, 'tests/unit/root-package-only.test.js', 'test("root", () => {});');
    writeNativeRunnerConfigs(tempRoot);

    const report = buildClassificationReport(reporter, tempRoot);

    expect(report.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'tests/unit/root-package-only.test.js',
          packageBoundary: null,
          signals: expect.not.arrayContaining(['test-helper-package-boundary']),
        }),
      ])
    );
  });

  test('finds package boundaries when rootDir is passed as a relative path', () => {
    writeFile(
      tempRoot,
      'tests/unit/helper-package/package.json',
      JSON.stringify({ type: 'module' })
    );
    writeFile(
      tempRoot,
      'tests/unit/helper-package/package-boundary.test.js',
      'test("esm", () => {});'
    );
    writeNativeRunnerConfigs(tempRoot);

    const report = reporter.buildClassificationReport({
      rootDir: path.relative(projectRoot, tempRoot),
      roots: ['tests/unit'],
      nativeDefaultConfigPath: path.join(tempRoot, 'jest.native-default.config.cjs'),
      nativeCoverageConfigPath: path.join(tempRoot, 'jest.native-esm.config.cjs'),
      files: ['tests/unit/helper-package/package-boundary.test.js'],
    });

    expect(report.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'tests/unit/helper-package/package-boundary.test.js',
          packageBoundary: 'tests/unit/helper-package/package.json',
          signals: expect.arrayContaining(['test-helper-package-boundary']),
        }),
      ])
    );
  });

  test('does not cross into same-prefix sibling directories when resolving package boundaries', () => {
    const nestedRootDir = path.join(tempRoot, 'tests/unit');
    writeFile(tempRoot, 'tests/unitary/package.json', JSON.stringify({ type: 'module' }));
    writeFile(tempRoot, 'tests/unitary/package-boundary.test.js', 'test("esm", () => {});');

    const record = reporter.classifyFile({
      filePath: '../unitary/package-boundary.test.js',
      rootDir: nestedRootDir,
      roots: ['tests/unit'],
    });

    expect(record.packageBoundary).toBeNull();
    expect(record.signals).not.toContain('test-helper-package-boundary');
  });

  test('classifies caller-provided file paths with the same record shape as discovered files', () => {
    setupNativeRunnerFixture(tempRoot);

    const report = reporter.buildClassificationReport({
      rootDir: tempRoot,
      roots: ['tests/unit'],
      nativeDefaultConfigPath: path.join(tempRoot, 'jest.native-default.config.cjs'),
      nativeCoverageConfigPath: path.join(tempRoot, 'jest.native-esm.config.cjs'),
      files: ['tests/unit/storage.test.js'],
    });

    expect(report.files).toEqual([
      expect.objectContaining({
        path: 'tests/unit/storage.test.js',
        root: 'tests/unit',
        signals: expect.arrayContaining(['jsdom-origin-or-storage']),
        primaryBlocker: 'jsdom-origin-or-storage',
        disposition: 'probe-for-native-default',
      }),
    ]);
    expect(report.totals.byRoot).toEqual({ 'tests/unit': 1 });
    expect(report.totals.byBlocker).toEqual({ 'jsdom-origin-or-storage': 1 });
    expect(report.candidateCohorts).toEqual([
      expect.objectContaining({ path: 'tests/unit/storage.test.js' }),
    ]);
  });

  test('classifies a single file when native runner sets are omitted', () => {
    writeFile(tempRoot, 'tests/unit/storage.test.js', 'sessionStorage.clear();');

    const record = reporter.classifyFile({
      filePath: 'tests/unit/storage.test.js',
      rootDir: tempRoot,
      roots: ['tests/unit'],
    });

    expect(record).toEqual(
      expect.objectContaining({
        path: 'tests/unit/storage.test.js',
        root: 'tests/unit',
        primaryBlocker: 'jsdom-origin-or-storage',
      })
    );
  });

  test('renders Markdown with blocker counts and candidate rows', () => {
    setupNativeRunnerFixture(tempRoot);

    const report = reporter.buildClassificationReport({
      rootDir: tempRoot,
      roots: ['tests/unit', 'tests/contract', 'tests/native-esm'],
      nativeDefaultConfigPath: path.join(tempRoot, 'jest.native-default.config.cjs'),
      nativeCoverageConfigPath: path.join(tempRoot, 'jest.native-esm.config.cjs'),
      files: ['tests/unit/storage.test.js'],
    });

    const markdown = reporter.renderMarkdown(report);

    expect(markdown).toContain('retirement-mode diagnostic');
    expect(markdown).toContain('does not execute Jest suites');
    expect(markdown).toContain('does not own coverage');
    expect(markdown).toContain('does not decide default developer commands');
    expect(markdown).toContain('Unknown classifications remain a hard diagnostic failure');
    expect(markdown).toContain('## Blocker Class Counts');
    expect(markdown).toContain('`jsdom-origin-or-storage`');
    expect(markdown).toContain('## Phase 3 Candidate Cohorts');
    expect(markdown).toContain('tests/unit/storage.test.js');
  });

  test('CLI writes summaries under coverage/native-default', () => {
    setupNativeRunnerFixture(tempRoot);

    const result = runCliWithArgs([
      '--root-dir',
      tempRoot,
      '--native-default-config',
      path.join(tempRoot, 'jest.native-default.config.cjs'),
      '--native-coverage-config',
      path.join(tempRoot, 'jest.native-esm.config.cjs'),
      '--summary-json',
      path.join(allowedOutputRoot, 'blocker-classification-summary.json'),
      '--summary-md',
      path.join(allowedOutputRoot, 'blocker-classification-summary.md'),
    ]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(allowedOutputRoot, 'blocker-classification-summary.json'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(allowedOutputRoot, 'blocker-classification-summary.md'))).toBe(
      true
    );
  });

  test.each(rejectedSymlinkOutputCases)('$description', caseDefinition => {
    expect.hasAssertions();
    setupNativeRunnerFixture(tempRoot);

    const symlinkTargetPath = path.join(tempRoot, `escaped-${caseDefinition.fileName}`);
    const symlinkPath = path.join(allowedOutputRoot, `symlink-${caseDefinition.fileName}`);
    const { jsonPath, markdownPath } = buildRejectedSymlinkOutputPaths({
      allowedOutputRoot,
      fileName: caseDefinition.fileName,
      flag: caseDefinition.flag,
      symlinkPath,
    });

    caseDefinition.prepareSymlinkTarget({
      tempRoot,
      fileName: caseDefinition.fileName,
      symlinkTargetPath,
    });
    fs.symlinkSync(symlinkTargetPath, symlinkPath, caseDefinition.symlinkType);

    const result = runCliWithArgs([
      '--root-dir',
      tempRoot,
      '--native-default-config',
      path.join(tempRoot, 'jest.native-default.config.cjs'),
      '--native-coverage-config',
      path.join(tempRoot, 'jest.native-esm.config.cjs'),
      '--summary-json',
      jsonPath,
      '--summary-md',
      markdownPath,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('摘要輸出路徑必須位於 coverage/native-default 底下');
    caseDefinition.verifyTarget({ symlinkTargetPath, fileName: caseDefinition.fileName });
  });

  test('CLI rejects symlinked coverage/native-default output root', () => {
    setupNativeRunnerFixture(tempRoot);
    fs.rmSync(allowedOutputRoot, { recursive: true, force: true });
    const escapedOutputRoot = path.join(tempRoot, 'escaped-native-default-root');
    createDirectory(escapedOutputRoot);
    fs.symlinkSync(escapedOutputRoot, allowedOutputRoot, 'dir');

    const result = runCliWithArgs([
      '--root-dir',
      tempRoot,
      '--native-default-config',
      path.join(tempRoot, 'jest.native-default.config.cjs'),
      '--native-coverage-config',
      path.join(tempRoot, 'jest.native-esm.config.cjs'),
      '--summary-json',
      path.join(allowedOutputRoot, 'blocker-classification-summary.json'),
      '--summary-md',
      path.join(allowedOutputRoot, 'blocker-classification-summary.md'),
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('摘要輸出路徑必須位於 coverage/native-default 底下');
    expectPathDoesNotExist(path.join(escapedOutputRoot, 'blocker-classification-summary.json'));
  });
});
