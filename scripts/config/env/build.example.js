// ==========================================
// 建置環境配置範本 (Build Environment Config Template)
// ==========================================

/**
 * 建置環境配置範本
 * 本地開發：由 postinstall 自動從此檔案複製為 build.js。
 * CI/CD 生產：由 GitHub Actions 腳本基於此範本動態生成 build.js 並注入 Secrets。
 *
 * @see docs/specs/BUILD_ENVIRONMENT_STRATEGY_SPEC.md
 */
export const BUILD_ENV = Object.freeze({
  ENABLE_OAUTH: false,
  ENABLE_ACCOUNT: false,
  OAUTH_SERVER_URL: '',
  OAUTH_CLIENT_ID: '',
  // public anti-abuse filter：隨 client bundle 公開分發，並非 secret；
  // 僅用於擋廉價濫用，真正的刷新防護是後端 refresh_proof。
  EXTENSION_API_KEY: '',
});
// Trigger release please pipeline
