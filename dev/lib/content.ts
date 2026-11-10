import config from '@payload-config'
import { getPayload } from 'payload'

/** Published document by slug, with `meta.image` populated. */
export const findPublished = async (collection: 'pages' | 'posts', slug: string) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection,
    depth: 1,
    limit: 1,
    where:
      collection === 'pages'
        ? { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] }
        : { slug: { equals: slug } },
  })
  return docs[0] ?? null
}
