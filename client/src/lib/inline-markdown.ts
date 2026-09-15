/**
 * Lightweight inline markdown → HTML for section paragraphs.
 * No remark/react-markdown — escape + a small syntax subset.
 * Rich-text HTML from the CMS is passed through unchanged.
 */

/** TipTap / authored HTML tags we trust enough to pass through (anywhere in the string). */
const HAS_TRUSTED_HTML =
  /<\/?(?:p|div|span|ul|ol|li|h[1-6]|strong|em|a|br|blockquote|b|i)\b/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || /^mailto:/i.test(url);
}

function linkAttrs(url: string): string {
  if (isAbsoluteUrl(url)) {
    return ` href="${url}" target="_blank" rel="noopener noreferrer"`;
  }
  return ` href="${url}"`;
}

/**
 * Convert plain text / light markdown to safe HTML.
 * Supports: [label](url), **bold**, *italic*, newlines → <br>.
 * If `input` already contains trusted HTML tags (e.g. mid-string `<a>`), returns it as-is.
 */
export function inlineMarkdownToHtml(input: string): string {
  if (!input) return "";
  if (HAS_TRUSTED_HTML.test(input)) return input;

  let html = escapeHtml(input);

  // Links — URL already escaped; only allow http(s), mailto, path, or hash hrefs
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, rawUrl: string) => {
    const url = rawUrl.trim();
    if (!/^(https?:\/\/|mailto:|\/|#)/i.test(url)) {
      return `[${label}](${rawUrl})`;
    }
    return `<a${linkAttrs(url)}>${label}</a>`;
  });

  // Bold before italic so **…** wins over nested *
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  html = html.replace(/\r\n|\r|\n/g, "<br>");

  return html;
}
