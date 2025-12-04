/**
 * @jest-environment jsdom
 */

import { converterFactory } from '../../../../scripts/content/converters/ConverterFactory.js';
import { domConverter } from '../../../../scripts/content/converters/DomConverter.js';
import { markdownConverter } from '../../../../scripts/content/converters/MarkdownConverter.js';

// Mock converters
jest.mock('../../../../scripts/content/converters/DomConverter', () => ({
  domConverter: { name: 'domConverter' },
}));
jest.mock('../../../../scripts/content/converters/MarkdownConverter', () => ({
  markdownConverter: { name: 'markdownConverter' },
}));

describe('ConverterFactory', () => {
  test('should return markdownConverter for "markdown"', () => {
    const converter = converterFactory.getConverter('markdown');
    expect(converter).toBe(markdownConverter);
  });

  test('should return markdownConverter for "md"', () => {
    const converter = converterFactory.getConverter('md');
    expect(converter).toBe(markdownConverter);
  });

  test('should return domConverter for "html"', () => {
    const converter = converterFactory.getConverter('html');
    expect(converter).toBe(domConverter);
  });

  test('should return domConverter for "dom"', () => {
    const converter = converterFactory.getConverter('dom');
    expect(converter).toBe(domConverter);
  });

  test('should return domConverter by default', () => {
    const converter = converterFactory.getConverter('unknown');
    expect(converter).toBe(domConverter);
  });

  test('should return domConverter for null/undefined', () => {
    expect(converterFactory.getConverter(null)).toBe(domConverter);
    expect(converterFactory.getConverter(undefined)).toBe(domConverter);
  });
});
