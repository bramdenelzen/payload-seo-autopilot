# payload-seo-autopilot

Automatic SEO for Payload CMS sites, made for clients who don't know SEO. Editors only create pages. The plugin fills in what they leave empty.

One plugin wraps the official [`@payloadcms/plugin-seo`](https://payloadcms.com/docs/plugins/seo) and [`@payloadcms/plugin-redirects`](https://payloadcms.com/docs/plugins/redirects) with sensible defaults, and adds Next.js helpers for metadata, `sitemap.xml` and `robots.txt`.

## What it does

| Feature               | What it does                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| SEO tab               | Meta title, description and image on every configured collection (plugin-seo)                                                           |
| Auto-generate buttons | Rule-based title (page title plus site name) and description (taken from the page's sections), or AI suggestions when an API key is set |
| Metadata fallbacks    | `buildMetadata()` uses editor meta when filled in and generated text otherwise, so no page ships without a title or description         |
| Canonical URLs        | Always on the production domain, also on preview deployments                                                                            |
| Sitemap               | `buildSitemap()` lists only published documents, with `lastModified`                                                                    |
| Robots                | `buildRobots()` allows crawling in production and blocks Vercel preview deployments completely                                          |
| Redirects             | The redirects collection (plugin-redirects)                                                                                             |

Planned next: automatic 301s when a slug changes, executing redirects in `proxy`, JSON-LD, an SEO checklist in the editor. See the plan document.

## Install

```bash
pnpm add payload-seo-autopilot @payloadcms/plugin-seo @payloadcms/plugin-redirects
# optional, for AI suggestions:
pnpm add @anthropic-ai/sdk
```

The official plugins are peer dependencies, because they pin `payload` to an exact version. Keep them on the same version as `payload`.

## Configure

```ts
// src/seo.config.ts
import { defineSeoConfig } from 'payload-seo-autopilot'

export const seoConfig = defineSeoConfig({
  siteName: 'Bakkerij Jansen',
  collections: {
    pages: { titleField: 'title', slugField: 'slug', contentFields: ['layout'], homeSlug: 'home' },
  },
  ai: { provider: 'anthropic' }, // off automatically when ANTHROPIC_API_KEY is not set
})
```

```ts
// payload.config.ts
import { seoAutopilot } from 'payload-seo-autopilot'
import { seoConfig } from './seo.config'

export default buildConfig({
  // ...
  plugins: [seoAutopilot(seoConfig)],
})
```

Don't also add `seoPlugin()` or `redirectsPlugin()` yourself. Pass their options through `seo: {...}` and `redirects: {...}`, or switch one off with `seo: false` / `redirects: false`.

### Options

| Option              | Default                                                                 |                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `siteName`          | required                                                                | Added after page titles, used as `og:site_name`                                                                                                               |
| `collections`       | required                                                                | Per collection: `titleField` (`title`), `slugField` (`slug`), `contentFields` (`['layout']`), `pathPrefix` (`''`), `homeSlug` (`home`). `true` = all defaults |
| `siteUrl`           | `NEXT_PUBLIC_SERVER_URL`, then `https://$VERCEL_PROJECT_PRODUCTION_URL` | Production origin for canonical URLs and the sitemap                                                                                                          |
| `uploadsCollection` | `media`                                                                 | Upload collection for `meta.image`                                                                                                                            |
| `defaultLocale`     | `nl`                                                                    | Language for AI text when the request has no locale                                                                                                           |
| `ai`                | off                                                                     | `{ provider: 'anthropic', apiKey?, model? }` or `{ provider: 'custom', generate }`                                                                            |
| `seo` / `redirects` | `{}`                                                                    | Extra options for the wrapped plugins, or `false`                                                                                                             |
| `disabled`          | `false`                                                                 | Turns the plugin off                                                                                                                                          |

### AI suggestions

AI only runs when an editor clicks **Auto-generate** next to the meta title or description. Nothing is generated or saved on its own, so the editor always sees the text first.

- **Off** when `ai` is not set, set to `false`, or when no API key is found. The buttons then give the rule-based text. Payload logs one line at startup when AI is configured but has no key.
- **Anthropic**: reads `ANTHROPIC_API_KEY`. The default model is `claude-opus-5-5`. For short meta texts, `model: 'claude-haiku-5-5'` costs far less.
- **Custom**: `{ provider: 'custom', generate: async ({ kind, title, content, siteName, locale }) => string | null }` for any other provider.
- If the AI call fails or returns nothing, the rule-based text is used and the error is logged.

## Next.js

```ts
// app/(frontend)/[[...slug]]/page.tsx
import { buildMetadata } from 'payload-seo-autopilot/next'
import { seoConfig } from '@/seo.config'

export async function generateMetadata({ params }) {
  const page = await findPage((await params).slug) // with depth: 1 so meta.image is populated
  return page ? buildMetadata({ collection: 'pages', config: seoConfig, doc: page }) : {}
}
```

```ts
// app/sitemap.ts
import config from '@payload-config'
import { getPayload } from 'payload'
import { buildSitemap } from 'payload-seo-autopilot/next'
import { seoConfig } from '@/seo.config'

export default async function sitemap() {
  return buildSitemap({ config: seoConfig, payload: await getPayload({ config }) })
}
```

```ts
// app/robots.ts
import { buildRobots } from 'payload-seo-autopilot/next'
import { seoConfig } from '@/seo.config'

export default function robots() {
  return buildRobots({ config: seoConfig })
}
```

A deployment is indexable unless `VERCEL_ENV` is set to something other than `production`, or `SEO_NOINDEX=true`. That makes Docker and Render indexable by default.

## Develop

```bash
pnpm install
pnpm test       # unit tests + an integration test against a real Payload with SQLite
pnpm typecheck
pnpm build
```
