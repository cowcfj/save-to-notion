/**
 * @jest-environment jsdom
 */

import { DomConverter } from '../../../../scripts/content/converters/DomConverter.js';
import { jest } from '@jest/globals';

// Mock dependencies
globalThis.ImageUtils = {
  extractImageSrc: jest.fn(),
};
globalThis.Logger = {
  debug: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('DomConverter Nested Links', () => {
  let domConverter = null;

  beforeEach(() => {
    domConverter = new DomConverter();
  });

  test('should apply link to nested bold text', () => {
    const html = '<p><a href="https://example.com"><b>Bold Link</b></a></p>';
    const blocks = domConverter.convert(html);

    expect(blocks).toHaveLength(1);
    const paragraph = blocks[0].paragraph;
    expect(paragraph.rich_text).toHaveLength(1);

    const textNode = paragraph.rich_text[0];
    expect(textNode.text.content).toBe('Bold Link');
    expect(textNode.annotations.bold).toBe(true);
    // Link should be applied
    expect(textNode.text.link).toEqual({ url: 'https://example.com/' });
  });

  test('should apply link to mixed content (italic + plain + bold)', () => {
    const html = '<p><a href="https://example.com"><i>Italic</i> and <b>Bold</b></a></p>';
    const blocks = domConverter.convert(html);

    expect(blocks).toHaveLength(1);
    const richText = blocks[0].paragraph.rich_text;

    // Check if parts are present with correct link
    const italicPart = richText.find(rt => rt.text.content === 'Italic');
    const boldPart = richText.find(rt => rt.text.content === 'Bold');

    // There might be a space " and " or split into " " "and" " " depending on exact whitespace handling.
    // We check if at least one plain text part has the link.
    const plainParts = richText.filter(rt => !rt.annotations.bold && !rt.annotations.italic);

    expect(italicPart).toBeDefined();
    expect(italicPart.annotations.italic).toBe(true);
    expect(italicPart.text.link).toEqual({ url: 'https://example.com/' });

    expect(boldPart).toBeDefined();
    expect(boldPart.annotations.bold).toBe(true);
    expect(boldPart.text.link).toEqual({ url: 'https://example.com/' });

    // Check plain text parts also have link
    plainParts.forEach(part => {
      expect(part.text.link).toEqual({ url: 'https://example.com/' });
    });
  });
});
