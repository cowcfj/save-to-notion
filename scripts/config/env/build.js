// ==========================================
// 建置環境配置 (Build Environment Config)
// ==========================================

/**
 * 建置環境配置
 * 此物件為所有 OAuth 相關配置的「單一真理來源 (Single Source of Truth)」。
 * - 本地開發：由 postinstall 自動從 env.example.js 複製，預設值為 OAuth 關閉。
 * - CI/CD 生產：由 GitHub Actions 腳本基於 env.example.js 動態生成並注入 Secrets。
 *
 * @see docs/specs/BUILD_ENVIRONMENT_STRATEGY_SPEC.md
 */
export const BUILD_ENV = Object.freeze({
  // 控制 UI 是否渲染 OAuth 登入區塊，以及 AuthManager 是否啟動 OAuth 流程
  ENABLE_OAUTH: true,
  // 控制 UI 是否渲染 Cloudflare account 登入區塊
  ENABLE_ACCOUNT: true,
  // 後端 Token 代理伺服器位址（末尾不可帶斜線，否則會產生雙斜線導致 API 路由失敗）
  OAUTH_SERVER_URL: 'https://save-to-notion-api.bulldrive.workers.dev',
  // Notion Public Integration Client ID
  OAUTH_CLIENT_ID: '319d872b-594c-8139-81d3-0037cd2c93bd',
  // 用於驗證 /refresh 請求，須與 Cloudflare Worker 的 EXTENSION_API_KEY binding 一致
  EXTENSION_API_KEY: '0ff1c6e137ad16ae1a1dfd4fc63e3200a18ec0b563120cb2857ced72793a24cb',
});
