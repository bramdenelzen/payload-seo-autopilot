import { defineSeoConfig } from 'payload-seo-autopilot'

/**
 * Shared between payload.config.ts and the Next.js routes, like in a client project.
 * AI suggestions use Anthropic when ANTHROPIC_API_KEY is set. With DEV_FAKE_AI=true a fake
 * provider answers instead, so the AI path can be tried without a key or cost.
 */
export const seoConfig = defineSeoConfig({
  ai: process.env.ANTHROPIC_API_KEY
    ? { provider: 'anthropic' }
    : process.env.DEV_FAKE_AI === 'true'
      ? {
          generate: ({ kind, title }) =>
            Promise.resolve(
              kind === 'title' ? `AI: ${title} | Bakkerij Jansen` : `AI description for ${title}.`,
            ),
          provider: 'custom',
        }
      : false,
  collections: {
    pages: { contentFields: ['layout'], homeSlug: 'home' },
    posts: { pathPrefix: '/blog' },
  },
  siteName: 'Bakkerij Jansen',
  siteUrl: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
})
