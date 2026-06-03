import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

const SAFE_URI_REGEXP = /^(?:https?|http):|^data:(?:image\/(?:jpeg|png|gif|webp|svg\+xml)|application\/pdf)(?:;|,)|^(?![a-z][-a-z0-9+.]*:)/i;

purify.addHook('afterSanitizeAttributes', function (node) {
  if (node.hasAttribute('src')) {
    const src = node.getAttribute('src');
    if (src && src.toLowerCase().startsWith('data:') && !SAFE_URI_REGEXP.test(src)) {
      node.removeAttribute('src');
    }
  }
  if (node.hasAttribute('href')) {
    const href = node.getAttribute('href');
    if (href && href.toLowerCase().startsWith('data:') && !SAFE_URI_REGEXP.test(href)) {
      node.removeAttribute('href');
    }
  }
});

const ARTICLE_HTML_ALLOWED_TAGS = [
  'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'section', 'main',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'strong', 'b', 'ins',
  'em', 'i', 'u', 's', 'del', 'strike', 'kbd', 'samp', 'tt', 'img', 'figure',
  'figcaption', 'hr', 'br'
];

const ARTICLE_HTML_ALLOWED_ATTR = ['href', 'src', 'alt', 'title'];

const input1 = '<img src="data:text/html,<svg/onload=alert(2)>" />';
const input2 = '<a href="data:application/pdf;base64,JVBERi0=">Download</a>';
const input3 = '<img src="data:image/png;base64,iVBORw" />';

const output1 = purify.sanitize(input1, {
  ALLOWED_TAGS: ARTICLE_HTML_ALLOWED_TAGS,
  ALLOWED_ATTR: ARTICLE_HTML_ALLOWED_ATTR,
  ALLOWED_URI_REGEXP: SAFE_URI_REGEXP
});

const output2 = purify.sanitize(input2, {
  ALLOWED_TAGS: ARTICLE_HTML_ALLOWED_TAGS,
  ALLOWED_ATTR: ARTICLE_HTML_ALLOWED_ATTR,
  ALLOWED_URI_REGEXP: SAFE_URI_REGEXP
});

const output3 = purify.sanitize(input3, {
  ALLOWED_TAGS: ARTICLE_HTML_ALLOWED_TAGS,
  ALLOWED_ATTR: ARTICLE_HTML_ALLOWED_ATTR,
  ALLOWED_URI_REGEXP: SAFE_URI_REGEXP
});

console.log('Hook Output 1 (img src data:text/html):', output1);
console.log('Hook Output 2 (a href data:application/pdf):', output2);
console.log('Hook Output 3 (img src data:image/png):', output3);
