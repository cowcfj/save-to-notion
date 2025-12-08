/**
 * @jest-environment jsdom
 */

import { ConverterFactory } from '../../../../scripts/content/converters/ConverterFactory.js';
import { domConverter } from '../../../../scripts/content/converters/DomConverter.js';

// Mock converters
jest.mock('../../../../scripts/content/converters/DomConverter', () => ({
  domConverter: { name: 'domConverter' },
}));

describe('ConverterFactory', () => {
  test('should return domConverter for "markdown"', () => {
    // Markdown now falls back to DomConverter or a specific handler
    // But ConverterFactory just returns domConverter for everything now
    const converter = ConverterFactory.getConverter('markdown');
    expect(converter).toBe(domConverter);
  });

  test('should return domConverter for "md"', () => {
    const converter = ConverterFactory.getConverter('md');
    expect(converter).toBe(domConverter);
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
