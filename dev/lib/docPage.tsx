import type { Metadata } from 'next'

import { notFound } from 'next/navigation.js'
import { buildMetadata } from 'payload-seo-autopilot/next'

import { RenderPage } from '../components/RenderPage.js'
import { SeoPanel } from '../components/SeoPanel.js'
import { seoConfig } from '../seo.config.js'
import { findPublished } from './content.js'

export const metadataFor = async (
  collection: 'pages' | 'posts',
  slug: string,
): Promise<Metadata> => {
  const doc = await findPublished(collection, slug)
  return doc ? buildMetadata({ collection, config: seoConfig, doc }) : {}
}

export const renderDoc = async (collection: 'pages' | 'posts', slug: string) => {
  const doc = await findPublished(collection, slug)
  if (!doc) {
    notFound()
  }
  return (
    <main>
      <RenderPage doc={doc} />
      <SeoPanel metadata={buildMetadata({ collection, config: seoConfig, doc })} />
    </main>
  )
}
