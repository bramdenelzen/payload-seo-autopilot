import { describe, expect, it } from 'vitest'

import {
  contentText,
  DESCRIPTION_MAX,
  docPath,
  fallbackDescription,
  fallbackTitle,
  resolveCollectionOptions,
  resolveMeta,
  TITLE_MAX,
} from './meta.js'
import { lexical } from './text.spec.js'

const pages = resolveCollectionOptions(true)

describe('resolveCollectionOptions', () => {
  it('fills in defaults', () => {
    expect(pages).toEqual({
      contentFields: ['layout'],
      homeSlug: 'home',
      pathPrefix: '',
      slugField: 'slug',
      titleField: 'title',
    })
    expect(resolveCollectionOptions(undefined)).toEqual(pages)
  })

  it('keeps custom values and strips a trailing slash from the prefix', () => {
    expect(
      resolveCollectionOptions({
        contentFields: ['body'],
        homeSlug: 'index',
        pathPrefix: '/blog/',
        slugField: 'path',
        titleField: 'name',
      }),
    ).toEqual({
      contentFields: ['body'],
      homeSlug: 'index',
      pathPrefix: '/blog',
      slugField: 'path',
      titleField: 'name',
    })
  })
})

describe('fallbackTitle', () => {
  it('adds the site name when it fits', () => {
    expect(fallbackTitle({ title: 'Over ons' }, pages, 'Bakkerij Jansen')).toBe(
      'Over ons | Bakkerij Jansen',
    )
  })

  it('drops the site name when the title is long, and cuts very long titles', () => {
    expect(fallbackTitle({ title: 'x'.repeat(50) }, pages, 'Bakkerij Jansen')).toBe('x'.repeat(50))
    expect(fallbackTitle({ title: 'woord '.repeat(20) }, pages, 'B').length).toBeLessThanOrEqual(
      TITLE_MAX,
    )
  })

  it('uses only the site name for an empty title or a title equal to it', () => {
    expect(fallbackTitle({}, pages, 'Bakkerij Jansen')).toBe('Bakkerij Jansen')
    expect(fallbackTitle({ title: '  ' }, pages, 'Bakkerij Jansen')).toBe('Bakkerij Jansen')
    expect(fallbackTitle({ title: 'bakkerij jansen' }, pages, 'Bakkerij Jansen')).toBe(
      'Bakkerij Jansen',
    )
  })

  it('reads a custom title field', () => {
    expect(
      fallbackTitle({ name: 'Taart' }, resolveCollectionOptions({ titleField: 'name' }), 'B'),
    ).toBe('Taart | B')
  })
})

describe('descriptions', () => {
  const doc = {
    intro: 'Niet gebruikt.',
    layout: [{ blockType: 'text', body: lexical('Wij bakken sinds 1952.') }],
    title: 'Home',
  }

  it('reads only the configured content fields', () => {
    expect(contentText(doc, pages)).toBe('Wij bakken sinds 1952.')
    expect(contentText(doc, resolveCollectionOptions({ contentFields: ['intro', 'layout'] }))).toBe(
      'Niet gebruikt. Wij bakken sinds 1952.',
    )
  })

  it('cuts the description to the search-result length', () => {
    const long = { layout: [{ body: lexical('Lang verhaal over brood. '.repeat(20)) }] }
    expect(fallbackDescription(long, pages).length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    expect(fallbackDescription(long, pages).endsWith('…')).toBe(true)
  })

  it('is empty for a page without text', () => {
    expect(fallbackDescription({ title: 'Leeg' }, pages)).toBe('')
  })
})

describe('resolveMeta', () => {
  const doc = { layout: [{ heading: 'Vers brood elke dag' }], title: 'Home' }

  it('prefers what the editor entered', () => {
    expect(
      resolveMeta(
        { ...doc, meta: { description: ' Eigen tekst ', title: 'Eigen titel' } },
        pages,
        'B',
      ),
    ).toEqual({ description: 'Eigen tekst', title: 'Eigen titel' })
  })

  it('falls back per field, also for null and blank values', () => {
    expect(resolveMeta({ ...doc, meta: { description: null, title: '  ' } }, pages, 'B')).toEqual({
      description: 'Vers brood elke dag.',
      title: 'Home | B',
    })
    expect(resolveMeta(doc, pages, 'B').title).toBe('Home | B')
  })
})

describe('docPath', () => {
  it('serves the home slug at the root', () => {
    expect(docPath({ slug: 'home' }, pages)).toBe('/')
  })

  it('builds paths, trimming slashes from the slug', () => {
    expect(docPath({ slug: 'over-ons' }, pages)).toBe('/over-ons')
    expect(docPath({ slug: '/contact/' }, pages)).toBe('/contact')
  })

  it('adds the prefix, and does not treat the home slug specially under a prefix', () => {
    const blog = resolveCollectionOptions({ pathPrefix: '/blog' })
    expect(docPath({ slug: 'post' }, blog)).toBe('/blog/post')
    expect(docPath({ slug: 'home' }, blog)).toBe('/blog/home')
  })

  it('returns null without a slug', () => {
    expect(docPath({}, pages)).toBeNull()
    expect(docPath({ slug: '' }, pages)).toBeNull()
    expect(docPath({ slug: 12 }, pages)).toBeNull()
  })
})
