import { afterEach, describe, expect, it, vi } from 'vitest'

import { defineSeoConfig } from '../index.js'
import { buildMetadata, buildRobots } from './next.js'

const config = defineSeoConfig({
  collections: { pages: { contentFields: ['intro'] }, posts: { pathPrefix: '/blog' } },
  siteName: 'Bakkerij',
  siteUrl: 'https://www.b.nl',
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildMetadata', () => {
  const home = { intro: 'Vers brood uit Utrecht.', slug: 'home', title: 'Home' }

  it('builds title, description, canonical and Open Graph from fallbacks', () => {
    vi.stubEnv('VERCEL_ENV', '')
    expect(buildMetadata({ collection: 'pages', config, doc: home })).toEqual({
      alternates: { canonical: 'https://www.b.nl' },
      description: 'Vers brood uit Utrecht.',
      metadataBase: new URL('https://www.b.nl'),
      openGraph: {
        description: 'Vers brood uit Utrecht.',
        siteName: 'Bakkerij',
        title: 'Home | Bakkerij',
        type: 'website',
        url: 'https://www.b.nl',
      },
      robots: undefined,
      title: { absolute: 'Home | Bakkerij' },
    })
  })

  it('uses editor meta and the og size of the meta image', () => {
    const metadata = buildMetadata({
      collection: 'posts',
      config,
      doc: {
        meta: {
          description: 'Eigen',
          image: { sizes: { og: { url: '/media/og.jpg' } }, url: '/media/full.jpg' },
          title: 'Titel',
        },
        slug: 'zuurdesem',
      },
    })
    expect(metadata.title).toEqual({ absolute: 'Titel' })
    expect(metadata.description).toBe('Eigen')
    expect(metadata.alternates?.canonical).toBe('https://www.b.nl/blog/zuurdesem')
    expect(metadata.openGraph?.images).toEqual([{ url: '/media/og.jpg' }])
  })

  it('falls back to the full image URL and ignores an unpopulated image id', () => {
    const withUrl = buildMetadata({
      collection: 'pages',
      config,
      doc: { meta: { image: { url: '/m.jpg' } } },
    })
    expect(withUrl.openGraph?.images).toEqual([{ url: '/m.jpg' }])
    const idOnly = buildMetadata({ collection: 'pages', config, doc: { meta: { image: 4 } } })
    expect(idOnly.openGraph).not.toHaveProperty('images')
  })

  it('sets noindex on Vercel previews', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(buildMetadata({ collection: 'pages', config, doc: home }).robots).toEqual({
      follow: false,
      index: false,
    })
  })

  it('leaves out URL fields when the slug or site URL is unknown', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
    const metadata = buildMetadata({
      collection: 'pages',
      config: { ...config, siteUrl: undefined },
      doc: { title: 'Zonder slug' },
    })
    expect(metadata.alternates).toBeUndefined()
    expect(metadata).not.toHaveProperty('metadataBase')
    expect(metadata.description).toBeUndefined()
  })

  it('accepts generated Payload types without an index signature', () => {
    interface Page {
      id: number
      slug: string
      title: string
    }
    const page: Page = { id: 1, slug: 'over-ons', title: 'Over ons' }
    expect(buildMetadata({ collection: 'pages', config, doc: page }).title).toEqual({
      absolute: 'Over ons | Bakkerij',
    })
  })
})

describe('buildRobots', () => {
  it('allows crawling with a sitemap in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(buildRobots({ config })).toEqual({
      rules: { allow: '/', disallow: ['/admin', '/api'], userAgent: '*' },
      sitemap: 'https://www.b.nl/sitemap.xml',
    })
  })

  it('accepts a custom disallow list', () => {
    vi.stubEnv('VERCEL_ENV', '')
    expect(buildRobots({ config, disallow: ['/intern'] }).rules).toEqual({
      allow: '/',
      disallow: ['/intern'],
      userAgent: '*',
    })
  })

  it('blocks everything on previews and leaves out the sitemap without a site URL', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(buildRobots({ config })).toEqual({ rules: { disallow: '/', userAgent: '*' } })

    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
    expect(buildRobots({ config: { ...config, siteUrl: undefined } })).not.toHaveProperty('sitemap')
  })
})
