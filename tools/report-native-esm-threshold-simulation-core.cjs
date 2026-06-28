const path = require('node:path');
const { createCoverageMap } = require('istanbul-lib-coverage');

const metricNames = ['lines', 'statements', 'functions', 'branches'];
const MAX_DRIFT_FILE_ROWS = 50;
const DEFAULT_ADAPTER_BASELINE = Object.freeze({
  nativeNonzeroOfficialFiles: 162,
  nativeZeroIncumbentNonzeroFiles: 23,
  requiredLines: 2073,
  residualGroupCounts: Object.freeze({
    'scripts/highlighter': 0,
    'scripts/utils': 20,
  }),
});

const BLOCKER_LEDGER = Object.freeze([
  {
    path: 'scripts/background.js',
    category: 'entrypoint-side-effect-boundary',
    reason: '擴充套件背景服務進入點具有頂層副作用，無法在無完整瀏覽器/擴充套件環境下安全導入。',
    expectedOwner: 'Browser Runtime',
    conditionForRemoval: '重構進入點以延遲載入副作用，或建立穩定的 chrome 擴充套件執行期模擬。',
  },
  {
    path: 'scripts/content/index.js',
    category: 'entrypoint-side-effect-boundary',
    reason: 'Content script 進入點具有頂層副作用，無法在無完整 DOM/擴充套件環境下安全導入。',
    expectedOwner: 'Browser Runtime',
    conditionForRemoval: '重構進入點以延遲載入副作用，或建立穩定的 DOM/JSDOM 執行期模擬。',
  },
  {
    path: 'scripts/postinstall.js',
    category: 'node-script-cjs-boundary',
    reason: 'Node.js 生命週期腳本採用 CommonJS 撰寫，非原生 ESM 執行期診斷之對象。',
    expectedOwner: 'Build Tooling',
    conditionForRemoval: '專案全面遷移至 type: module 或替換 Node 生命週期腳本。',
  },
  {
    path: 'scripts/background/handlers/saveHandlers.js',
    category: 'high-complexity-mocking-blocker',
    reason: '高複雜度請求/回應模擬阻礙（1500+ 行與 Notion API 互動的遺留 CJS 程式碼）。',
    expectedOwner: 'Refactoring Owner',
    conditionForRemoval: '將 Notion API 互動解耦為可模擬的 ESM 服務。',
  },
]);

