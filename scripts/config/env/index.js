/**
 * 環境配置聚合入口
 * 統一匯出 runtime 環境偵測與 build-time 配置
 */

import * as runtimeConfig from './runtime.js';
import * as buildConfig from './build.js';

export * from './runtime.js';
export * from './build.js';

const ENV_MODULE = Object.freeze({
  ...runtimeConfig,
  ...buildConfig,
});

export default ENV_MODULE;
