import { buildRobots } from 'payload-seo-autopilot/next'

import { seoConfig } from '../seo.config.js'

export const dynamic = 'force-dynamic'

export default function robots() {
  return buildRobots({ config: seoConfig })
}