const REPORT_MESSAGES = Object.freeze({
  NO_DRIFT_ROW: '| 無 |  |  |  |',
  NO_NATIVE_ZERO_FILES: '沒有 native 0% 但 incumbent nonzero 的檔案。',
  NOT_APPLICABLE: '不適用',
  DRIFT_TRUNCATED_ROW: hiddenCount =>
    `| 已截斷 | 顯示最嚴重前 ${MAX_DRIFT_FILE_ROWS} 筆；另有 ${hiddenCount} 筆未顯示。 |  |  |`,
});

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function isDescendantPath(relativePath) {
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function assertPathInsideDirectory(filePath, directoryPath, message) {
  const relativePath = path.relative(directoryPath, filePath);
  if (relativePath === '' || isDescendantPath(relativePath)) {
    return;
  }
  throw new Error(message);
}

function normalizeCoveragePath(filePath, projectRoot = process.cwd()) {
  if (!path.isAbsolute(filePath)) {
    return toPosix(filePath).replace(/^\.\//, '');
  }
  const relativePath = path.relative(projectRoot, filePath);
  if (isDescendantPath(relativePath)) {
    return toPosix(relativePath);
  }
  return toPosix(filePath);
}

function normalizePercentage(pct) {
  if (pct === 'Unknown' || Number.isNaN(pct)) {
    return 100;
  }
  return pct;
}

function roundPercentageDelta(delta) {
  const rounded = Math.round(delta * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeIstanbulMetrics(coverageSummary) {
  return Object.fromEntries(
    metricNames.map(metricName => [
      metricName,
      {
        total: coverageSummary[metricName].total,
        covered: coverageSummary[metricName].covered,
        pct: normalizePercentage(coverageSummary[metricName].pct),
      },
    ])
  );
}

function summarizeCoverageMap(coverageMap, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const istanbulMap = createCoverageMap(coverageMap || {});
  const files = istanbulMap
    .files()
    .map(filePath => ({
      path: normalizeCoveragePath(filePath, projectRoot),
      metrics: normalizeIstanbulMetrics(istanbulMap.fileCoverageFor(filePath).toSummary().toJSON()),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    files,
    global: {
      metrics: normalizeIstanbulMetrics(istanbulMap.getCoverageSummary().toJSON()),
    },
  };
}

function evaluateThresholds(summary, thresholds = {}) {
  const metrics = {};
  let pass = true;
  for (const metricName of metricNames) {
    const threshold = Number(thresholds[metricName] ?? 0);
    const actual = summary.global.metrics[metricName].pct;
    const status = actual >= threshold ? 'pass' : 'fail';
    if (status === 'fail') {
      pass = false;
    }
    metrics[metricName] = {
      actual,
      threshold,
      status,
      delta: roundPercentageDelta(actual - threshold),
    };
  }
  return { pass, metrics };
}

function createFileMetricMap(summary) {
  return new Map(summary.files.map(file => [file.path, file]));
}

function calculateGlobalDelta(incumbentSummary, nativeSummary) {
  return Object.fromEntries(
    metricNames.map(metricName => [
      metricName,
      roundPercentageDelta(
        nativeSummary.global.metrics[metricName].pct -
          incumbentSummary.global.metrics[metricName].pct
      ),
    ])
  );
}

function isScopeParityPass(scopeParitySummary) {
  const gate = scopeParitySummary?.gates?.find(record => record.id === 'official-scope-parity');
  return gate?.status === 'pass';
}

function createThresholdParityGate({ incumbentThreshold, nativeThreshold, scopeParitySummary }) {
  if (!isScopeParityPass(scopeParitySummary)) {
    return {
      id: 'threshold-parity',
      status: 'inconclusive',
      blocking: false,
      evidence:
        'official-scope-parity 未通過或缺少 scope parity summary，threshold parity 只能作為未定論診斷。',
    };
  }

  if (incumbentThreshold.pass && nativeThreshold.pass) {
    return {
      id: 'threshold-parity',
      status: 'pass',
      blocking: false,
      evidence: 'incumbent fallback 覆蓋率與 native ESM 覆蓋率都通過目前 V8 coverageThreshold.global。',
    };
  }

  if (incumbentThreshold.pass && !nativeThreshold.pass) {
    return {
      id: 'threshold-parity',
      status: 'fail',
      blocking: false,
      evidence: 'incumbent 覆蓋率通過門檻，但 native ESM 覆蓋率未通過門檻。',
    };
  }

  return {
    id: 'threshold-parity',
    status: 'inconclusive',
    blocking: false,
    evidence: 'incumbent coverage 本身未通過目前門檻，不能用來判斷 native ESM cutover parity。',
  };
}

function createThresholdGate(id, thresholdResult, producerName) {
  return {
    id,
    status: thresholdResult.pass ? 'pass' : 'fail',
    blocking: false,
    evidence: `${producerName} 覆蓋率${thresholdResult.pass ? '通過' : '未通過'} V8 coverageThreshold.global。`,
  };
}

function summarizeFileDrift({ incumbentSummary, nativeSummary, driftThreshold }) {
  const incumbentFiles = createFileMetricMap(incumbentSummary);
  const nativeFiles = createFileMetricMap(nativeSummary);
  const sharedPaths = [...incumbentFiles.keys()]
    .filter(filePath => nativeFiles.has(filePath))
    .sort();
  const materialFiles = [];
  const nativeZeroIncumbentNonzeroFiles = [];

  for (const filePath of sharedPaths) {
    const incumbentFile = incumbentFiles.get(filePath);
    const nativeFile = nativeFiles.get(filePath);
    const incumbentLinePct = incumbentFile.metrics.lines.pct;
    const nativeLinePct = nativeFile.metrics.lines.pct;
    const linePctDelta = roundPercentageDelta(nativeLinePct - incumbentLinePct);
    const record = {
      path: filePath,
      incumbentLinePct,
      nativeLinePct,
      linePctDelta,
    };
    if (incumbentLinePct - nativeLinePct >= driftThreshold) {
      materialFiles.push(record);
    }
    if (incumbentLinePct > 0 && nativeLinePct === 0) {
      nativeZeroIncumbentNonzeroFiles.push(record);
    }
  }

  return {
    materialFiles,
    nativeZeroIncumbentNonzeroFiles,
  };
}

function getPathGroup(filePath) {
  const parts = filePath.split('/');
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

function createGroupSummaryRecord(group, records) {
  const sortedRecords = [...records].sort((left, right) => left.linePctDelta - right.linePctDelta);
  return {
    group,
    files: records.length,
    worstLinePctDelta: sortedRecords[0]?.linePctDelta ?? 0,
    sampleFiles: sortedRecords.slice(0, 5).map(record => record.path),
  };
}

function groupDriftFilesByPathPrefix(records) {
  const groups = new Map();
  for (const record of records) {
    const group = getPathGroup(record.path);
    const groupRecords = groups.get(group) || [];
    groupRecords.push(record);
    groups.set(group, groupRecords);
  }

  return [...groups.entries()]
    .map(([group, groupRecords]) => createGroupSummaryRecord(group, groupRecords))
    .sort(
      (left, right) => right.files - left.files || left.worstLinePctDelta - right.worstLinePctDelta
    );
}

function summarizeBreadth({ sharedFiles, nativeFiles, drift }) {
  let nativeNonzeroOfficialFiles = 0;
  let nativeZeroOfficialFiles = 0;

  for (const filePath of sharedFiles) {
    const nativeLinePct = nativeFiles.get(filePath)?.metrics.lines.pct ?? 0;
    if (nativeLinePct > 0) {
      nativeNonzeroOfficialFiles += 1;
    } else {
      nativeZeroOfficialFiles += 1;
    }
  }

  return {
    nativeNonzeroOfficialFiles,
    nativeZeroOfficialFiles,
    materialDriftFiles: drift.materialFiles.length,
    nativeZeroIncumbentNonzeroFiles: drift.nativeZeroIncumbentNonzeroFiles.length,
    topMaterialDriftGroups: groupDriftFilesByPathPrefix(drift.materialFiles).slice(0, 15),
    topNativeZeroIncumbentNonzeroGroups: groupDriftFilesByPathPrefix(
      drift.nativeZeroIncumbentNonzeroFiles
    ).slice(0, 15),
  };
}

function createAdapterCheck(id, status, evidence) {
  return { id, status, evidence };
}

function getGroupCount(groupName, groups = []) {
  return groups.find(group => group.group === groupName)?.files ?? 0;
}

function evaluateResidualGroupCounts({ breadth, baseline }) {
  const baselineGroups = baseline.residualGroupCounts || {};
  return Object.entries(baselineGroups).map(([groupName, baselineCount]) => {
    const actualCount = getGroupCount(groupName, breadth.topNativeZeroIncumbentNonzeroGroups);
    const status = actualCount <= baselineCount ? 'pass' : 'fail';
    return createAdapterCheck(
      `residual-group:${groupName}`,
      status,
      `${groupName} native zero / incumbent nonzero 檔案數 ${actualCount}；baseline ${baselineCount}。`
    );
  });
}

function createScopeParityAdapterCheck(scopeParitySummary) {
  const scopeParityPassed = isScopeParityPass(scopeParitySummary);
  const evidence = scopeParityPassed
    ? 'official-scope-parity 已通過。'
    : 'official-scope-parity 未通過或缺少 summary。';
  return createAdapterCheck('official-scope-parity', scopeParityPassed ? 'pass' : 'fail', evidence);
}

function createSourceLineAdapterChecks(sourceLineSummary, adapterBaseline) {
  const sourceLineTotals = sourceLineSummary?.totals;
  if (sourceLineTotals) {
    return [
      createAdapterCheck(
        'source-line-correctness',
        sourceLineTotals.failedLines === 0 ? 'pass' : 'fail',
        `必要行通過 ${sourceLineTotals.passedLines}/${sourceLineTotals.requiredLines}；失敗 ${sourceLineTotals.failedLines}。`
      ),
      createAdapterCheck(
        'required-line-manifest-count',
        sourceLineTotals.requiredLines >= adapterBaseline.requiredLines ? 'pass' : 'fail',
        `必要行 manifest 數量 ${sourceLineTotals.requiredLines}；baseline ${adapterBaseline.requiredLines}。`
      ),
    ];
  }

  return [
    createAdapterCheck(
      'source-line-correctness',
      'not_evaluated',
      '缺少來源行正確性摘要。'
    ),
    createAdapterCheck(
      'required-line-manifest-count',
      'not_evaluated',
      '缺少來源行正確性摘要。'
    ),
  ];
}

function createBreadthAdapterChecks(breadth, adapterBaseline) {
  return [
    createAdapterCheck(
      'native-nonzero-official-files',
      breadth.nativeNonzeroOfficialFiles >= adapterBaseline.nativeNonzeroOfficialFiles
        ? 'pass'
        : 'fail',
      `native 正式非零檔案數 ${breadth.nativeNonzeroOfficialFiles}；baseline ${adapterBaseline.nativeNonzeroOfficialFiles}。`
    ),
    createAdapterCheck(
      'native-zero-incumbent-nonzero-files',
      breadth.nativeZeroIncumbentNonzeroFiles <= adapterBaseline.nativeZeroIncumbentNonzeroFiles
        ? 'pass'
        : 'fail',
      `native 零命中 / incumbent 非零命中檔案數 ${breadth.nativeZeroIncumbentNonzeroFiles}；baseline ${adapterBaseline.nativeZeroIncumbentNonzeroFiles}。`
    ),
  ];
}

function resolveAdapterStatus(checks) {
  const hasNotEvaluated = checks.some(check => check.status === 'not_evaluated');
  const hasFailures = checks.some(check => check.status === 'fail');
  if (hasFailures) {
    return 'fail';
  }
  return hasNotEvaluated ? 'not_evaluated' : 'pass';
}

function evaluateDiagnosticThresholdAdapter({
  breadth,
  scopeParitySummary,
  sourceLineSummary,
  baseline,
}) {
  const adapterBaseline = baseline || DEFAULT_ADAPTER_BASELINE;
  const checks = [
    createScopeParityAdapterCheck(scopeParitySummary),
    ...createSourceLineAdapterChecks(sourceLineSummary, adapterBaseline),
    ...createBreadthAdapterChecks(breadth, adapterBaseline),
    ...evaluateResidualGroupCounts({ breadth, baseline: adapterBaseline }),
  ];

  return {
    diagnosticOnly: true,
    status: resolveAdapterStatus(checks),
    blocking: false,
    baseline: adapterBaseline,
    checks,
  };
}

function compareCoverageSummaries({
  incumbentSummary,
  nativeSummary,
  thresholds,
  driftThreshold = 20,
  scopeParitySummary,
  sourceLineSummary,
  adapterBaseline = DEFAULT_ADAPTER_BASELINE,
  incumbentCoveragePath = 'coverage/jest/coverage-final.json',
  nativeCoveragePath = 'coverage/native-esm/coverage-final.json',
}) {
  const incumbentThreshold = evaluateThresholds(incumbentSummary, thresholds);
  const nativeThreshold = evaluateThresholds(nativeSummary, thresholds);
  const incumbentFiles = createFileMetricMap(incumbentSummary);
  const nativeFiles = createFileMetricMap(nativeSummary);
  const incumbentOnlyFiles = [...incumbentFiles.keys()]
    .filter(filePath => !nativeFiles.has(filePath))
    .sort();
  const nativeOnlyFiles = [...nativeFiles.keys()]
    .filter(filePath => !incumbentFiles.has(filePath))
    .sort();
  const sharedFiles = [...incumbentFiles.keys()]
    .filter(filePath => nativeFiles.has(filePath))
    .sort();
  const drift = summarizeFileDrift({ incumbentSummary, nativeSummary, driftThreshold });
  const breadth = summarizeBreadth({ sharedFiles, nativeFiles, drift });

  return {
    schemaVersion: 1,
    diagnosticOnly: true,
    incumbentCoveragePath,
    nativeCoveragePath,
    thresholdSource: 'jest.native-esm.config.cjs coverageThreshold.global',
    thresholds,
    driftThreshold,
    totals: {
      incumbentFiles: incumbentSummary.files.length,
      nativeFiles: nativeSummary.files.length,
      sharedFiles: sharedFiles.length,
      incumbentOnlyFiles: incumbentOnlyFiles.length,
      nativeOnlyFiles: nativeOnlyFiles.length,
    },
    global: {
      incumbent: incumbentSummary.global.metrics,
      native: nativeSummary.global.metrics,
      delta: calculateGlobalDelta(incumbentSummary, nativeSummary),
    },
    thresholdResults: {
      incumbent: incumbentThreshold,
      native: nativeThreshold,
    },
    gates: [
      createThresholdParityGate({ incumbentThreshold, nativeThreshold, scopeParitySummary }),
      createThresholdGate('incumbent-threshold', incumbentThreshold, 'incumbent fallback'),
      createThresholdGate('native-threshold', nativeThreshold, 'native ESM'),
      {
        id: 'report-integrity',
        status: 'pass',
        blocking: false,
        evidence:
          '門檻模擬只讀取 repo root 內的 coverage 輸入，並只寫入 coverage/native-esm 比較產物。',
      },
    ],
    breadth,
    diagnosticThresholdAdapter: evaluateDiagnosticThresholdAdapter({
      breadth,
      scopeParitySummary,
      sourceLineSummary,
      baseline: adapterBaseline,
    }),
    blockerLedger: BLOCKER_LEDGER,
    drift,
    scope: {
      incumbentOnlyFiles,
      nativeOnlyFiles,
    },
  };
}

function buildThresholdSimulationSummary(options) {
  const incumbentSummary =
    options.incumbentSummary ||
    summarizeCoverageMap(options.incumbentCoverageMap, { projectRoot: options.projectRoot });
  const nativeSummary =
    options.nativeSummary ||
    summarizeCoverageMap(options.nativeCoverageMap, { projectRoot: options.projectRoot });

  return compareCoverageSummaries({
    incumbentSummary,
    nativeSummary,
    thresholds: options.thresholds,
    driftThreshold: options.driftThreshold,
    scopeParitySummary: options.scopeParitySummary,
    sourceLineSummary: options.sourceLineSummary,
    adapterBaseline: options.adapterBaseline,
    incumbentCoveragePath: options.incumbentCoveragePath,
    nativeCoveragePath: options.nativeCoveragePath,
  });
}

function formatGateStatus(status) {
  return (
    {
      pass: '通過',
      fail: '失敗',
      inconclusive: '未定論',
      not_evaluated: '未評估',
    }[status] || status
  );
}

function escapeMarkdownTableCell(value) {
  return String(value)
    .replace(/\r?\n/g, ' ')
    .replaceAll('|', String.raw`\|`);
}

function formatMarkdownCodeList(values) {
  return values.map(value => `\`${value}\``).join('<br>');
}

function sortByWorstLineDelta(files) {
  return [...files].sort(
    (left, right) => left.linePctDelta - right.linePctDelta || left.path.localeCompare(right.path)
  );
}

function renderDriftRows(files) {
  if (files.length === 0) {
    return REPORT_MESSAGES.NO_DRIFT_ROW;
  }

  const displayedFiles = sortByWorstLineDelta(files).slice(0, MAX_DRIFT_FILE_ROWS);
  const rows = displayedFiles.map(
    file =>
      `| \`${file.path}\` | ${file.incumbentLinePct} | ${file.nativeLinePct} | ${file.linePctDelta} |`
  );
  const hiddenCount = files.length - displayedFiles.length;
  if (hiddenCount > 0) {
    rows.push(REPORT_MESSAGES.DRIFT_TRUNCATED_ROW(hiddenCount));
  }
  return rows.join('\n');
}

async function resolveCoverageThresholds(configExport) {
  const jestConfig = typeof configExport === 'function' ? await configExport() : configExport;
  return jestConfig?.coverageThreshold?.global || {};
}

function renderMetricRows(summary) {
  return metricNames
    .map(metricName => {
      const incumbent = summary.global.incumbent[metricName].pct;
      const native = summary.global.native[metricName].pct;
      const delta = summary.global.delta[metricName];
      const threshold = summary.thresholds?.[metricName] ?? REPORT_MESSAGES.NOT_APPLICABLE;
      return `| ${metricName} | ${incumbent} | ${native} | ${delta} | ${threshold} |`;
    })
    .join('\n');
}

function renderAdapterCheckRows(summary) {
  const checks = summary.diagnosticThresholdAdapter?.checks || [];
  if (checks.length === 0) {
    return '| 無 | 未評估 | 無 adapter checks。 |';
  }
  return checks
    .map(
      check =>
        `| \`${check.id}\` | ${formatGateStatus(check.status)} | ${escapeMarkdownTableCell(check.evidence)} |`
    )
    .join('\n');
}

function renderThresholdSimulationMarkdown(summary) {
  const gateRows = summary.gates
    .map(
      gate =>
        `| \`${gate.id}\` | ${formatGateStatus(gate.status)} | ${gate.blocking ? '是' : '否'} | ${escapeMarkdownTableCell(gate.evidence)} |`
    )
    .join('\n');
  const adapter = summary.diagnosticThresholdAdapter;
  const adapterStatus = adapter?.status
    ? formatGateStatus(adapter.status)
    : REPORT_MESSAGES.NOT_APPLICABLE;
  const adapterCheckRows = renderAdapterCheckRows(summary);
  const driftRows = renderDriftRows(summary.drift.materialFiles);
  const zeroRows =
    summary.drift.nativeZeroIncumbentNonzeroFiles.length === 0
      ? REPORT_MESSAGES.NO_NATIVE_ZERO_FILES
      : summary.drift.nativeZeroIncumbentNonzeroFiles
          .map(
            file =>
              `- \`${file.path}\`: incumbent ${file.incumbentLinePct}, native ${file.nativeLinePct}`
          )
          .join('\n');
  const materialGroupRows =
    summary.breadth?.topMaterialDriftGroups?.length > 0
      ? summary.breadth.topMaterialDriftGroups
          .map(
            record =>
              `| \`${record.group}\` | ${record.files} | ${record.worstLinePctDelta} | ${formatMarkdownCodeList(record.sampleFiles)} |`
          )
          .join('\n')
      : REPORT_MESSAGES.NO_DRIFT_ROW;
  const zeroGroupRows =
    summary.breadth?.topNativeZeroIncumbentNonzeroGroups?.length > 0
      ? summary.breadth.topNativeZeroIncumbentNonzeroGroups
          .map(
            record =>
              `| \`${record.group}\` | ${record.files} | ${record.worstLinePctDelta} | ${formatMarkdownCodeList(record.sampleFiles)} |`
          )
          .join('\n')
      : REPORT_MESSAGES.NO_DRIFT_ROW;

  return `# Native ESM 門檻比較摘要

> 比較 incumbent fallback 與正式 V8 本機門檻擁有者。比較檢查項仍是非阻擋；正式門檻檢查由 \`jest.native-esm.config.cjs\` 在 native coverage 執行中負責。

## 總計

- incumbent 檔案數：${summary.totals.incumbentFiles}
- native ESM 檔案數：${summary.totals.nativeFiles}
- shared 檔案數：${summary.totals.sharedFiles}
- 僅 incumbent 檔案數：${summary.totals.incumbentOnlyFiles}
- 僅 native 檔案數：${summary.totals.nativeOnlyFiles}
- native 正式非零檔案數：${summary.breadth?.nativeNonzeroOfficialFiles ?? REPORT_MESSAGES.NOT_APPLICABLE}
- native 正式零命中檔案數：${summary.breadth?.nativeZeroOfficialFiles ?? REPORT_MESSAGES.NOT_APPLICABLE}
- 重大漂移檔案數：${summary.breadth?.materialDriftFiles ?? REPORT_MESSAGES.NOT_APPLICABLE}
- native 零命中 / incumbent 非零命中檔案數：${summary.breadth?.nativeZeroIncumbentNonzeroFiles ?? REPORT_MESSAGES.NOT_APPLICABLE}

## 全域指標

| 指標 | incumbent | native ESM | 差異 | 門檻 |
| --- | ---: | ---: | ---: | ---: |
${renderMetricRows(summary)}

## 檢查項

| 檢查項 | 狀態 | 阻擋 | 證據 |
| --- | --- | --- | --- |
${gateRows}

## V8 門檻 adapter

> 非阻擋 adapter 檢查，用來約束 V8 廣度與來源行正確性；正式 \`coverageThreshold.global\` 已由 native Jest ESM config 負責。

- adapter 狀態：${adapterStatus}
- baseline native 正式非零檔案數：${adapter?.baseline?.nativeNonzeroOfficialFiles ?? REPORT_MESSAGES.NOT_APPLICABLE}
- baseline native 零命中 / incumbent 非零命中檔案數：${adapter?.baseline?.nativeZeroIncumbentNonzeroFiles ?? REPORT_MESSAGES.NOT_APPLICABLE}
- baseline 必要行 manifest 數量：${adapter?.baseline?.requiredLines ?? REPORT_MESSAGES.NOT_APPLICABLE}

| 檢查 | 狀態 | 證據 |
| --- | --- | --- |
${adapterCheckRows}

## 重大漂移檔案

### 漂移群組

| 群組 | 檔案數 | 最嚴重差異 | 範例檔案 |
| --- | ---: | ---: | --- |
${materialGroupRows}

### 檔案

| 檔案 | incumbent 行覆蓋率 | native 行覆蓋率 | 差異 |
| --- | ---: | ---: | ---: |
${driftRows}

## Native 零命中 / Incumbent 非零命中

### 零命中群組

| 群組 | 檔案數 | 最嚴重差異 | 範例檔案 |
| --- | ---: | ---: | --- |
${zeroGroupRows}

### 檔案

${zeroRows}

## 阻礙台帳

| 檔案路徑 | 阻礙類別 | 排除理由 | 預期所有權者 | 移除條件 |
| --- | --- | --- | --- | --- |
${summary.blockerLedger.map(blocker => `| \`${blocker.path}\` | \`${blocker.category}\` | ${escapeMarkdownTableCell(blocker.reason)} | \`${blocker.expectedOwner}\` | ${escapeMarkdownTableCell(blocker.conditionForRemoval)} |`).join('\n')}
`;
}

module.exports = {
  assertPathInsideDirectory,
  buildThresholdSimulationSummary,
  compareCoverageSummaries,
  evaluateThresholds,
  evaluateDiagnosticThresholdAdapter,
  normalizePercentage,
  renderThresholdSimulationMarkdown,
  resolveCoverageThresholds,
  summarizeCoverageMap,
};
