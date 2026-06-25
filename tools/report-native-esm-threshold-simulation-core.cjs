const path = require('node:path');
const { createCoverageMap } = require('istanbul-lib-coverage');

const metricNames = ['lines', 'statements', 'functions', 'branches'];

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
  if (pct === 'Unknown') {
    return 100;
  }
  return pct;
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
      delta: Math.floor((actual - threshold) * 100) / 100,
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
      Math.floor(
        (nativeSummary.global.metrics[metricName].pct -
          incumbentSummary.global.metrics[metricName].pct) *
          100
      ) / 100,
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
      evidence: 'official-scope-parity 未通過或缺少 scope parity summary，threshold parity 只能作為未定論診斷。',
    };
  }

  if (incumbentThreshold.pass && nativeThreshold.pass) {
    return {
      id: 'threshold-parity',
      status: 'pass',
      blocking: false,
      evidence: 'incumbent 與 native ESM coverage 都通過目前 coverageThreshold.global。',
    };
  }

  if (incumbentThreshold.pass && !nativeThreshold.pass) {
    return {
      id: 'threshold-parity',
      status: 'fail',
      blocking: false,
      evidence: 'incumbent coverage 通過門檻，但 native ESM coverage 未通過門檻。',
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
    evidence: `${producerName} coverage ${thresholdResult.pass ? '通過' : '未通過'} coverageThreshold.global。`,
  };
}

function summarizeFileDrift({ incumbentSummary, nativeSummary, driftThreshold }) {
  const incumbentFiles = createFileMetricMap(incumbentSummary);
  const nativeFiles = createFileMetricMap(nativeSummary);
  const sharedPaths = [...incumbentFiles.keys()].filter(filePath => nativeFiles.has(filePath)).sort();
  const materialFiles = [];
  const nativeZeroIncumbentNonzeroFiles = [];

  for (const filePath of sharedPaths) {
    const incumbentFile = incumbentFiles.get(filePath);
    const nativeFile = nativeFiles.get(filePath);
    const incumbentLinePct = incumbentFile.metrics.lines.pct;
    const nativeLinePct = nativeFile.metrics.lines.pct;
    const linePctDelta = Math.floor((nativeLinePct - incumbentLinePct) * 100) / 100;
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

function compareCoverageSummaries({
  incumbentSummary,
  nativeSummary,
  thresholds,
  driftThreshold = 20,
  scopeParitySummary,
  incumbentCoveragePath = 'coverage/jest/coverage-final.json',
  nativeCoveragePath = 'coverage/native-esm/coverage-final.json',
}) {
  const incumbentThreshold = evaluateThresholds(incumbentSummary, thresholds);
  const nativeThreshold = evaluateThresholds(nativeSummary, thresholds);
  const incumbentFiles = createFileMetricMap(incumbentSummary);
  const nativeFiles = createFileMetricMap(nativeSummary);
  const incumbentOnlyFiles = [...incumbentFiles.keys()].filter(filePath => !nativeFiles.has(filePath)).sort();
  const nativeOnlyFiles = [...nativeFiles.keys()].filter(filePath => !incumbentFiles.has(filePath)).sort();
  const sharedFiles = [...incumbentFiles.keys()].filter(filePath => nativeFiles.has(filePath)).sort();

  return {
    schemaVersion: 1,
    diagnosticOnly: true,
    incumbentCoveragePath,
    nativeCoveragePath,
    thresholdSource: 'jest.config.js coverageThreshold.global',
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
      createThresholdGate('incumbent-threshold', incumbentThreshold, 'incumbent'),
      createThresholdGate('native-threshold', nativeThreshold, 'native ESM'),
      {
        id: 'report-integrity',
        status: 'pass',
        blocking: false,
        evidence: 'threshold simulation 只讀取 repo root 內 coverage inputs，並只寫入 coverage/native-esm diagnostic artifacts。',
      },
    ],
    drift: summarizeFileDrift({ incumbentSummary, nativeSummary, driftThreshold }),
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
    options.nativeSummary || summarizeCoverageMap(options.nativeCoverageMap, { projectRoot: options.projectRoot });

  return compareCoverageSummaries({
    incumbentSummary,
    nativeSummary,
    thresholds: options.thresholds,
    driftThreshold: options.driftThreshold,
    scopeParitySummary: options.scopeParitySummary,
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
    }[status] || status
  );
}

function escapeMarkdownTableCell(value) {
  return String(value).replace(/\r?\n/g, ' ').replaceAll('|', String.raw`\|`);
}

function renderMetricRows(summary) {
  return metricNames
    .map(metricName => {
      const incumbent = summary.global.incumbent[metricName].pct;
      const native = summary.global.native[metricName].pct;
      const delta = summary.global.delta[metricName];
      const threshold = summary.thresholds[metricName];
      return `| ${metricName} | ${incumbent} | ${native} | ${delta} | ${threshold} |`;
    })
    .join('\n');
}

function renderThresholdSimulationMarkdown(summary) {
  const gateRows = summary.gates
    .map(
      gate =>
        `| \`${gate.id}\` | ${formatGateStatus(gate.status)} | ${gate.blocking ? '是' : '否'} | ${escapeMarkdownTableCell(gate.evidence)} |`
    )
    .join('\n');
  const driftRows =
    summary.drift.materialFiles.length === 0
      ? '| 無 |  |  |  |'
      : summary.drift.materialFiles
          .map(
            file =>
              `| \`${file.path}\` | ${file.incumbentLinePct} | ${file.nativeLinePct} | ${file.linePctDelta} |`
          )
          .join('\n');
  const zeroRows =
    summary.drift.nativeZeroIncumbentNonzeroFiles.length === 0
      ? '沒有 native 0% 但 incumbent nonzero 的檔案。'
      : summary.drift.nativeZeroIncumbentNonzeroFiles
          .map(file => `- \`${file.path}\`: incumbent ${file.incumbentLinePct}, native ${file.nativeLinePct}`)
          .join('\n');

  return `# Native ESM threshold simulation 摘要

> 僅供診斷，所有 gates 都是 non-blocking。這不是正式 coverage truth；Codecov 仍使用 \`coverage/jest/lcov.info\`。

## 總計

- incumbent 檔案數：${summary.totals.incumbentFiles}
- native ESM 檔案數：${summary.totals.nativeFiles}
- shared 檔案數：${summary.totals.sharedFiles}
- incumbent-only 檔案數：${summary.totals.incumbentOnlyFiles}
- native-only 檔案數：${summary.totals.nativeOnlyFiles}

## Global Metrics

| Metric | Incumbent | Native ESM | Delta | Threshold |
| --- | ---: | ---: | ---: | ---: |
${renderMetricRows(summary)}

## Gates

| Gate | 狀態 | 阻擋 | 證據 |
| --- | --- | --- | --- |
${gateRows}

## Material Drift Files

| 檔案 | Incumbent lines | Native lines | Delta |
| --- | ---: | ---: | ---: |
${driftRows}

## Native Zero / Incumbent Nonzero

${zeroRows}
`;
}

module.exports = {
  assertPathInsideDirectory,
  buildThresholdSimulationSummary,
  compareCoverageSummaries,
  evaluateThresholds,
  renderThresholdSimulationMarkdown,
  summarizeCoverageMap,
};
