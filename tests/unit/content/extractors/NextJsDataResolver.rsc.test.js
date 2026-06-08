/**
 * @jest-environment jsdom
 */

import * as NextJsDataResolver from '../../../../scripts/content/extractors/NextJsDataResolver.js';
import { NEXTJS_CONFIG } from '../../../../scripts/config/shared/content.js';
import Logger from '../../../../scripts/utils/Logger.js';

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: require('../../../helpers/loggerMock.js').createLoggerMock(),
}));

describe('NextJsDataResolver getPagesRouterData logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs structured context when __NEXT_DATA__ is empty or too large', () => {
    document.body.innerHTML = `<script id="__NEXT_DATA__">${'a'.repeat(
      NEXTJS_CONFIG.MAX_JSON_SIZE + 1
    )}</script>`;

    expect(NextJsDataResolver.getPagesRouterData(document)).toBeNull();

    expect(Logger.warn).toHaveBeenCalledWith('Next.js 數據過大或為空', {
      action: 'getPagesRouterData',
      result: 'failed',
      length: NEXTJS_CONFIG.MAX_JSON_SIZE + 1,
    });
  });

  it('logs structured context when __NEXT_DATA__ JSON parsing fails', () => {
    document.body.innerHTML = '<script id="__NEXT_DATA__">{"broken"</script>';

    expect(NextJsDataResolver.getPagesRouterData(document)).toBeNull();

    expect(Logger.warn).toHaveBeenCalledWith('解析 __NEXT_DATA__ 失敗', {
      action: 'getPagesRouterData',
      result: 'failed',
      error: expect.any(String),
    });
  });
});

