/**
 * @jest-environment jsdom
 */

import { MarkdownExtractor } from '../../../../scripts/content/extractors/MarkdownExtractor.js';

describe('MarkdownExtractor', () => {
  let doc;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Test Document');
  });

  describe('cleanDOM - Security Sanitization', () => {
    it('should remove dangerous tags (script, iframe, style, etc.)', () => {
      const container = doc.createElement('div');
      container.innerHTML = `
        <p>Safe content</p>
        <script>alert("XSS")</script>
        <iframe src="http://evil.com"></iframe>
        <style>body { display: none; }</style>
        <object data="evil.swf"></object>
        <embed src="evil.swf"></embed>
        <noscript>Cannot execute</noscript>
      `;
      doc.body.append(container);

      const cleaned = MarkdownExtractor.cleanDOM(container);

      expect(cleaned.innerHTML).not.toContain('<script');
      expect(cleaned.innerHTML).not.toContain('<iframe');
      expect(cleaned.innerHTML).not.toContain('<style');
      expect(cleaned.innerHTML).not.toContain('<object');
      expect(cleaned.innerHTML).not.toContain('<embed');
      expect(cleaned.innerHTML).not.toContain('<noscript');
      expect(cleaned.innerHTML).toContain('Safe content');
    });

    it('should remove inline event handlers (on*)', () => {
      const container = doc.createElement('div');
      container.innerHTML = `
        <div onclick="alert(1)" onmouseover="alert(2)" data-safe="true">
          Hover me
          <img src="test.jpg" onerror="alert(3)" onload="alert(4)" />
        </div>
      `;
      doc.body.append(container);

      const cleaned = MarkdownExtractor.cleanDOM(container);

      const div = cleaned.querySelector('div');
      expect(div.hasAttribute('onclick')).toBe(false);
      expect(div.hasAttribute('onmouseover')).toBe(false);
      expect(Object.hasOwn(div.dataset, 'safe')).toBe(true);

      const img = cleaned.querySelector('img');
      expect(img.hasAttribute('onerror')).toBe(false);
      expect(img.hasAttribute('onload')).toBe(false);
      expect(img.getAttribute('src')).toBe('test.jpg');
    });

    it('should remove javascript: URLs from href and src', () => {
      const container = doc.createElement('div');
      container.innerHTML = `
        <a href="javascript:alert(1)">Click me</a>
        <a href=" javascript: alert(2) ">Click me 2</a>
        <a href="JavaScript:alert(3)">Click me 3</a>
        <a href="https://safe.com">Safe Link</a>
        <img src="javascript:alert(4)" />
        <img src="image.jpg" />
      `;
      doc.body.append(container);

      const cleaned = MarkdownExtractor.cleanDOM(container);

      const links = cleaned.querySelectorAll('a');
      expect(links[0].hasAttribute('href')).toBe(false);
      expect(links[1].hasAttribute('href')).toBe(false);
      expect(links[2].hasAttribute('href')).toBe(false);
      expect(links[3].getAttribute('href')).toBe('https://safe.com');

      const imgs = cleaned.querySelectorAll('img');
      expect(imgs[0].hasAttribute('src')).toBe(false);
      expect(imgs[1].getAttribute('src')).toBe('image.jpg');
    });

    it('should remove <base> tag to prevent relative URL hijacking', () => {
      const container = doc.createElement('div');
      container.innerHTML = `
        <base href="https://evil.example.com/" />
        <p>Article body</p>
        <a href="/login">Sign in</a>
      `;
      doc.body.append(container);

      const cleaned = MarkdownExtractor.cleanDOM(container);

      expect(cleaned.querySelector('base')).toBeNull();
      expect(cleaned.innerHTML).toContain('Article body');
      expect(cleaned.querySelector('a[href="/login"]')).not.toBeNull();
    });

    it('should remove formaction attribute when it carries a dangerous URL', () => {
      const container = doc.createElement('div');
      container.innerHTML = `
        <form>
          <button type="submit" formaction="javascript:alert(1)">Bad</button>
          <input type="submit" formaction=" JavaScript: alert(2) " value="Bad input" />
          <button type="submit" formaction="https://safe.example.com/submit">Safe</button>
        </form>
      `;
      doc.body.append(container);

      const cleaned = MarkdownExtractor.cleanDOM(container);

      const buttons = cleaned.querySelectorAll('button');
      expect(buttons[0].hasAttribute('formaction')).toBe(false);
      expect(buttons[1].getAttribute('formaction')).toBe('https://safe.example.com/submit');

      const inputs = cleaned.querySelectorAll('input');
      expect(inputs[0].hasAttribute('formaction')).toBe(false);
    });

    it('should remove data:text/html URLs from href and src', () => {
      const container = doc.createElement('div');
      container.innerHTML = `
        <a href="data:text/html,<script>alert(1)</script>">Click</a>
        <a href=" Data:Text/HTML;base64,PHNjcmlwdD4=">Click 2</a>
        <a href="https://safe.com">Safe Link</a>
        <img src="data:text/html,<svg/onload=alert(2)>" />
      `;
      doc.body.append(container);

      const cleaned = MarkdownExtractor.cleanDOM(container);

      const links = cleaned.querySelectorAll('a');
      expect(links[0].hasAttribute('href')).toBe(false);
      expect(links[1].hasAttribute('href')).toBe(false);
      expect(links[2].getAttribute('href')).toBe('https://safe.com');

      const img = cleaned.querySelector('img');
      expect(img.hasAttribute('src')).toBe(false);
    });

    it('should preserve safe data: URIs (e.g., data:image/png) — regression guard', () => {
      const container = doc.createElement('div');
      const safeSrc =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
      container.innerHTML = `
        <img src="${safeSrc}" alt="dot" />
        <a href="data:application/pdf;base64,JVBERi0=">Download</a>
      `;
      doc.body.append(container);

      const cleaned = MarkdownExtractor.cleanDOM(container);

      expect(cleaned.querySelector('img').getAttribute('src')).toBe(safeSrc);
      expect(cleaned.querySelector('a').getAttribute('href')).toBe(
        'data:application/pdf;base64,JVBERi0='
      );
    });
  });
});
