/*
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/"}
 *
 * TabService status update tests
 */

import { jest } from '@jest/globals';
import {
  buildHighlight,
  buildPageRecord,
  createTabService,
  loadedTabServiceModules,
  mockInjectionService,
  mockLogger,
  resetTabServiceTestState,
} from './tabServiceTestHarness.js';

describe('TabService status updates', () => {
  let HIGHLIGHTS_PREFIX = null;
  let PAGE_PREFIX = null;
  let URL_ALIAS_PREFIX = null;
  let sanitizeUrlForLogging = null;
  let service = null;

  beforeEach(() => {
    ({ HIGHLIGHTS_PREFIX, PAGE_PREFIX, URL_ALIAS_PREFIX, sanitizeUrlForLogging } =
      loadedTabServiceModules);
    resetTabServiceTestState();
    service = createTabService();
  });

  describe('updateTabStatus', () => {
    it('should skip invalid URLs', async () => {
      await service.updateTabStatus(1, null);
      await service.updateTabStatus(1, '');
      await service.updateTabStatus(1, 'ftp://example.com');

      expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
    });

    it('should skip restricted URLs', async () => {
      await service.updateTabStatus(1, 'chrome://extensions');

      expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
    });

    it('should call restricted URL dependency with the service context', async () => {
      service.isRestrictedUrl = jest.fn(function () {
        return this === service;
      });

      await service.updateTabStatus(1, 'https://example.com');

      expect(service.isRestrictedUrl).toHaveBeenCalledWith('https://example.com');
      expect(service.getSavedPageData).not.toHaveBeenCalled();
      expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
    });

    it('should set badge for saved pages', async () => {
      service.getSavedPageData = jest.fn().mockResolvedValue({
        pageId: '123',
        notionPageId: 'notion-123',
        lastVerifiedAt: Date.now(), // 確保在 TTL 內
      });
      chrome.storage.local.get.mockImplementation(_keys => Promise.resolve({}));

      await service.updateTabStatus(1, 'https://example.com');

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 1 });
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        color: '#48bb78',
        tabId: 1,
      });
    });

    it('should clear badge for unsaved pages', async () => {
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation(_keys => Promise.resolve({}));

      await service.updateTabStatus(1, 'https://example.com');

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
    });

    it('should inject bundle for auto-restore when highlights exist', async () => {
      // Mock highlights 存在
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation(_keys =>
        Promise.resolve({ 'highlights_https://example.com': [{ id: '1' }] })
      );

      // Mock tab get 返回 complete 狀態
      chrome.tabs.get.mockImplementation(_tabId =>
        Promise.resolve({ id: 1, status: 'complete', url: 'https://example.com' })
      );

      await service.updateTabStatus(1, 'https://example.com');

      // 驗證使用 ensureBundleInjected 而非 injectHighlighter
      expect(mockInjectionService.ensureBundleInjected).toHaveBeenCalledWith(1);
    });

    it('should normalize originalUrl when creating fallback url_alias key', async () => {
      service.resolveTabUrl = jest.fn().mockResolvedValue({
        stableUrl: 'https://example.com/stable',
        originalUrl: 'https://example.com/original/?utm_source=fb#frag',
        hasStableUrl: true,
      });
      service._verifyAndUpdateStatus = jest.fn().mockResolvedValue();
      service._getHighlightsFromStorage = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([{ id: '1' }]);
      service._waitForTabCompilation = jest
        .fn()
        .mockResolvedValue({ id: 1, status: 'complete', url: 'https://example.com/stable' });
      service._sendStableUrl = jest.fn();
      service.normalizeUrl = jest.fn(url => url.replace('/?utm_source=fb#frag', ''));

      // Phase 4 (tighten)：alias 寫入需 stableUrl 已有有效 evidence；seed page_<stable> 含 highlights
      chrome.storage.local.get.mockResolvedValue({
        'page_https://example.com/stable': {
          notion: null,
          highlights: [{ id: 'evidence-h', text: 'evidence', color: 'yellow' }],
          metadata: { lastUpdated: 1 },
        },
      });
      chrome.storage.local.set.mockResolvedValue(undefined);

      await service._updateTabStatusInternal(1, 'https://example.com/original/?utm_source=fb#frag');

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [`${URL_ALIAS_PREFIX}https://example.com/original`]: 'https://example.com/stable',
        })
      );
    });

    it('Phase 4 (tighten)：hasStableUrl=true 但 stableUrl 無 evidence 時，MUST NOT 寫入 url_alias', async () => {
      // 情境：Preloader 解析出 stableUrl，但 page_<stable> 與 highlights_<stable> 都無資料
      // 預期：tighten 模式下 alias 寫入應被跳過，避免 canonical 漂移
      service.resolveTabUrl = jest.fn().mockResolvedValue({
        stableUrl: 'https://example.com/?p=2928',
        originalUrl: 'https://example.com/long-path',
        hasStableUrl: true,
      });
      service._verifyAndUpdateStatus = jest.fn().mockResolvedValue();
      service._getHighlightsFromStorage = jest.fn().mockResolvedValue(null);
      jest.spyOn(service, 'migrateLegacyHighlights').mockResolvedValue();

      // 無 evidence：所有 key 都返回空
      chrome.storage.local.get.mockResolvedValue({});
      chrome.storage.local.set.mockResolvedValue(undefined);

      await service._updateTabStatusInternal(1, 'https://example.com/long-path');

      // alias key MUST NOT 被寫入
      const aliasSets = chrome.storage.local.set.mock.calls.filter(call =>
        Object.keys(call[0]).some(k => k.startsWith(URL_ALIAS_PREFIX))
      );
      expect(aliasSets).toHaveLength(0);
    });

    it('Phase 4 (tighten)：hasStableUrl=true 且 stableUrl 已有 page_* evidence 時，建立 url_alias', async () => {
      // 情境：stableUrl 對應的 page_* 已有 highlights → 滿足 tighten 條件
      service.resolveTabUrl = jest.fn().mockResolvedValue({
        stableUrl: 'https://example.com/?p=2928',
        originalUrl: 'https://example.com/long-path',
        hasStableUrl: true,
      });
      service._verifyAndUpdateStatus = jest.fn().mockResolvedValue();
      service._getHighlightsFromStorage = jest.fn().mockResolvedValue(null);
      jest.spyOn(service, 'migrateLegacyHighlights').mockResolvedValue();

      chrome.storage.local.get.mockResolvedValue({
        'page_https://example.com/?p=2928': {
          notion: null,
          highlights: [{ id: 'h', text: 'evidence', color: 'yellow' }],
          metadata: { lastUpdated: 1 },
        },
      });
      chrome.storage.local.set.mockResolvedValue(undefined);

      await service._updateTabStatusInternal(1, 'https://example.com/long-path');

      // alias 應該在 evidence 滿足時建立
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [`${URL_ALIAS_PREFIX}https://example.com/long-path`]: 'https://example.com/?p=2928',
      });
    });

    it('應等待 url_alias 寫入完成後才繼續更新狀態', async () => {
      service.resolveTabUrl = jest.fn().mockResolvedValue({
        stableUrl: 'https://example.com/?p=2928',
        originalUrl: 'https://example.com/long-path',
        hasStableUrl: true,
      });
      service._verifyAndUpdateStatus = jest.fn().mockResolvedValue();
      service._getHighlightsFromStorage = jest.fn().mockResolvedValue(null);
      jest.spyOn(service, 'migrateLegacyHighlights').mockResolvedValue();

      // Phase 4 follow-up（2026-05-03 plan §4）：顯式 mock chrome.storage.local.get,
      // 提供 stableUrl 的 page_* evidence,讓 _persistUrlAliasIfNeeded 真的走到 set 寫入路徑。
      // 不再依賴前一 test 的 mockResolvedValue 殘留（jest.clearAllMocks 不清 implementation,
      // 順序變動會讓本 test 偷偷走到 throw catch 路徑而非真的等 set 完成）。
      chrome.storage.local.get.mockResolvedValue({
        'page_https://example.com/?p=2928': {
          notion: null,
          highlights: [{ id: 'evidence-h', text: 'evidence', color: 'yellow' }],
          metadata: { lastUpdated: 1 },
        },
      });

      let resolveStorageSet;
      chrome.storage.local.set.mockReturnValue(
        new Promise(resolve => {
          resolveStorageSet = resolve;
        })
      );

      const updatePromise = service._updateTabStatusInternal(1, 'https://example.com/long-path');
      await Promise.resolve();

      expect(service._verifyAndUpdateStatus).not.toHaveBeenCalled();

      resolveStorageSet();
      await updatePromise;

      expect(service._verifyAndUpdateStatus).toHaveBeenCalledWith(
        1,
        'https://example.com/?p=2928',
        'https://example.com/long-path'
      );
    });

    it('url_alias 寫入失敗時應記錄警告並繼續更新狀態', async () => {
      service.resolveTabUrl = jest.fn().mockResolvedValue({
        stableUrl: 'https://example.com/?p=2928',
        originalUrl: 'https://example.com/long-path',
        hasStableUrl: true,
      });
      service._verifyAndUpdateStatus = jest.fn().mockResolvedValue();
      service._getHighlightsFromStorage = jest.fn().mockResolvedValue(null);
      jest.spyOn(service, 'migrateLegacyHighlights').mockResolvedValue();

      // Phase 4 (tighten)：先 seed evidence 才會走到 alias 寫入路徑，從而觸發 set 失敗
      chrome.storage.local.get.mockResolvedValue({
        'page_https://example.com/?p=2928': {
          notion: null,
          highlights: [{ id: 'h', text: 'evidence', color: 'yellow' }],
          metadata: { lastUpdated: 1 },
        },
      });
      chrome.storage.local.set.mockRejectedValue(new Error('alias write failed'));

      await service._updateTabStatusInternal(1, 'https://example.com/long-path');

      expect(service._verifyAndUpdateStatus).toHaveBeenCalledWith(
        1,
        'https://example.com/?p=2928',
        'https://example.com/long-path'
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[TabService] url_alias 寫入或檢查失敗，將繼續後續狀態更新',
        expect.objectContaining({
          action: 'updateTabStatus',
          originalUrl: expect.any(String),
          stableUrl: expect.any(String),
          error: expect.any(Error),
        })
      );
    });

    it('hasStableUrl=false 時不應建立 url_alias', async () => {
      // 情境：Preloader 超時，stableUrl = originalUrl
      service.resolveTabUrl = jest.fn().mockResolvedValue({
        stableUrl: 'https://example.com/long-path',
        originalUrl: 'https://example.com/long-path',
        hasStableUrl: false,
      });
      service._verifyAndUpdateStatus = jest.fn().mockResolvedValue();
      service._getHighlightsFromStorage = jest.fn().mockResolvedValue(null);
      jest.spyOn(service, 'migrateLegacyHighlights').mockResolvedValue();
      chrome.storage.local.set.mockResolvedValue(undefined);

      await service._updateTabStatusInternal(1, 'https://example.com/long-path');

      // 不應有任何 alias 建立調用（storage.local.set 未因 alias 而被呼叫）
      const aliasCalls = chrome.storage.local.set.mock.calls.filter(([arg]) =>
        Object.keys(arg).some(k => k.startsWith(URL_ALIAS_PREFIX))
      );
      expect(aliasCalls).toHaveLength(0);
    });

    it('stableUrl 查無 highlights 時應 fallback 到 originalUrl 並成功回傳 highlights', async () => {
      // 驗證 fallback 資料命中時確實回傳 highlights（功能正確性）
      const highlights = [{ id: 'fallback-highlight' }];

      service._getHighlightsFromStorage = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(highlights);

      const result = await service._getHighlightsWithFallback(
        'https://example.com/stable',
        true,
        'https://example.com/original'
      );

      expect(result).toBe(highlights);
      expect(service._getHighlightsFromStorage).toHaveBeenNthCalledWith(
        1,
        'https://example.com/stable'
      );
      expect(service._getHighlightsFromStorage).toHaveBeenNthCalledWith(
        2,
        'https://example.com/original'
      );
    });

    it('應以脫敏後的 highlight storage key 記錄除錯資訊', async () => {
      const rawUrl = 'https://example.com/article?token=secret123&utm_source=ads#frag';
      const rawStorageKey = `page_${rawUrl}`;
      chrome.storage.local.get.mockResolvedValue({
        [rawStorageKey]: { highlights: [{ id: 'highlight-1' }] },
      });

      await service._getHighlightsFromStorage(rawUrl);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `[TabService] Checking highlights for page_${sanitizeUrlForLogging(rawUrl)}:`,
        {
          found: true,
          count: 1,
        }
      );
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining(rawStorageKey),
        expect.anything()
      );
    });

    it('[REGRESSION] url_alias 指向 stableUrl 時，應能命中 page_<stableUrl>', async () => {
      const originalUrl = 'https://example.com/posts/hello';
      const stableUrl = 'https://example.com/?p=123';
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;
      const legacyKey = `${HIGHLIGHTS_PREFIX}${originalUrl}`;
      const highlights = [{ id: 'stable-highlight' }];

      chrome.storage.local.get.mockImplementation(async keys => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result = {};
        if (keyList.includes(`${URL_ALIAS_PREFIX}${originalUrl}`)) {
          result[`${URL_ALIAS_PREFIX}${originalUrl}`] = stableUrl;
        }
        if (keyList.includes(stablePageKey)) {
          result[stablePageKey] = { highlights };
        }
        return result;
      });

      const result = await service._getHighlightsFromStorage(originalUrl);

      expect(result).toEqual(highlights);
      expect(chrome.storage.local.get).toHaveBeenNthCalledWith(
        1,
        expect.arrayContaining([
          `${URL_ALIAS_PREFIX}${originalUrl}`,
          `${PAGE_PREFIX}${originalUrl}`,
          legacyKey,
        ])
      );
      expect(chrome.storage.local.get).toHaveBeenNthCalledWith(
        2,
        expect.arrayContaining([stablePageKey, `${HIGHLIGHTS_PREFIX}${stableUrl}`])
      );
    });

    // ─── Step 0.2 Regression Test ────────────────────────────────────────────
    // 驗證：fallback 命中 originalUrl 時，不應無條件補寫 url_alias。
    // 修復前此測試應 FAIL（因為現有程式碼會無條件補寫 alias）。
    it('[REGRESSION] fallback 命中 page_<originalUrl> 時，不應立即補寫 url_alias', async () => {
      const highlights = [{ id: 'regression-no-alias' }];

      service._getHighlightsFromStorage = jest
        .fn()
        .mockResolvedValueOnce(null) // stableUrl miss
        .mockResolvedValueOnce(highlights); // originalUrl hit

      await service._getHighlightsWithFallback(
        'https://example.com/stable',
        true,
        'https://example.com/original'
      );

      // 修復後：不應在 fallback 命中後補寫 alias
      const aliasCalls = chrome.storage.local.set.mock.calls.filter(([arg]) =>
        Object.keys(arg).some(k => k.startsWith(URL_ALIAS_PREFIX))
      );
      expect(aliasCalls).toHaveLength(0);
    });

    it('refresh 後解析出 stableUrl 且僅有 highlights 時，應保持未保存 badge 並注入 bundle', async () => {
      const originalUrl = 'https://example.com/articles/slug';
      const stableUrl = 'https://example.com/?p=2928';

      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      service.resolveTabUrl = jest
        .fn()
        .mockResolvedValueOnce({
          stableUrl: originalUrl,
          originalUrl,
          hasStableUrl: false,
        })
        .mockResolvedValueOnce({
          stableUrl,
          originalUrl,
          hasStableUrl: true,
        });

      chrome.storage.local.get.mockImplementation(keys => {
        const keyList = Array.isArray(keys) ? keys : [keys];

        if (keyList.includes(`page_${stableUrl}`)) {
          return Promise.resolve({
            [`page_${stableUrl}`]: buildPageRecord({
              notion: null,
              highlights: [buildHighlight()],
            }),
          });
        }

        return Promise.resolve({});
      });

      chrome.tabs.get.mockResolvedValue({ id: 1, status: 'complete', url: stableUrl });

      await service.updateTabStatus(1, originalUrl);
      await service.updateTabStatus(1, originalUrl);

      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '', tabId: 1 });
      expect(mockInjectionService.ensureBundleInjected).toHaveBeenCalledWith(1);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [`${URL_ALIAS_PREFIX}${originalUrl}`]: stableUrl,
      });
    });

    it('refresh 後 stableUrl 命中 notion:null 的 page_* 時，不應回彈為已保存', async () => {
      const originalUrl = 'https://example.com/posts/long-title';
      const stableUrl = 'https://example.com/?p=123';

      service.resolveTabUrl = jest
        .fn()
        .mockResolvedValueOnce({
          stableUrl: originalUrl,
          originalUrl,
          hasStableUrl: false,
        })
        .mockResolvedValueOnce({
          stableUrl,
          originalUrl,
          hasStableUrl: true,
        });
      service.getSavedPageData = jest.fn().mockImplementation(url => {
        if (url === originalUrl || url === stableUrl) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      chrome.storage.local.get.mockImplementation(keys => {
        const keyList = Array.isArray(keys) ? keys : [keys];

        if (keyList.includes(`page_${stableUrl}`)) {
          return Promise.resolve({
            [`page_${stableUrl}`]: buildPageRecord({
              notion: null,
              highlights: [],
            }),
          });
        }

        return Promise.resolve({});
      });

      chrome.tabs.get.mockResolvedValue({ id: 1, status: 'complete', url: stableUrl });

      await service.updateTabStatus(1, originalUrl);
      await service.updateTabStatus(1, originalUrl);

      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '', tabId: 1 });
      // v2.68.0+: Floating Rail 預設啟用，無歷史標註頁面也應注入 bundle 讓 rail 自動載入
      expect(mockInjectionService.ensureBundleInjected).toHaveBeenCalledWith(1);
    });

    it('should call migrateLegacyHighlights when no highlights exist', async () => {
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation(_keys => Promise.resolve({}));

      const migrateSpy = jest.spyOn(service, 'migrateLegacyHighlights').mockResolvedValue();

      await service.updateTabStatus(1, 'https://example.com');

      expect(migrateSpy).toHaveBeenCalledWith(
        1,
        'https://example.com',
        'highlights_https://example.com'
      );
    });

    it('[REGRESSION] Floating Rail 預設啟用時，無歷史標註的頁面也應注入 content bundle', async () => {
      // Bug：v2.68.0 加入 Floating Rail 後，TabService 在 `if (!highlights)` 分支
      // 直接 return，導致全新網頁從未注入 content.bundle.js，rail 永遠不出現。
      // 修復：在無 highlights 分支內仍判斷 floatingRailEnabled，預設啟用即注入 bundle。
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation(_keys => Promise.resolve({}));
      chrome.storage.sync.get = jest.fn().mockResolvedValue({}); // 未設定 = 預設啟用
      chrome.tabs.get.mockResolvedValue({
        id: 1,
        status: 'complete',
        url: 'https://example.com',
      });
      jest.spyOn(service, 'migrateLegacyHighlights').mockResolvedValue();

      await service.updateTabStatus(1, 'https://example.com');

      expect(mockInjectionService.ensureBundleInjected).toHaveBeenCalledWith(1);
    });

    it('[REGRESSION] floatingRailEnabled=false 時，無歷史標註頁面不應注入 bundle', async () => {
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation(_keys => Promise.resolve({}));
      chrome.storage.sync.get = jest.fn().mockResolvedValue({ floatingRailEnabled: false });
      jest.spyOn(service, 'migrateLegacyHighlights').mockResolvedValue();

      await service.updateTabStatus(1, 'https://example.com');

      expect(mockInjectionService.ensureBundleInjected).not.toHaveBeenCalled();
    });

    it('should handle ensureBundleInjected rejection gracefully', async () => {
      // Arrange: 模擬 highlights 存在
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation(_keys =>
        Promise.resolve({ 'highlights_https://example.com': [{ id: '1' }] })
      );

      chrome.tabs.get.mockImplementation(_tabId => {
        chrome.runtime = { lastError: null };
        return Promise.resolve({ id: 1, status: 'complete', url: 'https://example.com' });
      });

      // Arrange: 模擬注入失敗
      const injectionError = new Error('Bundle injection failed');
      mockInjectionService.ensureBundleInjected.mockRejectedValue(injectionError);

      // Act
      await service.updateTabStatus(1, 'https://example.com');

      // Assert: 錯誤被記錄
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[TabService] Error updating tab status'),
        expect.objectContaining({ error: injectionError })
      );

      // Assert: ensureBundleInjected 被調用
      expect(mockInjectionService.ensureBundleInjected).toHaveBeenCalledWith(1);
    });

    it('should handle errors gracefully', async () => {
      // 確保 getSavedPageData 拋出錯誤
      service.getSavedPageData = jest.fn().mockRejectedValue(new Error('Storage error'));

      await service.updateTabStatus(1, 'https://example.com');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
