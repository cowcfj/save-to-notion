/**
 * 環境配置聚合入口。
 *
 * 目前透過 `export *` 聚合兩個子模組：
 * - `runtime.js`（`runtimeConfig`）：負責 runtime feature detection
 * - `build.js`（`buildConfig`）：負責 compile-time constants
 *
 * `ENV_MODULE` 以 `Object.freeze` 封裝聚合匯出，僅提供淺層凍結；
 * nested 物件（例如 `BUILD_ENV` 內部屬性）若未由子模組自行凍結，仍可被修改。
 * 既有測試的反序列化流程依賴此行為，請勿誤認為此處提供 deep freeze。
 *
 * @see runtimeConfig
 * @see buildConfig
 * @see ENV_MODULE
 * @see Object.freeze
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
