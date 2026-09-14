const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i;

function normalizeEntities(text) {
  return String(text || '')
    .replace(/&amp;nbsp;/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ');
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const ENTITY_RE = /&(?:(amp|lt|gt|quot|apos)|#(\d+)|#x([0-9a-f]+));/gi;

/**
 * Plan ED2 (audit ED-1). One pass, so `&amp;amp;` becomes `&amp;` — never `&`:
 * a body whose text really is "&amp;" must keep it. An entity for a code point
 * that does not exist is left as written.
 */
function decodeEntities(text) {
  return text.replace(ENTITY_RE, (entity, name, decimal, hex) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()];
    const codePoint = decimal ? Number(decimal) : parseInt(hex, 16);
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return entity;
    }
  });
}

export function slideBodyToHtml(body) {
  const value = normalizeEntities(body).replace(/\r\n?/g, '\n');
  if (!value) return '';

  if (!HTML_TAG_RE.test(value)) {
    // A tagless body is either raw text ("Rock & Roll", from seeds and imports)
    // or what the editor saved from innerHTML ("Praise &amp; Worship").
    // Escaping the second again is what turned "&" into "&amp;amp;" one edit at
    // a time (ED-1), so decode once first: the result is the same either way.
    return escapeHtml(decodeEntities(value)).replace(/\n/g, '<br />');
  }

  return value.replace(/\n/g, '<br />');
}

export function slideBodyToPlainText(body) {
  const value = normalizeEntities(body);
  if (!value) return '';

  const text = value
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '');

  // Decoded only after the tags are gone, so a decoded "<b>" is never stripped
  // as one (ED-1).
  return decodeEntities(text)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
