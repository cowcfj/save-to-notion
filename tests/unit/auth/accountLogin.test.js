import {
  buildAccountApiUrl,
  buildAccountLoginStartUrl,
  getOptionsAdvancedUrl,
} from '../../../scripts/auth/accountLogin.js';
import { BUILD_ENV } from '../../../scripts/config/env/index.js';

jest.mock('../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    OAUTH_SERVER_URL: 'https://worker.test',
  },
}));

describe('accountLogin.js', () => {
  beforeEach(() => {
    BUILD_ENV.OAUTH_SERVER_URL = 'https://worker.test';
    globalThis.chrome = {
      runtime: {
        id: 'ext_id_123',
        getURL: jest.fn(path => `chrome-extension://ext_id_123/${path}`),
      },
    };
  });

  afterEach(() => {
    delete globalThis.chrome;
    jest.clearAllMocks();
  });

  describe('buildAccountApiUrl', () => {
    it('應保留 base URL path prefix 並正規化前後斜線', () => {
      const result = buildAccountApiUrl(
        ' https://worker.test/proxy/// ',
        '///v1/account/google/start'
      );

      expect(result).toBe('https://worker.test/proxy/v1/account/google/start');
    });

    it('base URL 缺失時應拋出明確錯誤', () => {
      expect(() => buildAccountApiUrl('', '/v1/account/google/start')).toThrow(
        'OAUTH_SERVER_URL is required'
      );
      expect(() => buildAccountApiUrl(null, '/v1/account/google/start')).toThrow(
        'OAUTH_SERVER_URL is required'
      );
    });

    it('base URL 不是 absolute URL 時應拋出明確錯誤', () => {
      expect(() => buildAccountApiUrl('/relative/path', '/v1/account/google/start')).toThrow(
        'Invalid OAUTH_SERVER_URL: must be an absolute URL'
      );
    });

    it('base URL 含 query 或 hash 時應拒絕', () => {
      expect(() =>
        buildAccountApiUrl('https://worker.test?debug=1', '/v1/account/google/start')
      ).toThrow('Invalid OAUTH_SERVER_URL: must not include query or hash');

      expect(() =>
        buildAccountApiUrl('https://worker.test#callback', '/v1/account/google/start')
      ).toThrow('Invalid OAUTH_SERVER_URL: must not include query or hash');
    });
  });

  describe('buildAccountLoginStartUrl', () => {
    it('應建立帶有 extension id 與 callback mode 的 Google login start URL', () => {
      BUILD_ENV.OAUTH_SERVER_URL = 'https://worker.test/proxy';

      const result = buildAccountLoginStartUrl();
      const url = new URL(result.url);

      expect(result.success).toBe(true);
      expect(url.origin).toBe('https://worker.test');
      expect(url.pathname).toBe('/proxy/v1/account/google/start');
      expect(url.searchParams.get('ext_id')).toBe('ext_id_123');
      expect(url.searchParams.get('callback_mode')).toBe('bridge');
    });

    it('缺少 OAUTH_SERVER_URL 時應回傳 generic error', () => {
      BUILD_ENV.OAUTH_SERVER_URL = '';

      expect(buildAccountLoginStartUrl()).toEqual({
        success: false,
        error: '登入設定異常，請稍後再試',
        reason: 'missing_base_url',
      });
    });

    it('OAUTH_SERVER_URL 格式無效時應回傳 generic error', () => {
      BUILD_ENV.OAUTH_SERVER_URL = 'https://worker.test?debug=1';

      expect(buildAccountLoginStartUrl()).toEqual({
        success: false,
        error: '登入設定異常，請稍後再試',
        reason: 'invalid_base_url',
      });
    });
  });

  describe('getOptionsAdvancedUrl', () => {
    it('應回傳 options advanced section deep link', () => {
      expect(getOptionsAdvancedUrl()).toBe(
        'chrome-extension://ext_id_123/options/options.html?section=advanced'
      );
      expect(globalThis.chrome.runtime.getURL).toHaveBeenCalledWith(
        'options/options.html?section=advanced'
      );
    });
  });
});
