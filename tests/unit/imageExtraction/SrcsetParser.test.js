const SrcsetParser = require('../../../scripts/imageExtraction/SrcsetParser');

describe('SrcsetParser', () => {
    describe('parse', () => {
        test('應該解析簡單的 srcset', () => {
            const srcset = 'image-320w.jpg 320w, image-640w.jpg 640w, image-1280w.jpg 1280w';
            const result = SrcsetParser.parse(srcset);
            expect(result).toBe('image-1280w.jpg');
        });

        test('應該處理像素密度描述符', () => {
            const srcset = 'image-1x.jpg 1x, image-2x.jpg 2x, image-3x.jpg 3x';
            const result = SrcsetParser.parse(srcset);
            expect(result).toBe('image-3x.jpg');
        });

        test('應該處理空 srcset', () => {
            expect(SrcsetParser.parse('')).toBeNull();
            expect(SrcsetParser.parse(null)).toBeNull();
            expect(SrcsetParser.parse()).toBeNull();
        });

        test('應該跳過 data: URL', () => {
            const srcset = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7 1x, image.jpg 2x';
            const result = SrcsetParser.parse(srcset);
            expect(result).toBe('image.jpg');
        });
    });

    describe('parseSrcsetEntries', () => {
        test('應該解析多個條目', () => {
            const srcset = 'image-320w.jpg 320w, image-640w.jpg 640w';
            const entries = SrcsetParser.parseSrcsetEntries(srcset);
            expect(entries).toHaveLength(2);
            expect(entries[0].url).toBe('image-320w.jpg');
            expect(entries[0].width).toBe(320);
            expect(entries[1].url).toBe('image-640w.jpg');
            expect(entries[1].width).toBe(640);
        });

        test('應該處理沒有描述符的條目', () => {
            const srcset = 'image.jpg';
            const entries = SrcsetParser.parseSrcsetEntries(srcset);
            expect(entries).toHaveLength(1);
            expect(entries[0].url).toBe('image.jpg');
            expect(entries[0].density).toBe(1.0);
        });
    });

    describe('selectBestUrl', () => {
        test('應該選擇最大寬度的圖片', () => {
            const entries = [
                { url: 'small.jpg', width: 320, density: null },
                { url: 'large.jpg', width: 1280, density: null },
                { url: 'medium.jpg', width: 640, density: null }
            ];
            const result = SrcsetParser.selectBestUrl(entries);
            expect(result).toBe('large.jpg');
        });

        test('應該選擇最大密度的圖片', () => {
            const entries = [
                { url: '1x.jpg', width: null, density: 1.0 },
                { url: '3x.jpg', width: null, density: 3.0 },
                { url: '2x.jpg', width: null, density: 2.0 }
            ];
            const result = SrcsetParser.selectBestUrl(entries);
            expect(result).toBe('3x.jpg');
        });

        test('應該優先選擇寬度而不是密度', () => {
            const entries = [
                { url: 'width.jpg', width: 1280, density: null },
                { url: 'density.jpg', width: null, density: 3.0 }
            ];
            const result = SrcsetParser.selectBestUrl(entries);
            expect(result).toBe('width.jpg');
        });
    });

    describe('isValidSrcset', () => {
        test('應該驗證有效的 srcset', () => {
            expect(SrcsetParser.isValidSrcset('image.jpg 1x')).toBe(true);
            expect(SrcsetParser.isValidSrcset('image-320w.jpg 320w')).toBe(true);
        });

        test('應該拒絕無效的 srcset', () => {
            expect(SrcsetParser.isValidSrcset('')).toBe(false);
            expect(SrcsetParser.isValidSrcset(null)).toBe(false);
            expect(SrcsetParser.isValidSrcset()).toBe(false);
        });
    });

    describe('getStats', () => {
        test('應該返回正確的統計信息', () => {
            const srcset = 'image-320w.jpg 320w, image-2x.jpg 2x, image.jpg';
            const stats = SrcsetParser.getStats(srcset);
            expect(stats.totalEntries).toBe(3);
            expect(stats.widthEntries).toBe(1);
            expect(stats.densityEntries).toBe(2); // 包括默認的 1x
            expect(stats.maxWidth).toBe(320);
            expect(stats.maxDensity).toBe(2.0);
        });
    });
});