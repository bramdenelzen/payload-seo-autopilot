import config from '@payload-config'
import { getPayload } from 'payload'
import { buildSitemap } from 'payload-seo-autopilot/next'

import { seoConfig } from '../seo.config.js'

export const dynamic = 'force-dynamic'

export default async function sitemap() {
  return buildSitemap({ config: seoConfig, payload: await getPayload({ config }) })
}
