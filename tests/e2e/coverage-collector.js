/**
 * E2E 測試覆蓋率收集器
 *
 * 使用 Puppeteer Coverage API 收集瀏覽器中執行的 JavaScript 覆蓋率
 * 並轉換為 Istanbul 格式以便與 Jest 覆蓋率合併
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');

class E2ECoverageCollector {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
    this.coverageData = [];
  }

  /**
   * 啟動 Puppeteer 瀏覽器
   */
  async launch() {
    console.log('🚀 啟動 Puppeteer 瀏覽器...');

    this.browser = await puppeteer.launch({
      headless: this.config.puppeteer.headless,
      args: this.config.puppeteer.args,
      // 加載 Chrome 擴展
      ...(this.config.puppeteer.extensionPath && {
        args: [
          ...this.config.puppeteer.args,
          `--disable-extensions-except=${path.resolve(this.config.puppeteer.extensionPath)}`,
          `--load-extension=${path.resolve(this.config.puppeteer.extensionPath)}`
        ]
      })
    });

    this.page = await this.browser.newPage();

    // 設置視窗大小
    await this.page.setViewport({ width: 1280, height: 720 });

    console.log('✅ 瀏覽器啟動成功');
  }

  /**
   * 開始覆蓋率收集
   */
  async startCoverage() {
    console.log('📊 開始 JavaScript 覆蓋率收集...');

    // 啟用 JS 覆蓋率
    await this.page.coverage.startJSCoverage({
      resetOnNavigation: false, // 跨頁面導航保留覆蓋率
      reportAnonymousScripts: true // 包含匿名腳本
    });

    // 啟用 CSS 覆蓋率（可選）
    // await this.page.coverage.startCSSCoverage();
  }

  /**
   * 停止覆蓋率收集並獲取數據
   */
  async stopCoverage() {
    console.log('🛑 停止覆蓋率收集...');

    const jsCoverage = await this.page.coverage.stopJSCoverage();
    // const cssCoverage = await this.page.coverage.stopCSSCoverage();

    this.coverageData.push(...jsCoverage);

    console.log(`✅ 收集到 ${jsCoverage.length} 個 JavaScript 文件的覆蓋率數據`);

    return jsCoverage;
  }

  /**
   * 執行測試場景
   */
  async runTestScenario(scenario) {
    console.log(`\n🧪 執行測試場景: ${scenario.name}`);

    try {
      // 動態導入測試場景
      const testModule = require(path.resolve(scenario.file));

      // 執行測試
      await testModule.run(this.page, this.config);

      console.log(`✅ ${scenario.name} - 測試通過`);
      return true;
    } catch (error) {
      console.error(`❌ ${scenario.name} - 測試失敗:`, error.message);
      return false;
    }
  }

  /**
   * 將 Puppeteer 覆蓋率轉換為 Istanbul 格式
   */
  convertToIstanbul(coverage) {
    console.log('\n🔄 轉換覆蓋率格式為 Istanbul...');

    const coverageMap = createCoverageMap({});

    for (const entry of coverage) {
      // 過濾掉不需要的文件
      if (!this.shouldIncludeFile(entry.url)) {
        continue;
      }

      // 提取文件路徑
      const filePath = this.extractFilePath(entry.url);

      if (!filePath) {
        continue;
      }

      // 轉換範圍為 Istanbul 格式
      const istanbulCoverage = this.convertRangesToIstanbul(
        filePath,
        entry.text,
        entry.ranges
      );

      if (istanbulCoverage) {
        coverageMap.addFileCoverage(istanbulCoverage);
      }
    }

    console.log(`✅ 轉換完成，包含 ${Object.keys(coverageMap.data).length} 個文件`);

    return coverageMap;
  }

  /**
   * 判斷是否應該包含此文件
   */
  shouldIncludeFile(url) {
    // 只包含項目中的文件
    if (!url.includes('chrome-extension://') && !url.includes('file://')) {
      return false;
    }

    // 檢查是否在 include 列表中
    const fileName = this.extractFilePath(url);
    if (!fileName) return false;

    const { include, exclude } = this.config.coverage;

    // 檢查排除列表
    if (exclude.some(pattern => this.matchPattern(fileName, pattern))) {
      return false;
    }

    // 檢查包含列表
    return include.some(pattern => this.matchPattern(fileName, pattern));
  }

  /**
   * 從 URL 提取文件路徑
   */
  extractFilePath(url) {
    try {
      // Chrome 擴展 URL: chrome-extension://[id]/scripts/background.js
      if (url.includes('chrome-extension://')) {
        const match = url.match(/chrome-extension:\/\/[^/]+\/(.+)/);
        return match ? match[1] : null;
      }

      // 文件 URL: file:///path/to/file.js
      if (url.includes('file://')) {
        return url.replace('file://', '').replace(process.cwd(), '');
      }

      return null;
    } catch (error) {
      console.warn(`⚠️ 無法解析 URL: ${url}`, error);
      return null;
    }
  }

  /**
   * 簡單的模式匹配
   */
  matchPattern(str, pattern) {
    // 將 glob 模式轉換為正則表達式
    const regex = new RegExp(
      '^' + pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]') + '$'
    );
    return regex.test(str);
  }

  /**
   * 將 Puppeteer 範圍轉換為 Istanbul 覆蓋率格式
   */
  convertRangesToIstanbul(filePath, text, ranges) {
    try {
      // 創建基本的覆蓋率對象
      const coverage = {
        path: path.resolve(filePath),
        statementMap: {},
        fnMap: {},
        branchMap: {},
        s: {}, // statement counters
        f: {}, // function counters
        b: {}  // branch counters
      };

      // 簡化版：將每個範圍視為一個語句
      ranges.forEach((range, index) => {
        coverage.statementMap[index] = {
          start: this.offsetToLocation(text, range.start),
          end: this.offsetToLocation(text, range.end)
        };
        coverage.s[index] = range.count || 1;
      });

      return coverage;
    } catch (error) {
      console.warn(`⚠️ 轉換失敗: ${filePath}`, error.message);
      return null;
    }
  }

  /**
   * 將字符偏移轉換為行列位置
   */
  offsetToLocation(text, offset) {
    const lines = text.substring(0, offset).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length
    };
  }

  /**
   * 保存覆蓋率數據
   */
  saveCoverage(coverageMap, outputDir) {
    console.log(`\n💾 保存覆蓋率報告到: ${outputDir}`);

    // 確保輸出目錄存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 創建報告上下文
    const context = createContext({
      dir: outputDir,
      coverageMap,
      defaultSummarizer: 'nested'
    });

    // 生成不同格式的報告
    const reportTypes = this.config.coverage.reporters;

    for (const reportType of reportTypes) {
      const report = reports.create(reportType, {});
      report.execute(context);
      console.log(`  ✅ ${reportType} 報告已生成`);
    }

    console.log('✅ 所有覆蓋率報告已生成');
  }

  /**
   * 關閉瀏覽器
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 瀏覽器已關閉');
    }
  }

  /**
   * 執行完整的 E2E 測試並收集覆蓋率
   */
  async run() {
    try {
      // 1. 啟動瀏覽器
      await this.launch();

      // 2. 開始覆蓋率收集
      await this.startCoverage();

      // 3. 執行所有啟用的測試場景
      const enabledScenarios = this.config.testScenarios.filter(s => s.enabled);
      const results = [];

      for (const scenario of enabledScenarios) {
        const success = await this.runTestScenario(scenario);
        results.push({ scenario: scenario.name, success });
      }

      // 4. 停止覆蓋率收集
      const coverage = await this.stopCoverage();

      // 5. 轉換為 Istanbul 格式
      const coverageMap = this.convertToIstanbul(coverage);

      // 6. 保存覆蓋率報告
      this.saveCoverage(coverageMap, this.config.coverage.dir);

      // 7. 輸出測試結果摘要
      console.log('\n' + '='.repeat(60));
      console.log('📊 E2E 測試結果摘要');
      console.log('='.repeat(60));

      results.forEach(({ scenario, success }) => {
        const icon = success ? '✅' : '❌';
        console.log(`${icon} ${scenario}`);
      });

      const passedCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      console.log(`\n總計: ${passedCount}/${totalCount} 通過`);
      console.log('='.repeat(60) + '\n');

      return {
        success: passedCount === totalCount,
        coverageMap,
        results
      };

    } catch (error) {
      console.error('❌ E2E 測試執行失敗:', error);
      throw error;
    } finally {
      // 8. 清理
      await this.close();
    }
  }
}

module.exports = E2ECoverageCollector;
