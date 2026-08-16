// Markdown -> sanitized HTML (replaces react-markdown + remark-gfm).
// `marked` provides GFM; DOMPurify sanitizes; highlight.js colors code blocks.
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(md) {
  const htmlOut = marked.parse(String(md ?? ''));
  return DOMPurify.sanitize(htmlOut, { ADD_ATTR: ['target'] });
}

// Call after inserting markdown into a root element (shadow or light).
export function highlightBlocks(root) {
  root?.querySelectorAll?.('pre code').forEach((el) => {
    try {
      hljs.highlightElement(el);
    } catch {
      /* unknown language — leave as-is */
    }
  });
}

export { hljs };