describe('NextJsDataResolver RSC Payload Parsing Helpers', () => {
  describe('_extractRscDataObject', () => {
    it('should return null for non-array input', () => {
      expect(NextJsDataResolver.extractRscDataObject(null)).toBeNull();
      expect(NextJsDataResolver.extractRscDataObject({})).toBeNull();
      expect(NextJsDataResolver.extractRscDataObject('not an array')).toBeNull();
    });

    it('should fallback to search loop and find object when array length is less than 4', () => {
      const input = [{ target: 'found' }];
      expect(NextJsDataResolver.extractRscDataObject(input)).toEqual({ target: 'found' });
    });

    it('should return index 3 item when length >= 4 and index 3 is a plain object', () => {
      const input = ['$', '$L2a', null, { pageData: { atoms: [] } }];
      expect(NextJsDataResolver.extractRscDataObject(input)).toEqual({
        pageData: { atoms: [] },
      });
    });

    it('should fallback to search loop when index 3 is null', () => {
      const input = ['$', '$L2a', null, null, { pageData: { atoms: [] } }];
      expect(NextJsDataResolver.extractRscDataObject(input)).toEqual({
        pageData: { atoms: [] },
      });
    });

    it('should return the first non-null plain object found in the array', () => {
      const input = [null, 'string', { target: 'found' }, null, { second: 'ignored' }];
      expect(NextJsDataResolver.extractRscDataObject(input)).toEqual({ target: 'found' });
    });

    it('should return null if no plain object is found', () => {
      const input = [null, 'string', 123, true];
      expect(NextJsDataResolver.extractRscDataObject(input)).toBeNull();
    });

    it('should skip nested arrays during fallback search', () => {
      const input = [null, ['nested-array'], { target: 'found' }];
      expect(NextJsDataResolver.extractRscDataObject(input)).toEqual({ target: 'found' });
    });
  });

  describe('_tryParseRscLine', () => {
    it('should return null when no colon is present', () => {
      expect(NextJsDataResolver.tryParseRscLine('no colon here')).toBeNull();
    });

    it('should return null when payload does not start with { or [', () => {
      expect(NextJsDataResolver.tryParseRscLine('1:invalid')).toBeNull();
    });

    it('should return inner object when payload is a valid RSC wrapper', () => {
      const line = '4:["$", "$L2a", null, {"pageData": {"atoms": []}}]';
      expect(NextJsDataResolver.tryParseRscLine(line)).toEqual({ pageData: { atoms: [] } });
    });

    it('should return the parsed object or array when it is not a classic RSC wrapper', () => {
      const line = '4:[1, 2, 3]';
      expect(NextJsDataResolver.tryParseRscLine(line)).toEqual([1, 2, 3]);

      const lineWithObj = '4:[1, 2, {"target":"found"}]';
      expect(NextJsDataResolver.tryParseRscLine(lineWithObj)).toEqual({ target: 'found' });
    });

    it('should return the parsed object when payload is a simple plain object JSON', () => {
      const line = '3:{"someNoise": true}';
      expect(NextJsDataResolver.tryParseRscLine(line)).toEqual({ someNoise: true });
    });

    it('should return null on malformed JSON instead of throwing error', () => {
      const line = '3:{"malformed"';
      expect(NextJsDataResolver.tryParseRscLine(line)).toBeNull();
    });
  });

  describe('_fallbackParseRsc', () => {
    it('should return null when chunk has no colon', () => {
      expect(NextJsDataResolver.fallbackParseRsc('no colon')).toBeNull();
    });

    it('should return null on JSON parse failure', () => {
      expect(NextJsDataResolver.fallbackParseRsc('1:{"bad"')).toBeNull();
    });

    it('should return inner object of a single-line RSC wrapper', () => {
      const chunk = '4:["$", "$L2a", null, {"key": "val"}]';
      expect(NextJsDataResolver.fallbackParseRsc(chunk)).toEqual({ key: 'val' });
    });

    it('should return parsed object when chunk is plain object', () => {
      const chunk = '3:{"key": "val"}';
      expect(NextJsDataResolver.fallbackParseRsc(chunk)).toEqual({ key: 'val' });
    });

    it('should return parsed object if _extractRscDataObject returns null but parsed is an object', () => {
      const chunk = '1:{"foo": "bar"}';
      expect(NextJsDataResolver.fallbackParseRsc(chunk)).toEqual({ foo: 'bar' });
    });
  });

  describe('_parseMultiLineRsc', () => {
    it('should return empty array for empty string', () => {
      expect(NextJsDataResolver.parseMultiLineRsc('')).toEqual([]);
    });

    it('should parse single line rsc', () => {
      const input = '3:{"someNoise":true}';
      expect(NextJsDataResolver.parseMultiLineRsc(input)).toEqual([{ someNoise: true }]);
    });

    it('should filter out unparsable lines', () => {
      const input = '3:{"someNoise":true}\n5:bad-line\n4:{"valid":true}';
      expect(NextJsDataResolver.parseMultiLineRsc(input)).toEqual([
        { someNoise: true },
        { valid: true },
      ]);
    });

    it('should return empty array when all lines are unparsable', () => {
      const input = 'bad-line\nanother-bad';
      expect(NextJsDataResolver.parseMultiLineRsc(input)).toEqual([]);
    });
  });

  describe('_parseAppRouterScript', () => {
    it('should return empty array for script content without push calls', () => {
      expect(NextJsDataResolver.parseAppRouterScript('')).toEqual([]);
      expect(NextJsDataResolver.parseAppRouterScript('console.log("hello")')).toEqual([]);
    });

    it('should parse script with single push call', () => {
      const script = 'self.__next_f.push([1, "3:{\\\"someNoise\\\":true}\\n"])';
      expect(NextJsDataResolver.parseAppRouterScript(script)).toEqual([{ someNoise: true }]);
    });

    it('should parse script with multiple push calls', () => {
      const script =
        'self.__next_f.push([1, "1:I[\\\"noise\\\"]\\n"])\nself.__next_f.push([1, "3:{\\\"valid\\\":true}\\n"])';
      expect(NextJsDataResolver.parseAppRouterScript(script)).toEqual([
        '1:I["noise"]\n',
        { valid: true },
      ]);
    });

    it('should skip malformed JSON inside push calls', () => {
      const script =
        'self.__next_f.push([1, "3:{\\\"valid\\\":true}\\n"])\nself.__next_f.push(invalid_json_here)';
      expect(NextJsDataResolver.parseAppRouterScript(script)).toEqual([{ valid: true }]);
    });

    it('should skip pushing when closing parenthesis is missing', () => {
      const script = 'self.__next_f.push([1, "3:{\\\"valid\\\":true}\\n"';
      expect(NextJsDataResolver.parseAppRouterScript(script)).toEqual([]);
    });
  });
});
