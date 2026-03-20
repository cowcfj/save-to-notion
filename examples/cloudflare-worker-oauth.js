/**
 * Notion OAuth Proxy - Cloudflare Worker Example
 *
 * 這是一個基礎的 Cloudflare Worker 範例，用於代理 Notion 的 OAuth 認證請求
 * 並保護您的 Client Secret 避免在前端代碼中外洩。
 *
 * 部署指引：
 * 1. 在 Cloudflare 建立一個新的 Worker
 * 2. 貼上並覆寫原有的程式碼
 * 3. 在 Worker 的 Settings > Variables 頁面加入以下環境變數 (Environment Variables)：
 *    - OAUTH_CLIENT_ID: 您的 Notion Public Integration Client ID
 *    - OAUTH_CLIENT_SECRET: 您的 Notion Public Integration Client Secret (⚠️ 設定為 Encrypt)
 *    - EXTENSION_API_KEY: 您自訂的安全金鑰，用於防止他人濫用這個代理伺服器 (⚠️ 設定為 Encrypt)
 * 4. 將 Worker 的網址（例如 https://notion-proxy.your-name.workers.dev）填入本地 env.js 的 OAUTH_SERVER_URL 中
 * 5. 將上述的 EXTENSION_API_KEY 填入本地 env.js 的 EXTENSION_API_KEY 中
 */

export default {
  async fetch(request, env) {
    // 預檢請求 (CORS Preflight) - 允許 Chrome 擴充功能發起跨域請求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Extension-Key',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 1. 驗證擴充功能送來的安全金鑰，防止他人濫用此 Worker API
    const extKey = request.headers.get('X-Extension-Key');
    if (!extKey || extKey !== env.EXTENSION_API_KEY) {
      return Response.json(
        { error: 'Unauthorized Access' },
        {
          status: 401,
          headers: { 'Access-Control-Allow-Origin': '*' },
        }
      );
    }

    // 2. 準備轉向至官方 Notion API (僅允許 OAuth 相關路徑轉發，加強安全性)
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/v1/oauth/')) {
      return Response.json(
        { error: 'Endpoint Not Found' },
        {
          status: 404,
          headers: { 'Access-Control-Allow-Origin': '*' },
        }
      );
    }

    const notionUrl = `https://api.notion.com${url.pathname}`;

    // 3. 將 Client ID 與 Secret 組合成 Basic Auth 格式
    const authString = btoa(`${env.OAUTH_CLIENT_ID}:${env.OAUTH_CLIENT_SECRET}`);

    // 4. 重構請求並轉發至官方伺服器
    const proxyReq = new Request(notionUrl, {
      method: request.method,
      headers: {
        Authorization: `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      // 直接轉發原始的 Request Body
      body: request.body,
    });

    try {
      const response = await fetch(proxyReq);

      // 5. 將 Notion 回傳的內容直接轉交回 Chrome 擴充功能
      const responseBody = await response.text();
      return new Response(responseBody, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (_error) {
      // skipcq: JS-0002
      console.error('Proxy Error:', _error);
      return Response.json(
        { error: 'Proxy server encountered an error' },
        {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
        }
      );
    }
  },
};
