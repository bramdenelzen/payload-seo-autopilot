import { describe, expect, it } from 'vitest'

import { extractText, truncate } from './text.js'

export const lexical = (...paragraphs: string[]) => ({
  root: {
    children: paragraphs.map((text) => ({ children: [{ text, type: 'text' }], type: 'paragraph' })),
    type: 'root',
  },
})

describe('extractText', () => {
  it('reads sections in document order and turns headings into sentences', () => {
    const layout = [
      { blockType: 'hero', heading: 'Vers brood elke ochtend', id: 'a1' },
      { blockType: 'text', body: lexical('Wij bakken sinds 1952.', 'Kom langs in Utrecht!') },
    ]
    expect(extractText(layout)).toBe(
      'Vers brood elke ochtend. Wij bakken sinds 1952. Kom langs in Utrecht!',
    )
  })

  it('skips ids, block types, links, slugs, button labels and nested meta', () => {
    const value = {
      blockName: 'Mijn blok',
      blockType: 'hero',
      buttonHref: '/contact',
      buttonLabel: 'Neem contact op',
      cta: { label: 'Bestel nu', url: 'https://shop.nl' },
      heading: 'Echte tekst hier',
      id: '65f1c2',
      image: { alt: 'Een brood op tafel' },
      link: { label: 'Lees meer', url: '/meer' },
      meta: { description: 'Niet meenemen' },
      slug: 'home',
      variant: 'dark',
    }
    expect(extractText(value)).toBe('Echte tekst hier.')
  })

  it('ignores single tokens, URLs, anchors, mail and phone links', () => {
    expect(
      extractText(['dark', 'https://x.nl', '/pad', '#sectie', 'mailto:a@b.nl', 'tel:0612345678']),
    ).toBe('')
  })

  it('reads nested Lexical nodes, links and line breaks', () => {
    const state = {
      root: {
        children: [
          {
            children: [
              { text: 'Bestel ', type: 'text' },
              { children: [{ text: 'online', type: 'text' }], type: 'link' },
              { type: 'linebreak' },
              { text: 'of in de winkel.', type: 'text' },
            ],
            type: 'paragraph',
          },
          {
            children: [{ children: [{ text: 'Punt een', type: 'text' }], type: 'listitem' }],
            type: 'list',
          },
          { children: [], type: 'paragraph' },
        ],
        type: 'root',
      },
    }
    expect(extractText(state)).toBe('Bestel online of in de winkel. Punt een.')
  })

  it('handles empty and non-text values', () => {
    expect(extractText(undefined)).toBe('')
    expect(extractText(null)).toBe('')
    expect(extractText(42)).toBe('')
    expect(extractText({ count: 3, enabled: true })).toBe('')
    expect(extractText([[['Diep genest, nog steeds tekst']]])).toBe(
      'Diep genest, nog steeds tekst.',
    )
  })

  it('collapses whitespace', () => {
    expect(extractText('  Veel   ruimte\n\nhier  ')).toBe('Veel ruimte hier.')
  })
})

describe('truncate', () => {
  it('keeps text that fits, normalising whitespace', () => {
    expect(truncate('kort', 10)).toBe('kort')
    expect(truncate(' a   b ', 10)).toBe('a b')
  })

  it('cuts on a word boundary and adds an ellipsis', () => {
    expect(truncate('een twee drie vier vijf', 15)).toBe('een twee drie…')
    expect(truncate('een twee drie vier vijf', 15).length).toBeLessThanOrEqual(15)
  })

  it('drops trailing punctuation before the ellipsis', () => {
    expect(truncate('Brood, koek, taart en meer', 13)).toBe('Brood, koek…')
  })

  it('cuts inside a long word when there is no usable space', () => {
    expect(truncate('Donaudampfschifffahrtsgesellschaft', 10)).toBe('Donaudamp…')
  })
})
