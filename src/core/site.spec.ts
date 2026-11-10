import { afterEach, describe, expect, it, vi } from 'vitest'

import { absoluteUrl, isIndexable, resolveSiteUrl } from './site.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveSiteUrl', () => {
  it('prefers the explicit value and strips trailing slashes', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://env.nl')
    expect(resolveSiteUrl('https://www.klant.nl//')).toBe('https://www.klant.nl')
  })

  it('falls back to NEXT_PUBLIC_SERVER_URL, then the Vercel production domain', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://env.nl/')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'klant.vercel.app')
    expect(resolveSiteUrl()).toBe('https://env.nl')

    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', '')
    expect(resolveSiteUrl()).toBe('https://klant.vercel.app')
  })

  it('is null when nothing is known', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
    expect(resolveSiteUrl()).toBeNull()
  })
})

describe('isIndexable', () => {
  it('indexes outside Vercel (Docker, Render) and on Vercel production', () => {
    vi.stubEnv('VERCEL_ENV', '')
    expect(isIndexable()).toBe(true)
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(isIndexable()).toBe(true)
  })

  it('never indexes Vercel preview or development deployments', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(isIndexable()).toBe(false)
    vi.stubEnv('VERCEL_ENV', 'development')
    expect(isIndexable()).toBe(false)
  })

  it('can be switched off with SEO_NOINDEX', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('SEO_NOINDEX', 'true')
    expect(isIndexable()).toBe(false)
  })
})

describe('absoluteUrl', () => {
  it('joins the origin and path, with the home page as the bare origin', () => {
    expect(absoluteUrl('https://b.nl', '/over-ons')).toBe('https://b.nl/over-ons')
    expect(absoluteUrl('https://b.nl', '/')).toBe('https://b.nl')
  })

  it('returns the path when the origin is unknown', () => {
    expect(absoluteUrl(null, '/over-ons')).toBe('/over-ons')
  })
})
