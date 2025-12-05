/**
 * @jest-environment jsdom
 */

import { ConverterFactory } from '../../../../scripts/content/converters/ConverterFactory.js';
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
    const converter = ConverterFactory.getConverter('markdown');
    expect(converter).toBe(markdownConverter);
  });

  test('should return markdownConverter for "md"', () => {
    const converter = ConverterFactory.getConverter('md');
    expect(converter).toBe(markdownConverter);
  });

  test('should return domConverter for "html"', () => {
    const converter = ConverterFactory.getConverter('html');
    expect(converter).toBe(domConverter);
  });

  test('should return domConverter for "dom"', () => {
    const converter = ConverterFactory.getConverter('dom');
    expect(converter).toBe(domConverter);
  });

  test('should return domConverter by default', () => {
    const converter = ConverterFactory.getConverter('unknown');
    expect(converter).toBe(domConverter);
  });

  test('should return domConverter for null/undefined', () => {
    expect(ConverterFactory.getConverter(null)).toBe(domConverter);
    expect(ConverterFactory.getConverter()).toBe(domConverter);
  });
});
