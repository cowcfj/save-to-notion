/**
 * @jest-environment jsdom
 */

import { ConverterFactory } from '../../../../scripts/content/converters/ConverterFactory.js';
import { domConverter } from '../../../../scripts/content/converters/DomConverter.js';

describe('ConverterFactory', () => {
  test.each(['markdown', 'md', 'html', 'dom', 'unknown'])(
    'should return domConverter for "%s"',
    format => {
      expect(ConverterFactory.getConverter(format)).toBe(domConverter);
    }
  );

  test('should return domConverter for null/undefined', () => {
    expect(ConverterFactory.getConverter(null)).toBe(domConverter);
    expect(ConverterFactory.getConverter()).toBe(domConverter);
  });
});
