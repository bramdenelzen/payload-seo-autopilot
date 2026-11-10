import type { Metadata, MetadataRoute } from 'next'
import type { Payload } from 'payload'

import type { SeoAutopilotConfig } from '../types.js'

import { docPath, resolveCollectionOptions, resolveMeta } from '../core/meta.js'
import { absoluteUrl, isIndexable, resolveSiteUrl } from '../core/site.js'

export { isIndexable, resolveSiteUrl } from '../core/site.js'

type Doc = Record<string, unknown>

const imageUrl = (image: unknown): null | string => {
  if (!image || typeof image !== 'object') {
    return null
  }
  const record = image as { sizes?: { og?: { url?: string } }; url?: string }
  return record.sizes?.og?.url ?? record.url ?? null
}

/**
 * Metadata for one document: editor meta when filled in, generated text otherwise, a canonical
 * URL on the production domain, and `noindex` on preview deployments.
 * Fetch the document with `depth: 1` so `meta.image` is populated.
 */
export const buildMetadata = ({
  collection,
  config,
  doc,
}: {
  collection: string
  config: SeoAutopilotConfig
  doc: Doc
}): Metadata => {
  const options = resolveCollectionOptions(config.collections[collection])
  const siteUrl = resolveSiteUrl(config.siteUrl)
  const { description, title } = resolveMeta(doc, options, config.siteName)
  const path = docPath(doc, options)
  const url = path ? absoluteUrl(siteUrl, path) : undefined
  const image = imageUrl((doc.meta as Doc | undefined)?.image)

  return {
    ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
    alternates: url ? { canonical: url } : undefined,
    description: description || undefined,
    openGraph: {
      description: description || undefined,
      siteName: config.siteName,
      title,
      type: 'website',
      url,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    robots: isIndexable() ? undefined : { follow: false, index: false },
    title: { absolute: title },
  }
}

/**
 * Every published document of the configured collections, for `app/sitemap.ts`.
 * Drafts are left out when the collection uses drafts.
 */
export const buildSitemap = async ({
  config,
  payload,
}: {
  config: SeoAutopilotConfig
  payload: Payload
}): Promise<MetadataRoute.Sitemap> => {
  const siteUrl = resolveSiteUrl(config.siteUrl)
  const entries: MetadataRoute.Sitemap = []

  for (const [slug, raw] of Object.entries(config.collections)) {
    const options = resolveCollectionOptions(raw)
    const collection = payload.collections[slug as keyof typeof payload.collections]
    const hasDrafts = Boolean(collection?.config.versions && collection.config.versions.drafts)

    const result = await payload.find({
      collection: slug as never,
      depth: 0,
      draft: false,
      overrideAccess: false,
      pagination: false,
      where: hasDrafts ? { _status: { equals: 'published' } } : undefined,
    })

    for (const doc of result.docs as Doc[]) {
      const path = docPath(doc, options)
      if (!path) {
        continue
      }
      entries.push({
        lastModified: typeof doc.updatedAt === 'string' ? new Date(doc.updatedAt) : undefined,
        url: absoluteUrl(siteUrl, path),
      })
    }
  }

  return entries
}

/**
 * `app/robots.ts`: everything allowed with a sitemap link in production, everything blocked
 * on preview deployments so they never end up in Google.
 */
export const buildRobots = ({
  config,
  disallow = ['/admin', '/api'],
}: {
  config: SeoAutopilotConfig
  disallow?: string[]
}): MetadataRoute.Robots => {
  if (!isIndexable()) {
    return { rules: { disallow: '/', userAgent: '*' } }
  }

  const siteUrl = resolveSiteUrl(config.siteUrl)

  return {
    rules: { allow: '/', disallow, userAgent: '*' },
    ...(siteUrl ? { sitemap: `${siteUrl}/sitemap.xml` } : {}),
  }
}
