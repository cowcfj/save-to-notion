/**
 * ImageService 單元測試
 * 測試 LRU 緩存行為、TTL 過期、驗證委派
 */

const {
  ImageService,
  ImageUrlValidationCache,
} = require('../../../../scripts/background/services/ImageService');

describe('ImageUrlValidationCache', () => {
  let cache = null;

  beforeEach(() => {
    cache = new ImageUrlValidationCache(5, 1000); // 小緩存，1秒 TTL
  });

  describe('基本操作', () => {
    it('應該正確設置和獲取緩存值', () => {
      cache.set('https://example.com/image.jpg', true);
      expect(cache.get('https://example.com/image.jpg')).toBe(true);
    });

    it('應該返回 null 當 URL 未緩存時', () => {
      expect(cache.get('https://unknown.com/image.jpg')).toBeNull();
    });

    it('應該正確記錄緩存命中和未命中', () => {
      cache.set('https://example.com/image.jpg', true);
      cache.get('https://example.com/image.jpg'); // hit
      cache.get('https://unknown.com/image.jpg'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('LRU 驅逐策略', () => {
    it('應該在達到最大容量時驅逐最少使用的條目', () => {
      // 填滿緩存
      for (let i = 0; i < 5; i++) {
        cache.set(`https://example.com/img${i}.jpg`, true);
      }

      // 訪問第一個條目使其成為最近使用
      cache.get('https://example.com/img0.jpg');

      // 添加新條目，應該驅逐 img1（最少使用）
      cache.set('https://example.com/img5.jpg', true);

      expect(cache.get('https://example.com/img0.jpg')).toBe(true); // 保留
      expect(cache.get('https://example.com/img1.jpg')).toBeNull(); // 被驅逐
      expect(cache.get('https://example.com/img5.jpg')).toBe(true); // 新增
    });

    it('應該正確記錄驅逐次數', () => {
      for (let i = 0; i < 7; i++) {
        cache.set(`https://example.com/img${i}.jpg`, true);
      }

      const stats = cache.getStats();
      expect(stats.evictions).toBe(2); // 超出容量 2 次
    });
  });

  describe('TTL 過期機制', () => {
    it('應該返回 null 當條目過期時', async () => {
      cache.set('https://example.com/image.jpg', true);
      expect(cache.get('https://example.com/image.jpg')).toBe(true);

      // 等待 TTL 過期
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(cache.get('https://example.com/image.jpg')).toBeNull();
    });

    it('cleanupExpired 應該清理過期條目', async () => {
      cache.set('https://example.com/img1.jpg', true);
      await new Promise(resolve => setTimeout(resolve, 500));
      cache.set('https://example.com/img2.jpg', true);

      // 等待第一個過期
      await new Promise(resolve => setTimeout(resolve, 600));

      cache.cleanupExpired();

      expect(cache.get('https://example.com/img1.jpg')).toBeNull();
      // img2 可能還在（取決於精確時間）
    });
  });

  describe('clear 方法', () => {
    it('應該清空所有緩存和統計', () => {
      cache.set('https://example.com/img1.jpg', true);
      cache.set('https://example.com/img2.jpg', false);
      cache.get('https://example.com/img1.jpg');

      cache.clear();

      expect(cache.get('https://example.com/img1.jpg')).toBeNull();
      expect(cache.get('https://example.com/img2.jpg')).toBeNull();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.size).toBe(0);
    });
  });
});

describe('ImageService', () => {
  let service = null;
  let mockValidator = null;
  let mockLogger = null;

  beforeEach(() => {
    mockValidator = jest.fn(url => url.endsWith('.jpg'));
    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    service = new ImageService({
      maxCacheSize: 10,
      cacheTtl: 60000,
      validator: mockValidator,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    service.stopCleanupTask();
    jest.restoreAllMocks();
  });

  describe('isValidImageUrl', () => {
    it('應該使用外部驗證器驗證 URL', () => {
      const result = service.isValidImageUrl('https://example.com/photo.jpg');
      expect(result).toBe(true);
      expect(mockValidator).toHaveBeenCalledWith('https://example.com/photo.jpg');
    });

    it('應該緩存驗證結果', () => {
      service.isValidImageUrl('https://example.com/photo.jpg');
      service.isValidImageUrl('https://example.com/photo.jpg');

      // 驗證器只應被調用一次
      expect(mockValidator).toHaveBeenCalledTimes(1);
    });

    it('應該根據創建時間清理過期條目，而不是訪問時間', () => {
      const url = 'https://example.com/old-item.jpg';
      const ttl = 1000;
      service = new ImageService({
        cacheTtl: ttl,
        maxCacheSize: 10,
        logger: mockLogger,
        validator: mockValidator,
      });

      // 1. 初始添加 (T=0)
      const startTime = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(startTime);
      service.isValidImageUrl(url);

      // 2. 模擬快過期時訪問 (T=900) - 這會更新 accessOrder 但不應更新 cache.timestamp
      jest.spyOn(Date, 'now').mockReturnValue(startTime + 900);
      service.isValidImageUrl(url);

      // 3. 模擬過期時間點 (T=1100)
      // 依據創建時間(T=0)，現在(T=1100)已過期 (>1000)
      // 但依據訪問時間(T=900)，現在還沒過期 (1100-900 = 200 < 1000)
      jest.spyOn(Date, 'now').mockReturnValue(startTime + 1100);
      service.cache.cleanupExpired();

      // 如果邏輯錯誤（使用訪問時間），這裡會是 true
      // 如果邏輯正確（使用創建時間），這裡應該是 false
      service.isValidImageUrl(url);

      // 我們期望它被清理掉，重新驗證
      expect(mockValidator).toHaveBeenCalledTimes(2); // 初始1 + 訪問1(沒觸發) + 過期後重新驗證1 = 2
      // 初始調用 -> validator calls: 1
      // 第二次調用 (cache hit) -> validator calls: 1
      // cleanupExpired -> 應該清除
      // 第三次調用 (should be miss) -> validator calls: 2
      expect(mockValidator).toHaveBeenCalledTimes(2);
    });

    it('應該拒絕無效輸入', () => {
      expect(service.isValidImageUrl(null)).toBe(false);
      expect(service.isValidImageUrl('')).toBe(false);
      expect(service.isValidImageUrl(123)).toBe(false);
      expect(mockValidator).not.toHaveBeenCalled();
    });

    it('應該使用本地回退驗證器當外部驗證器不可用時', () => {
      const serviceNoValidator = new ImageService({ logger: mockLogger });

      const result = serviceNoValidator.isValidImageUrl('https://example.com/photo.jpg');
      expect(result).toBe(true); // 本地驗證器應通過
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('應該處理驗證器拋出的錯誤', () => {
      mockValidator.mockImplementation(() => {
        throw new Error('Validator error');
      });

      const result = service.isValidImageUrl('https://example.com/photo.jpg');
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('setValidator', () => {
    it('應該允許動態設置驗證器', () => {
      const newValidator = jest.fn(() => true);
      service.setValidator(newValidator);

      service.isValidImageUrl('https://example.com/new.png');
      expect(newValidator).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('應該返回正確的統計信息', () => {
      service.isValidImageUrl('https://example.com/a.jpg');
      service.isValidImageUrl('https://example.com/a.jpg'); // cache hit
      service.isValidImageUrl('https://example.com/b.png');

      const stats = service.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.size).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('應該清空緩存', () => {
      service.isValidImageUrl('https://example.com/a.jpg');
      service.clearCache();

      const stats = service.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('cleanup task', () => {
    it('應該啟動和停止清理任務', () => {
      jest.useFakeTimers();

      service.startCleanupTask(1000);
      expect(service.cleanupIntervalId).not.toBeNull();

      service.stopCleanupTask();
      expect(service.cleanupIntervalId).toBeNull();

      jest.useRealTimers();
    });

    it('不應重複啟動清理任務', () => {
      service.startCleanupTask(1000);
      const firstId = service.cleanupIntervalId;

      service.startCleanupTask(1000);
      expect(service.cleanupIntervalId).toBe(firstId);

      service.stopCleanupTask();
    });
  });

  describe('本地回退驗證器', () => {
    let serviceNoValidator = null;

    beforeEach(() => {
      serviceNoValidator = new ImageService({ logger: mockLogger });
    });

    it('應該接受有效的圖片擴展名', () => {
      const extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
      extensions.forEach(ext => {
        serviceNoValidator.clearCache();
        expect(serviceNoValidator.isValidImageUrl(`https://example.com/img.${ext}`)).toBe(true);
      });
    });

    it('應該識別圖片路徑關鍵詞', () => {
      expect(serviceNoValidator.isValidImageUrl('https://example.com/images/photo')).toBe(true);
      expect(serviceNoValidator.isValidImageUrl('https://example.com/media/banner')).toBe(true);
      expect(serviceNoValidator.isValidImageUrl('https://cdn.example.com/uploads/photo')).toBe(
        true
      );
    });

    it('應該拒絕非 HTTP(S) 協議', () => {
      expect(serviceNoValidator.isValidImageUrl('ftp://example.com/img.jpg')).toBe(false);
      expect(serviceNoValidator.isValidImageUrl('file:///path/to/img.jpg')).toBe(false);
    });

    it('應該拒絕包含點但非圖片擴展名的 URL', () => {
      expect(serviceNoValidator.isValidImageUrl('https://example.com/api/v1.0/data')).toBe(false);
      expect(serviceNoValidator.isValidImageUrl('https://example.com/user.profile')).toBe(false);
      expect(serviceNoValidator.isValidImageUrl('https://example.com/document.pdf')).toBe(false);
    });

    it('應該拒絕無效 URL', () => {
      expect(serviceNoValidator.isValidImageUrl('not-a-url')).toBe(false);
    });
  });
});
