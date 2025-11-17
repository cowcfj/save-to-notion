/**
 * ImageExtractor 回退策略行為測試
 */

jest.mock('../../../scripts/imageExtraction/FallbackStrategies', () => ({
    extractFromBackground: jest.fn(() => 'https://cdn.test/background.jpg'),
    extractFromPicture: jest.fn(() => 'https://cdn.test/picture.jpg'),
    extractFromNoscript: jest.fn(() => 'https://cdn.test/noscript.jpg')
}));

const FallbackStrategies = require('../../../scripts/imageExtraction/FallbackStrategies');
const ImageExtractor = require('../../../scripts/imageExtraction/ImageExtractor');

describe('ImageExtractor - 回退策略整合', () => {
    let extractor = null;
    let imgElement = null;

    beforeEach(() => {
        extractor = new ImageExtractor();
        imgElement = document.createElement('img');
        jest.clearAllMocks();
    });

    it('啟用回退時應該委派背景提取', () => {
        const result = extractor._extractFromBackground(imgElement);

        expect(FallbackStrategies.extractFromBackground).toHaveBeenCalledTimes(1);
        expect(FallbackStrategies.extractFromBackground).toHaveBeenCalledWith(imgElement);
        expect(result).toBe('https://cdn.test/background.jpg');
    });

    it('應該委派 picture 與 noscript 提取流程', () => {
        const pictureResult = extractor._extractFromPicture(imgElement);
        const noscriptResult = extractor._extractFromNoscript(imgElement);

        expect(FallbackStrategies.extractFromPicture).toHaveBeenCalledTimes(1);
        expect(FallbackStrategies.extractFromPicture).toHaveBeenCalledWith(imgElement);
        expect(pictureResult).toBe('https://cdn.test/picture.jpg');

        expect(FallbackStrategies.extractFromNoscript).toHaveBeenCalledTimes(1);
        expect(FallbackStrategies.extractFromNoscript).toHaveBeenCalledWith(imgElement);
        expect(noscriptResult).toBe('https://cdn.test/noscript.jpg');
    });

    it('關閉 enableFallbacks 時應該略過委派', () => {
        extractor = new ImageExtractor({ enableFallbacks: false });

        const bgResult = extractor._extractFromBackground(imgElement);
        const pictureResult = extractor._extractFromPicture(imgElement);
        const noscriptResult = extractor._extractFromNoscript(imgElement);

        expect(FallbackStrategies.extractFromBackground).not.toHaveBeenCalled();
        expect(FallbackStrategies.extractFromPicture).not.toHaveBeenCalled();
        expect(FallbackStrategies.extractFromNoscript).not.toHaveBeenCalled();
        expect(bgResult).toBeNull();
        expect(pictureResult).toBeNull();
        expect(noscriptResult).toBeNull();
    });
});
