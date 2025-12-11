/**
 * 覆蓋率合併工具
 *
 * 將 Jest 單元測試覆蓋率和 E2E 測試覆蓋率合併為統一報告
 */

const fs = require('fs');
const path = require('path');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');

class CoverageMerger {
  constructor() {
    this.coverageMap = createCoverageMap({});
  }

  /**
   * 加載 Jest 覆蓋率數據
   */
  loadJestCoverage(jestCoverageFile) {
    console.log('📖 加載 Jest 單元測試覆蓋率...');

    if (!fs.existsSync(jestCoverageFile)) {
      console.warn(`⚠️ Jest 覆蓋率文件不存在: ${jestCoverageFile}`);
      return;
    }

    try {
      const jestCoverage = JSON.parse(fs.readFileSync(jestCoverageFile, 'utf8'));

      // 合併到覆蓋率 map
      this.coverageMap.merge(jestCoverage);

      const fileCount = Object.keys(jestCoverage).length;
      console.log(`✅ 已加載 ${fileCount} 個文件的 Jest 覆蓋率`);
    } catch (error) {
      console.error('❌ 加載 Jest 覆蓋率失敗:', error.message);
    }
  }

  /**
   * 加載 E2E 覆蓋率數據
   */
  loadE2ECoverage(e2eCoverageFile) {
    console.log('📖 加載 E2E 測試覆蓋率...');

    if (!fs.existsSync(e2eCoverageFile)) {
      console.warn(`⚠️ E2E 覆蓋率文件不存在: ${e2eCoverageFile}`);
      return;
    }

    try {
      const e2eCoverage = JSON.parse(fs.readFileSync(e2eCoverageFile, 'utf8'));

      // 合併到覆蓋率 map
      this.coverageMap.merge(e2eCoverage);

      const fileCount = Object.keys(e2eCoverage).length;
      console.log(`✅ 已加載 ${fileCount} 個文件的 E2E 覆蓋率`);
    } catch (error) {
      console.error('❌ 加載 E2E 覆蓋率失敗:', error.message);
    }
  }

  /**
   * 生成合併後的報告
   */
  generateReports(outputDir, reporters = ['text', 'json', 'lcov', 'html']) {
    console.log('\n📊 生成合併後的覆蓋率報告...');

    // 確保輸出目錄存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 創建報告上下文
    const context = createContext({
      dir: outputDir,
      coverageMap: this.coverageMap,
      defaultSummarizer: 'nested',
    });

    // 生成各種格式的報告
    reporters.forEach(reporterName => {
      try {
        const reporter = reports.create(reporterName, {});
        reporter.execute(context);
        console.log(`  ✅ ${reporterName} 報告已生成`);
      } catch (error) {
        console.error(`  ❌ ${reporterName} 報告生成失敗:`, error.message);
      }
    });

    console.log(`\n✅ 所有報告已保存到: ${outputDir}`);
  }

  /**
   * 打印覆蓋率摘要
   */
  printSummary() {
    console.log(`
${'='.repeat(60)}
📊 合併後的覆蓋率摘要
${'='.repeat(60)}`);

    const summary = this.coverageMap.getCoverageSummary();

    console.log(`
語句覆蓋率:   ${summary.statements.pct.toFixed(2)}% (${summary.statements.covered}/${summary.statements.total})
分支覆蓋率:   ${summary.branches.pct.toFixed(2)}% (${summary.branches.covered}/${summary.branches.total})
函數覆蓋率:   ${summary.functions.pct.toFixed(2)}% (${summary.functions.covered}/${summary.functions.total})
行覆蓋率:     ${summary.lines.pct.toFixed(2)}% (${summary.lines.covered}/${summary.lines.total})
    `);

    console.log(`${'='.repeat(60)}\n`);

    return summary;
  }

  /**
   * 比較測試前後的覆蓋率變化
   */
  static compareCoverage(beforeSummary, afterSummary) {
    console.log(`
${'='.repeat(60)}
📈 覆蓋率變化
${'='.repeat(60)}`);

    // 防禦性檢查：確保 summary 對象存在
    if (!beforeSummary || !afterSummary) {
      console.warn('⚠️ 無法比較覆蓋率：缺少 summary 數據');
      console.log(`${'='.repeat(60)}\n`);
      return;
    }

    const metrics = ['statements', 'branches', 'functions', 'lines'];

    metrics.forEach(metric => {
      // 防禦性檢查：確保 metric 數據存在
      if (!beforeSummary[metric] || !afterSummary[metric]) {
        console.warn(`⚠️ 跳過 ${metric}：數據不完整`);
        return;
      }

      const before = beforeSummary[metric].pct || 0;
      const after = afterSummary[metric].pct || 0;
      const diff = after - before;
      const arrow = diff > 0 ? '↗️' : diff < 0 ? '↘️' : '→';
      const sign = diff > 0 ? '+' : '';

      console.log(
        `${metric.padEnd(12)}: ${before.toFixed(2)}% → ${after.toFixed(2)}% ${arrow} ${sign}${diff.toFixed(2)}%`
      );
    });

    console.log(`${'='.repeat(60)}\n`);
  }

  /**
   * 執行完整的合併流程
   */
  merge(config) {
    console.log('\n🔄 開始合併覆蓋率數據...\n');

    // 1. 加載 Jest 覆蓋率
    const jestCoverageFile = path.join('coverage', 'coverage-final.json');
    this.loadJestCoverage(jestCoverageFile);

    // 記錄 Jest 覆蓋率摘要（可能為空）
    const jestSummary =
      Object.keys(this.coverageMap.data).length > 0 ? this.coverageMap.getCoverageSummary() : null;

    // 2. 加載 E2E 覆蓋率
    const e2eCoverageFile = path.join(config.coverage.dir, 'coverage-final.json');
    this.loadE2ECoverage(e2eCoverageFile);

    // 3. 生成合併報告
    this.generateReports(config.coverage.mergedDir, config.coverage.reporters);

    // 4. 打印摘要
    const mergedSummary = this.printSummary();

    // 5. 比較覆蓋率變化（只有當兩者都存在時）
    if (jestSummary && mergedSummary) {
      CoverageMerger.compareCoverage(jestSummary, mergedSummary);
    } else {
      console.log('\n⚠️ 跳過覆蓋率比較：Jest 覆蓋率數據不完整\n');
    }

    return {
      jestSummary,
      mergedSummary,
      coverageMap: this.coverageMap,
    };
  }
}

// 命令行執行
if (require.main === module) {
  const config = require('./coverage-config');
  const merger = new CoverageMerger();

  try {
    merger.merge(config);
    console.log('✅ 覆蓋率合併完成');
  } catch (error) {
    console.error('❌ 覆蓋率合併失敗:', error);
    process.exitCode = 1;
  }
}

module.exports = CoverageMerger;
