/** Keys that never hold readable copy, at any depth. */
const SKIP_KEYS = new Set([
  '_status',
  'anchor',
  'blockName',
  'blockType',
  'createdAt',
  'format',
  'href',
  'icon',
  'id',
  'link',
  'meta',
  'slug',
  'style',
  'theme',
  'updatedAt',
  'url',
  'variant',
])

/** Keys of interface text such as button labels, which read badly in a description. */
const UI_KEY = /label|button|cta|alt$/i

const NOT_COPY = /^(?:https?:|mailto:|tel:|\/|#)|^[\w-]+$/

/**
 * Collects the readable text of a document value: Lexical rich text, plain text fields and
 * the fields of blocks (sections), in document order. Single words and links are skipped, so
 * only sentences are kept.
 */
export const extractText = (value: unknown): string => {
  const parts: string[] = []

  const walk = (node: unknown, key?: string): void => {
    if (key && (SKIP_KEYS.has(key) || UI_KEY.test(key))) {
      return
    }

    if (typeof node === 'string') {
      const text = node.trim()
      if (text && !NOT_COPY.test(text)) {
        parts.push(text)
      }
      return
    }

    if (Array.isArray(node)) {
      node.forEach((item) => walk(item))
      return
    }

    if (!node || typeof node !== 'object') {
      return
    }

    const record = node as Record<string, unknown>

    // A Lexical editor state: read the text nodes, one paragraph per block-level node.
    if (record.root && typeof record.root === 'object') {
      parts.push(...lexicalParagraphs(record.root))
      return
    }

    for (const [childKey, child] of Object.entries(record)) {
      walk(child, childKey)
    }
  }

  walk(value)

  // Headings have no closing punctuation; add a full stop so parts read as sentences.
  return parts
    .map((part) => (/[.!?…:;]$/.test(part) ? part : `${part}.`))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const lexicalParagraphs = (root: unknown): string[] => {
  const paragraphs: string[] = []

  const inline = (node: unknown): string => {
    if (!node || typeof node !== 'object') {
      return ''
    }
    const record = node as { children?: unknown[]; text?: unknown; type?: unknown }
    if (typeof record.text === 'string') {
      return record.text
    }
    if (record.type === 'linebreak') {
      return ' '
    }
    return (record.children ?? []).map(inline).join('')
  }

  for (const child of (root as { children?: unknown[] }).children ?? []) {
    const text = inline(child).trim()
    if (text) {
      paragraphs.push(text)
    }
  }

  return paragraphs
}

/** Shortens text to `max` characters on a word boundary, adding an ellipsis when cut. */
export const truncate = (text: string, max: number): string => {
  const clean = text.replace(/\s+/g, ' ').trim()

  if (clean.length <= max) {
    return clean
  }

  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut

  return `${base.replace(/[\s,;:.–-]+$/, '')}…`
}
