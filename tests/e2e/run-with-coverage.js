#!/usr/bin/env node

/**
 * E2E 測試覆蓋率執行器
 *
 * 完整的 E2E 測試執行流程：
 * 1. 運行 E2E 測試並收集覆蓋率
 * 2. 與 Jest 覆蓋率合併
 * 3. 生成統一報告
 */

const E2ECoverageCollector = require('./coverage-collector');
const CoverageMerger = require('./coverage-merger');
const config = require('./coverage-config');

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 E2E 測試覆蓋率收集器');
  console.log('='.repeat(60) + '\n');

  try {
    // 步驟 1: 執行 E2E 測試並收集覆蓋率
    console.log('📝 步驟 1/2: 執行 E2E 測試...\n');

    const collector = new E2ECoverageCollector(config);
    const result = await collector.run();

    if (!result.success) {
      console.error('❌ 某些 E2E 測試失敗，但仍會生成覆蓋率報告');
    }

    // 步驟 2: 合併覆蓋率
    console.log('\n📝 步驟 2/2: 合併覆蓋率報告...\n');

    const merger = new CoverageMerger();
    const mergedResult = await merger.merge(config);

    // 最終摘要
    console.log('\n' + '='.repeat(60));
    console.log('🎉 測試覆蓋率收集完成！');
    console.log('='.repeat(60));
    console.log(`
📊 報告位置:
   - E2E 覆蓋率:    ${config.coverage.dir}
   - 合併覆蓋率:    ${config.coverage.mergedDir}
`);

    // 只在兩個摘要都存在時顯示比較
    if (mergedResult.jestSummary && mergedResult.mergedSummary) {
      console.log(`📈 覆蓋率提升:
   - 語句: ${mergedResult.jestSummary.statements.pct.toFixed(2)}% → ${mergedResult.mergedSummary.statements.pct.toFixed(2)}%
   - 分支: ${mergedResult.jestSummary.branches.pct.toFixed(2)}% → ${mergedResult.mergedSummary.branches.pct.toFixed(2)}%
   - 函數: ${mergedResult.jestSummary.functions.pct.toFixed(2)}% → ${mergedResult.mergedSummary.functions.pct.toFixed(2)}%
   - 行數: ${mergedResult.jestSummary.lines.pct.toFixed(2)}% → ${mergedResult.mergedSummary.lines.pct.toFixed(2)}%
`);
    } else if (mergedResult.mergedSummary) {
      console.log(`📊 E2E 覆蓋率:
   - 語句: ${mergedResult.mergedSummary.statements.pct.toFixed(2)}%
   - 分支: ${mergedResult.mergedSummary.branches.pct.toFixed(2)}%
   - 函數: ${mergedResult.mergedSummary.functions.pct.toFixed(2)}%
   - 行數: ${mergedResult.mergedSummary.lines.pct.toFixed(2)}%
`);
    }

    console.log(`💡 查看詳細報告: open ${config.coverage.mergedDir}/index.html
    `);

    console.log('='.repeat(60) + '\n');

    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('\n❌ 執行失敗:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// 執行主函數
if (require.main === module) {
  main();
}

module.exports = { main };
